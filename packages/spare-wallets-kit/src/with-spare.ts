import { TransactionBuilder, type FeeBumpTransaction, type Transaction } from "@stellar/stellar-sdk";
import { NETWORKS, addDonation, donateAfter, parseUsdc, type DonationInfo, type PayWith } from "spare-sdk";
import { createConfirmModal } from "./modal.js";
import { promptSession, type PromptSession } from "./session.js";
import type {
  ChoiceCheck, ConfirmFn, DonationChoice, DonationChoices, DonationPrompt, FollowUpResult, Locale, MainTxResult,
  SignOptions, SignResult, SignWithDonationResult, SignerLike, SpareOptions, SpareSigner, WalletKind,
} from "./types.js";

/** Default preset amounts, in USD. */
export const DEFAULT_PRESETS = ["0.10", "0.25", "0.50"] as const;
/** Smallest donation the confirmation step accepts, in USD. */
export const MIN_AMOUNT = "0.01";
const MIN_STROOPS = 100_000n;

function walletId(kit: SignerLike, option: SpareOptions["wallet"]): string | undefined {
  try {
    if (typeof option === "function") return option();
    if (option !== undefined) return option;
    return kit.selectedModule?.productId; // v2 getter throws when no wallet is selected
  } catch {
    return undefined;
  }
}

/**
 * Explicit passphrase wins; otherwise the one of an explicit `network`. With neither the
 * result is undefined (fail closed, as in 0.1): the default network must not parse the tx,
 * because that check would be circular (a tx is always "from" the network used to read it).
 */
function resolvePassphrase(opts: SignOptions, options: SpareOptions): string | undefined {
  const explicit = opts.networkPassphrase ?? options.networkPassphrase;
  if (explicit) return explicit;
  const network = options.network;
  return network !== undefined && Object.hasOwn(NETWORKS, network)
    ? NETWORKS[network as keyof typeof NETWORKS].passphrase
    : undefined;
}

/**
 * Network to hand to the SDK. An explicit `network` option wins; otherwise it is inferred from the
 * effective passphrase when that is one of Spare's networks. An unknown passphrase infers nothing
 * (the SDK then defaults to mainnet and reports network-mismatch, so the original is signed).
 */
function resolveNetwork(opts: SignOptions, options: SpareOptions): SpareOptions["network"] {
  if (options.network !== undefined) return options.network;
  const passphrase = opts.networkPassphrase ?? options.networkPassphrase;
  return (Object.keys(NETWORKS) as (keyof typeof NETWORKS)[]).find((n) => NETWORKS[n].passphrase === passphrase);
}

const isLedger = (id: string | undefined) => id !== undefined && /ledger/i.test(id);

/**
 * Preset amounts: the app's (or the defaults) plus a fixed `mode.amount`, keeping only valid
 * amounts within [0.01, cap], deduplicated and ascending. Strings are kept as the app wrote them.
 */
export function presetAmounts(options: SpareOptions): string[] {
  const list: unknown[] = [...(Array.isArray(options.presets) ? options.presets : DEFAULT_PRESETS)];
  if (options.mode && "amount" in options.mode) list.push(options.mode.amount);
  const cap = parseUsdc(options.maxAmount);
  const seen = new Map<bigint, string>();
  for (const p of list) {
    if (typeof p !== "string") continue;
    const v = parseUsdc(p);
    if (v === null || v < MIN_STROOPS || (cap !== null && v > cap) || seen.has(v)) continue;
    seen.set(v, p);
  }
  return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, s]) => s);
}

type Offer = { xdr: string; donation: DonationInfo };
type Evaluation = { offer: Offer } | { reason: string; passthrough?: true };

const toCheck = (e: Evaluation): ChoiceCheck => {
  if (!("offer" in e)) return { status: "not-offered", reason: e.reason };
  const d = e.offer.donation;
  return {
    status: "offered",
    amount: d.amount,
    payWith: d.payWith ?? "usdc",
    ...(d.sendMax !== undefined && { xlmSendMax: d.sendMax }),
    ...(d.purchase !== undefined && { purchaseTotal: d.purchase }),
    ...(d.roundedTotal !== undefined && { roundUpTotal: d.roundedTotal }),
  };
};

/**
 * Wraps a Stellar Wallets Kit so every `signTransaction` first offers a Spare donation.
 * Fails closed: if anything in the Spare logic goes wrong, the user's original tx is signed.
 */
export function withSpare(kit: SignerLike, options: SpareOptions): SpareSigner {
  let lastDonation: DonationInfo | null = null;
  let defaultConfirm: ConfirmFn | undefined;
  const locale = (): Locale => options.locale ?? "en";
  const confirm: ConfirmFn = (p) => {
    if (options.confirm) return options.confirm(p);
    defaultConfirm ??= createConfirmModal({
      locale: locale(),
      ...(options.theme && { theme: options.theme }),
    });
    return defaultConfirm(p);
  };
  const assets = (): PayWith[] => (options.quotes ? ["usdc", "xlm"] : ["usdc"]);

  const prompt = (
    donation: DonationInfo, mode: "fixed" | "round-up", secondSignature: boolean, choices: DonationChoices,
  ): DonationPrompt => {
    const id = walletId(kit, options.wallet);
    const wallet: WalletKind = isLedger(id) ? "ledger" : secondSignature ? "soroban" : "classic";
    return {
      amount: donation.amount,
      payWith: donation.payWith ?? "usdc",
      ...(donation.sendMax !== undefined && { xlmSendMax: donation.sendMax }),
      foundationName: options.foundationName ?? options.foundation.domain,
      foundationDomain: options.foundation.domain,
      mode,
      wallet,
      locale: locale(),
      secondSignature,
      // Computed once, by the SDK, from every op that spends USDC: never recomputed here.
      ...(donation.purchase !== undefined && { purchaseTotal: donation.purchase }),
      ...(donation.roundedTotal !== undefined && { roundUpTotal: donation.roundedTotal }),
      choices,
    };
  };

  /** SDK options shared by both paths, read through the prompt session. */
  const common = (s: PromptSession, opts: SignOptions, payWith: PayWith) => {
    const network = resolveNetwork(opts, options);
    return {
      foundation: options.foundation,
      appId: options.appId,
      maxAmount: options.maxAmount,
      accounts: s.accounts,
      ...(network !== undefined && { network }),
      ...(s.fetch && { fetch: s.fetch }),
      ...(options.baseFee !== undefined && { baseFee: options.baseFee }),
      payWith,
      ...(s.quotes && { quotes: s.quotes }),
      ...(options.slippageBps !== undefined && { slippageBps: options.slippageBps }),
    };
  };

  /**
   * Runs the confirmation step with choices. `evaluate` prices one choice (SDK checks included);
   * the first offered candidate is preselected. Resolves the offer to sign, or why there is none.
   */
  async function negotiate(
    s: PromptSession,
    candidates: DonationChoice[],
    evaluate: (c: DonationChoice) => Promise<Evaluation>,
    roundUpPossible: boolean,
    secondSignature: boolean,
  ): Promise<{ offer: Offer } | { declined: true } | { reason: string; passthrough?: true }> {
    let first: Evaluation = { reason: "invalid-options" };
    let chosen: DonationChoice | undefined;
    for (const c of candidates) {
      first = await evaluate(c);
      if ("offer" in first || first.passthrough) {
        chosen = c;
        break;
      }
    }
    if (!("offer" in first) || !chosen) return first;
    s.freeze();

    const initial = first.offer;
    const roundUp = roundUpPossible && (chosen.roundUp === true ||
      "offer" in (await evaluate({ roundUp: true, payWith: chosen.payWith })));

    const enabled = assets();
    const guarded = async (c: DonationChoice): Promise<Evaluation> => {
      if (typeof c !== "object" || c === null || !enabled.includes(c.payWith)) return { reason: "xlm-unavailable" };
      if (c.roundUp === true) return roundUp ? evaluate({ roundUp: true, payWith: c.payWith }) : { reason: "round-up-unavailable" };
      const v = typeof c.amount === "string" ? parseUsdc(c.amount) : null;
      if (v === null || v < MIN_STROOPS) return { reason: "invalid-amount" };
      return evaluate({ amount: c.amount, payWith: c.payWith });
    };

    let latest = 0;
    let selected: Promise<Offer | null> = Promise.resolve(initial);
    const choices: DonationChoices = {
      presets: presetAmounts(options),
      min: MIN_AMOUNT,
      max: options.maxAmount,
      roundUp,
      payWith: enabled,
      selected: chosen,
      check: async (c) => toCheck(await guarded(c)),
      select: (c) => {
        const ticket = ++latest;
        const run = guarded(c).catch((): Evaluation => ({ reason: "error" }));
        const prev = selected;
        // Only the most recent selection counts, whatever order the evaluations finish in.
        selected = run.then(async (e) => (ticket === latest ? ("offer" in e ? e.offer : null) : prev));
        return run.then(toCheck);
      },
    };

    const mode = chosen.roundUp === true ? "round-up" : "fixed";
    const yes = await confirm(prompt(initial.donation, mode, secondSignature, choices));
    if (yes !== true) return { declined: true };
    const offer = await selected;
    return offer ? { offer } : { declined: true };
  }

  /** Preselection order: the preferred asset first (USDC unless the app says "xlm"). */
  const candidatesFor = (base: { amount: string } | { roundUp: true }): DonationChoice[] => {
    const list = assets();
    const order = options.payWith === "xlm" && list.includes("xlm") ? (["xlm", "usdc"] as PayWith[]) : list;
    return order.map((payWith) => ({ ...base, payWith }) as DonationChoice);
  };

  type Decision =
    | { kind: "modified"; xdr: string; donation: DonationInfo }
    | { kind: "original"; outcome: SignWithDonationResult["outcome"]; reason?: string };

  async function decide(xdr: string, opts: SignOptions): Promise<Decision> {
    try {
      const passphrase = resolvePassphrase(opts, options);
      if (!passphrase) return { kind: "original", outcome: "error", reason: "missing-network-passphrase" };
      const tx = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction | FeeBumpTransaction;
      const s = promptSession(options.accounts, options.fetch ?? ((i, init) => globalThis.fetch(i, init)), options.quotes);
      const evaluate = async (c: DonationChoice): Promise<Evaluation> => {
        const r = await addDonation(tx, {
          ...common(s, opts, c.payWith),
          ...(c.roundUp === true ? { roundUp: true } : { amount: c.amount }),
        });
        if (r.status === "passthrough") return { reason: r.reason, passthrough: true };
        if (r.status === "not-offered") return { reason: r.reason };
        return { offer: { xdr: r.transaction.toXDR(), donation: r.donation } };
      };
      const mode = options.mode;
      const base = mode && "roundUp" in mode ? { roundUp: true as const } : { amount: mode?.amount ?? presetAmounts(options)[0] ?? MIN_AMOUNT };
      const r = await negotiate(s, candidatesFor(base), evaluate, true, false);
      if ("declined" in r) return { kind: "original", outcome: "declined" };
      if ("reason" in r) return { kind: "original", outcome: r.passthrough ? "passthrough" : "not-offered", reason: r.reason };
      return { kind: "modified", xdr: r.offer.xdr, donation: r.offer.donation };
    } catch (e) {
      return { kind: "original", outcome: "error", reason: e instanceof Error ? e.message : "unknown" };
    }
  }

  async function signWithDonation(xdr: string, opts: SignOptions = {}): Promise<SignWithDonationResult> {
    const d = await decide(xdr, opts);
    if (d.kind === "modified") {
      // Wallet errors (e.g. the user rejects in the wallet) propagate: that is the wallet's call.
      const signed = await kit.signTransaction(d.xdr, opts);
      lastDonation = d.donation;
      return { ...signed, donation: d.donation, changed: true, outcome: "donated" };
    }
    const signed = await kit.signTransaction(xdr, opts);
    lastDonation = null;
    return {
      ...signed, donation: null, changed: false, outcome: d.outcome,
      ...(d.reason !== undefined && { reason: d.reason }),
    };
  }

  async function offerFollowUp(main: MainTxResult, opts: SignOptions = {}): Promise<FollowUpResult> {
    let offered: Offer;
    try {
      const mode = options.mode;
      const amount = options.followUpAmount ??
        (mode === undefined ? presetAmounts(options)[0] : "amount" in mode ? mode.amount : undefined);
      if (amount === undefined) return { status: "skipped", reason: "no-follow-up-amount" };
      if (!resolvePassphrase(opts, options)) return { status: "skipped", reason: "missing-network-passphrase" };
      const explicit = opts.networkPassphrase ?? options.networkPassphrase;
      const s = promptSession(options.accounts, options.fetch ?? ((i, init) => globalThis.fetch(i, init)), options.quotes);
      const evaluate = async (c: DonationChoice): Promise<Evaluation> => {
        if (c.roundUp === true) return { reason: "round-up-unavailable" };
        const r = await donateAfter(main, {
          ...common(s, opts, c.payWith),
          amount: c.amount,
          ...(explicit !== undefined && { networkPassphrase: explicit }),
        });
        return r.status === "offered" ? { offer: { xdr: r.transaction.toXDR(), donation: r.donation } } : { reason: r.reason };
      };
      const r = await negotiate(s, candidatesFor({ amount }), evaluate, false, true);
      if ("declined" in r) return { status: "skipped", reason: "declined" };
      if ("reason" in r) return { status: "skipped", reason: r.reason };
      offered = r.offer;
    } catch {
      return { status: "skipped", reason: "error" };
    }
    const signed: SignResult = await kit.signTransaction(offered.xdr, opts);
    lastDonation = offered.donation;
    return { status: "signed", ...signed, donation: offered.donation };
  }

  return {
    async signTransaction(xdr, opts) {
      const { donation: _d, changed: _c, outcome: _o, reason: _r, ...signed } = await signWithDonation(xdr, opts);
      return signed;
    },
    signWithDonation,
    offerFollowUp,
    get lastDonation() {
      return lastDonation;
    },
  };
}
