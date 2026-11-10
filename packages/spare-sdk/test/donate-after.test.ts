import { Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { donateAfter, type DonateAfterOptions } from "../src/index.js";
import {
  FOUNDATION, line, memoText, PASSPHRASE, USDC, foundationKp, snapshot, stroops, tomlFetch, user, verifiedFetch, world,
} from "./helpers.js";

const success = { successful: true, sourceAccount: user.publicKey(), hash: "abc" };
const base = (over: Partial<DonateAfterOptions> = {}): DonateAfterOptions => ({
  foundation: FOUNDATION,
  amount: "0.50",
  appId: "demo-app",
  maxAmount: "5",
  accounts: world(),
  fetch: verifiedFetch,
  networkPassphrase: PASSPHRASE,
  ...over,
});

describe("donateAfter (Soroban follow-up)", () => {
  it("builds a separate unsigned payment tx with the spare memo after a successful main tx", async () => {
    const r = await donateAfter(success, base());
    if (r.status !== "offered") throw new Error(r.status);
    const tx = r.transaction;
    expect(tx.operations).toHaveLength(1);
    const op = tx.operations[0] as Operation.Payment;
    expect(op).toMatchObject({ type: "payment", destination: foundationKp.publicKey(), amount: "0.5000000" });
    expect(op.asset.equals(USDC)).toBe(true);
    expect(memoText(tx)).toBe("spare:demo-app");
    expect(tx.source).toBe(user.publicKey());
    expect(tx.sequence).toBe("101"); // account seq 100 + 1
    expect(tx.fee).toBe("100");
    expect(tx.signatures).toHaveLength(0);
    expect(tx.timeBounds?.maxTime).not.toBe("0");
    expect(r.requiresSecondSignature).toBe(true);
    expect(r.donation.attributed).toBe(true);
  });

  it("offers nothing when the main tx did not succeed", async () => {
    const r = await donateAfter({ ...success, successful: false }, base());
    expect(r).toMatchObject({ status: "not-offered", reason: "main-tx-not-successful" });
  });

  it("applies the same eligibility checks", async () => {
    expect(await donateAfter(success, base({ fetch: tomlFetch([]) }))).toMatchObject({ reason: "foundation-not-verified" });
    expect(await donateAfter(success, base({ amount: "6" }))).toMatchObject({ reason: "amount-over-cap" });
    expect(await donateAfter(success, base({ appId: "x".repeat(30) }))).toMatchObject({ reason: "invalid-app-id" });
    expect(await donateAfter(success, base({ accounts: world().set(foundationKp.publicKey(), snapshot({ usdc: line(0n, false) })) })))
      .toMatchObject({ reason: "foundation-trustline-unauthorized" });
    expect(await donateAfter(success, base({ accounts: world().set(user.publicKey(), snapshot({ usdc: line(stroops("0.1"), true) })) })))
      .toMatchObject({ reason: "insufficient-balance" });
  });

  it("rejects a malformed baseFee instead of throwing", async () => {
    for (const baseFee of ["abc", "-5", "1.5", ""]) {
      expect(await donateAfter(success, base({ baseFee }))).toMatchObject({ status: "not-offered", reason: "invalid-options" });
    }
  });

  it("applies the 100-stroop minimum fee", async () => {
    const r = await donateAfter(success, base({ baseFee: "0" }));
    if (r.status !== "offered") throw new Error(r.status);
    expect(r.transaction.fee).toBe("100");
  });

  it("is not offered when the user account needs more than the master key (single payment = medium threshold)", async () => {
    const acc = world().set(user.publicKey(), snapshot({ masterWeight: 1, thresholds: { low: 1, medium: 2, high: 2 } }));
    expect(await donateAfter(success, base({ accounts: acc }))).toMatchObject({ status: "not-offered", reason: "multisig" });
    const ok = world().set(user.publicKey(), snapshot({ masterWeight: 2, thresholds: { low: 1, medium: 2, high: 3 } }));
    expect((await donateAfter(success, base({ accounts: ok }))).status).toBe("offered");
  });

  it("checks trustline authorization and headroom", async () => {
    expect(await donateAfter(success, base({ accounts: world().set(user.publicKey(), snapshot({ usdc: line(stroops("10"), false) })) })))
      .toMatchObject({ reason: "user-trustline-unauthorized" });
    expect(await donateAfter(success, base({ accounts: world().set(foundationKp.publicKey(), snapshot({ usdc: line(0n, true, stroops("0.1")) })) })))
      .toMatchObject({ reason: "foundation-trustline-full" });
  });

  it("is round-up free: only fixed amounts", async () => {
    // @ts-expect-error roundUp is not part of the Soroban path
    const o: DonateAfterOptions = base({ roundUp: true });
    expect(o).toBeDefined();
  });

  it("produces a tx that round-trips through XDR", async () => {
    const r = await donateAfter(success, base());
    if (r.status !== "offered") throw new Error();
    const again = TransactionBuilder.fromXDR(r.transaction.toXDR(), PASSPHRASE);
    expect(again.toXDR()).toBe(r.transaction.toXDR());
  });
});
