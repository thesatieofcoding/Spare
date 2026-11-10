import { describe, expect, it } from "vitest";
import { USDC_ISSUER } from "../src/constants.js";
import { toAccountSnapshot, type HorizonAccountRecord } from "../src/horizon.js";

const rec = (over: Partial<HorizonAccountRecord> = {}): HorizonAccountRecord => ({
  account_id: "GA",
  sequence: "7",
  subentry_count: 1,
  num_sponsoring: 0,
  num_sponsored: 0,
  thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
  signers: [{ key: "GA", weight: 1 }],
  balances: [
    { asset_type: "native", balance: "10.0000000", selling_liabilities: "0.0000000" },
    { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: USDC_ISSUER, balance: "5.5000000", limit: "100.0000000", buying_liabilities: "2.0000000", selling_liabilities: "0.5000000", is_authorized: true },
  ],
  ...over,
});

describe("toAccountSnapshot", () => {
  it("maps balances net of reserve and liabilities", () => {
    const s = toAccountSnapshot(rec());
    expect(s.sequence).toBe("7");
    // (2 + 1 subentry) * 0.5 = 1.5 XLM reserve
    expect(s.xlmAvailable).toBe(85_000_000n);
    // headroom = limit 100 - balance 5.5 - buying liabilities 2
    expect(s.usdc).toEqual({ balance: 50_000_000n, authorized: true, headroom: 925_000_000n });
    expect(s.masterWeight).toBe(1);
    expect(s.thresholds).toEqual({ low: 0, medium: 0, high: 0 });
    expect(s.memoRequired).toBe(false);
  });
  it("ignores USDC from other issuers", () => {
    const r = rec();
    r.balances[1]!.asset_issuer = "GOTHER";
    expect(toAccountSnapshot(r).usdc).toBeNull();
  });
  it("reports unauthorized trustlines", () => {
    const r = rec();
    r.balances[1]!.is_authorized = false;
    expect(toAccountSnapshot(r).usdc?.authorized).toBe(false);
  });
  it("exposes master weight and thresholds instead of a boolean", () => {
    const r = rec({
      thresholds: { low_threshold: 1, med_threshold: 2, high_threshold: 3 },
      signers: [{ key: "GA", weight: 1 }, { key: "GB", weight: 1 }],
    });
    const s = toAccountSnapshot(r);
    expect(s.masterWeight).toBe(1);
    expect(s.thresholds).toEqual({ low: 1, medium: 2, high: 3 });
  });
  it("reports a disabled master key as weight 0", () => {
    expect(toAccountSnapshot(rec({ signers: [{ key: "GA", weight: 0 }, { key: "GB", weight: 1 }] })).masterWeight).toBe(0);
  });
  it("reads SEP-29 config.memo_required from data_attr", () => {
    expect(toAccountSnapshot(rec({ data_attr: { "config.memo_required": "MQ==" } })).memoRequired).toBe(true);
    expect(toAccountSnapshot(rec({ data_attr: { "config.memo_required": "MA==" } })).memoRequired).toBe(false);
    expect(toAccountSnapshot(rec({ data_attr: { other: "MQ==" } })).memoRequired).toBe(false);
  });
  it("gives zero headroom when the trustline limit is missing or exceeded", () => {
    const r = rec();
    delete r.balances[1]!.limit;
    expect(toAccountSnapshot(r).usdc?.headroom).toBe(0n);
    const over = rec();
    over.balances[1]!.limit = "5.0000000";
    expect(toAccountSnapshot(over).usdc?.headroom).toBe(0n);
  });
});
