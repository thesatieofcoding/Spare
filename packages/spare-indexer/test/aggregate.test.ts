import { describe, expect, it } from "vitest";
import { aggregate } from "../src/domain/aggregate.js";
import { mergeRecords } from "../src/domain/merge.js";
import type { DonationRecord } from "../src/domain/types.js";
import { FOUNDATION, OTHER_FOUNDATION } from "./fixtures/observations.js";

const rec = (over: Partial<DonationRecord>): DonationRecord => ({
  id: "t1:0",
  foundation: FOUNDATION,
  amount: "1.0000000",
  appId: "A",
  ledger: 10,
  closedAt: "2026-11-01T00:00:00Z",
  txHash: "t1",
  ...over,
});

describe("mergeRecords", () => {
  it("dedupes by id and sorts by (ledger, id) regardless of input order", () => {
    const a = rec({ id: "b:0", txHash: "b", ledger: 5 });
    const b = rec({ id: "a:1", txHash: "a", ledger: 9 });
    const c = rec({ id: "a:0", txHash: "a", ledger: 9 });
    const out1 = mergeRecords([b, a, c, { ...a }]);
    const out2 = mergeRecords([c, a, b]);
    expect(out1.map((r) => r.id)).toEqual(["b:0", "a:0", "a:1"]);
    expect(out2).toEqual(out1);
  });
  it("accepts existing + incoming overlap without dupes", () => {
    expect(mergeRecords([rec({}), rec({})])).toHaveLength(1);
  });
});

describe("aggregate", () => {
  it("1.00 + 0.50 app A, 2.00 untagged -> 1.50 / 2 / A 1.50 / unattributed 2.00 count 1", () => {
    const recs = [
      rec({ id: "t1:0", txHash: "t1", amount: "1.0000000" }),
      rec({ id: "t2:0", txHash: "t2", amount: "0.5000000" }),
      rec({ id: "t3:0", txHash: "t3", amount: "2.0000000", appId: null }),
    ];
    const agg = aggregate(recs).get(FOUNDATION);
    expect(agg).toEqual({
      foundation: FOUNDATION,
      total: "1.5000000",
      count: 2,
      apps: [{ appId: "A", total: "1.5000000", count: 2 }],
      unattributed: { total: "2.0000000", count: 1 },
      txHashes: ["t1", "t2", "t3"],
    });
  });
  it("is stroop-exact (0.1 + 0.2 = 0.3) and splits foundations/apps sorted by appId", () => {
    const recs = [
      rec({ id: "x:0", txHash: "x", amount: "0.1000000", appId: "B" }),
      rec({ id: "y:0", txHash: "y", amount: "0.2000000", appId: "B" }),
      rec({ id: "z:0", txHash: "z", amount: "0.0000001", appId: "A" }),
      rec({ id: "w:0", txHash: "w", foundation: OTHER_FOUNDATION, amount: "9.0000000" }),
    ];
    const m = aggregate(recs);
    expect(m.get(FOUNDATION)?.apps).toEqual([
      { appId: "A", total: "0.0000001", count: 1 },
      { appId: "B", total: "0.3000000", count: 2 },
    ]);
    expect(m.get(FOUNDATION)?.total).toBe("0.3000001");
    expect(m.get(OTHER_FOUNDATION)?.total).toBe("9.0000000");
  });
  it("foundation with no records yields zeroes when requested", () => {
    const a = aggregate([], [FOUNDATION]).get(FOUNDATION);
    expect(a).toMatchObject({ total: "0.0000000", count: 0, unattributed: { total: "0.0000000", count: 0 } });
  });
});
