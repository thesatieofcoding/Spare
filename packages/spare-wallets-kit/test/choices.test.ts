import { Account, Asset, BASE_FEE, Operation, TransactionBuilder, type Transaction } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import type { AccountPort, PathQuotePort } from "spare-sdk";
import { withSpare, type DonationPrompt } from "../src/index.js";
import { PASSPHRASE, USDC, baseOptions, buildTx, fakeKit, foundationKp, merchant, user, world } from "./helpers.js";

const signed = (s: string) => TransactionBuilder.fromXDR(s.replace(/^signed:/, ""), PASSPHRASE) as Transaction;
const quotes = (): PathQuotePort & { quoteXlmForUsdc: ReturnType<typeof vi.fn> } => {
  const quoteXlmForUsdc = vi.fn(async (usdc: bigint) => ({ sendAmount: usdc * 4n, path: [] }));
  return { quoteXlmForUsdc };
};
const xlmTx = (): Transaction =>
  new TransactionBuilder(new Account(user.publicKey(), "100"), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .setTimeout(60)
    .addOperation(Operation.payment({ destination: merchant.publicKey(), asset: Asset.native(), amount: "3" }))
    .build();
/** User holding XLM only (no USDC trustline). */
function xlmOnlyWorld(): AccountPort {
  const w = world();
  return {
    loadAccount: async (id) => {
      const s = await w.loadAccount(id);
      return id === user.publicKey() && s ? { ...s, usdc: null } : s;
    },
  };
}

/** confirm that drives the choices, then answers. */
const driving = (fn: (p: DonationPrompt) => Promise<unknown>, answer = true) =>
  vi.fn(async (p: DonationPrompt) => {
    await fn(p);
    return answer;
  });

describe("withSpare: amount and pay-asset choices", () => {
  it("offers default presets, preselects the smallest, and pays in USDC by default", async () => {
    let seen: DonationPrompt | undefined;
    const confirm = driving(async (p) => void (seen = p));
    const r = await withSpare(fakeKit(), baseOptions({ confirm, mode: undefined }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen?.amount).toBe("0.1000000");
    expect(seen?.payWith).toBe("usdc");
    expect(seen?.choices).toMatchObject({
      presets: ["0.10", "0.25", "0.50"], min: "0.01", max: "5", payWith: ["usdc"], roundUp: true,
      selected: { amount: "0.10", payWith: "usdc" },
    });
    expect(r.donation?.amount).toBe("0.1000000");
  });

  it("keeps an explicit mode amount preselected and in the preset list", async () => {
    let seen: DonationPrompt | undefined;
    await withSpare(fakeKit(), baseOptions({ confirm: driving(async (p) => void (seen = p)), mode: { amount: "0.75" }, presets: ["0.10", "1"] }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen?.choices?.presets).toEqual(["0.10", "0.75", "1"]);
    expect(seen?.choices?.selected).toEqual({ amount: "0.75", payWith: "usdc" });
  });

  it("drops presets above the cap or below US$0.01", async () => {
    let seen: DonationPrompt | undefined;
    await withSpare(fakeKit(), baseOptions({ confirm: driving(async (p) => void (seen = p)), mode: undefined, maxAmount: "0.30", presets: ["0.001", "0.10", "0.25", "0.50", "x"] }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen?.choices?.presets).toEqual(["0.10", "0.25"]);
  });

  it("signs the amount the user selected", async () => {
    const confirm = driving(async (p) => {
      expect(await p.choices!.select({ amount: "0.25", payWith: "usdc" })).toMatchObject({ status: "offered", amount: "0.2500000" });
    });
    const r = await withSpare(fakeKit(), baseOptions({ confirm, mode: undefined }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r.outcome).toBe("donated");
    expect((signed(r.signedTxXdr).operations[1] as Operation.Payment).amount).toBe("0.2500000");
    expect(r.donation?.amount).toBe("0.2500000");
  });

  it("switching to XLM signs a path payment that delivers USDC to the foundation", async () => {
    const q = quotes();
    const confirm = driving(async (p) => {
      expect(p.choices?.payWith).toEqual(["usdc", "xlm"]);
      expect(await p.choices!.select({ amount: "0.50", payWith: "xlm" })).toMatchObject({ status: "offered", payWith: "xlm", xlmSendMax: "2.0400000" });
    });
    const r = await withSpare(fakeKit(), baseOptions({ confirm, quotes: q }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    const op = signed(r.signedTxXdr).operations[1] as Operation.PathPaymentStrictReceive;
    expect(op).toMatchObject({ type: "pathPaymentStrictReceive", destination: foundationKp.publicKey(), destAmount: "0.5000000", sendMax: "2.0400000" });
    expect(op.destAsset.equals(USDC)).toBe(true);
    expect(r.donation?.payWith).toBe("xlm");
  });

  it("defaults to XLM when the donor holds no USDC and quotes are available", async () => {
    let seen: DonationPrompt | undefined;
    const r = await withSpare(fakeKit(), baseOptions({ confirm: driving(async (p) => void (seen = p)), accounts: xlmOnlyWorld(), quotes: quotes() }) as never)
      .signWithDonation(xlmTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen).toMatchObject({ payWith: "xlm", xlmSendMax: "2.0400000", choices: { roundUp: false, selected: { payWith: "xlm" } } });
    expect(r.outcome).toBe("donated");
  });

  it("without quotes a donor holding no USDC is not offered anything", async () => {
    const confirm = vi.fn(async () => true);
    const r = await withSpare(fakeKit(), baseOptions({ confirm, accounts: xlmOnlyWorld() }) as never)
      .signWithDonation(xlmTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "not-offered", reason: "user-trustline-missing", changed: false });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("check() evaluates without changing what will be signed", async () => {
    const confirm = driving(async (p) => {
      expect(await p.choices!.check({ amount: "0.25", payWith: "usdc" })).toMatchObject({ status: "offered" });
    });
    const r = await withSpare(fakeKit(), baseOptions({ confirm }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r.donation?.amount).toBe("0.5000000");
  });

  it("an ineligible selection is never signed: yes then counts as declined", async () => {
    const confirm = driving(async (p) => {
      expect(await p.choices!.select({ amount: "6", payWith: "usdc" })).toEqual({ status: "not-offered", reason: "amount-over-cap" });
      expect(await p.choices!.check({ amount: "0.009", payWith: "usdc" })).toEqual({ status: "not-offered", reason: "invalid-amount" });
      expect(await p.choices!.check({ amount: "0.25", payWith: "xlm" })).toEqual({ status: "not-offered", reason: "xlm-unavailable" });
    });
    const kit = fakeKit();
    const tx = buildTx();
    const r = await withSpare(kit, baseOptions({ confirm }) as never).signWithDonation(tx.toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "declined", changed: false, donation: null });
    expect(kit.signTransaction.mock.calls[0]?.[0]).toBe(tx.toXDR());
  });

  it("the latest selection wins even if an earlier one resolves later", async () => {
    const confirm = driving(async (p) => {
      const a = p.choices!.select({ amount: "0.10", payWith: "usdc" });
      const b = p.choices!.select({ amount: "0.25", payWith: "usdc" });
      await Promise.all([b, a]);
    });
    const r = await withSpare(fakeKit(), baseOptions({ confirm }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r.donation?.amount).toBe("0.2500000");
  });

  it("selecting round-up on a USDC purchase signs the rounded amount", async () => {
    const confirm = driving(async (p) => {
      expect(await p.choices!.select({ roundUp: true, payWith: "usdc" })).toMatchObject({ status: "offered", roundUpTotal: "5.0000000" });
    });
    const r = await withSpare(fakeKit(), baseOptions({ confirm }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r.donation?.amount).toBe("0.8000000");
  });

  it("reads each account and stellar.toml once per prompt, however many choices are checked", async () => {
    const w = world();
    const accounts = { loadAccount: vi.fn((id: string) => w.loadAccount(id)) };
    const fetch = vi.fn(async () => new Response(`ACCOUNTS = ["${foundationKp.publicKey()}"]\n`));
    const confirm = driving(async (p) => {
      for (const amount of ["0.10", "0.25", "0.50"]) await p.choices!.check({ amount, payWith: "usdc" });
    });
    await withSpare(fakeKit(), baseOptions({ confirm, accounts, fetch }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(fetch).toHaveBeenCalledOnce();
    const users = accounts.loadAccount.mock.calls.filter(([id]) => id === user.publicKey());
    expect(users).toHaveLength(1);
  });
});

describe("withSpare: prompt cache keeps the SDK's stellar.toml limits", () => {
  it("an oversized stellar.toml still fails verification", async () => {
    const big = `ACCOUNTS = ["${foundationKp.publicKey()}"]\n# ${"x".repeat(101 * 1024)}`;
    const fetch = vi.fn(async () => new Response(big));
    const confirm = vi.fn(async () => true);
    const r = await withSpare(fakeKit(), baseOptions({ confirm, fetch }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "not-offered", reason: "foundation-not-verified" });
  });

  it("a non-UTF-8 stellar.toml still fails verification", async () => {
    const bytes = new Uint8Array([0x41, 0x43, 0xff, 0xfe]);
    const confirm = vi.fn(async () => true);
    const r = await withSpare(fakeKit(), baseOptions({ confirm, fetch: vi.fn(async () => new Response(bytes)) }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "not-offered", reason: "foundation-not-verified" });
  });
});

describe("withSpare: follow-up choices", () => {
  const main = { successful: true, sourceAccount: user.publicKey(), hash: "abc" };

  it("offers amount and asset choices without round-up, and signs the selection", async () => {
    let seen: DonationPrompt | undefined;
    const confirm = driving(async (p) => {
      seen = p;
      await p.choices!.select({ amount: "0.25", payWith: "xlm" });
    });
    const r = await withSpare(fakeKit(), baseOptions({ confirm, quotes: quotes() }) as never).offerFollowUp(main);
    expect(seen?.choices).toMatchObject({ roundUp: false, payWith: ["usdc", "xlm"] });
    if (r.status !== "signed") throw new Error(JSON.stringify(r));
    const op = signed(r.signedTxXdr).operations[0] as Operation.PathPaymentStrictReceive;
    expect(op).toMatchObject({ type: "pathPaymentStrictReceive", destAmount: "0.2500000", sendMax: "1.0200000" });
  });

  it("round-up is not a follow-up choice", async () => {
    const confirm = driving(async (p) => {
      expect(await p.choices!.select({ roundUp: true, payWith: "usdc" })).toEqual({ status: "not-offered", reason: "round-up-unavailable" });
    });
    const r = await withSpare(fakeKit(), baseOptions({ confirm }) as never).offerFollowUp(main);
    expect(r).toEqual({ status: "skipped", reason: "declined" });
  });
});
