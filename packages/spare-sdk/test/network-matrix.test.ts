import { Asset, Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  addDonation, donateAfter, NETWORKS, toAccountSnapshot, type AddDonationOptions, type HorizonAccountRecord, type Network,
} from "../src/index.js";
import {
  FOUNDATION, buildTx, foundationKp, line, payUsdc, snapshot, stroops, tomlFetch, user, verifiedFetch, world,
} from "./helpers.js";

/** SOW test matrix, run on both networks: every failing check offers nothing. */
describe.each(["mainnet", "testnet"] as const)("SOW eligibility matrix on %s", (network: Network) => {
  const cfg = NETWORKS[network];
  const usdc = new Asset("USDC", cfg.usdcIssuer);
  const tx = (amount = "4.20") => buildTx({ passphrase: cfg.passphrase, ops: [payUsdc(amount, usdc)] });
  const opts = (over: Partial<AddDonationOptions> = {}): AddDonationOptions => ({
    foundation: FOUNDATION, amount: "0.50", appId: "demo-app", maxAmount: "5",
    network, accounts: world(network), fetch: verifiedFetch, ...over,
  });
  const reason = async (over: Partial<AddDonationOptions>, t = tx()) => {
    const r = await addDonation(t, opts(over));
    return r.status === "offered" ? "offered" : (r as { reason: string }).reason;
  };

  it("baseline is offered", async () => {
    expect(await reason({})).toBe("offered");
  });
  it("amount over the cap", async () => {
    expect(await reason({ amount: "5.01" })).toBe("amount-over-cap");
  });
  it("unverified foundation (not in toml ACCOUNTS)", async () => {
    expect(await reason({ fetch: tomlFetch([Keypair.random().publicKey()]) })).toBe("foundation-not-verified");
  });
  it("foundation trustline missing", async () => {
    const a = world(network).set(foundationKp.publicKey(), snapshot({ usdc: null }));
    expect(await reason({ accounts: a })).toBe("foundation-trustline-missing");
  });
  it("foundation trustline deauthorized", async () => {
    const a = world(network).set(foundationKp.publicKey(), snapshot({ usdc: line(0n, false) }));
    expect(await reason({ accounts: a })).toBe("foundation-trustline-unauthorized");
  });
  it("user trustline missing", async () => {
    const a = world(network).set(user.publicKey(), snapshot({ usdc: null }));
    expect(await reason({ accounts: a })).toBe("user-trustline-missing");
  });
  it("insufficient balance: donation + USDC purchase", async () => {
    const a = world(network).set(user.publicKey(), snapshot({ usdc: line(stroops("4.50")) }));
    expect(await reason({ accounts: a })).toBe("insufficient-balance"); // 4.20 + 0.50 > 4.50
  });
  it("insufficient balance: fee", async () => {
    const a = world(network).set(user.publicKey(), snapshot({ xlmAvailable: 1n }));
    expect(await reason({ accounts: a })).toBe("insufficient-balance");
  });

  it("donateAfter: same checks fail closed", async () => {
    const success = { successful: true, sourceAccount: user.publicKey() };
    const d = (over: Partial<Parameters<typeof donateAfter>[1]>) =>
      donateAfter(success, { foundation: FOUNDATION, amount: "0.50", appId: "demo-app", maxAmount: "5", network, accounts: world(network), fetch: verifiedFetch, ...over });
    expect((await d({})).status).toBe("offered");
    expect(await d({ amount: "5.01" })).toMatchObject({ reason: "amount-over-cap" });
    expect(await d({ fetch: tomlFetch([Keypair.random().publicKey()]) })).toMatchObject({ reason: "foundation-not-verified" });
    expect(await d({ accounts: world(network).set(user.publicKey(), snapshot({ usdc: null })) })).toMatchObject({ reason: "user-trustline-missing" });
  });
});

/** S1.3 / S1.4 through the adapter mapping: a line in the other network's issuer is no trustline. */
describe("cross-network issuer via toAccountSnapshot", () => {
  const rec = (issuer: string): HorizonAccountRecord => ({
    account_id: "GA", sequence: "1", subentry_count: 1, num_sponsoring: 0, num_sponsored: 0,
    thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    signers: [{ key: "GA", weight: 1 }],
    balances: [
      { asset_type: "native", balance: "100.0000000" },
      { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: issuer, balance: "50.0000000", limit: "1000.0000000", is_authorized: true },
    ],
  });
  it.each([
    ["mainnet", "testnet"],
    ["testnet", "mainnet"],
  ] as const)("%s sees no USDC trustline when the account only holds %s-issuer USDC", (on, held) => {
    expect(toAccountSnapshot(rec(NETWORKS[held].usdcIssuer), NETWORKS[on].usdcIssuer).usdc).toBeNull();
    expect(toAccountSnapshot(rec(NETWORKS[on].usdcIssuer), NETWORKS[on].usdcIssuer).usdc).not.toBeNull();
  });
});
