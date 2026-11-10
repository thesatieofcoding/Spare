import {
  Account, Asset, FeeBumpTransaction, Keypair, Memo, Operation, TransactionBuilder, xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { addDonation, type AddDonationOptions, type DonationResult } from "../src/index.js";
import {
  FAKE_USDC, line, memoText, FOUNDATION, FakeAccounts, PASSPHRASE, USDC, buildTx, foundationKp, merchant,
  payUsdc, payXlm, snapshot, stroops, tomlFetch, user, verifiedFetch, world,
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

function expectOffered(r: DonationResult) {
  if (r.status !== "offered") throw new Error(`expected offered, got ${JSON.stringify(r, (_, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r;
}
const notOffered = (r: DonationResult, reason: string) => {
  expect(r.status).toBe("not-offered");
  if (r.status === "not-offered") expect(r.reason).toBe(reason);
};

describe("addDonation: op building", () => {
  it("appends a USDC payment to the foundation after the existing ops", async () => {
    const tx = buildTx();
    const r = expectOffered(await addDonation(tx, base()));
    const ops = r.transaction.operations;
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ type: "payment", destination: merchant.publicKey() });
    const d = ops[1] as Operation.Payment;
    expect(d.type).toBe("payment");
    expect(d.destination).toBe(foundationKp.publicKey());
    expect(d.amount).toBe("0.5000000");
    expect(d.asset.equals(USDC)).toBe(true);
    expect(d.source).toBeUndefined();
    expect(r.donation).toMatchObject({ amount: "0.5000000", foundation: FOUNDATION.account });
  });

  it("returns a new unsigned tx, leaving the input untouched, preserving source/seq/timebounds/network", async () => {
    const tx = buildTx();
    const before = tx.toXDR();
    const r = expectOffered(await addDonation(tx, base()));
    expect(tx.toXDR()).toBe(before);
    expect(r.transaction).not.toBe(tx);
    expect(r.transaction.signatures).toHaveLength(0);
    expect(r.transaction.source).toBe(tx.source);
    expect(r.transaction.sequence).toBe(tx.sequence);
    expect(r.transaction.timeBounds).toEqual(tx.timeBounds);
    expect(r.transaction.networkPassphrase).toBe(PASSPHRASE);
    expect(Buffer.compare(r.transaction.hash(), tx.hash())).not.toBe(0);
  });

  it("raises the fee by one per-operation base fee per extra operation", async () => {
    const r = expectOffered(await addDonation(buildTx({ fee: "100" }), base()));
    expect(r.transaction.fee).toBe("200");
    expect(r.fee).toBe(200n);
    const multi = expectOffered(await addDonation(buildTx({ fee: "100", ops: [payUsdc("1"), payUsdc("1"), payUsdc("1")] }), base()));
    expect(multi.transaction.fee).toBe("400"); // 3 ops x 100 + one more op at 100
    const bumped = expectOffered(await addDonation(buildTx({ fee: "1000" }), base()));
    expect(bumped.transaction.fee).toBe("2000"); // keeps the app's per-op rate
  });

  it("baseFee override sets the per-op rate for the whole tx", async () => {
    const r = expectOffered(await addDonation(buildTx({ fee: "100" }), base({ baseFee: "250" })));
    expect(r.transaction.fee).toBe("500");
  });

  it("sets memo spare:<appId> when the tx memo is none", async () => {
    const r = expectOffered(await addDonation(buildTx(), base()));
    expect(r.transaction.memo.type).toBe("text");
    expect(memoText(r.transaction)).toBe("spare:demo-app");
    expect(r.donation.attributed).toBe(true);
  });

  it("keeps an existing memo and flags the donation as unattributed", async () => {
    const r = expectOffered(await addDonation(buildTx({ memo: Memo.text("order 42") }), base()));
    expect(memoText(r.transaction)).toBe("order 42");
    expect(r.donation.attributed).toBe(false);
    const id = expectOffered(await addDonation(buildTx({ memo: Memo.id("7") }), base()));
    expect(id.transaction.memo.type).toBe("id");
  });
});

describe("addDonation: round-up math", () => {
  it("rounds a USDC purchase up to the next whole dollar", async () => {
    const r = expectOffered(await addDonation(buildTx({ ops: [payUsdc("4.20")] }), { ...base(), amount: undefined, roundUp: true }));
    expect((r.transaction.operations[1] as Operation.Payment).amount).toBe("0.8000000");
  });
  it("sums all USDC payments in the tx", async () => {
    const r = expectOffered(await addDonation(buildTx({ ops: [payUsdc("1.30"), payUsdc("2.45")] }), { ...base(), amount: undefined, roundUp: true }));
    expect((r.transaction.operations[2] as Operation.Payment).amount).toBe("0.2500000");
  });
  it("handles 7-decimal edge values without float error", async () => {
    const r = expectOffered(await addDonation(buildTx({ ops: [payUsdc("0.1000001")] }), { ...base(), amount: undefined, roundUp: true }));
    expect((r.transaction.operations[1] as Operation.Payment).amount).toBe("0.8999999");
  });
  it("offers no donation when the purchase is already a whole dollar", async () => {
    const r = await addDonation(buildTx({ ops: [payUsdc("5")] }), { ...base(), amount: undefined, roundUp: true });
    notOffered(r, "round-up-already-whole");
  });
  it("is not offered when the purchase is not in USDC", async () => {
    notOffered(await addDonation(buildTx({ ops: [payXlm("10")] }), { ...base(), amount: undefined, roundUp: true }), "round-up-needs-usdc-purchase");
  });
  it("is not offered when USDC is from a non-Circle issuer", async () => {
    notOffered(await addDonation(buildTx({ ops: [payUsdc("4.20", FAKE_USDC)] }), { ...base(), amount: undefined, roundUp: true }), "round-up-needs-usdc-purchase");
  });
  it("is not offered for a mixed USDC + other-asset purchase", async () => {
    notOffered(await addDonation(buildTx({ ops: [payUsdc("4.20"), payXlm("1")] }), { ...base(), amount: undefined, roundUp: true }), "round-up-needs-usdc-purchase");
  });
  it("counts pathPaymentStrictSend with USDC as the send asset", async () => {
    const op = Operation.pathPaymentStrictSend({ sendAsset: USDC, sendAmount: "2.10", destination: merchant.publicKey(), destAsset: Asset.native(), destMin: "1" });
    const r = expectOffered(await addDonation(buildTx({ ops: [op] }), { ...base(), amount: undefined, roundUp: true }));
    expect((r.transaction.operations[1] as Operation.Payment).amount).toBe("0.9000000");
  });
  it("enforces the cap on the computed round-up", async () => {
    notOffered(await addDonation(buildTx({ ops: [payUsdc("4.20")] }), { ...base({ maxAmount: "0.5" }), amount: undefined, roundUp: true }), "amount-over-cap");
  });
  it("rejects amount+roundUp together and neither", async () => {
    notOffered(await addDonation(buildTx(), base({ roundUp: true })), "invalid-options");
    notOffered(await addDonation(buildTx(), { ...base(), amount: undefined }), "invalid-options");
  });
});

describe("addDonation: eligibility (not offered, tx untouched)", () => {
  it("rejects an unverified foundation", async () => {
    const tx = buildTx();
    const r = await addDonation(tx, base({ fetch: tomlFetch(["GSOMEONEELSE"]) }));
    notOffered(r, "foundation-not-verified");
    expect(r.transaction).toBe(tx);
  });
  it("rejects an amount over the cap, and accepts equal to the cap", async () => {
    notOffered(await addDonation(buildTx(), base({ amount: "5.0000001", maxAmount: "5" })), "amount-over-cap");
    expectOffered(await addDonation(buildTx(), base({ amount: "5", maxAmount: "5" })));
  });
  it("rejects invalid amounts", async () => {
    for (const amount of ["0", "-1", "abc", "0.12345678", "1e2"]) notOffered(await addDonation(buildTx(), base({ amount })), "invalid-amount");
  });
  it("rejects an invalid appId", async () => {
    notOffered(await addDonation(buildTx(), base({ appId: "a".repeat(23) })), "invalid-app-id");
    notOffered(await addDonation(buildTx(), base({ appId: "café" })), "invalid-app-id");
  });
  it("rejects an invalid foundation account", async () => {
    notOffered(await addDonation(buildTx(), base({ foundation: { ...FOUNDATION, account: "nope" } })), "invalid-foundation");
  });
  it("rejects donating to the tx's own source", async () => {
    notOffered(await addDonation(buildTx(), base({ foundation: { ...FOUNDATION, account: user.publicKey() } })), "invalid-foundation");
  });
  it("rejects a foundation with no USDC trustline", async () => {
    const acc = world().set(foundationKp.publicKey(), snapshot({ usdc: null }));
    notOffered(await addDonation(buildTx(), base({ accounts: acc })), "foundation-trustline-missing");
  });
  it("rejects a foundation whose USDC trustline is deauthorized", async () => {
    const acc = world().set(foundationKp.publicKey(), snapshot({ usdc: line(0n, false) }));
    notOffered(await addDonation(buildTx(), base({ accounts: acc })), "foundation-trustline-unauthorized");
  });
  it("rejects a missing foundation account", async () => {
    notOffered(await addDonation(buildTx(), base({ accounts: world().set(foundationKp.publicKey(), null) })), "foundation-trustline-missing");
  });
  it("rejects a user without a USDC trustline", async () => {
    notOffered(await addDonation(buildTx({ ops: [payXlm("1")] }), base({ accounts: world().set(user.publicKey(), snapshot({ usdc: null })) })), "user-trustline-missing");
  });
  it("rejects when USDC balance does not cover the donation", async () => {
    const acc = world().set(user.publicKey(), snapshot({ usdc: line(stroops("0.49"), true) }));
    notOffered(await addDonation(buildTx({ ops: [payXlm("1")] }), base({ accounts: acc })), "insufficient-balance");
  });
  it("requires balance to cover purchase + donation when the purchase is USDC", async () => {
    const acc = world().set(user.publicKey(), snapshot({ usdc: line(stroops("4.50"), true) }));
    notOffered(await addDonation(buildTx({ ops: [payUsdc("4.20")] }), base({ accounts: acc })), "insufficient-balance");
    const ok = world().set(user.publicKey(), snapshot({ usdc: line(stroops("4.70"), true) }));
    expectOffered(await addDonation(buildTx({ ops: [payUsdc("4.20")] }), base({ accounts: ok })));
  });
  it("does not add the purchase to the requirement when the purchase is not USDC", async () => {
    const acc = world().set(user.publicKey(), snapshot({ usdc: line(stroops("0.50"), true) }));
    expectOffered(await addDonation(buildTx({ ops: [payXlm("10")] }), base({ accounts: acc })));
  });
  it("rejects when XLM cannot cover the (increased) fee", async () => {
    const acc = world().set(user.publicKey(), snapshot({ xlmAvailable: 150n }));
    notOffered(await addDonation(buildTx({ fee: "100" }), base({ accounts: acc })), "insufficient-balance");
  });
  it("fails closed when the account lookup throws", async () => {
    const acc = new FakeAccounts(); // throws on any load
    notOffered(await addDonation(buildTx(), base({ accounts: acc })), "account-lookup-failed");
  });
});

describe("addDonation: pass-through (unchanged tx, no donation)", () => {
  const pass = async (tx: Transaction | FeeBumpTransaction, reason: string, over: Partial<AddDonationOptions> = {}) => {
    const r = await addDonation(tx, base(over));
    expect(r.status).toBe("passthrough");
    if (r.status === "passthrough") {
      expect(r.reason).toBe(reason);
      expect(r.transaction).toBe(tx);
    }
  };

  it("fee-bump transactions", async () => {
    const inner = buildTx();
    inner.sign(user);
    const fb = TransactionBuilder.buildFeeBumpTransaction(Keypair.random(), "200", inner, PASSPHRASE);
    await pass(fb, "fee-bump");
  });
  it("partly signed / already signed transactions", async () => {
    const tx = buildTx();
    tx.sign(user);
    await pass(tx, "already-signed");
    const partly = buildTx();
    partly.sign(Keypair.random());
    await pass(partly, "already-signed");
  });
  it("multisig: an op with a different source account", async () => {
    const op = Operation.payment({ destination: merchant.publicKey(), asset: USDC, amount: "1", source: Keypair.random().publicKey() });
    await pass(buildTx({ ops: [op] }), "multiple-sources");
  });
  it("multisig: source account needs more than one signature", async () => {
    const acc = world().set(user.publicKey(), snapshot({ masterWeight: 1, thresholds: { low: 1, medium: 2, high: 2 } }));
    await pass(buildTx(), "multisig", { accounts: acc });
  });
  it("Soroban InvokeHostFunction transactions", async () => {
    const op = Operation.invokeContractFunction({ contract: "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA", function: "hello", args: [] });
    await pass(buildTx({ ops: [op] }), "soroban");
  });
  it("other Soroban ops (extend footprint ttl, restore footprint)", async () => {
    await pass(buildTx({ ops: [Operation.extendFootprintTtl({ extendTo: 100 })] }), "soroban");
    await pass(buildTx({ ops: [Operation.restoreFootprint({})] }), "soroban");
  });
  it("never reads accounts or fetches toml for pass-through txs", async () => {
    const tx = buildTx();
    tx.sign(user);
    const boom = async () => { throw new Error("should not be called"); };
    const r = await addDonation(tx, base({ accounts: { loadAccount: boom }, fetch: boom }));
    expect(r.status).toBe("passthrough");
  });
});

describe("addDonation: non-Circle USDC", () => {
  it("never pays the foundation anything but Circle USDC", async () => {
    const r = expectOffered(await addDonation(buildTx(), base()));
    const d = r.transaction.operations[1] as Operation.Payment;
    expect(d.asset.getIssuer()).toBe("GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
  });
});



const roundUp = (over: Partial<AddDonationOptions> = {}): AddDonationOptions => ({ ...base(over), amount: undefined, roundUp: true });
const poolId = "a".repeat(64);

describe("addDonation: purchase reported for the confirmation UI", () => {
  it("returns the USDC purchase and the rounded total on a round-up", async () => {
    const r = expectOffered(await addDonation(buildTx({ ops: [payUsdc("4.20")] }), roundUp()));
    expect(r.donation).toMatchObject({
      purchase: "4.2000000", purchaseStroops: stroops("4.20"),
      roundedTotal: "5.0000000", roundedTotalStroops: stroops("5"),
    });
  });
  it("counts a pathPaymentStrictSend purchase (not only payment ops)", async () => {
    const op = Operation.pathPaymentStrictSend({ sendAsset: USDC, sendAmount: "2.10", destination: merchant.publicKey(), destAsset: Asset.native(), destMin: "1" });
    const r = expectOffered(await addDonation(buildTx({ ops: [op] }), roundUp()));
    expect(r.donation).toMatchObject({ purchase: "2.1000000", roundedTotal: "3.0000000", amount: "0.9000000" });
  });
  it("is not offered on pathPaymentStrictReceive: the real spend is unknown up front", async () => {
    const op = Operation.pathPaymentStrictReceive({ sendAsset: USDC, sendMax: "2.10", destination: merchant.publicKey(), destAsset: Asset.native(), destAmount: "1" });
    notOffered(await addDonation(buildTx({ ops: [op] }), roundUp()), "round-up-needs-usdc-purchase");
  });
  it("fixed mode with strictReceive reserves sendMax in the balance check", async () => {
    const op = Operation.pathPaymentStrictReceive({ sendAsset: USDC, sendMax: "10", destination: merchant.publicKey(), destAsset: Asset.native(), destAmount: "1" });
    const acc = world().set(user.publicKey(), snapshot({ usdc: line(stroops("10.2"), true) }));
    notOffered(await addDonation(buildTx({ ops: [op] }), base({ accounts: acc })), "insufficient-balance");
  });
});

describe("addDonation: multisig and extra signers (CAP-21)", () => {
  const acc = (s: Parameters<typeof snapshot>[0]) => world().set(user.publicKey(), snapshot(s));
  it("passes through a tx with extraSigners", async () => {
    const tx = TransactionBuilder.cloneFrom(buildTx(), { fee: "100", extraSigners: [Keypair.random().publicKey()] }).build();
    const r = await addDonation(tx, base());
    expect(r).toMatchObject({ status: "passthrough", reason: "extra-signers" });
    expect(r.transaction).toBe(tx);
  });
  it("offers when the master key alone meets the medium threshold", async () => {
    expectOffered(await addDonation(buildTx(), base({ accounts: acc({ masterWeight: 2, thresholds: { low: 1, medium: 2, high: 3 } }) })));
  });
  it("passes through when master weight is below the medium threshold", async () => {
    const r = await addDonation(buildTx(), base({ accounts: acc({ masterWeight: 1, thresholds: { low: 1, medium: 2, high: 2 } }) }));
    expect(r).toMatchObject({ status: "passthrough", reason: "multisig" });
  });
  it("passes through when the master key is disabled", async () => {
    const r = await addDonation(buildTx(), base({ accounts: acc({ masterWeight: 0 }) }));
    expect(r).toMatchObject({ status: "passthrough", reason: "multisig" });
  });
  it("uses the HIGH threshold when the tx has a setOptions op", async () => {
    const accounts = acc({ masterWeight: 2, thresholds: { low: 1, medium: 2, high: 3 } });
    const tx = buildTx({ ops: [payUsdc("1"), Operation.setOptions({ homeDomain: "x.example" })] });
    expect(await addDonation(tx, base({ accounts }))).toMatchObject({ status: "passthrough", reason: "multisig" });
  });
});

describe("addDonation: SEP-29 memo_required", () => {
  const memoReq = (dest = merchant.publicKey()) => world().set(dest, snapshot({ memoRequired: true }));
  it("does not set the Spare memo when a payment destination requires a memo", async () => {
    const r = expectOffered(await addDonation(buildTx(), base({ accounts: memoReq() })));
    expect(r.transaction.memo.type).toBe("none");
    expect(r.donation.attributed).toBe(false);
    expect(r.transaction.operations).toHaveLength(2);
  });
  it("covers path payment destinations", async () => {
    const op = Operation.pathPaymentStrictSend({ sendAsset: USDC, sendAmount: "2", destination: merchant.publicKey(), destAsset: Asset.native(), destMin: "1" });
    const r = expectOffered(await addDonation(buildTx({ ops: [op] }), base({ accounts: memoReq() })));
    expect(r.transaction.memo.type).toBe("none");
    expect(r.donation.attributed).toBe(false);
  });
  it("still tags when no destination requires a memo", async () => {
    expect(expectOffered(await addDonation(buildTx(), base())).donation.attributed).toBe(true);
  });
  it("fails closed on the memo: an unreadable destination leaves the memo unset", async () => {
    const accounts = new FakeAccounts()
      .set(user.publicKey(), snapshot())
      .set(foundationKp.publicKey(), snapshot({ usdc: line(0n, true) }));
    const r = expectOffered(await addDonation(buildTx(), base({ accounts }))); // merchant lookup throws
    expect(r.transaction.memo.type).toBe("none");
    expect(r.donation.attributed).toBe(false);
  });
  it("a non-existent destination is not memo-required", async () => {
    const r = expectOffered(await addDonation(buildTx(), base({ accounts: world().set(merchant.publicKey(), null) })));
    expect(r.donation.attributed).toBe(true);
  });
  it("keeps an existing memo untouched", async () => {
    const r = expectOffered(await addDonation(buildTx({ memo: Memo.text("order 42") }), base({ accounts: memoReq() })));
    expect(memoText(r.transaction)).toBe("order 42");
  });
});

describe("addDonation: trustline and operation eligibility", () => {
  it("rejects an unauthorized user USDC trustline", async () => {
    const acc = world().set(user.publicKey(), snapshot({ usdc: line(stroops("100"), false) }));
    notOffered(await addDonation(buildTx({ ops: [payXlm("1")] }), base({ accounts: acc })), "user-trustline-unauthorized");
  });
  it("rejects a foundation trustline without headroom, accepts exact fit", async () => {
    const full = world().set(foundationKp.publicKey(), snapshot({ usdc: line(0n, true, stroops("0.49")) }));
    notOffered(await addDonation(buildTx(), base({ accounts: full })), "foundation-trustline-full");
    const exact = world().set(foundationKp.publicKey(), snapshot({ usdc: line(0n, true, stroops("0.5")) }));
    expectOffered(await addDonation(buildTx(), base({ accounts: exact })));
  });
  it("counts XLM sent by the tx in the XLM sufficiency check", async () => {
    const acc = world().set(user.publicKey(), snapshot({ xlmAvailable: stroops("100") }));
    notOffered(await addDonation(buildTx({ ops: [payXlm("100")] }), base({ accounts: acc })), "insufficient-balance");
    expectOffered(await addDonation(buildTx({ ops: [payXlm("99")] }), base({ accounts: acc })));
    const create = Operation.createAccount({ destination: Keypair.random().publicKey(), startingBalance: "100" });
    notOffered(await addDonation(buildTx({ ops: [create] }), base({ accounts: acc })), "insufficient-balance");
  });
  it("is not offered for ops that can spend USDC but are not modelled", async () => {
    const buy = Operation.manageBuyOffer({ selling: USDC, buying: Asset.native(), buyAmount: "1", price: "1" });
    const claim = Operation.createClaimableBalance({ asset: USDC, amount: "1", claimants: [new (await import("@stellar/stellar-sdk")).Claimant(merchant.publicKey())] });
    const lp = Operation.liquidityPoolDeposit({ liquidityPoolId: poolId, maxAmountA: "1", maxAmountB: "1", minPrice: "0.5", maxPrice: "2" });
    for (const op of [buy, claim, lp]) notOffered(await addDonation(buildTx({ ops: [op] }), base()), "unsupported-operation");
  });
  it("round-up is not offered when the tx has an unmodelled op next to the USDC payment", async () => {
    const lpw = Operation.liquidityPoolWithdraw({ liquidityPoolId: poolId, amount: "1", minAmountA: "0", minAmountB: "0" });
    notOffered(await addDonation(buildTx({ ops: [payUsdc("4.20"), lpw] }), roundUp()), "round-up-needs-usdc-purchase");
  });
});

describe("addDonation: fee options", () => {
  it("rejects a malformed baseFee instead of throwing", async () => {
    for (const baseFee of ["abc", "-1", "1.5", "", "1e3", "9".repeat(30)]) {
      notOffered(await addDonation(buildTx(), base({ baseFee })), "invalid-options");
    }
  });
  it("uses the same fee for eligibility and build when the tx fee is zero (min 100 per op)", async () => {
    const r = expectOffered(await addDonation(buildTx({ fee: "0" }), base()));
    expect(r.transaction.fee).toBe("200");
    expect(r.fee).toBe(200n);
    const tight = world().set(user.publicKey(), snapshot({ xlmAvailable: 150n }));
    notOffered(await addDonation(buildTx({ fee: "0" }), base({ accounts: tight })), "insufficient-balance");
  });
});
