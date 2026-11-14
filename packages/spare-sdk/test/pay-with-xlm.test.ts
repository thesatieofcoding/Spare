import { Asset, Keypair, Operation } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  addDonation, donateAfter, xlmSendMax, type AddDonationOptions, type DonateAfterOptions, type PathQuotePort,
} from "../src/index.js";
import {
  FOUNDATION, PASSPHRASE, USDC, buildTx, foundationKp, line, payUsdc, payXlm, snapshot, stroops, user, verifiedFetch,
  world,
} from "./helpers.js";
import { USDC_ISSUER } from "../src/constants.js";

/** Quote port that always prices 1 USDC at `rate` XLM and records what it was asked. */
function fakeQuotes(rate = "4", extra: Partial<{ path: Asset[]; network: "mainnet" | "testnet" }> = {}) {
  const quoteXlmForUsdc = vi.fn(async (usdc: bigint, _issuer: string) => ({
    sendAmount: (usdc * stroops(rate)) / 10_000_000n,
    path: extra.path ?? [],
  }));
  const port: PathQuotePort = { quoteXlmForUsdc, ...(extra.network && { network: extra.network }) };
  return Object.assign(port, { quoteXlmForUsdc });
}

const base = (over: Partial<AddDonationOptions> = {}): AddDonationOptions => ({
  foundation: FOUNDATION,
  appId: "demo-app",
  maxAmount: "5",
  accounts: world(),
  fetch: verifiedFetch,
  amount: "0.50",
  payWith: "xlm",
  quotes: fakeQuotes(),
  ...over,
});

const noUsdcUser = (xlm = "100") => world().set(user.publicKey(), snapshot({ usdc: null, xlmAvailable: stroops(xlm) }));

describe("xlmSendMax", () => {
  it("adds the slippage margin and rounds up to the stroop", () => {
    expect(xlmSendMax(stroops("2"), 200)).toBe(stroops("2.04"));
    expect(xlmSendMax(1n, 200)).toBe(2n); // ceil, never under the quote
    expect(xlmSendMax(stroops("2"), 0)).toBe(stroops("2"));
  });
});

describe("addDonation paying with XLM (path payment)", () => {
  it("appends a strict-receive path payment: foundation gets exactly the USDC amount", async () => {
    const quotes = fakeQuotes("4");
    const r = await addDonation(buildTx({ ops: [payXlm("10")] }), base({ quotes, accounts: noUsdcUser() }));
    if (r.status !== "offered") throw new Error(JSON.stringify(r));
    const op = r.transaction.operations.at(-1) as Operation.PathPaymentStrictReceive;
    expect(op.type).toBe("pathPaymentStrictReceive");
    expect(op.destination).toBe(foundationKp.publicKey());
    expect(op.destAsset.equals(USDC)).toBe(true);
    expect(op.destAmount).toBe("0.5000000");
    expect(op.sendAsset.isNative()).toBe(true);
    // quote 2 XLM + default 2% margin
    expect(op.sendMax).toBe("2.0400000");
    expect(op.path).toEqual([]);
    expect(quotes.quoteXlmForUsdc).toHaveBeenCalledWith(stroops("0.5"), USDC_ISSUER);
    expect(r.donation).toMatchObject({
      amount: "0.5000000", payWith: "xlm", sendMax: "2.0400000", sendMaxStroops: stroops("2.04"),
      quotedXlm: "2.0000000", quotedXlmStroops: stroops("2"),
    });
    expect(r.fee).toBe(200n);
  });

  it("keeps paying with USDC by default and says so", async () => {
    const r = await addDonation(buildTx(), base({ payWith: undefined, quotes: undefined }));
    if (r.status !== "offered") throw new Error(r.status);
    expect(r.transaction.operations.at(-1)?.type).toBe("payment");
    expect(r.donation.payWith).toBe("usdc");
    expect(r.donation.sendMax).toBeUndefined();
  });

  it("carries the quoted intermediate path", async () => {
    const hop = new Asset("EURC", Keypair.random().publicKey());
    const r = await addDonation(buildTx({ ops: [payXlm("1")] }), base({ quotes: fakeQuotes("4", { path: [hop] }) }));
    if (r.status !== "offered") throw new Error(r.status);
    const op = r.transaction.operations.at(-1) as Operation.PathPaymentStrictReceive;
    expect(op.path).toHaveLength(1);
    expect(op.path[0]?.equals(hop)).toBe(true);
  });

  it("honours a custom slippage and rejects a malformed one", async () => {
    const r = await addDonation(buildTx({ ops: [payXlm("1")] }), base({ slippageBps: 500 }));
    if (r.status !== "offered") throw new Error(r.status);
    expect(r.donation.sendMax).toBe("2.1000000");
    for (const slippageBps of [-1, 1.5, 1001, Number.NaN]) {
      expect(await addDonation(buildTx({ ops: [payXlm("1")] }), base({ slippageBps })))
        .toMatchObject({ status: "not-offered", reason: "invalid-options" });
    }
  });

  it("needs a quote port and a known pay asset", async () => {
    expect(await addDonation(buildTx(), base({ quotes: undefined }))).toMatchObject({ reason: "invalid-options" });
    expect(await addDonation(buildTx(), base({ payWith: "btc" as never }))).toMatchObject({ reason: "invalid-options" });
  });

  it("refuses a quote port from another network", async () => {
    expect(await addDonation(buildTx(), base({ quotes: fakeQuotes("4", { network: "testnet" }) })))
      .toMatchObject({ reason: "network-mismatch" });
  });

  it("offers nothing when there is no path or the quote fails (never throws)", async () => {
    const none: PathQuotePort = { quoteXlmForUsdc: async () => null };
    const boom: PathQuotePort = { quoteXlmForUsdc: async () => { throw new Error("horizon down"); } };
    const zero: PathQuotePort = { quoteXlmForUsdc: async () => ({ sendAmount: 0n, path: [] }) };
    const long: PathQuotePort = {
      quoteXlmForUsdc: async () => ({ sendAmount: 1n, path: Array.from({ length: 6 }, () => new Asset("AB", Keypair.random().publicKey())) }),
    };
    for (const quotes of [none, boom, zero, long]) {
      expect(await addDonation(buildTx(), base({ quotes }))).toMatchObject({ status: "not-offered", reason: "no-path" });
    }
  });

  it("a USDC purchase paid next to an XLM donation still needs the user's USDC to cover it", async () => {
    const tx = () => buildTx({ ops: [payUsdc("4.20")] });
    expect(await addDonation(tx(), base({ accounts: noUsdcUser() }))).toMatchObject({ reason: "user-trustline-missing" });
    const unauth = world().set(user.publicKey(), snapshot({ usdc: line(stroops("100"), false) }));
    expect(await addDonation(tx(), base({ accounts: unauth }))).toMatchObject({ reason: "user-trustline-unauthorized" });
    const short = world().set(user.publicKey(), snapshot({ usdc: line(stroops("4.19")) }));
    expect(await addDonation(tx(), base({ accounts: short }))).toMatchObject({ reason: "insufficient-balance" });
    // exactly the purchase is enough: the donation itself is paid in XLM
    const exact = world().set(user.publicKey(), snapshot({ usdc: line(stroops("4.20")) }));
    expect(await addDonation(tx(), base({ accounts: exact }))).toMatchObject({ status: "offered" });
  });

  it("rejects a quoted path that loops back through XLM", async () => {
    const native: PathQuotePort = { quoteXlmForUsdc: async () => ({ sendAmount: 1n, path: [Asset.native()] }) };
    expect(await addDonation(buildTx(), base({ quotes: native }))).toMatchObject({ reason: "no-path" });
  });

  it("still requires the foundation's authorized Circle-USDC trustline", async () => {
    const accounts = noUsdcUser().set(foundationKp.publicKey(), snapshot({ usdc: null }));
    expect(await addDonation(buildTx({ ops: [payXlm("1")] }), base({ accounts }))).toMatchObject({ reason: "foundation-trustline-missing" });
    const unauth = noUsdcUser().set(foundationKp.publicKey(), snapshot({ usdc: line(0n, false) }));
    expect(await addDonation(buildTx({ ops: [payXlm("1")] }), base({ accounts: unauth }))).toMatchObject({ reason: "foundation-trustline-unauthorized" });
  });

  it("checks XLM above the reserve covers purchase + sendMax + fee", async () => {
    // purchase 10 XLM + sendMax 2.04 + fee 0.00002 = 12.04002
    const tx = () => buildTx({ ops: [payXlm("10")] });
    expect(await addDonation(tx(), base({ accounts: noUsdcUser("12.04") }))).toMatchObject({ reason: "insufficient-balance" });
    expect(await addDonation(tx(), base({ accounts: noUsdcUser("12.04002") }))).toMatchObject({ status: "offered" });
  });

  it("checks amount and cap before asking for a quote", async () => {
    const quotes = fakeQuotes();
    expect(await addDonation(buildTx(), base({ quotes, amount: "6" }))).toMatchObject({ reason: "amount-over-cap" });
    expect(quotes.quoteXlmForUsdc).not.toHaveBeenCalled();
  });

  it("round-up still needs a USDC purchase, and may then be paid in XLM", async () => {
    expect(await addDonation(buildTx({ ops: [payXlm("1")] }), base({ amount: undefined, roundUp: true })))
      .toMatchObject({ reason: "round-up-needs-usdc-purchase" });
    const r = await addDonation(buildTx({ ops: [payUsdc("4.20")] }), base({ amount: undefined, roundUp: true }));
    if (r.status !== "offered") throw new Error(r.status);
    expect(r.donation).toMatchObject({ amount: "0.8000000", payWith: "xlm", roundedTotal: "5.0000000" });
  });

  it("network passphrase on the USDC side follows the network option", async () => {
    const r = await addDonation(buildTx({ ops: [payXlm("1")], passphrase: PASSPHRASE }), base());
    expect(r.status).toBe("offered");
  });
});

describe("donateAfter paying with XLM", () => {
  const success = { successful: true, sourceAccount: user.publicKey(), hash: "abc" };
  const opts = (over: Partial<DonateAfterOptions> = {}): DonateAfterOptions => ({
    foundation: FOUNDATION,
    amount: "0.25",
    appId: "demo-app",
    maxAmount: "5",
    accounts: noUsdcUser(),
    fetch: verifiedFetch,
    payWith: "xlm",
    quotes: fakeQuotes("4"),
    ...over,
  });

  it("builds a follow-up path payment the user signs separately", async () => {
    const r = await donateAfter(success, opts());
    if (r.status !== "offered") throw new Error(JSON.stringify(r));
    expect(r.transaction.operations).toHaveLength(1);
    const op = r.transaction.operations[0] as Operation.PathPaymentStrictReceive;
    expect(op).toMatchObject({ type: "pathPaymentStrictReceive", destAmount: "0.2500000", sendMax: "1.0200000" });
    expect(op.destAsset.equals(USDC)).toBe(true);
    expect(op.sendAsset.isNative()).toBe(true);
    expect(r.donation).toMatchObject({ payWith: "xlm", sendMax: "1.0200000" });
    expect(r.requiresSecondSignature).toBe(true);
  });

  it("offers nothing without a path or enough XLM", async () => {
    expect(await donateAfter(success, opts({ quotes: { quoteXlmForUsdc: async () => null } }))).toMatchObject({ reason: "no-path" });
    expect(await donateAfter(success, opts({ accounts: noUsdcUser("1.02") }))).toMatchObject({ reason: "insufficient-balance" });
    expect(await donateAfter(success, opts({ accounts: noUsdcUser("1.02001") }))).toMatchObject({ status: "offered" });
  });

  it("USDC follow-up still needs the user's USDC trustline", async () => {
    expect(await donateAfter(success, opts({ payWith: "usdc" }))).toMatchObject({ reason: "user-trustline-missing" });
  });
});
