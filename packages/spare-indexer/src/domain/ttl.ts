/** 30 days of ledgers at 5s each. */
export const NEAR_EXPIRY_LEDGERS = 518_400;

/** D15: flagged when the entry is missing/archived or has < threshold ledgers left. */
export function nearExpiry(
  liveUntil: number | null,
  latestLedger: number,
  threshold: number = NEAR_EXPIRY_LEDGERS,
): boolean {
  return liveUntil === null || liveUntil - latestLedger < threshold;
}
