import { Asset, Keypair, Operation } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { analyzeSpend } from "../src/spend.js";
import { NETWORKS } from "../src/network.js";
import { FAKE_USDC, TESTNET_USDC, USDC, merchant, payUsdc, payXlm, stroops } from "./helpers.js";

const poolId = "a".repeat(64);
const spend = (...ops: ReturnType<typeof payUsdc>[]) => analyzeSpend(ops.map((o) => Operation.fromXDRObject(o)));

describe("analyzeSpend", () => {
  it("sums Circle USDC and flags nothing else", () => {
    expect(spend(payUsdc("1.5"), payUsdc("2"))).toMatchObject({ usdc: stroops("3.5"), other: false, unsupported: false, uncertain: false });
  });
  it("counts native XLM and flags other", () => {
    expect(spend(payXlm("3"))).toMatchObject({ usdc: 0n, xlm: stroops("3"), other: true });
    const create = Operation.createAccount({ destination: Keypair.random().publicKey(), startingBalance: "5" });
    expect(spend(create)).toMatchObject({ xlm: stroops("5"), other: true });
  });
  it("flags lookalike USDC as other", () => {
    expect(spend(payUsdc("1", FAKE_USDC))).toMatchObject({ usdc: 0n, other: true });
  });
  it("strictReceive spends up to sendMax and is uncertain", () => {
    const op = Operation.pathPaymentStrictReceive({ sendAsset: USDC, sendMax: "2", destination: merchant.publicKey(), destAsset: Asset.native(), destAmount: "1" });
    expect(spend(op)).toMatchObject({ usdc: stroops("2"), uncertain: true });
  });
  it("marks unmodelled spenders unsupported", () => {
    const buy = Operation.manageBuyOffer({ selling: USDC, buying: Asset.native(), buyAmount: "1", price: "1" });
    const lp = Operation.liquidityPoolDeposit({ liquidityPoolId: poolId, maxAmountA: "1", maxAmountB: "1", minPrice: "0.5", maxPrice: "2" });
    expect(spend(buy).unsupported).toBe(true);
    expect(spend(lp).unsupported).toBe(true);
    expect(spend(Operation.accountMerge({ destination: merchant.publicKey() })).unsupported).toBe(true);
  });
  it("any other op type sets other (unknown ops never look like a pure USDC purchase)", () => {
    const lpw = Operation.liquidityPoolWithdraw({ liquidityPoolId: poolId, amount: "1", minAmountA: "0", minAmountB: "0" });
    expect(spend(payUsdc("1"), lpw)).toMatchObject({ usdc: stroops("1"), other: true, unsupported: false });
  });
  it("ops that move no funds do not flag other", () => {
    expect(spend(payUsdc("1"), Operation.setOptions({ homeDomain: "x.example" }), Operation.manageData({ name: "a", value: "b" })).other).toBe(false);
  });

  it("counts only the selected network's issuer as USDC", () => {
    const op = Operation.fromXDRObject(payUsdc("2", TESTNET_USDC));
    expect(analyzeSpend([op], NETWORKS.testnet.usdcIssuer)).toMatchObject({ usdc: stroops("2"), other: false });
    expect(analyzeSpend([op], NETWORKS.mainnet.usdcIssuer)).toMatchObject({ usdc: 0n, other: true });
    const main = Operation.fromXDRObject(payUsdc("2"));
    expect(analyzeSpend([main], NETWORKS.testnet.usdcIssuer)).toMatchObject({ usdc: 0n, other: true });
  });
  it("rejects third-party USDC on both networks", () => {
    const op = Operation.fromXDRObject(payUsdc("1", FAKE_USDC));
    for (const n of [NETWORKS.mainnet, NETWORKS.testnet])
      expect(analyzeSpend([op], n.usdcIssuer)).toMatchObject({ usdc: 0n, other: true });
  });
});
