import { Account, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { addDonation, type AddDonationOptions } from "../src/index.js";
import { FOUNDATION, PASSPHRASE, user, verifiedFetch, world } from "./helpers.js";

const base = (over: Partial<AddDonationOptions> = {}): AddDonationOptions => ({
  foundation: FOUNDATION,
  amount: "0.50",
  appId: "demo-app",
  maxAmount: "5",
  accounts: world(),
  fetch: verifiedFetch,
  ...over,
});

describe("addDonation hardening: zero-operation tx", () => {
  it("is not-offered invalid-options, never throws", async () => {
    // builder.build() accepts zero ops; the empty tx can also arrive via XDR.
    const empty = new TransactionBuilder(new Account(user.publicKey(), "100"), {
      fee: "100", networkPassphrase: PASSPHRASE,
    }).setTimeout(60).build();
    expect(empty.operations).toHaveLength(0);
    const r = await addDonation(empty, base());
    expect(r).toMatchObject({ status: "not-offered", reason: "invalid-options" });
  });
});
