import { execFileSync } from "node:child_process";
import {
  Account, Address, Asset, BASE_FEE, Contract, Horizon, Keypair, Networks, Operation, TransactionBuilder,
  FeeBumpTransaction, Transaction, nativeToScVal, rpc,
} from "@stellar/stellar-sdk";
import { HorizonAccountPort, NETWORKS, addDonation, donateAfter, type AccountPort } from "spare-sdk";
import { withSpare } from "spare-wallets-kit";

const PASSPHRASE = "Test SDF Network ; September 2015";
const HORIZON = "https://horizon-testnet.stellar.org";
const RPC = "https://soroban-testnet.stellar.org";
const ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const FOUNDATION = { account: "GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ", domain: "donatespare.xyz" };
const APP_ID = "spare-demo";
const MERCHANT = "GD7FFFXLB7CE3KHDSVOXOHC36G6FLCBIMLFNXMPAIPTVX7AS5EESBSND";
const USDC = new Asset("USDC", ISSUER);
const network = "testnet" as const;

const horizon = new Horizon.Server(HORIZON);
const soroban = new rpc.Server(RPC);
const accounts = new HorizonAccountPort({ network });
const link = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;
const secret = (name: string) => execFileSync("stellar", ["keys", "secret", name], { encoding: "utf8" }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
async function scenario(name: string, fn: () => Promise<string | void>) {
  try {
    const extra = await fn();
    console.log(`PASS  ${name}${extra ? `\n      ${extra}` : ""}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}
function eq<T>(actual: T, expected: T, what: string) {
  if (actual !== expected) throw new Error(`${what}: expected ${String(expected)}, got ${String(actual)}`);
}
const rec = (h: string) => `${h}\n      ${link(h)}`;

async function guard() {
  const root = (await (await fetch(HORIZON)).json()) as { network_passphrase: string };
  const net = await soroban.getNetwork();
  if (root.network_passphrase !== PASSPHRASE || net.passphrase !== PASSPHRASE || Networks.TESTNET !== PASSPHRASE)
    throw new Error("Refusing to run: endpoints are not testnet");
  if (NETWORKS.testnet.passphrase !== PASSPHRASE || NETWORKS.testnet.usdcIssuer !== ISSUER) throw new Error("SDK testnet config mismatch");
}

async function friendbot(pub: string) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${pub}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}

async function buildPayment(source: string, dest: string, amount: string, asset: Asset = USDC) {
  const acct = await horizon.loadAccount(source);
  return new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.payment({ destination: dest, asset, amount }))
    .setTimeout(120)
    .build();
}

async function submit(tx: Transaction) {
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

async function verifyOnChain(hash: string, expectedFoundationAmount: string) {
  const t = (await horizon.transactions().transaction(hash).call()) as any;
  const ops = (await horizon.operations().forTransaction(hash).limit(10).call()).records as any[];
  const payments = ops.filter((o) => o.type === "payment");
  eq(payments.length, 2, "payment op count");
  eq(ops.length, 2, "op count");
  eq(t.memo_type, "text", "memo_type");
  eq(t.memo, `spare:${APP_ID}`, "memo");
  if (Number(t.max_fee) < 200) throw new Error(`max_fee ${t.max_fee} < 200 (not raised for 2 ops)`);
  const toFoundation = payments.find((p) => p.to === FOUNDATION.account);
  if (!toFoundation) throw new Error("no payment to foundation");
  eq(toFoundation.asset_issuer, ISSUER, "donation issuer");
  eq(Number(toFoundation.amount), Number(expectedFoundationAmount), "foundation amount");
  return { t, payments };
}

async function main() {
  await guard();
  console.log("Network check OK (testnet). Running scenarios.\n");
  const user = Keypair.fromSecret(secret("spare-demo-user"));
  const userPub = user.publicKey();
  eq(userPub, "GBIWH4BQZADAZ2TKUQU3Y4MOOWWFGJXLMM5JUMX5VVPQURSI7YD3XGY2", "user key");
  const base = { foundation: FOUNDATION, appId: APP_ID, maxAmount: "5", accounts, network } as const;

  // a. classic fixed
  await scenario("a. classic: 1 USDC purchase + fixed 0.50 donation", async () => {
    const tx = await buildPayment(userPub, MERCHANT, "1");
    const r = await addDonation(tx, { ...base, amount: "0.50" });
    if (r.status !== "offered") throw new Error(`status ${r.status} ${"reason" in r ? r.reason : ""}`);
    r.transaction.sign(user);
    const hash = await submit(r.transaction);
    await verifyOnChain(hash, "0.5");
    return rec(hash);
  });

  // b. round-up
  await scenario("b. round-up: 1.30 USDC purchase -> donation 0.70, total 2.00", async () => {
    const tx = await buildPayment(userPub, MERCHANT, "1.30");
    const r = await addDonation(tx, { ...base, roundUp: true });
    if (r.status !== "offered") throw new Error(`status ${r.status} ${"reason" in r ? r.reason : ""}`);
    eq(Number(r.donation.amount), 0.7, "donation amount");
    eq(Number(r.donation.purchase), 1.3, "purchase");
    eq(Number(r.donation.roundedTotal), 2, "roundedTotal");
    r.transaction.sign(user);
    const hash = await submit(r.transaction);
    const { payments } = await verifyOnChain(hash, "0.7");
    const merch = payments.find((p) => p.to === MERCHANT);
    eq(Number(merch.amount) + Number(payments.find((p) => p.to === FOUNDATION.account).amount), 2, "on-chain total");
    return rec(hash);
  });

  // c. soroban
  await scenario("c. soroban: SAC transfer 0.5 USDC + donateAfter follow-up", async () => {
    const contractId = USDC.contractId(PASSPHRASE);
    const acct = await soroban.getAccount(userPub);
    const raw = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(
        new Contract(contractId).call(
          "transfer",
          new Address(userPub).toScVal(),
          new Address(MERCHANT).toScVal(),
          nativeToScVal(5000000n, { type: "i128" }),
        ),
      )
      .setTimeout(120)
      .build();
    const sim = await soroban.simulateTransaction(raw);
    if (rpc.Api.isSimulationError(sim)) throw new Error(`simulation: ${sim.error}`);
    const prepared = rpc.assembleTransaction(raw, sim).build();
    prepared.sign(user);
    const sent = await soroban.sendTransaction(prepared);
    if (sent.status === "ERROR") throw new Error(`send error: ${JSON.stringify(sent.errorResult)}`);
    let got = await soroban.getTransaction(sent.hash);
    for (let i = 0; i < 30 && got.status === "NOT_FOUND"; i++) { await sleep(1000); got = await soroban.getTransaction(sent.hash); }
    eq(got.status, "SUCCESS", "soroban status");
    // wait for Horizon to ingest so donateAfter reads the new sequence
    for (let i = 0; i < 30; i++) {
      try { await horizon.transactions().transaction(sent.hash).call(); break; } catch { await sleep(1000); }
    }
    const follow = await donateAfter({ successful: true, sourceAccount: userPub, hash: sent.hash }, { ...base, amount: "0.50" });
    if (follow.status !== "offered") throw new Error(`follow ${follow.status} ${"reason" in follow ? follow.reason : ""}`);
    eq(follow.requiresSecondSignature, true, "requiresSecondSignature");
    follow.transaction.sign(user);
    const fh = await submit(follow.transaction);
    const mainOps = (await horizon.operations().forTransaction(sent.hash).call()).records as any[];
    eq(mainOps[0].type, "invoke_host_function", "main op type");
    const t = (await horizon.transactions().transaction(fh).call()) as any;
    eq(t.memo, `spare:${APP_ID}`, "follow-up memo");
    const ops = (await horizon.operations().forTransaction(fh).call()).records as any[];
    eq(ops.length, 1, "follow-up ops");
    eq(ops[0].to, FOUNDATION.account, "follow-up dest");
    eq(Number(ops[0].amount), 0.5, "follow-up amount");
    return `main ${rec(sent.hash)}\n      follow-up ${rec(fh)}`;
  });

  // d. negatives (no submission)
  const expect = async (name: string, run: () => Promise<{ status: string; reason?: string }>, status: string, reason: string) =>
    scenario(`d. ${name}`, async () => {
      const r = await run(); // must not throw
      eq(r.status, status, "status");
      eq(r.reason, reason, "reason");
      return `${r.status}/${r.reason}`;
    });

  const fresh = () => buildPayment(userPub, MERCHANT, "1");

  const stranger = Keypair.random();
  await friendbot(stranger.publicKey());
  await expect("unverified foundation (funded, not in toml)", async () =>
    addDonation(await fresh(), { ...base, foundation: { account: stranger.publicKey(), domain: "donatespare.xyz" }, amount: "0.50" }),
    "not-offered", "foundation-not-verified");

  await expect("amount over cap", async () => addDonation(await fresh(), { ...base, amount: "6" }), "not-offered", "amount-over-cap");
  await expect("insufficient balance (amount > balance)", async () =>
    addDonation(await fresh(), { ...base, amount: "500", maxAmount: "1000" }), "not-offered", "insufficient-balance");
  await expect("network mismatch (testnet tx, network=mainnet)", async () =>
    addDonation(await fresh(), { ...base, network: "mainnet", accounts: { loadAccount: (id: string) => accounts.loadAccount(id) } as AccountPort, amount: "0.50" }),
    "not-offered", "network-mismatch");

  // non-Circle USDC: purchase paid in USDC from a different issuer, round-up must refuse
  const fakeIssuer = Keypair.random();
  await friendbot(fakeIssuer.publicKey());
  const fakeUsdc = new Asset("USDC", fakeIssuer.publicKey());
  await expect("non-Circle USDC purchase + round-up", async () => {
    const tx = new TransactionBuilder(new Account(userPub, "1"), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(Operation.payment({ destination: MERCHANT, asset: fakeUsdc, amount: "1.30" }))
      .setTimeout(120).build();
    return addDonation(tx, { ...base, roundUp: true });
  }, "not-offered", "round-up-needs-usdc-purchase");

  // foundation whose only USDC line is a non-Circle issuer -> no Circle trustline. The live toml cannot list a
  // random account, so a toml is served for it through the injected fetch (documented in README).
  const thrower = Keypair.random();
  await friendbot(thrower.publicKey());
  {
    const acct = await horizon.loadAccount(thrower.publicKey());
    const t = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(Operation.changeTrust({ asset: fakeUsdc })).setTimeout(60).build();
    t.sign(thrower);
    await horizon.submitTransaction(t);
  }
  const tomlFetch = (async () => new Response(`ACCOUNTS = ["${thrower.publicKey()}"]\n`, { status: 200 })) as unknown as typeof fetch;
  await expect("foundation without Circle USDC trustline (only non-Circle USDC)", async () =>
    addDonation(await fresh(), { ...base, foundation: { account: thrower.publicKey(), domain: "example.test" }, fetch: tomlFetch, amount: "0.50" }),
    "not-offered", "foundation-trustline-missing");

  await expect("fee-bump passthrough", async () => {
    const inner = await fresh(); inner.sign(user);
    const fb = TransactionBuilder.buildFeeBumpTransaction(stranger, "400", inner, PASSPHRASE);
    return addDonation(fb as unknown as Transaction, { ...base, amount: "0.50" });
  }, "passthrough", "fee-bump");
  await expect("partly-signed passthrough", async () => {
    const tx = await fresh(); tx.sign(user);
    return addDonation(tx, { ...base, amount: "0.50" });
  }, "passthrough", "already-signed");
  await expect("multisig-source passthrough (medium threshold 2, master weight 1)", async () => {
    const multisig: AccountPort = {
      ...accounts, network,
      loadAccount: async (id: string) => {
        const s = await accounts.loadAccount(id);
        return s && id === userPub ? { ...s, thresholds: { ...s.thresholds, medium: 2 } } : s;
      },
    } as AccountPort;
    return addDonation(await fresh(), { ...base, accounts: multisig, amount: "0.50" });
  }, "passthrough", "multisig");

  // e. wallets-kit
  const passphrase = PASSPHRASE;
  const signer = {
    signTransaction: async (xdr: string, opts?: { networkPassphrase?: string }) => {
      const t = TransactionBuilder.fromXDR(xdr, opts?.networkPassphrase ?? passphrase) as Transaction;
      t.sign(user);
      return { signedTxXdr: t.toXDR(), signerAddress: userPub };
    },
  };
  const kitOpts = { ...base, foundationName: "Spare demo foundation", mode: { amount: "0.50" } } as const;

  await scenario("e1. wallets-kit withSpare confirm=true -> classic flow submits", async () => {
    const prompts: unknown[] = [];
    const spare = withSpare(signer, { ...kitOpts, confirm: async (p) => { prompts.push(p); return true; } });
    const tx = await buildPayment(userPub, MERCHANT, "1");
    const res = await spare.signWithDonation(tx.toXDR(), { address: userPub });
    eq(res.outcome, "donated", "outcome"); eq(res.changed, true, "changed");
    eq(prompts.length, 1, "confirm calls");
    const signed = TransactionBuilder.fromXDR(res.signedTxXdr, PASSPHRASE) as Transaction;
    const hash = await submit(signed);
    await verifyOnChain(hash, "0.5");
    return rec(hash);
  });

  await scenario("e2. wallets-kit withSpare confirm=false -> original tx signed unchanged", async () => {
    const spare = withSpare(signer, { ...kitOpts, confirm: async () => false });
    const tx = await buildPayment(userPub, MERCHANT, "0.10");
    const res = await spare.signWithDonation(tx.toXDR(), { address: userPub });
    eq(res.outcome, "declined", "outcome"); eq(res.changed, false, "changed");
    const signed = TransactionBuilder.fromXDR(res.signedTxXdr, PASSPHRASE) as Transaction;
    eq(signed.hash().toString("hex"), tx.hash().toString("hex"), "hash unchanged");
    eq(signed.operations.length, 1, "ops");
    const hash = await submit(signed);
    const ops = (await horizon.operations().forTransaction(hash).call()).records as any[];
    eq(ops.length, 1, "on-chain ops");
    return rec(hash);
  });

  console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(2); });
