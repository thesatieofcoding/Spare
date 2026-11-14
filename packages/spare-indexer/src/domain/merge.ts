import type { DonationRecord } from "./types.js";

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Dedupe by `txHash:opIndex` (first wins) and sort by (ledger, id): order-independent output. */
export function mergeRecords(records: readonly DonationRecord[]): DonationRecord[] {
  const byId = new Map<string, DonationRecord>();
  for (const r of records) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => a.ledger - b.ledger || cmp(a.id, b.id));
}
