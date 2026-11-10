import {
  Asset, FeeBumpTransaction, Memo, Operation, Transaction, TransactionBuilder,
} from "@stellar/stellar-sdk";
import { formatStroops, parseUsdc, roundUpToWholeDollar, toStroops } from "./amount.js";
import { memoFor } from "./app-id.js";
import { USDC_CODE, USDC_ISSUER } from "./constants.js";
import { checkEligibility } from "./eligibility.js";
import { perOpFee } from "./fee.js";
import type { AccountPort, AccountSnapshot } from "./ports.js";
import { canSignAlone, requiredThreshold } from "./signing.js";
import { analyzeSpend } from "./spend.js";
import type { CommonOptions, DonationResult, NotOfferedReason, PassthroughReason } from "./types.js";

/** Provide exactly one of `amount` (fixed USDC) or `roundUp: true` (USDC purchases only). */
export type AddDonationOptions = CommonOptions & { amount?: string; roundUp?: boolean };

const SOROBAN_OPS = new Set(["invokeHostFunction", "extendFootprintTtl", "restoreFootprint"]);

/** Why Spare must not touch this tx, or null when it is an unsigned, single-source classic tx. */
function structuralPassthrough(tx: Transaction | FeeBumpTransaction): PassthroughReason | null {
  if (tx instanceof FeeBumpTransaction) return "fee-bump";
  if (tx.signatures.length > 0) return "already-signed";
  if (tx.extraSigners && tx.extraSigners.length > 0) return "extra-signers"; // CAP-21 precondition
  if (tx.operations.some((op) => SOROBAN_OPS.has(op.type))) return "soroban";
  if (tx.operations.some((op) => op.source !== undefined && op.source !== tx.source))
    return "multiple-sources";
  return null;
}

/** Destinations that receive funds from the tx: where a SEP-29 memo may be required. */
function destinations(ops: Transaction["operations"]): string[] {
  const out = new Set<string>();
  for (const op of ops) {
    if (
      op.type === "payment" || op.type === "pathPaymentStrictSend" ||
      op.type === "pathPaymentStrictReceive" || op.type === "accountMerge"
    ) out.add(op.destination);
  }
  return [...out];
}

/**
 * True unless every destination is known not to require a memo (SEP-29). Fails closed: a
 * destination we cannot read counts as requiring one. A missing account does not.
 */
async function anyMemoRequired(accounts: AccountPort, ops: Transaction["operations"]): Promise<boolean> {
  const checks = await Promise.all(
    destinations(ops).map(async (d) => {
      try {
        return (await accounts.loadAccount(d))?.memoRequired === true;
      } catch {
        return true;
      }
    }),
  );
  return checks.some(Boolean);
}

/**
 * Appends a USDC donation to an unsigned classic tx, if (and only if) every check passes.
 * Never throws for ineligible input: inspect `status`.
 *  - "offered": `transaction` is a new unsigned tx (new hash, higher fee); show `donation.amount` to the user.
 *  - "not-offered": tx is fine, but no donation should be shown. Use the original.
 *  - "passthrough": Spare cannot safely modify this tx. Use the original.
 */
export async function addDonation(
  tx: Transaction | FeeBumpTransaction,
  opts: AddDonationOptions,
): Promise<DonationResult> {
  const pass = structuralPassthrough(tx);
  if (pass) return { status: "passthrough", reason: pass, transaction: tx };
  const t = tx as Transaction;
  const no = (reason: NotOfferedReason): DonationResult => ({ status: "not-offered", reason, transaction: t });

  if ((opts.amount === undefined) === (opts.roundUp !== true)) return no("invalid-options");

  const feeFallback = (BigInt(t.fee) + BigInt(t.operations.length) - 1n) / BigInt(t.operations.length);
  const perOp = perOpFee(opts.baseFee, feeFallback);
  if (perOp === null) return no("invalid-options");

  const spend = analyzeSpend(t.operations);
  if (spend.unsupported) return no("unsupported-operation");
  let amount: bigint | null;
  if (opts.roundUp === true) {
    if (spend.other || spend.uncertain || spend.usdc === 0n) return no("round-up-needs-usdc-purchase");
    amount = roundUpToWholeDollar(spend.usdc);
    if (amount === 0n) return no("round-up-already-whole");
  } else {
    amount = parseUsdc(opts.amount as string);
    if (amount === null) return no("invalid-amount");
  }

  let user: AccountSnapshot | null;
  try {
    user = await opts.accounts.loadAccount(t.source);
  } catch {
    return no("account-lookup-failed");
  }
  if (!user) return no("account-lookup-failed");
  if (!canSignAlone(user, requiredThreshold(t.operations)))
    return { status: "passthrough", reason: "multisig", transaction: t };

  // Fee: one extra operation at the tx's own per-op rate (ceil, min 100), unless overridden.
  const newFee = perOp * (BigInt(t.operations.length) + 1n);

  const reason = await checkEligibility({
    accounts: opts.accounts,
    ...(opts.fetch && { fetch: opts.fetch }),
    foundation: opts.foundation,
    appId: opts.appId,
    amount,
    cap: toStroops(opts.maxAmount),
    source: t.source,
    user,
    usdcSpend: spend.usdc,
    fee: newFee,
    xlmSpend: spend.xlm,
  });
  if (reason) return no(reason);

  // Our memo would bypass a destination's SEP-29 memo_required check: leave the memo unset so
  // the app's own checkMemoRequired still fires.
  const attributed = t.memo.type === "none" && !(await anyMemoRequired(opts.accounts, t.operations));
  const builder = TransactionBuilder.cloneFrom(t, {
    fee: perOp.toString(),
    ...(attributed && { memo: Memo.text(memoFor(opts.appId)) }),
  });
  builder.addOperation(
    Operation.payment({
      destination: opts.foundation.account,
      asset: new Asset(USDC_CODE, USDC_ISSUER),
      amount: formatStroops(amount),
    }),
  );
  const out = builder.build();

  return {
    status: "offered",
    transaction: out,
    fee: BigInt(out.fee),
    donation: {
      amount: formatStroops(amount),
      amountStroops: amount,
      foundation: opts.foundation.account,
      attributed,
      ...(opts.roundUp === true && {
        purchase: formatStroops(spend.usdc),
        purchaseStroops: spend.usdc,
        roundedTotal: formatStroops(spend.usdc + amount),
        roundedTotalStroops: spend.usdc + amount,
      }),
    },
  };
}
