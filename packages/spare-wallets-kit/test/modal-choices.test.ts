import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfirmModal, type ChoiceCheck, type DonationChoice, type DonationChoices, type DonationPrompt } from "../src/index.js";

const seven = (usd: string) => {
  const [i = "0", f = ""] = usd.split(".");
  return `${i}.${f.padEnd(7, "0")}`;
};

/** Fake evaluator: USDC fine up to `usdcLimit`, XLM at 4 XLM/USD (+2%), round-up to 5. */
function fakeChoices(over: Partial<DonationChoices> & { usdcLimit?: number; xlm?: boolean } = {}) {
  const evaluate = async (c: DonationChoice): Promise<ChoiceCheck> => {
    if (c.roundUp) return { status: "offered", amount: "0.8000000", payWith: c.payWith, purchaseTotal: "4.2000000", roundUpTotal: "5.0000000" };
    const n = Number(c.amount);
    if (!(n >= 0.01) || n > 5) return { status: "not-offered", reason: "invalid-amount" };
    if (c.payWith === "usdc" && n > (over.usdcLimit ?? 99)) return { status: "not-offered", reason: "insufficient-balance" };
    if (c.payWith === "xlm" && over.xlm === false) return { status: "not-offered", reason: "no-path" };
    return {
      status: "offered", amount: seven(c.amount as string), payWith: c.payWith,
      ...(c.payWith === "xlm" && { xlmSendMax: (n * 4 * 1.02).toFixed(7) }),
    };
  };
  const choices: DonationChoices = {
    presets: ["0.10", "0.25", "0.50"], min: "0.01", max: "5", roundUp: false, payWith: ["usdc", "xlm"],
    selected: { amount: "0.10", payWith: "usdc" },
    check: vi.fn(evaluate), select: vi.fn(evaluate),
    ...over,
  };
  return choices as DonationChoices & { check: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> };
}

const prompt = (choices: DonationChoices, over: Partial<DonationPrompt> = {}): DonationPrompt => ({
  amount: "0.1000000", payWith: "usdc", foundationName: "Tellus", foundationDomain: "tellus.example",
  mode: "fixed", wallet: "classic", locale: "en", secondSignature: false, choices, ...over,
});

const root = () => document.querySelector<HTMLElement>("[data-spare-confirm]")!.shadowRoot as ShadowRoot;
const radio = (group: "amount" | "pay", value: string) =>
  root().querySelector<HTMLInputElement>(`[data-role="${group}"] input[type=radio][value="${value}"]`)!;
const primary = () => root().querySelector<HTMLButtonElement>('button[data-action="primary"]')!;
const secondary = () => root().querySelector<HTMLButtonElement>('button[data-action="secondary"]')!;
const other = () => root().querySelector<HTMLInputElement>('input[data-role="other-amount"]')!;
const status = () => root().querySelector<HTMLElement>('[data-role="status"]')!;
const title = () => root().querySelector("h2")!.textContent;
const pick = async (el: HTMLInputElement) => {
  el.checked = true;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.advanceTimersByTimeAsync(0);
};
const type = async (value: string) => {
  other().value = value;
  other().dispatchEvent(new Event("input", { bubbles: true }));
  await vi.advanceTimersByTimeAsync(300);
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("createConfirmModal with choices", () => {
  it("renders labelled amount and pay-asset groups with the smallest preset selected", async () => {
    const p = createConfirmModal()(prompt(fakeChoices()));
    await vi.advanceTimersByTimeAsync(0);
    const amounts = root().querySelector('fieldset[data-role="amount"]')!;
    expect(amounts.querySelector("legend")?.textContent).toBe("Amount");
    expect(Array.from(amounts.querySelectorAll<HTMLInputElement>("input[type=radio]")).map((r) => r.value)).toEqual(["0.10", "0.25", "0.50", "other"]);
    expect(radio("amount", "0.10").checked).toBe(true);
    expect(radio("amount", "0.10").closest("label")?.textContent).toBe("US$0.10");
    expect(root().querySelector(`label[for="${other().id}"]`)?.textContent).toBe("Other amount (US$)");
    expect(root().querySelector('fieldset[data-role="pay"] legend')?.textContent).toBe("Pay with");
    expect(radio("pay", "usdc").checked).toBe(true);
    expect(radio("pay", "xlm").closest("label")?.textContent).toContain("≈ 0.41 XLM max");
    expect(status().getAttribute("aria-live")).toBe("polite");
    secondary().click();
    await expect(p).resolves.toBe(false);
  });

  it("picking a preset selects it and updates title and button", async () => {
    const c = fakeChoices();
    const p = createConfirmModal()(prompt(c));
    await pick(radio("amount", "0.25"));
    expect(c.select).toHaveBeenLastCalledWith({ amount: "0.25", payWith: "usdc" });
    expect(title()).toBe("Add US$0.25 for Tellus?");
    expect(primary().textContent).toBe("Add US$0.25");
    await vi.advanceTimersByTimeAsync(400);
    primary().click();
    await expect(p).resolves.toBe(true);
  });

  it("paying in XLM shows the XLM ceiling and that the foundation receives USDC", async () => {
    const c = fakeChoices();
    const p = createConfirmModal()(prompt(c));
    await pick(radio("pay", "xlm"));
    expect(c.select).toHaveBeenLastCalledWith({ amount: "0.10", payWith: "xlm" });
    expect(root().querySelector('[data-role="pay-note"]')?.textContent).toBe(
      "You pay at most 0.41 XLM; Tellus receives US$0.10 in USDC. Unused XLM stays with you.",
    );
    secondary().click();
    await p;
  });

  it("validates the other amount (min, max, format) and keeps the primary disabled", async () => {
    const c = fakeChoices();
    const p = createConfirmModal()(prompt(c));
    await vi.advanceTimersByTimeAsync(0);
    await type("0.001");
    expect(radio("amount", "other").checked).toBe(true);
    expect(other().getAttribute("aria-invalid")).toBe("true");
    expect(status().textContent).toBe("Enter an amount from US$0.01 to US$5.00.");
    expect(primary().disabled).toBe(true);
    await type("7");
    expect(primary().disabled).toBe(true);
    await type("abc");
    expect(primary().disabled).toBe(true);
    await type("1.5");
    expect(other().getAttribute("aria-invalid")).toBe("false");
    expect(c.select).toHaveBeenLastCalledWith({ amount: "1.5", payWith: "usdc" });
    expect(primary().disabled).toBe(false);
    expect(primary().textContent).toBe("Add US$1.50");
    secondary().click();
    await p;
  });

  it("accepts a decimal comma in Spanish", async () => {
    const c = fakeChoices();
    const p = createConfirmModal({ locale: "es" })(prompt(c, { locale: "es" }));
    await type("1,25");
    expect(c.select).toHaveBeenLastCalledWith({ amount: "1.25", payWith: "usdc" });
    expect(primary().textContent).toBe("Sumar US$1,25");
    expect(root().querySelector('fieldset[data-role="amount"] legend')?.textContent).toBe("Monto");
    secondary().click();
    await p;
  });

  it("rejects a decimal comma in English (it could be a thousands separator)", async () => {
    const c = fakeChoices();
    const p = createConfirmModal()(prompt(c));
    await type("1,25");
    expect(other().getAttribute("aria-invalid")).toBe("true");
    expect(primary().disabled).toBe(true);
    secondary().click();
    await p;
  });

  it("an invalid other amount invalidates the selection so yes cannot sign it", async () => {
    const c = fakeChoices();
    const p = createConfirmModal()(prompt(c));
    await type("0.001");
    expect(c.select).toHaveBeenLastCalledWith({ amount: "0.001", payWith: "usdc" });
    secondary().click();
    await p;
  });

  it("disables a pay asset that is not eligible for the amount and switches to the other", async () => {
    const c = fakeChoices({ usdcLimit: 0.3 });
    const p = createConfirmModal()(prompt(c));
    await vi.advanceTimersByTimeAsync(0);
    expect(radio("pay", "usdc").disabled).toBe(false);
    await pick(radio("amount", "0.50"));
    await vi.advanceTimersByTimeAsync(0);
    expect(radio("pay", "usdc").disabled).toBe(true);
    expect(radio("pay", "xlm").checked).toBe(true);
    expect(c.select).toHaveBeenLastCalledWith({ amount: "0.50", payWith: "xlm" });
    expect(primary().disabled).toBe(false);
    secondary().click();
    await p;
  });

  it("says so and disables confirm when no asset can pay the amount", async () => {
    const c = fakeChoices({ usdcLimit: 0.3, xlm: false });
    const p = createConfirmModal()(prompt(c));
    await pick(radio("amount", "0.50"));
    await vi.advanceTimersByTimeAsync(0);
    expect(primary().disabled).toBe(true);
    expect(status().textContent).toBe("This option isn't available right now.");
    secondary().click();
    await p;
  });

  it("disables confirm while a choice is being checked", async () => {
    let release: () => void = () => undefined;
    const c = fakeChoices();
    const slow = c.select.getMockImplementation()!;
    c.select.mockImplementation((ch: DonationChoice) => new Promise((r) => (release = () => r(slow(ch)))));
    const p = createConfirmModal()(prompt(c));
    await vi.advanceTimersByTimeAsync(500);
    release();
    await vi.advanceTimersByTimeAsync(0);
    radio("amount", "0.25").checked = true;
    radio("amount", "0.25").dispatchEvent(new Event("change", { bubbles: true }));
    expect(primary().disabled).toBe(true);
    expect(status().textContent).toBe("Checking…");
    primary().click();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(primary().disabled).toBe(false);
    secondary().click();
    await expect(p).resolves.toBe(false);
  });

  it("shows the round-up chip only when round-up is available", async () => {
    const without = createConfirmModal()(prompt(fakeChoices()));
    expect(radio("amount", "round-up")).toBeNull();
    secondary().click();
    await without;
    const c = fakeChoices({ roundUp: true });
    const p = createConfirmModal()(prompt(c));
    await vi.advanceTimersByTimeAsync(0);
    expect(radio("amount", "round-up").closest("label")?.textContent).toBe("Round up to US$5.00");
    await pick(radio("amount", "round-up"));
    expect(c.select).toHaveBeenLastCalledWith({ roundUp: true, payWith: "usdc" });
    expect(title()).toBe("Round up for Tellus?");
    secondary().click();
    await p;
  });

  it("hides the pay-asset group when only one asset is enabled", async () => {
    const p = createConfirmModal()(prompt(fakeChoices({ payWith: ["usdc"] })));
    expect(root().querySelector('fieldset[data-role="pay"]')).toBeNull();
    secondary().click();
    await p;
  });

  it("Tab cycles through every enabled control", async () => {
    const p = createConfirmModal()(prompt(fakeChoices()));
    await vi.advanceTimersByTimeAsync(0);
    const seen: (Element | null)[] = [];
    radio("amount", "0.10").focus();
    for (let i = 0; i < 6; i++) {
      root().querySelector("[role=dialog]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true }));
      seen.push(root().activeElement);
    }
    expect(seen).toEqual([other(), radio("pay", "usdc"), primary(), secondary(), radio("amount", "0.10"), other()]);
    secondary().click();
    await p;
  });
});

describe("built-in modal driving withSpare", () => {
  it("the amount picked in the modal is the one signed", async () => {
    const { withSpare } = await import("../src/index.js");
    const { baseOptions, buildTx, fakeKit, PASSPHRASE } = await import("./helpers.js");
    const { TransactionBuilder } = await import("@stellar/stellar-sdk");
    const kit = fakeKit();
    const pending = withSpare(kit, baseOptions({ mode: undefined }) as never)
      .signWithDonation(buildTx().toXDR(), { networkPassphrase: PASSPHRASE });
    await vi.waitFor(() => expect(document.querySelector("[data-spare-confirm]")).not.toBeNull());
    await pick(radio("amount", "0.25"));
    await vi.waitFor(() => expect(primary().disabled).toBe(false));
    await vi.advanceTimersByTimeAsync(400);
    primary().click();
    const r = await pending;
    const tx = TransactionBuilder.fromXDR(r.signedTxXdr.replace(/^signed:/, ""), PASSPHRASE) as import("@stellar/stellar-sdk").Transaction;
    expect((tx.operations[1] as { amount: string }).amount).toBe("0.2500000");
  });
});
