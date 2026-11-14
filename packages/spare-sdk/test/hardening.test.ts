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

describe("donateAfter: waits for Horizon to catch up with the main tx", () => {
  const main = (over: Record<string, unknown> = {}) => ({ successful: true, sourceAccount: user.publicKey(), ledger: 500, ...over });
  const opts = (accounts: unknown, over: Record<string, unknown> = {}) => ({
    foundation: FOUNDATION, amount: "0.50", appId: "demo-app", maxAmount: "5", fetch: verifiedFetch,
    accounts, ...over,
  }) as never;
  /** Account port whose view of the user lags `stale` loads behind. */
  const lagging = (stale: number, fresh: Partial<ReturnType<typeof snapshot>>, old: Partial<ReturnType<typeof snapshot>>) => {
    const inner = world();
    let n = 0;
    return {
      loads: () => n,
      port: {
        async loadAccount(id: string) {
          if (id !== user.publicKey()) return inner.loadAccount(id);
          return snapshot(n++ < stale ? old : fresh);
        },
      },
    };
  };

  it("retries until the account ledger reaches the main tx ledger, then builds on the fresh sequence", async () => {
    const l = lagging(3, { ledger: 501, sequence: "101" }, { ledger: 499, sequence: "100" });
    const sleeps: number[] = [];
    const r = await donateAfter(main(), opts(l.port, { sleep: async (ms: number) => void sleeps.push(ms) }));
    if (r.status !== "offered") throw new Error(r.reason);
    expect(r.transaction.sequence).toBe("102");
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  it("also accepts a sequence that has reached the main tx sequence", async () => {
    const l = lagging(1, { sequence: "101" }, { sequence: "100" });
    const r = await donateAfter(main({ ledger: undefined, sequence: "101" }), opts(l.port, { sleep: async () => undefined }));
    expect(r.status).toBe("offered");
    expect(l.loads()).toBe(2);
  });

  it("never submits stale data: gives up with account-not-synced after the bounded wait", async () => {
    const l = lagging(Infinity, {}, { ledger: 499, sequence: "100" });
    const sleeps: number[] = [];
    const r = await donateAfter(main(), opts(l.port, { sleep: async (ms: number) => void sleeps.push(ms), syncTimeoutMs: 3000, syncIntervalMs: 1000 }));
    expect(r).toEqual({ status: "not-offered", reason: "account-not-synced" });
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  it("does not wait when the main result carries no ledger or sequence (as before)", async () => {
    const l = lagging(Infinity, {}, { ledger: 1, sequence: "100" });
    const r = await donateAfter(main({ ledger: undefined }), opts(l.port, { sleep: async () => { throw new Error("slept"); } }));
    expect(r.status).toBe("offered");
  });

  it("does not wait when the port reports no ledger and no sequence was given", async () => {
    const r = await donateAfter(main(), opts(world(), { sleep: async () => { throw new Error("slept"); } }));
    expect(r.status).toBe("offered");
  });
});

describe("toAccountSnapshot: ledger", () => {
  it("carries last_modified_ledger when Horizon sends it", async () => {
    const { toAccountSnapshot } = await import("../src/horizon.js");
    const rec = {
      account_id: user.publicKey(), sequence: "1", last_modified_ledger: 77, subentry_count: 0, num_sponsoring: 0, num_sponsored: 0,
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 }, signers: [], balances: [],
    };
    expect(toAccountSnapshot(rec).ledger).toBe(77);
    const { last_modified_ledger: _l, ...noLedger } = rec;
    expect(toAccountSnapshot(noLedger)).not.toHaveProperty("ledger");
  });
});
