import { describe, expect, expectTypeOf, it } from "vitest";
import { classify } from "../src/domain/classify.js";
import type { DonationRecord, TransferObservation } from "../src/domain/types.js";
import {
  FOUNDATION, GDONOR, LOOKALIKE_ISSUER, MAINNET_USDC, OTHER_FOUNDATION, TESTNET_USDC, muxedOf, obs, txt,
} from "./fixtures/observations.js";

const ctx = { network: "mainnet" as const, foundations: new Set([FOUNDATION]) };

describe("classify", () => {
  it("counts a tagged USDC payment to a known foundation", () => {
    expect(classify(obs(), ctx)).toEqual({
      kind: "counted",
      record: {
        id: `${"a".repeat(64)}:0`,
        foundation: FOUNDATION,
        amount: "0.5000000",
        appId: "shop1",
        ledger: 1000,
        closedAt: "2026-11-01T00:00:00Z",
        txHash: "a".repeat(64),
      },
    });
  });

  it("counts an untagged payment with appId null", () => {
    const r = classify(obs({ memo: { type: "none" } }), ctx);
    expect(r.kind === "counted" && r.record.appId).toBe(null);
  });

  it("a malformed tag counts as unattributed", () => {
    const r = classify(obs({ memo: txt(`spare:${"a".repeat(23)}`) }), ctx);
    expect(r.kind === "counted" && r.record.appId).toBe(null);
  });

  it("counts path_payment_strict_send and path_payment_strict_receive by USDC received", () => {
    for (const opType of ["path_payment_strict_send", "path_payment_strict_receive"]) {
      const r = classify(obs({ opType, amount: 12_345_678n }), ctx);
      expect(r.kind === "counted" && r.record.amount).toBe("1.2345678");
    }
  });

  it("ignores a lookalike issuer (same code)", () => {
    expect(classify(obs({ asset: { code: "USDC", issuer: LOOKALIKE_ISSUER } }), ctx)).toEqual({
      kind: "ignored", reason: "wrong-issuer",
    });
  });

  it("ignores the testnet issuer on mainnet and counts it on testnet", () => {
    const o = obs({ asset: { code: "USDC", issuer: TESTNET_USDC } });
    expect(classify(o, ctx)).toEqual({ kind: "ignored", reason: "wrong-issuer" });
    expect(classify(o, { ...ctx, network: "testnet" }).kind).toBe("counted");
    expect(classify(obs(), { ...ctx, network: "testnet" })).toEqual({ kind: "ignored", reason: "wrong-issuer" });
  });

  it("ignores XLM and other asset codes", () => {
    expect(classify(obs({ asset: "native" }), ctx)).toEqual({ kind: "ignored", reason: "wrong-asset" });
    expect(classify(obs({ asset: { code: "EURC", issuer: MAINNET_USDC } }), ctx)).toEqual({
      kind: "ignored", reason: "wrong-asset",
    });
  });

  it("ignores failed operations", () => {
    expect(classify(obs({ successful: false }), ctx)).toEqual({ kind: "ignored", reason: "failed" });
  });

  it.each(["invoke_host_function", "transfer", "mint", "create_claimable_balance", "account_merge"])(
    "ignores non-classic-payment op %s (SAC transfer/mint etc.)",
    (opType) => {
      expect(classify(obs({ opType }), ctx)).toEqual({ kind: "ignored", reason: "not-classic-payment" });
    },
  );

  it("ignores payments to an unknown foundation", () => {
    expect(classify(obs({ to: OTHER_FOUNDATION }), ctx)).toEqual({ kind: "ignored", reason: "unknown-foundation" });
    expect(classify(obs({ to: "not-an-address" }), ctx)).toEqual({ kind: "ignored", reason: "unknown-foundation" });
  });

  it("reduces a muxed destination (M...) to its base G account", () => {
    const r = classify(obs({ to: muxedOf(FOUNDATION, 42n) }), ctx);
    expect(r.kind === "counted" && r.record.foundation).toBe(FOUNDATION);
  });

  it("never carries a donor address: types have no source and output omits the sentinel", () => {
    expectTypeOf<keyof TransferObservation>().not.toEqualTypeOf<"source">();
    type Keys = keyof TransferObservation | keyof DonationRecord;
    expectTypeOf<"source" extends Keys ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<"from" extends Keys ? true : false>().toEqualTypeOf<false>();
    // A JS caller could smuggle a source field in; the record must not copy it.
    const smuggled = { ...obs(), source: GDONOR, from: GDONOR } as TransferObservation;
    const r = classify(smuggled, ctx);
    expect(JSON.stringify(r)).not.toContain(GDONOR);
  });
});
