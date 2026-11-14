import { Asset, Keypair, Memo, Operation, TransactionBuilder, Account, BASE_FEE } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { sameDonation } from "../src/requote.js";
import { PASSPHRASE, USDC, foundationKp, merchant, user } from "./helpers.js";

const build = (over: { destAmount?: string; dest?: string; asset?: Asset; memo?: string; sendMax?: string; purchase?: string } = {}) => {
  const b = new TransactionBuilder(new Account(user.publicKey(), "100"), {
    fee: BASE_FEE, networkPassphrase: PASSPHRASE, memo: Memo.text(over.memo ?? "spare:demo-app"),
  }).setTimeout(60);
  b.addOperation(Operation.payment({ destination: merchant.publicKey(), asset: USDC, amount: over.purchase ?? "1" }));
  b.addOperation(Operation.pathPaymentStrictReceive({
    sendAsset: Asset.native(), sendMax: over.sendMax ?? "2.04", destination: over.dest ?? foundationKp.publicKey(),
    destAsset: over.asset ?? USDC, destAmount: over.destAmount ?? "0.5", path: [],
  }));
  return b.build().toXDR();
};

describe("sameDonation (what the donor approved vs the re-quoted tx)", () => {
  it("accepts the same donation, purchase and memo (path and quote may differ)", () => {
    expect(sameDonation(build(), build(), PASSPHRASE)).toBe(true);
  });
  it("rejects any change to amount, destination, received asset, cap, memo or the purchase", () => {
    const other = new Asset("USDC", Keypair.random().publicKey());
    for (const over of [
      { destAmount: "0.6" }, { dest: merchant.publicKey() }, { asset: other }, { sendMax: "2.05" },
      { memo: "spare:other" }, { purchase: "2" },
    ]) {
      expect(sameDonation(build(), build(over), PASSPHRASE)).toBe(false);
    }
  });
  it("fails closed on garbage", () => {
    expect(sameDonation(build(), "nope", PASSPHRASE)).toBe(false);
  });
});
