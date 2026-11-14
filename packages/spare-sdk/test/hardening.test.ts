import { Account, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { addDonation, donateAfter, type AddDonationOptions } from "../src/index.js";
import { FOUNDATION, PASSPHRASE, buildTx, payUsdc, snapshot, stroops, user, verifiedFetch, world } from "./helpers.js";

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

describe("addDonation hardening: fee overflow", () => {
  const rich = () => world().set(user.publicKey(), snapshot({ xlmAvailable: stroops("100000000") }));
  it("a baseFee whose total exceeds uint32 is not-offered invalid-options, never throws", async () => {
    for (const baseFee of ["2000000000", "4294967295", "99999999999"]) {
      const r = await addDonation(buildTx({ ops: [payUsdc("4.20"), payUsdc("1")] }), base({ baseFee, accounts: rich() }));
      expect(r, baseFee).toMatchObject({ status: "not-offered", reason: "invalid-options" });
    }
  });
  it("a fee that fits uint32 still works", async () => {
    const r = await addDonation(buildTx(), base({ baseFee: "2000000000", accounts: rich() }));
    expect(r.status).toBe("offered");
  });
});

describe("donateAfter hardening: fee overflow", () => {
  it("a baseFee above uint32 is not-offered invalid-options", async () => {
    const accounts = world().set(user.publicKey(), snapshot({ xlmAvailable: stroops("100000000") }));
    const r = await donateAfter({ successful: true, sourceAccount: user.publicKey() }, {
      foundation: FOUNDATION, amount: "0.50", appId: "demo-app", maxAmount: "5", accounts, fetch: verifiedFetch, baseFee: "5000000000",
    });
    expect(r).toEqual({ status: "not-offered", reason: "invalid-options" });
  });
});

describe("hardening: JS callers with wrongly typed options never get a TypeError", () => {
  const bad = (o: Record<string, unknown>) => ({ ...base(), ...o }) as unknown as AddDonationOptions;
  it("addDonation: numeric amount / maxAmount", async () => {
    expect(await addDonation(buildTx(), bad({ amount: 0.5 }))).toMatchObject({ status: "not-offered", reason: "invalid-amount" });
    expect(await addDonation(buildTx(), bad({ maxAmount: 5 }))).toMatchObject({ status: "not-offered", reason: "invalid-amount" });
  });
  it("addDonation: missing foundation / accounts / options", async () => {
    expect(await addDonation(buildTx(), bad({ foundation: undefined }))).toMatchObject({ status: "not-offered", reason: "invalid-options" });
    expect(await addDonation(buildTx(), bad({ foundation: null }))).toMatchObject({ status: "not-offered", reason: "invalid-options" });
    expect(await addDonation(buildTx(), bad({ accounts: undefined }))).toMatchObject({ status: "not-offered", reason: "invalid-options" });
    expect(await addDonation(buildTx(), undefined as never)).toMatchObject({ status: "not-offered", reason: "invalid-options" });
  });
  it("donateAfter: numeric amount, missing foundation / accounts", async () => {
    const main = { successful: true, sourceAccount: user.publicKey() };
    const o = (x: Record<string, unknown>) => ({ ...base(), ...x }) as never;
    expect(await donateAfter(main, o({ amount: 0.5 }))).toMatchObject({ status: "not-offered", reason: "invalid-amount" });
    expect(await donateAfter(main, o({ maxAmount: 5 }))).toMatchObject({ status: "not-offered", reason: "invalid-amount" });
    expect(await donateAfter(main, o({ foundation: undefined }))).toMatchObject({ status: "not-offered", reason: "invalid-options" });
    expect(await donateAfter(main, o({ accounts: undefined }))).toMatchObject({ status: "not-offered", reason: "invalid-options" });
    expect(await donateAfter(main, undefined as never)).toMatchObject({ status: "not-offered", reason: "invalid-options" });
  });
});
