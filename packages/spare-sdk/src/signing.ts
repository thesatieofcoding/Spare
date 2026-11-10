import type { Transaction } from "@stellar/stellar-sdk";
import type { AccountSnapshot } from "./ports.js";

export type Threshold = "medium" | "high";

const HIGH_OPS = new Set(["setOptions", "accountMerge"]);

/**
 * Threshold category the tx needs. Any payment is medium; setOptions and accountMerge are
 * treated as high (conservative: setOptions is only high when it touches signers/thresholds).
 */
export function requiredThreshold(ops: Transaction["operations"]): Threshold {
  return ops.some((op) => HIGH_OPS.has(op.type)) ? "high" : "medium";
}

/** True when the account's master key alone meets the threshold (a signature needs weight >= 1). */
export function canSignAlone(account: AccountSnapshot, needed: Threshold): boolean {
  const required = Math.max(account.thresholds[needed], 1);
  return account.masterWeight >= required;
}
