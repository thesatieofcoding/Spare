import {
  Account, Asset, BASE_FEE, Keypair, Memo, Networks, TransactionBuilder, Operation, type Transaction,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { withSpare, type DonationPrompt } from "../src/index.js";
import {
  PASSPHRASE, USDC, baseOptions, buildPathTx, buildTx, fakeKit, foundationKp, merchant, user, world,
} from "./helpers.js";

const confirmFn = (answer: boolean | Error) =>
  vi.fn(async (_p: DonationPrompt) => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
const signedXdr = (s: string) => s.replace(/^signed:/, "");

describe("withSpare: classic flow", () => {
  it("offered + yes signs the modified tx and reports the changed hash", async () => {
    const kit = fakeKit();
    const confirm = confirmFn(true);
    const tx = buildTx();
    const spare = withSpare(kit, baseOptions({ confirm }) as never);

    const r = await spare.signWithDonation(tx.toXDR(), { networkPassphrase: PASSPHRASE });

    expect(confirm).toHaveBeenCalledOnce();
    expect(r.changed).toBe(true);
    expect(r.outcome).toBe("donated");
    expect(r.donation?.amount).toBe("0.5000000");
    const sent = TransactionBuilder.fromXDR(signedXdr(r.signedTxXdr), PASSPHRASE) as Transaction;
    expect(sent.operations).toHaveLength(2);
    expect((sent.operations[1] as Operation.Payment).destination).toBe(foundationKp.publicKey());
    expect(Buffer.from(sent.hash()).toString("hex")).not.toBe(Buffer.from(tx.hash()).toString("hex"));
    expect(spare.lastDonation?.amount).toBe("0.5000000");
  });

  it("passes the prompt data to confirm (amount, foundation, mode, wallet, locale)", async () => {
    const confirm = confirmFn(true);
    const spare = withSpare(fakeKit(), baseOptions({ confirm, locale: "es" }) as never);
    await spare.signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      amount: "0.5000000",
      foundationName: "Fundación Ejemplo",
      foundationDomain: "foundation.example",
      mode: "fixed",
      wallet: "classic",
      locale: "es",
      secondSignature: false,
    });
  });

  it("round-up shows the purchase of a pathPaymentStrictSend, as computed by the SDK", async () => {
    const confirm = confirmFn(true);
    const spare = withSpare(fakeKit(), baseOptions({ confirm, mode: { roundUp: true } }) as never);
    await spare.signWithDonation(buildPathTx("2.10").toXDR(), { networkPassphrase: PASSPHRASE });
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      mode: "round-up", amount: "0.9000000", purchaseTotal: "2.1000000", roundUpTotal: "3.0000000",
    });
  });

  it("round-up mode prompts with mode 'round-up'", async () => {
    const confirm = confirmFn(true);
    const spare = withSpare(fakeKit(), baseOptions({ confirm, mode: { roundUp: true } }) as never);
    await spare.signWithDonation(buildTx({ usdc: "4.20" }).toXDR(), { networkPassphrase: PASSPHRASE });
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      mode: "round-up", amount: "0.8000000", purchaseTotal: "4.2000000", roundUpTotal: "5.0000000",
    });
  });

  it("offered + no signs the ORIGINAL xdr byte-identical", async () => {
    const kit = fakeKit();
    const xdr = buildTx().toXDR();
    const spare = withSpare(kit, baseOptions({ confirm: confirmFn(false) }) as never);
    const r = await spare.signWithDonation(xdr, { networkPassphrase: PASSPHRASE });
    expect(kit.signTransaction).toHaveBeenCalledWith(xdr, { networkPassphrase: PASSPHRASE });
    expect(r.signedTxXdr).toBe(`signed:${xdr}`);
    expect(r).toMatchObject({ changed: false, donation: null, outcome: "declined" });
  });

  it("passthrough (already signed) never asks and signs the original", async () => {
    const tx = buildTx();
    tx.sign(user);
    const confirm = confirmFn(true);
    const kit = fakeKit();
    const r = await withSpare(kit, baseOptions({ confirm }) as never).signWithDonation(tx.toXDR(), {
      networkPassphrase: PASSPHRASE,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(r).toMatchObject({ changed: false, donation: null, outcome: "passthrough", reason: "already-signed" });
    expect(kit.signTransaction.mock.calls[0]?.[0]).toBe(tx.toXDR());
  });

  it("not-offered (unverified foundation) never asks and signs the original", async () => {
    const confirm = confirmFn(true);
    const unverified = async () => new Response('ACCOUNTS = []\n');
    const xdr = buildTx().toXDR();
    const kit = fakeKit();
    const r = await withSpare(kit, baseOptions({ confirm, fetch: unverified }) as never).signWithDonation(xdr, {
      networkPassphrase: PASSPHRASE,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(r).toMatchObject({ changed: false, outcome: "not-offered", reason: "foundation-not-verified" });
    expect(kit.signTransaction.mock.calls[0]?.[0]).toBe(xdr);
  });

  it("fails closed when Spare logic throws: signs original, never blocks", async () => {
    const xdr = buildTx().toXDR();
    const kit = fakeKit();
    const exploding = { ...baseOptions(), confirm: confirmFn(true) };
    Object.defineProperty(exploding, "foundation", { get() { throw new Error("kaboom"); } });
    const r = await withSpare(kit, exploding as never).signWithDonation(xdr, {
      networkPassphrase: PASSPHRASE,
    });
    expect(r).toMatchObject({ changed: false, donation: null, outcome: "error" });
    expect(kit.signTransaction.mock.calls[0]?.[0]).toBe(xdr);
  });

  it("fails closed when confirm throws", async () => {
    const xdr = buildTx().toXDR();
    const kit = fakeKit();
    const r = await withSpare(kit, baseOptions({ confirm: confirmFn(new Error("ui crashed")) }) as never)
      .signWithDonation(xdr, { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ changed: false, outcome: "error" });
    expect(kit.signTransaction.mock.calls[0]?.[0]).toBe(xdr);
  });

  it("fails closed on unparseable xdr and on an unknown network at runtime", async () => {
    const kit = fakeKit();
    const spare = withSpare(
      kit, baseOptions({ confirm: confirmFn(true), networkPassphrase: undefined, network: "devnet" }) as never,
    );
    const r1 = await spare.signWithDonation("not-xdr", { networkPassphrase: PASSPHRASE });
    const r2 = await spare.signWithDonation(buildTx().toXDR());
    expect(r1.outcome).toBe("error");
    expect(r2.outcome).toBe("error");
    expect(r2.reason).toBe("missing-network-passphrase");
    expect(kit.signTransaction).toHaveBeenCalledTimes(2);
  });

  it("with neither network nor any passphrase it fails closed and signs the original (as in 0.1)", async () => {
    const kit = fakeKit();
    const confirm = confirmFn(true);
    const spare = withSpare(kit, baseOptions({ confirm, networkPassphrase: undefined }) as never);
    const xdr = buildTx().toXDR();
    const r = await spare.signWithDonation(xdr);
    expect(r).toMatchObject({ changed: false, outcome: "error", reason: "missing-network-passphrase" });
    expect(confirm).not.toHaveBeenCalled();
    expect(kit.signTransaction).toHaveBeenCalledWith(xdr, {});
  });

  it("with neither network nor any passphrase the follow-up is skipped", async () => {
    const spare = withSpare(fakeKit(), baseOptions({ confirm: confirmFn(true), networkPassphrase: undefined }) as never);
    expect(await spare.offerFollowUp({ successful: true, sourceAccount: user.publicKey(), hash: "abc" })).toEqual({
      status: "skipped", reason: "missing-network-passphrase",
    });
  });

  it("propagates wallet signing errors (user rejected in wallet)", async () => {
    const kit = fakeKit();
    kit.signTransaction.mockRejectedValueOnce(new Error("rejected"));
    const spare = withSpare(kit, baseOptions({ confirm: confirmFn(true) }) as never);
    await expect(spare.signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE })).rejects.toThrow("rejected");
  });

  it("signTransaction keeps the kit signature and returns { signedTxXdr }", async () => {
    const spare = withSpare(fakeKit(), baseOptions({ confirm: confirmFn(true) }) as never);
    const r = await spare.signTransaction(buildTx().toXDR(), { networkPassphrase: PASSPHRASE, address: user.publicKey() });
    expect(r.signedTxXdr).toMatch(/^signed:/);
    expect(r.signerAddress).toBe(user.publicKey());
  });

  it("a user who declines is signed with the original even when the memo is taken", async () => {
    const xdr = buildTx({ memo: Memo.text("invoice-9") }).toXDR();
    const kit = fakeKit();
    const confirm = confirmFn(true);
    const r = await withSpare(kit, baseOptions({ confirm }) as never).signWithDonation(xdr, { networkPassphrase: PASSPHRASE });
    expect(r.donation?.attributed).toBe(false);
    expect(r.changed).toBe(true);
  });
});

describe("withSpare: wallet detection", () => {
  const prompt = async (kit: ReturnType<typeof fakeKit>, extra: Record<string, unknown> = {}) => {
    const confirm = confirmFn(true);
    await withSpare(kit, baseOptions({ confirm, ...extra }) as never).signWithDonation(buildTx().toXDR(), {
      networkPassphrase: PASSPHRASE,
    });
    return confirm.mock.calls[0]?.[0] as DonationPrompt;
  };

  it("wallet option 'LEDGER' gives wallet 'ledger'", async () => {
    expect((await prompt(fakeKit(), { wallet: "LEDGER" })).wallet).toBe("ledger");
  });
  it("wallet option as function is read per call", async () => {
    expect((await prompt(fakeKit(), { wallet: () => "ledger" })).wallet).toBe("ledger");
  });
  it("falls back to kit.selectedModule.productId", async () => {
    const kit = fakeKit({ selectedModule: { productId: "LEDGER" } } as never);
    expect((await prompt(kit)).wallet).toBe("ledger");
  });
  it("a throwing selectedModule getter (v2 with no wallet picked) means classic", async () => {
    const kit = fakeKit();
    Object.defineProperty(kit, "selectedModule", { get() { throw new Error("none"); } });
    expect((await prompt(kit)).wallet).toBe("classic");
  });
  it("other wallets are classic", async () => {
    expect((await prompt(fakeKit(), { wallet: "freighter" })).wallet).toBe("classic");
  });
});

describe("withSpare: Soroban follow-up", () => {
  const main = { successful: true, sourceAccount: user.publicKey(), hash: "abc" };

  it("offered + yes signs the follow-up tx; prompt says second signature", async () => {
    const kit = fakeKit();
    const confirm = confirmFn(true);
    const spare = withSpare(kit, baseOptions({ confirm }) as never);
    const r = await spare.offerFollowUp(main);
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({ wallet: "soroban", secondSignature: true, mode: "fixed" });
    expect(r.status).toBe("signed");
    if (r.status !== "signed") return;
    const tx = TransactionBuilder.fromXDR(signedXdr(r.signedTxXdr), PASSPHRASE) as Transaction;
    expect(tx.operations).toHaveLength(1);
    expect((tx.operations[0] as Operation.Payment).asset.equals(USDC)).toBe(true);
    expect(r.donation.amount).toBe("0.5000000");
  });

  it("offered + no signs nothing", async () => {
    const kit = fakeKit();
    const r = await withSpare(kit, baseOptions({ confirm: confirmFn(false) }) as never).offerFollowUp(main);
    expect(r).toEqual({ status: "skipped", reason: "declined" });
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });

  it("failed main tx: not offered, never asks", async () => {
    const confirm = confirmFn(true);
    const r = await withSpare(fakeKit(), baseOptions({ confirm }) as never).offerFollowUp({ ...main, successful: false });
    expect(r).toMatchObject({ status: "skipped", reason: "main-tx-not-successful" });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("round-up mode has no follow-up unless followUpAmount is set", async () => {
    const confirm = confirmFn(true);
    const spare = withSpare(fakeKit(), baseOptions({ confirm, mode: { roundUp: true } }) as never);
    expect((await spare.offerFollowUp(main)).status).toBe("skipped");
    const spare2 = withSpare(fakeKit(), baseOptions({ confirm, mode: { roundUp: true }, followUpAmount: "1" }) as never);
    expect((await spare2.offerFollowUp(main)).status).toBe("signed");
  });

  it("Ledger follow-up keeps wallet 'ledger' and still flags the second signature", async () => {
    const confirm = confirmFn(true);
    await withSpare(fakeKit(), baseOptions({ confirm, wallet: "LEDGER" }) as never).offerFollowUp(main);
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({ wallet: "ledger", secondSignature: true });
  });

  it("fails closed when confirm throws", async () => {
    const kit = fakeKit();
    const r = await withSpare(kit, baseOptions({ confirm: confirmFn(new Error("x")) }) as never).offerFollowUp(main);
    expect(r).toMatchObject({ status: "skipped", reason: "error" });
    expect(kit.signTransaction).not.toHaveBeenCalled();
  });
});

describe("withSpare: pass-through (never modified, never asks)", () => {
  const run = async (xdr: string, extra: Record<string, unknown> = {}) => {
    const confirm = confirmFn(true);
    const kit = fakeKit();
    const r = await withSpare(kit, baseOptions({ confirm, ...extra }) as never).signWithDonation(xdr, {
      networkPassphrase: PASSPHRASE,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(kit.signTransaction).toHaveBeenCalledOnce();
    expect(kit.signTransaction.mock.calls[0]?.[0]).toBe(xdr); // original XDR, byte for byte
    expect(r).toMatchObject({ changed: false, donation: null, outcome: "passthrough" });
    return r;
  };

  it("fee-bump envelope", async () => {
    const inner = buildTx();
    inner.sign(user);
    const bump = TransactionBuilder.buildFeeBumpTransaction(Keypair.random(), "400", inner, PASSPHRASE);
    expect((await run(bump.toXDR())).reason).toBe("fee-bump");
  });

  it("multisig source (threshold above its master weight)", async () => {
    const base = world();
    const multisig = {
      loadAccount: async (id: string) => {
        const a = await base.loadAccount(id);
        return id === user.publicKey() && a
          ? { ...a, masterWeight: 1, thresholds: { low: 2, medium: 2, high: 2 } }
          : a;
      },
    };
    expect((await run(buildTx().toXDR(), { accounts: multisig })).reason).toBe("multisig");
  });

  it("already signed", async () => {
    const tx = buildTx();
    tx.sign(user);
    expect((await run(tx.toXDR())).reason).toBe("already-signed");
  });

  it("Soroban InvokeHostFunction", async () => {
    const tx = new TransactionBuilder(new Account(user.publicKey(), "100"), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .setTimeout(60)
      .addOperation(Operation.invokeContractFunction({
        contract: USDC.contractId(PASSPHRASE), function: "transfer", args: [],
      }))
      .build();
    expect((await run(tx.toXDR())).reason).toBe("soroban");
  });
});

describe("withSpare: network option", () => {
  const TESTNET_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const testnetTx = () =>
    new TransactionBuilder(new Account(user.publicKey(), "100"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .setTimeout(60)
      .addOperation(Operation.payment({
        destination: merchant.publicKey(), asset: new Asset("USDC", TESTNET_ISSUER), amount: "4.20",
      }))
      .build();

  it("network 'testnet' parses with the testnet passphrase and offers", async () => {
    const confirm = confirmFn(true);
    const kit = fakeKit();
    const r = await withSpare(
      kit, baseOptions({ confirm, network: "testnet", networkPassphrase: undefined }) as never,
    ).signWithDonation(testnetTx().toXDR());
    expect(r.outcome).toBe("donated");
    const sent = TransactionBuilder.fromXDR(signedXdr(r.signedTxXdr), Networks.TESTNET) as Transaction;
    expect((sent.operations[1] as Operation.Payment).asset.getIssuer()).toBe(TESTNET_ISSUER);
  });

  it("a mainnet tx under network 'testnet' is not offered (network-mismatch) and signed unchanged", async () => {
    const confirm = confirmFn(true);
    const kit = fakeKit();
    const xdr = buildTx().toXDR();
    const r = await withSpare(kit, baseOptions({ confirm, network: "testnet" }) as never).signWithDonation(xdr, {
      networkPassphrase: PASSPHRASE,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(r).toMatchObject({ changed: false, outcome: "not-offered", reason: "network-mismatch" });
    expect(kit.signTransaction.mock.calls[0]?.[0]).toBe(xdr);
  });

  it("the Soroban follow-up honors network 'testnet'", async () => {
    const r = await withSpare(
      fakeKit(), baseOptions({ confirm: confirmFn(true), network: "testnet", networkPassphrase: undefined }) as never,
    ).offerFollowUp({ successful: true, sourceAccount: user.publicKey(), hash: "abc" });
    expect(r.status).toBe("signed");
    if (r.status !== "signed") return;
    const tx = TransactionBuilder.fromXDR(signedXdr(r.signedTxXdr), Networks.TESTNET) as Transaction;
    expect((tx.operations[0] as Operation.Payment).asset.getIssuer()).toBe(TESTNET_ISSUER);
  });
});
