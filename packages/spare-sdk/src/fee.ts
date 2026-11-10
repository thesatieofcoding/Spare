import { DEFAULT_BASE_FEE, MIN_BASE_FEE } from "./constants.js";

/** Digits only, at most 15 of them: the total fee always stays far below int64. */
const FEE_RE = /^\d{1,15}$/;

/**
 * Per-op fee from user input: `undefined` -> `fallback` (DEFAULT_BASE_FEE when not given),
 * malformed -> null. Never below {@link MIN_BASE_FEE}, so eligibility and build use one number.
 */
export function perOpFee(input: string | undefined, fallback: bigint = BigInt(DEFAULT_BASE_FEE)): bigint | null {
  let v = fallback;
  if (input !== undefined) {
    if (!FEE_RE.test(input)) return null;
    v = BigInt(input);
  }
  return v < MIN_BASE_FEE ? MIN_BASE_FEE : v;
}
