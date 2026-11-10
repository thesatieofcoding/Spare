import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfirmModal, type DonationPrompt } from "../src/index.js";

const prompt = (over: Partial<DonationPrompt> = {}): DonationPrompt => ({
  amount: "0.5000000",
  foundationName: "Tellus Cooperative",
  foundationDomain: "tellus.example",
  mode: "fixed",
  wallet: "classic",
  locale: "en",
  secondSignature: false,
  ...over,
});

const host = () => document.querySelector<HTMLElement>("[data-spare-confirm]");
const root = () => host()?.shadowRoot as ShadowRoot;
const text = () => root().textContent ?? "";
const btn = (kind: "primary" | "secondary") => root().querySelector<HTMLButtonElement>(`button[data-action="${kind}"]`)!;
const keydown = (key: string, init: KeyboardEventInit = {}) =>
  root().querySelector("[role=dialog]")!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true, ...init }));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  host()?.remove();
  document.body.innerHTML = "";
});

describe("createConfirmModal", () => {
  it("renders an accessible dialog with the amount and foundation, then removes itself", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt());
    const dialog = root().querySelector("[role=dialog]")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby")!;
    expect(root().getElementById(labelId)?.textContent).toBe("Add US$0.50 for Tellus Cooperative?");
    expect(root().querySelector("[role=dialog]")!.getAttribute("data-domain")).toBe("tellus.example");
    expect(btn("primary").textContent).toBe("Add US$0.50");
    expect(btn("secondary").textContent).toBe("Not now");
    btn("secondary").click();
    await p;
    expect(host()).toBeNull();
  });

  it("primary resolves true once the activation guard has elapsed", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt());
    await vi.advanceTimersByTimeAsync(400);
    btn("primary").click();
    await expect(p).resolves.toBe(true);
  });

  it("ignores primary activation during the first 400ms (no accidental Enter/click)", async () => {
    let settled: boolean | undefined;
    const p = createConfirmModal({ locale: "en" })(prompt()).then((v) => (settled = v));
    btn("primary").click();
    await vi.advanceTimersByTimeAsync(399);
    btn("primary").click();
    expect(settled).toBeUndefined();
    expect(host()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    btn("primary").click();
    await p;
    expect(settled).toBe(true);
  });

  it("the secondary button works immediately", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt());
    btn("secondary").click();
    await expect(p).resolves.toBe(false);
  });

  it("shows the verified domain as secondary body text, in both languages", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt());
    const d = root().querySelector("[data-role=domain]")!;
    expect(d.textContent).toBe("Domain-verified: tellus.example");
    expect(root().querySelector("style")!.textContent).toContain(".legal, .domain { color: var(--text-secondary); }"); // Body S secondary
    btn("secondary").click();
    await p;
    const q = createConfirmModal({ locale: "es" })(prompt({ locale: "es" }));
    expect(root().querySelector("[data-role=domain]")!.textContent).toBe("Dominio verificado: tellus.example");
    btn("secondary").click();
    await q;
  });

  it("makes the page behind the dialog inert while open and restores it", async () => {
    const app = document.createElement("main");
    const already = document.createElement("aside");
    already.setAttribute("inert", "");
    document.body.append(app, already);
    const p = createConfirmModal({ locale: "en" })(prompt());
    expect(app.hasAttribute("inert")).toBe(true);
    expect(host()!.hasAttribute("inert")).toBe(false);
    btn("secondary").click();
    await p;
    expect(app.hasAttribute("inert")).toBe(false);
    expect(already.hasAttribute("inert")).toBe(true); // was inert before: stays that way
  });

  it("Esc resolves false", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt());
    keydown("Escape");
    await expect(p).resolves.toBe(false);
  });

  it("round-up variant labels the button with the rounded total", async () => {
    const p = createConfirmModal({ locale: "en" })(
      prompt({ mode: "round-up", purchaseTotal: "11.4000000", roundUpTotal: "12.0000000", amount: "0.6000000" }),
    );
    expect(root().querySelector("h2")!.textContent).toBe("Round up for Tellus Cooperative?");
    expect(root().querySelector(".body")!.textContent).toBe(
      "Your US$11.40 payment becomes US$12.00. The extra US$0.60 goes to Tellus Cooperative.",
    );
    expect(btn("primary").textContent).toBe("Round up to US$12.00");
    btn("secondary").click();
    await p;
  });

  it("soroban variant states a second signature is needed", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt({ wallet: "soroban", secondSignature: true }));
    expect(root().querySelector("[data-role=wallet-note]")!.textContent).toBe(
      "This is a separate payment, so your wallet will ask for a second signature.",
    );
    btn("secondary").click();
    await p;
  });

  it("ledger variant says to confirm on the device", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt({ wallet: "ledger" }));
    expect(root().querySelector("[data-role=wallet-note]")!.textContent).toBe(
      "Check your Ledger: it will show “Payment 0.50 USDC” before you approve.",
    );
    btn("secondary").click();
    await p;
  });

  it("classic variant has no wallet note", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt());
    expect(root().querySelector("[data-role=wallet-note]")).toBeNull();
    btn("secondary").click();
    await p;
  });

  it("renders Spanish copy", async () => {
    const p = createConfirmModal({ locale: "es" })(prompt({ locale: "es" }));
    expect(root().querySelector("h2")!.textContent).toBe("¿Sumar US$0,50 para Tellus Cooperative?");
    expect(root().querySelector(".body")!.textContent).toBe("Tu pago sigue igual hasta que confirmes. Puedes seguir sin aportar.");
    expect(text()).toContain("Tú decides. Spare nunca retiene los fondos.");
    expect(btn("secondary").textContent).toBe("Ahora no");
    expect(btn("primary").textContent).toBe("Sumar US$0,50");
    btn("secondary").click();
    await p;
  });

  it("uses the prompt locale when none is configured", async () => {
    const p = createConfirmModal()(prompt({ locale: "es" }));
    expect(btn("secondary").textContent).toBe("Ahora no");
    btn("secondary").click();
    await p;
  });

  it("moves focus into the dialog and restores it on close", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);
    const p = createConfirmModal({ locale: "en" })(prompt());
    // Not the primary button: Enter/Space right after open must not accept the donation.
    expect(root().activeElement).not.toBe(btn("primary"));
    expect(root().activeElement).toBe(root().querySelector("[role=dialog]"));
    expect(root().querySelector("[role=dialog]")!.getAttribute("tabindex")).toBe("-1");
    btn("secondary").click();
    await p;
    expect(document.activeElement).toBe(opener);
  });

  it("traps Tab inside the dialog", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt());
    btn("secondary").focus();
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true, cancelable: true });
    root().querySelector("[role=dialog]")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(root().activeElement).toBe(btn("primary"));
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, composed: true, cancelable: true });
    root().querySelector("[role=dialog]")!.dispatchEvent(back);
    expect(root().activeElement).toBe(btn("secondary"));
    btn("secondary").click();
    await p;
  });

  it("applies the requested theme and honors reduced motion in scoped styles", async () => {
    const p = createConfirmModal({ locale: "en", theme: "dark" })(prompt());
    expect(host()!.getAttribute("data-theme")).toBe("dark");
    expect(root().querySelector("style")!.textContent).toContain("prefers-reduced-motion");
    expect(root().querySelector("style")!.textContent).toContain("#A9C7A6");
    btn("secondary").click();
    await p;
  });

  it("escapes foundation names (no HTML injection)", async () => {
    const p = createConfirmModal({ locale: "en" })(prompt({ foundationName: "<img src=x onerror=alert(1)>" }));
    expect(root().querySelector("img")).toBeNull();
    btn("secondary").click();
    await p;
  });
});
