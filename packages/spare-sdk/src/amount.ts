import { MAX_STROOPS, STROOPS_PER_UNIT } from "./constants.js";

const AMOUNT_RE = /^\d+(\.\d{1,7})?$/;

/** Decimal string ("0.5", up to 7 decimals) to stroops. No floats. Returns null if malformed. */
export function toStroops(s: string): bigint | null {
  if (typeof s !== "string" || !AMOUNT_RE.test(s)) return null; // JS callers may pass a number
  const [int = "0", frac = ""] = s.split(".");
  const v = BigInt(int) * STROOPS_PER_UNIT + BigInt(frac.padEnd(7, "0"));
  return v > MAX_STROOPS ? null : v;
}

/** Like {@link toStroops} but also rejects zero: a donation must be positive. */
export function parseUsdc(s: string): bigint | null {
  const v = toStroops(s);
  return v === null || v === 0n ? null : v;
}

/** Stroops to the 7-decimal string Stellar operations expect. */
export function formatStroops(v: bigint): string {
  const int = v / STROOPS_PER_UNIT;
  const frac = (v % STROOPS_PER_UNIT).toString().padStart(7, "0");
  return `${int}.${frac}`;
}

/**
 * Gap between `purchase` and the next whole dollar.
 * A purchase that is already a whole dollar yields 0n (no donation); we never default to a full $1.
 */
export function roundUpToWholeDollar(purchase: bigint): bigint {
  const rem = purchase % STROOPS_PER_UNIT;
  return rem === 0n ? 0n : STROOPS_PER_UNIT - rem;
}
