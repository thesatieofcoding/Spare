import { Operation } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { addDonation, NETWORKS, type AddDonationOptions, type DonationResult } from "../src/index.js";
import {
  FAKE_USDC, FOUNDATION, TESTNET_PASSPHRASE, TESTNET_USDC, buildTx, memoText, payUsdc, payXlm, user, verifiedFetch, world,
} from "./helpers.js";

const base = (over: Partial<AddDonationOptions> = {}): AddDonationOptions => ({
  foundation: FOUNDATION,
  amount: "0.50",
  appId: "demo-app",
  maxAmount: "5",
  accounts: world(),
  fetch: verifiedFetch,
  ...over,
});
const testnetTx = (...ops: ReturnType<typeof payUsdc>[]) =>
  buildTx({ passphrase: TESTNET_PASSPHRASE, ...(ops.length && { ops }) });
const reasonOf = (r: DonationResult) => (r.status === "not-offered" || r.status === "passthrough" ? r.reason : r.status);
const roundUp = (over: Partial<AddDonationOptions> = {}) => base({ amount: undefined, roundUp: true, ...over });

describe("addDonation: network option", () => {
  it("no network option behaves like 0.1.x on mainnet (S1.1)", async () => {
    const r = await addDonation(buildTx(), base());
    expect(r.status).toBe("offered");
    expect(memoText((r as Extract<DonationResult, { status: "offered" }>).transaction)).toBe("spare:demo-app");
  });

  it("testnet offers with the testnet issuer on the payment op (S1.2)", async () => {
    const r = await addDonation(testnetTx(payUsdc("4.20", TESTNET_USDC)), base({ network: "testnet", accounts: world("testnet") }));
    if (r.status !== "offered") throw new Error(reasonOf(r));
    const d = r.transaction.operations[1] as Operation.Payment;
    expect(d.asset.getIssuer()).toBe(NETWORKS.testnet.usdcIssuer);
    expect(r.transaction.networkPassphrase).toBe(NETWORKS.testnet.passphrase);
  });

  it("testnet: a tx built with the mainnet passphrase is not offered, no throw (S1.6)", async () => {
    const r = await addDonation(buildTx(), base({ network: "testnet" }));
    expect(r.status).toBe("not-offered");
    expect(reasonOf(r)).toBe("network-mismatch");
  });

  it("mainnet default: a tx built with the testnet passphrase is network-mismatch", async () => {
    expect(reasonOf(await addDonation(testnetTx(), base()))).toBe("network-mismatch");
  });

  it("an account port bound to another network is network-mismatch", async () => {
    const r = await addDonation(testnetTx(), base({ network: "testnet", accounts: world("mainnet") }));
    expect(reasonOf(r)).toBe("network-mismatch");
    expect(reasonOf(await addDonation(buildTx(), base({ accounts: world("testnet") })))).toBe("network-mismatch");
  });

  it("an unbound account port is accepted on either network", async () => {
    const r = await addDonation(testnetTx(), base({ network: "testnet", accounts: world() }));
    expect(r.status).toBe("offered");
  });

  it("unknown network at runtime is not-offered, never throws (S1.10)", async () => {
    const r = await addDonation(buildTx(), base({ network: "devnet" as never }));
    expect(r.status).toBe("not-offered");
    expect(reasonOf(r)).toBe("invalid-options");
  });

  it("fee-bump / signed txs still pass through before any network check", async () => {
    const tx = buildTx();
    tx.sign(user);
    const r = await addDonation(tx, base({ network: "testnet" }));
    expect(r.status).toBe("passthrough");
  });
});

describe("addDonation: issuer per network", () => {
  it("round-up math is identical on testnet (S1.7)", async () => {
    const r = await addDonation(testnetTx(payUsdc("4.20", TESTNET_USDC)), roundUp({ network: "testnet", accounts: world("testnet") }));
    if (r.status !== "offered") throw new Error(reasonOf(r));
    expect((r.transaction.operations[1] as Operation.Payment).amount).toBe("0.8000000");
  });

  it("round-up on testnet with a non-USDC purchase is not offered (S1.7)", async () => {
    const r = await addDonation(testnetTx(payXlm("10")), roundUp({ network: "testnet", accounts: world("testnet") }));
    expect(reasonOf(r)).toBe("round-up-needs-usdc-purchase");
  });

  it("mainnet does not count testnet-issuer USDC as a purchase (S1.3)", async () => {
    const r = await addDonation(buildTx({ ops: [payUsdc("4.20", TESTNET_USDC)] }), roundUp());
    expect(reasonOf(r)).toBe("round-up-needs-usdc-purchase");
  });

  it("testnet does not count mainnet-issuer USDC as a purchase (S1.4)", async () => {
    const r = await addDonation(testnetTx(payUsdc("4.20")), roundUp({ network: "testnet", accounts: world("testnet") }));
    expect(reasonOf(r)).toBe("round-up-needs-usdc-purchase");
  });

  it("third-party USDC is rejected on both networks (S1.5)", async () => {
    for (const network of ["mainnet", "testnet"] as const) {
      const tx = buildTx({ passphrase: NETWORKS[network].passphrase, ops: [payUsdc("4.20", FAKE_USDC)] });
      const r = await addDonation(tx, roundUp({ network, accounts: world(network) }));
      expect(reasonOf(r)).toBe("round-up-needs-usdc-purchase");
    }
  });

  it("fixed mode: a foreign-issuer USDC purchase does not count toward the balance check", async () => {
    // 1000 USDC balance, 999.80 purchase in testnet-issuer on mainnet: not USDC, so only 0.50 is required.
    const r = await addDonation(buildTx({ ops: [payUsdc("999.80", TESTNET_USDC)] }), base({ amount: "0.50" }));
    expect(r.status).toBe("offered");
  });
});
