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

/** Options with the picker on: explicit presets (an explicit `mode` alone keeps the 0.1.3 yes/no prompt). */
const picker = (over: Record<string, unknown> = {}) => baseOptions({ presets: ["0.10", "0.25", "0.50"], ...over });

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
    const r = await withSpare(fakeKit(), picker({ confirm, mode: undefined }) as never)
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
    await withSpare(fakeKit(), picker({ confirm: driving(async (p) => void (seen = p)), mode: { amount: "0.75" }, presets: ["0.10", "1"] }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen?.choices?.presets).toEqual(["0.10", "0.75", "1"]);
    expect(seen?.choices?.selected).toEqual({ amount: "0.75", payWith: "usdc" });
  });

  it("drops presets above the cap or below US$0.01", async () => {
    let seen: DonationPrompt | undefined;
    await withSpare(fakeKit(), picker({ confirm: driving(async (p) => void (seen = p)), mode: undefined, maxAmount: "0.30", presets: ["0.001", "0.10", "0.25", "0.50", "x"] }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen?.choices?.presets).toEqual(["0.10", "0.25"]);
  });

  it("signs the amount the user selected", async () => {
    const confirm = driving(async (p) => {
      expect(await p.choices!.select({ amount: "0.25", payWith: "usdc" })).toMatchObject({ status: "offered", amount: "0.2500000" });
    });
    const r = await withSpare(fakeKit(), picker({ confirm, mode: undefined }) as never)
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
    const r = await withSpare(fakeKit(), picker({ confirm, quotes: q }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    const op = signed(r.signedTxXdr).operations[1] as Operation.PathPaymentStrictReceive;
    expect(op).toMatchObject({ type: "pathPaymentStrictReceive", destination: foundationKp.publicKey(), destAmount: "0.5000000", sendMax: "2.0400000" });
    expect(op.destAsset.equals(USDC)).toBe(true);
    expect(r.donation?.payWith).toBe("xlm");
  });

  it("defaults to XLM when the donor holds no USDC and quotes are available", async () => {
    let seen: DonationPrompt | undefined;
    const r = await withSpare(fakeKit(), picker({ confirm: driving(async (p) => void (seen = p)), accounts: xlmOnlyWorld(), quotes: quotes() }) as never)
      .signWithDonation(xlmTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen).toMatchObject({ payWith: "xlm", xlmSendMax: "2.0400000", choices: { roundUp: false, selected: { payWith: "xlm" } } });
    expect(r.outcome).toBe("donated");
  });

  it("payWith 'xlm' preselects XLM even when USDC would work", async () => {
    let seen: DonationPrompt | undefined;
    await withSpare(fakeKit(), picker({ confirm: driving(async (p) => void (seen = p)), quotes: quotes(), payWith: "xlm" }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen).toMatchObject({ payWith: "xlm", choices: { payWith: ["usdc", "xlm"], selected: { payWith: "xlm" } } });
  });

  it("payWith 'xlm' falls back to USDC when XLM cannot pay", async () => {
    let seen: DonationPrompt | undefined;
    const none: PathQuotePort = { quoteXlmForUsdc: async () => null };
    await withSpare(fakeKit(), picker({ confirm: driving(async (p) => void (seen = p)), quotes: none, payWith: "xlm" }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen?.payWith).toBe("usdc");
  });

  it("without quotes a donor holding no USDC is not offered anything", async () => {
    const confirm = vi.fn(async () => true);
    const r = await withSpare(fakeKit(), picker({ confirm, accounts: xlmOnlyWorld() }) as never)
      .signWithDonation(xlmTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "not-offered", reason: "user-trustline-missing", changed: false });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("check() evaluates without changing what will be signed", async () => {
    const confirm = driving(async (p) => {
      expect(await p.choices!.check({ amount: "0.25", payWith: "usdc" })).toMatchObject({ status: "offered" });
    });
    const r = await withSpare(fakeKit(), picker({ confirm }) as never)
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
    const r = await withSpare(kit, picker({ confirm }) as never).signWithDonation(tx.toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "declined", changed: false, donation: null });
    expect(kit.signTransaction.mock.calls[0]?.[0]).toBe(tx.toXDR());
  });

  it("the latest selection wins even if an earlier one resolves later", async () => {
    const confirm = driving(async (p) => {
      const a = p.choices!.select({ amount: "0.10", payWith: "usdc" });
      const b = p.choices!.select({ amount: "0.25", payWith: "usdc" });
      await Promise.all([b, a]);
    });
    const r = await withSpare(fakeKit(), picker({ confirm }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r.donation?.amount).toBe("0.2500000");
  });

  it("selecting round-up on a USDC purchase signs the rounded amount", async () => {
    const confirm = driving(async (p) => {
      expect(await p.choices!.select({ roundUp: true, payWith: "usdc" })).toMatchObject({ status: "offered", roundUpTotal: "5.0000000" });
    });
    const r = await withSpare(fakeKit(), picker({ confirm }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r.donation?.amount).toBe("0.8000000");
  });

  it("reads each account and stellar.toml once per prompt, however many choices are checked", async () => {
    const w = world();
    const accounts = { loadAccount: vi.fn((id: string) => w.loadAccount(id)) };
    const fetch = vi.fn(async () => new Response(`ACCOUNTS = ["${foundationKp.publicKey()}"]\n`));
    const confirm = driving(async (p) => {
      for (const amount of ["0.10", "0.25", "0.50"]) await p.choices!.check({ amount, payWith: "usdc" });
    });
    await withSpare(fakeKit(), picker({ confirm, accounts, fetch }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(fetch).toHaveBeenCalledOnce();
    const users = accounts.loadAccount.mock.calls.filter(([id]) => id === user.publicKey());
    expect(users).toHaveLength(1);
  });
});

describe("withSpare: picker is opt-in for 0.1.3 integrations", () => {
  it("an explicit mode without presets keeps the single-amount yes/no prompt", async () => {
    let seen: DonationPrompt | undefined;
    const r = await withSpare(fakeKit(), baseOptions({ confirm: driving(async (p) => void (seen = p)) }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(seen?.choices).toBeUndefined();
    expect(r.donation?.amount).toBe("0.5000000");
  });

  it("presets, or no mode at all, turn the picker on", async () => {
    for (const over of [{ presets: ["0.25"] }, { mode: undefined }]) {
      let seen: DonationPrompt | undefined;
      await withSpare(fakeKit(), baseOptions({ confirm: driving(async (p) => void (seen = p)), ...over }) as never)
        .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
      expect(seen?.choices).toBeDefined();
    }
  });

  it("the follow-up follows the same rule", async () => {
    let seen: DonationPrompt | undefined;
    await withSpare(fakeKit(), baseOptions({ confirm: driving(async (p) => void (seen = p)) }) as never)
      .offerFollowUp({ successful: true, sourceAccount: user.publicKey(), hash: "abc" });
    expect(seen?.choices).toBeUndefined();
  });
});

describe("withSpare: selection edge cases", () => {
  it("an ineligible latest selection wins over an earlier valid one: yes is declined", async () => {
    const confirm = driving(async (p) => {
      await p.choices!.select({ amount: "0.25", payWith: "usdc" });
      await p.choices!.select({ amount: "6", payWith: "usdc" });
    });
    const r = await withSpare(fakeKit(), picker({ confirm }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "declined", changed: false });
  });

  it("a superseded selection never becomes the one signed, whatever order it resolves in", async () => {
    let releaseFirst: () => void = () => undefined;
    let slow = false;
    const quoteXlmForUsdc = vi.fn(async (usdc: bigint) => {
      if (slow) await new Promise<void>((r) => (releaseFirst = r));
      return { sendAmount: usdc * 4n, path: [] };
    });
    const confirm = driving(async (p) => {
      slow = true;
      const a = p.choices!.select({ amount: "0.25", payWith: "xlm" }); // valid, resolves last
      slow = false;
      const b = p.choices!.select({ amount: "6", payWith: "usdc" });   // invalid, resolves first
      expect(await b).toMatchObject({ status: "not-offered" });
      releaseFirst();
      expect(await a).toMatchObject({ status: "offered" });
    });
    const r = await withSpare(fakeKit(), picker({ confirm, quotes: { quoteXlmForUsdc } }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "declined", donation: null });
  });
});

describe("withSpare: XLM quote is re-checked live at confirm", () => {
  /** Quote port whose XLM price per USD can be changed mid-prompt. */
  const moving = (rate: { v: bigint | null }) => {
    const quoteXlmForUsdc = vi.fn(async (usdc: bigint) => (rate.v === null ? null : { sendAmount: usdc * rate.v, path: [] }));
    return { quoteXlmForUsdc };
  };

  it("price moved above the shown max: not signed silently, declined with quote-changed", async () => {
    const rate = { v: 4n as bigint | null };
    const confirm = driving(async (p) => {
      expect(p).toMatchObject({ payWith: "xlm", xlmSendMax: "2.0400000" });
      rate.v = 5n;
    });
    const kit = fakeKit();
    const tx = buildTx({ usdc: "1" });
    const r = await withSpare(kit, baseOptions({ confirm, quotes: moving(rate), payWith: "xlm" }) as never)
      .signWithDonation(tx.toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "declined", reason: "quote-changed", changed: false, donation: null });
    expect(kit.signTransaction.mock.calls[0]?.[0]).toBe(tx.toXDR());
  });

  it("price at or under the shown max: signs a fresh tx whose sendMax is within what was shown", async () => {
    const rate = { v: 4n as bigint | null };
    const confirm = driving(async () => void (rate.v = 3n));
    const r = await withSpare(fakeKit(), baseOptions({ confirm, quotes: moving(rate), payWith: "xlm" }) as never)
      .signWithDonation(buildTx({ usdc: "1" }).toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r.outcome).toBe("donated");
    const op = signed(r.signedTxXdr).operations[1] as Operation.PathPaymentStrictReceive;
    expect(op.sendMax).toBe("1.5300000");
    expect(r.donation?.sendMax).toBe("1.5300000");
  });

  it("no quote at confirm: declined", async () => {
    const rate = { v: 4n as bigint | null };
    const confirm = driving(async () => void (rate.v = null));
    const r = await withSpare(fakeKit(), baseOptions({ confirm, quotes: moving(rate), payWith: "xlm" }) as never)
      .signWithDonation(buildTx({ usdc: "1" }).toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "declined", reason: "quote-changed" });
  });

  it("the follow-up re-checks too", async () => {
    const rate = { v: 4n as bigint | null };
    const confirm = driving(async () => void (rate.v = 5n));
    const r = await withSpare(fakeKit(), baseOptions({ confirm, quotes: moving(rate), payWith: "xlm" }) as never)
      .offerFollowUp({ successful: true, sourceAccount: user.publicKey(), hash: "abc" });
    expect(r).toEqual({ status: "skipped", reason: "quote-changed" });
  });

  it("quotes are never served from the prompt cache", async () => {
    const q = quotes();
    const confirm = driving(async (p) => {
      await p.choices!.check({ amount: "0.25", payWith: "xlm" });
      await p.choices!.check({ amount: "0.25", payWith: "xlm" });
    }, false);
    await withSpare(fakeKit(), picker({ confirm, quotes: q }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(q.quoteXlmForUsdc.mock.calls.filter(([u]) => u === 2_500_000n)).toHaveLength(2);
  });
});

describe("withSpare: prompt cache keeps the SDK's stellar.toml limits", () => {
  it("an oversized stellar.toml still fails verification", async () => {
    const big = `ACCOUNTS = ["${foundationKp.publicKey()}"]\n# ${"x".repeat(101 * 1024)}`;
    const fetch = vi.fn(async () => new Response(big));
    const confirm = vi.fn(async () => true);
    const r = await withSpare(fakeKit(), picker({ confirm, fetch }) as never).signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    expect(r).toMatchObject({ outcome: "not-offered", reason: "foundation-not-verified" });
  });

  it("a non-UTF-8 stellar.toml still fails verification", async () => {
    const bytes = new Uint8Array([0x41, 0x43, 0xff, 0xfe]);
    const confirm = vi.fn(async () => true);
    const r = await withSpare(fakeKit(), picker({ confirm, fetch: vi.fn(async () => new Response(bytes)) }) as never)
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
    const r = await withSpare(fakeKit(), picker({ confirm, quotes: quotes() }) as never).offerFollowUp(main);
    expect(seen?.choices).toMatchObject({ roundUp: false, payWith: ["usdc", "xlm"] });
    if (r.status !== "signed") throw new Error(JSON.stringify(r));
    const op = signed(r.signedTxXdr).operations[0] as Operation.PathPaymentStrictReceive;
    expect(op).toMatchObject({ type: "pathPaymentStrictReceive", destAmount: "0.2500000", sendMax: "1.0200000" });
  });

  it("round-up is not a follow-up choice", async () => {
    const confirm = driving(async (p) => {
      expect(await p.choices!.select({ roundUp: true, payWith: "usdc" })).toEqual({ status: "not-offered", reason: "round-up-unavailable" });
    });
    const r = await withSpare(fakeKit(), picker({ confirm }) as never).offerFollowUp(main);
    expect(r).toEqual({ status: "skipped", reason: "declined" });
  });
});
