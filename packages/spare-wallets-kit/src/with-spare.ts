import { TransactionBuilder } from "@stellar/stellar-sdk";
import { addDonation, donateAfter, type DonationInfo } from "spare-sdk";
import { createConfirmModal } from "./modal.js";
import type {
  ConfirmFn, DonationPrompt, FollowUpResult, Locale, MainTxResult, SignOptions, SignResult,
  SignWithDonationResult, SignerLike, SpareOptions, SpareSigner, WalletKind,
} from "./types.js";

function walletId(kit: SignerLike, option: SpareOptions["wallet"]): string | undefined {
  try {
    if (typeof option === "function") return option();
    if (option !== undefined) return option;
    return kit.selectedModule?.productId; // v2 getter throws when no wallet is selected
  } catch {
    return undefined;
  }
}

const isLedger = (id: string | undefined) => id !== undefined && /ledger/i.test(id);

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

  const prompt = (
    donation: DonationInfo, mode: "fixed" | "round-up", secondSignature: boolean,
  ): DonationPrompt => {
    const id = walletId(kit, options.wallet);
    const wallet: WalletKind = isLedger(id) ? "ledger" : secondSignature ? "soroban" : "classic";
    return {
      amount: donation.amount,
      foundationName: options.foundationName ?? options.foundation.domain,
      foundationDomain: options.foundation.domain,
      mode,
      wallet,
      locale: locale(),
      secondSignature,
      // Computed once, by the SDK, from every op that spends USDC: never recomputed here.
      ...(donation.purchase !== undefined && { purchaseTotal: donation.purchase }),
      ...(donation.roundedTotal !== undefined && { roundUpTotal: donation.roundedTotal }),
    };
  };

  type Decision =
    | { kind: "modified"; xdr: string; donation: DonationInfo }
    | { kind: "original"; outcome: SignWithDonationResult["outcome"]; reason?: string };

  async function decide(xdr: string, opts: SignOptions): Promise<Decision> {
    try {
      const passphrase = opts.networkPassphrase ?? options.networkPassphrase;
      if (!passphrase) return { kind: "original", outcome: "error", reason: "missing-network-passphrase" };
      const tx = TransactionBuilder.fromXDR(xdr, passphrase);
      const roundUp = "roundUp" in options.mode;
      const r = await addDonation(tx, {
        foundation: options.foundation,
        appId: options.appId,
        maxAmount: options.maxAmount,
        accounts: options.accounts,
        ...(options.fetch && { fetch: options.fetch }),
        ...(options.baseFee !== undefined && { baseFee: options.baseFee }),
        ...("amount" in options.mode ? { amount: options.mode.amount } : { roundUp: true }),
      });
      if (r.status === "passthrough") return { kind: "original", outcome: "passthrough", reason: r.reason };
      if (r.status === "not-offered") return { kind: "original", outcome: "not-offered", reason: r.reason };
      const yes = await confirm(prompt(r.donation, roundUp ? "round-up" : "fixed", false));
      if (yes !== true) return { kind: "original", outcome: "declined" };
      return { kind: "modified", xdr: r.transaction.toXDR(), donation: r.donation };
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
    let offered: { xdr: string; donation: DonationInfo };
    try {
      const amount = options.followUpAmount ?? ("amount" in options.mode ? options.mode.amount : undefined);
      if (amount === undefined) return { status: "skipped", reason: "no-follow-up-amount" };
      const passphrase = opts.networkPassphrase ?? options.networkPassphrase;
      if (!passphrase) return { status: "skipped", reason: "missing-network-passphrase" };
      const r = await donateAfter(main, {
        foundation: options.foundation,
        appId: options.appId,
        maxAmount: options.maxAmount,
        accounts: options.accounts,
        ...(options.fetch && { fetch: options.fetch }),
        ...(options.baseFee !== undefined && { baseFee: options.baseFee }),
        amount,
        networkPassphrase: passphrase,
      });
      if (r.status !== "offered") return { status: "skipped", reason: r.reason };
      const yes = await confirm(prompt(r.donation, "fixed", r.requiresSecondSignature));
      if (yes !== true) return { status: "skipped", reason: "declined" };
      offered = { xdr: r.transaction.toXDR(), donation: r.donation };
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
