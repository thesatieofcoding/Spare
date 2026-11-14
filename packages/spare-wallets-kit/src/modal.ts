import { choiceText, modalText } from "./strings.js";
import type { ChoiceCheck, ConfirmFn, DonationChoice, DonationPrompt, Locale, PayWith, Theme } from "./types.js";

export interface ConfirmModalOptions {
  /** Forces the language. Defaults to the locale carried by the prompt. */
  locale?: Locale;
  theme?: Theme;
}

// Tokens mirror Figma `Spare / color` (Light/Dark). Fonts are not bundled: system fallbacks apply.
const STYLES = `
:host { all: initial; }
.root {
  --bg-page: #FBF7EE; --surface: #FBF7EE; --field: #B7CDB0; --border: #D9D4C8; --text-primary: #2C2B2B;
  --text-secondary: #6B6A62; --accent: #3E6650; --on-accent: #FBF7EE; --error: #8F4A3A; --scrim: rgba(26,34,29,.45);
  --font-ui: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: "Newsreader", Georgia, "Times New Roman", serif;
  position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: var(--scrim); font-family: var(--font-ui); color: var(--text-primary);
  animation: fade .16s ease-out;
}
:host([data-theme="dark"]) .root {
  --bg-page: #1A221D; --surface: #1A221D; --field: #33402F; --border: #33402F; --text-primary: #FBF7EE;
  --text-secondary: #B9B4A6; --accent: #A9C7A6; --on-accent: #2C2B2B; --error: #E3A08F; --scrim: rgba(0,0,0,.6);
}
@media (prefers-color-scheme: dark) {
  :host([data-theme="auto"]) .root {
    --bg-page: #1A221D; --surface: #1A221D; --field: #33402F; --border: #33402F; --text-primary: #FBF7EE;
    --text-secondary: #B9B4A6; --accent: #A9C7A6; --on-accent: #2C2B2B; --error: #E3A08F; --scrim: rgba(0,0,0,.6);
  }
}
.dialog {
  box-sizing: border-box; width: 420px; max-width: 100%; max-height: 100%; overflow-y: auto;
  display: flex; flex-direction: column; gap: 16px;
  padding: 28px; background: var(--bg-page); border: 1px solid var(--border); border-radius: 16px;
  animation: rise .18s ease-out;
}
.wordmark { margin: 0; font: 500 20px/24px var(--font-ui); }
.title { margin: 0; font: 500 22px/28px var(--font-display); }
.body, .legal, .note, .domain, .pay-note, .status { margin: 0; font: 400 14px/20px var(--font-ui); }
.note { font-weight: 500; }
.legal, .domain { color: var(--text-secondary); }
.status:empty { display: none; }
.status[data-tone="error"] { color: var(--error); }
.dialog:focus { outline: none; }
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
legend { padding: 0; margin-bottom: 8px; font: 500 14px/20px var(--font-ui); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { position: relative; display: inline-flex; }
.chip input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.chip span {
  display: inline-block; padding: 8px 14px; border: 1px solid var(--border); border-radius: 999px;
  font: 500 14px/20px var(--font-ui); color: var(--text-primary); background: transparent;
}
.chip input:checked + span { background: var(--field); border-color: var(--accent); }
.chip input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
.chip input:disabled + span { opacity: .45; text-decoration: line-through; }
.chip input:disabled { cursor: not-allowed; }
.other { display: flex; flex-direction: column; gap: 4px; }
.other label { font: 400 14px/20px var(--font-ui); color: var(--text-secondary); }
.other input {
  box-sizing: border-box; width: 160px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 999px;
  font: 400 14px/20px var(--font-ui); color: var(--text-primary); background: transparent;
}
.other input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.other input[aria-invalid="true"] { border-color: var(--error); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
button { font: 500 14px/20px var(--font-ui); padding: 12px 20px; border: 0; border-radius: 999px; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
.primary { background: var(--accent); color: var(--on-accent); }
.secondary { background: transparent; color: var(--text-primary); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.primary:focus-visible { outline-color: var(--text-primary); }
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rise { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { .root, .dialog { animation: none; } }
`;

let counter = 0;

/** Primary activation is ignored this long after opening: a stray Enter/click must not donate. */
const PRIMARY_GUARD_MS = 400;
/** Pause after typing in "other amount" before checking it. */
const TYPING_DEBOUNCE_MS = 300;
const AMOUNT_RE = /^\d+([.,]\d{1,7})?$/;

/** Marks the page behind the dialog inert; returns the undo (leaves already-inert nodes alone). */
function inertSiblings(host: HTMLElement): () => void {
  const marked: Element[] = [];
  for (const el of Array.from(document.body.children)) {
    if (el === host || el.hasAttribute("inert")) continue;
    el.setAttribute("inert", "");
    marked.push(el);
  }
  return () => marked.forEach((el) => el.removeAttribute("inert"));
}

/** Decimal string to a comparable number of hundred-thousandths (7 decimals), or null. */
function units(s: string): bigint | null {
  if (!AMOUNT_RE.test(s)) return null;
  const [i = "0", f = ""] = s.replace(",", ".").split(".");
  return BigInt(i) * 10_000_000n + BigInt(f.padEnd(7, "0"));
}

/**
 * Default confirmation UI: vanilla DOM in a shadow root. Resolves true only on the primary
 * button; Esc, the secondary button and the backdrop all resolve false. When the prompt carries
 * `choices`, the donor can pick an amount and pay asset; each change is re-checked and confirm
 * stays disabled until the current pick is eligible.
 */
export function createConfirmModal(options: ConfirmModalOptions = {}): ConfirmFn {
  return (prompt) =>
    new Promise<boolean>((resolve) => {
      if (typeof document === "undefined") return resolve(false);
      const locale = options.locale ?? prompt.locale;
      const text = modalText(prompt, locale);
      const opener = document.activeElement as HTMLElement | null;
      const id = `spare-title-${++counter}`;

      const host = document.createElement("div");
      host.setAttribute("data-spare-confirm", "");
      host.setAttribute("data-theme", options.theme ?? "auto");
      const shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = STYLES;

      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, content?: string) => {
        const node = document.createElement(tag);
        node.className = cls;
        if (content !== undefined) node.textContent = content;
        return node;
      };

      const root = el("div", "root");
      const dialog = el("div", "dialog");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("data-domain", prompt.foundationDomain);
      dialog.setAttribute("aria-labelledby", id);
      dialog.setAttribute("aria-describedby", `${id}-body`);
      dialog.tabIndex = -1;
      dialog.lang = locale;

      const title = el("h2", "title", text.title);
      title.id = id;
      const body = el("p", "body", text.body);
      body.id = `${id}-body`;
      const actions = el("div", "actions");
      const primary = el("button", "primary", text.primary);
      const secondary = el("button", "secondary", text.secondary);
      for (const [b, kind] of [[primary, "primary"], [secondary, "secondary"]] as const) {
        b.type = "button";
        b.setAttribute("data-action", kind);
      }
      actions.append(primary, secondary);

      const domain = el("p", "domain", text.domain);
      domain.setAttribute("data-role", "domain");
      dialog.append(el("p", "wordmark", "spare"), title, domain);

      const choices = prompt.choices;
      const controls = choices ? buildControls() : null;
      if (controls) dialog.append(controls.amountSet, ...(controls.paySet ? [controls.paySet] : []));
      dialog.append(body);
      const payNote = el("p", "pay-note", text.payNote ?? "");
      payNote.setAttribute("data-role", "pay-note");
      if (text.payNote || controls) dialog.append(payNote);
      payNote.hidden = !text.payNote;
      const note = el("p", "note", text.walletNote ?? "");
      note.setAttribute("data-role", "wallet-note");
      if (text.walletNote) dialog.append(note);
      if (controls) dialog.append(controls.status);
      const legal = el("p", "legal", text.legal);
      dialog.append(actions, legal);
      root.append(dialog);
      shadow.append(style, root);

      /** Amount radios, "other" input, pay-asset radios and the live status line. */
      function buildControls() {
        const c = choices!;
        const t = choiceText(locale);
        const group = `${id}-amount`;
        const radio = (name: string, value: string, label: string) => {
          const wrap = el("label", "chip");
          const input = el("input", "");
          input.type = "radio";
          input.name = name;
          input.value = value;
          wrap.append(input, el("span", "", label));
          return { wrap, input, span: wrap.lastChild as HTMLSpanElement };
        };
        const amountSet = el("fieldset", "group");
        amountSet.setAttribute("data-role", "amount");
        amountSet.append(el("legend", "", t.amountLegend));
        const chips = el("div", "chips");
        const presets = c.presets.map((p) => radio(group, p, t.usd(p)));
        const roundUp = c.roundUp ? radio(group, "round-up", t.roundUp(prompt.roundUpTotal ?? "0")) : null;
        const otherRadio = radio(group, "other", t.other);
        chips.append(...presets.map((p) => p.wrap), ...(roundUp ? [roundUp.wrap] : []), otherRadio.wrap);
        const otherBox = el("div", "other");
        const otherInput = el("input", "");
        otherInput.id = `${id}-other`;
        otherInput.type = "text";
        otherInput.inputMode = "decimal";
        otherInput.autocomplete = "off";
        otherInput.setAttribute("data-role", "other-amount");
        otherInput.setAttribute("aria-invalid", "false");
        otherInput.setAttribute("aria-describedby", `${id}-status`);
        const otherLabel = el("label", "", t.otherLabel);
        otherLabel.htmlFor = otherInput.id;
        otherBox.append(otherLabel, otherInput);
        amountSet.append(chips, otherBox);

        let paySet: HTMLFieldSetElement | null = null;
        const pay = new Map<PayWith, ReturnType<typeof radio>>();
        if (c.payWith.length > 1) {
          paySet = el("fieldset", "group");
          paySet.setAttribute("data-role", "pay");
          paySet.append(el("legend", "", t.payLegend));
          const row = el("div", "chips");
          for (const a of c.payWith) {
            const r = radio(`${id}-pay`, a, a.toUpperCase());
            pay.set(a, r);
            row.append(r.wrap);
          }
          paySet.append(row);
        }
        const status = el("p", "status");
        status.id = `${id}-status`;
        status.setAttribute("data-role", "status");
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        return { t, amountSet, paySet, presets, roundUp, otherRadio, otherInput, pay, status };
      }

      let done = false;
      let restoreInert: () => void = () => undefined;
      let typingTimer: ReturnType<typeof setTimeout> | undefined;
      const openedAt = Date.now();
      const finish = (answer: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(typingTimer);
        document.removeEventListener("keydown", onDocKey, true);
        restoreInert();
        host.remove();
        if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus();
        resolve(answer);
      };
      const onDocKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      };
      /** Enabled controls in tab order; for a radio group only the checked radio. */
      const focusables = (): HTMLElement[] =>
        Array.from(dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")).filter(
          (n) => !n.disabled && !(n instanceof HTMLInputElement && n.type === "radio" && !n.checked),
        );
      dialog.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;
        e.preventDefault();
        const order = focusables();
        const i = order.findIndex((b) => b === shadow.activeElement);
        const next = e.shiftKey ? (i <= 0 ? order.length - 1 : i - 1) : (i + 1) % order.length;
        order[next]?.focus();
      });
      root.addEventListener("click", (e) => {
        if (e.target === root) finish(false); // backdrop
      });
      primary.addEventListener("click", () => {
        if (!primary.disabled && Date.now() - openedAt >= PRIMARY_GUARD_MS) finish(true);
      });
      secondary.addEventListener("click", () => finish(false));
      document.addEventListener("keydown", onDocKey, true);

      if (controls && choices) wireChoices(controls, choices);

      document.body.append(host);
      restoreInert = inertSiblings(host);
      dialog.focus(); // the dialog itself, not a button: the first Enter/Space must not accept

      function wireChoices(k: NonNullable<typeof controls>, c: NonNullable<typeof choices>) {
        let payWith: PayWith = c.selected.payWith;
        const initial = c.selected;
        const startPreset = initial.roundUp ? null : k.presets.find((p) => units(p.input.value) === units(initial.amount));
        if (initial.roundUp && k.roundUp) k.roundUp.input.checked = true;
        else if (startPreset) startPreset.input.checked = true;
        else {
          k.otherRadio.input.checked = true;
          k.otherInput.value = initial.amount ?? "";
        }
        k.pay.get(payWith)?.input.toggleAttribute("checked", true);
        const payRadio = k.pay.get(payWith);
        if (payRadio) payRadio.input.checked = true;

        if (k.roundUp && prompt.roundUpTotal === undefined) {
          void c.check({ roundUp: true, payWith }).then((r) => {
            if (r.status === "offered" && r.roundUpTotal && k.roundUp) k.roundUp.span.textContent = k.t.roundUp(r.roundUpTotal);
          }).catch(() => undefined);
        }

        /** The current pick, or null when "other" holds an invalid amount. */
        const current = (): { choice: DonationChoice; valid: boolean } => {
          if (k.roundUp?.input.checked) return { choice: { roundUp: true, payWith }, valid: true };
          const preset = k.presets.find((p) => p.input.checked);
          if (preset) return { choice: { amount: preset.input.value, payWith }, valid: true };
          const raw = k.otherInput.value.trim();
          const v = units(raw);
          const amount = AMOUNT_RE.test(raw) ? raw.replace(",", ".") : raw;
          const min = units(c.min) ?? 0n;
          const max = units(c.max);
          const valid = v !== null && v >= min && (max === null || v <= max);
          return { choice: { amount, payWith }, valid };
        };

        const setStatus = (msg: string, tone: "info" | "error" = "info") => {
          k.status.textContent = msg;
          k.status.setAttribute("data-tone", tone);
        };

        const show = (r: Extract<ChoiceCheck, { status: "offered" }>) => {
          const view = modalText({
            ...prompt,
            amount: r.amount,
            payWith: r.payWith,
            mode: r.roundUpTotal !== undefined && r.purchaseTotal !== undefined ? "round-up" : "fixed",
            ...(r.xlmSendMax !== undefined ? { xlmSendMax: r.xlmSendMax } : { xlmSendMax: undefined }),
            ...(r.purchaseTotal !== undefined && { purchaseTotal: r.purchaseTotal }),
            ...(r.roundUpTotal !== undefined && { roundUpTotal: r.roundUpTotal }),
          } as DonationPrompt, locale);
          title.textContent = view.title;
          body.textContent = view.body;
          primary.textContent = view.primary;
          payNote.textContent = view.payNote ?? "";
          payNote.hidden = !view.payNote;
          if (view.walletNote) note.textContent = view.walletNote;
          if (r.roundUpTotal && k.roundUp) k.roundUp.span.textContent = k.t.roundUp(r.roundUpTotal);
        };

        const showXlmMax = (r: ChoiceCheck | undefined) => {
          const x = k.pay.get("xlm");
          if (!x) return;
          x.span.textContent = r?.status === "offered" && r.xlmSendMax ? `XLM (${k.t.xlmMax(r.xlmSendMax)})` : "XLM";
        };

        let seq = 0;
        const refresh = async (): Promise<void> => {
          const ticket = ++seq;
          const { choice, valid } = current();
          k.otherInput.setAttribute("aria-invalid", String(k.otherRadio.input.checked && !valid));
          primary.disabled = true;
          if (!valid) {
            setStatus(k.t.invalidAmount(c.min, c.max), "error");
            await c.select(choice).catch(() => undefined); // invalidates what a yes would sign
            return;
          }
          setStatus(k.t.checking);
          const others = c.payWith.filter((a) => a !== payWith);
          const settle = (p: Promise<ChoiceCheck>) => p.catch((): ChoiceCheck => ({ status: "not-offered", reason: "error" }));
          const [mine, ...rest] = await Promise.all([
            settle(c.select(choice)),
            ...others.map((a) => settle(c.check({ ...choice, payWith: a } as DonationChoice))),
          ]);
          if (ticket !== seq || done) return;
          const results = new Map<PayWith, ChoiceCheck>([[payWith, mine as ChoiceCheck], ...others.map((a, i) => [a, rest[i] as ChoiceCheck] as const)]);
          for (const [a, r] of k.pay) r.input.disabled = results.get(a)?.status !== "offered";
          showXlmMax(results.get("xlm"));
          if (mine?.status === "offered") {
            show(mine);
            setStatus("");
            primary.disabled = false;
            return;
          }
          const fallback = others.find((a) => results.get(a)?.status === "offered");
          if (fallback) {
            payWith = fallback;
            const r = k.pay.get(fallback);
            if (r) r.input.checked = true;
            return refresh();
          }
          setStatus(k.t.unavailable, "error");
        };

        const onAmount = () => {
          clearTimeout(typingTimer);
          void refresh();
        };
        for (const p of k.presets) p.input.addEventListener("change", onAmount);
        k.roundUp?.input.addEventListener("change", onAmount);
        k.otherRadio.input.addEventListener("change", () => {
          k.otherInput.focus();
          onAmount();
        });
        k.otherInput.addEventListener("input", () => {
          k.otherRadio.input.checked = true;
          clearTimeout(typingTimer);
          primary.disabled = true;
          typingTimer = setTimeout(() => void refresh(), TYPING_DEBOUNCE_MS);
        });
        for (const [a, r] of k.pay) {
          r.input.addEventListener("change", () => {
            if (!r.input.checked) return;
            payWith = a;
            void refresh();
          });
        }
        void refresh();
      }
    });
}
