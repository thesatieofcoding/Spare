import { modalText } from "./strings.js";
import type { ConfirmFn, Locale, Theme } from "./types.js";

export interface ConfirmModalOptions {
  /** Forces the language. Defaults to the locale carried by the prompt. */
  locale?: Locale;
  theme?: Theme;
}

// Tokens mirror Figma `Spare / color` (Light/Dark). Fonts are not bundled: system fallbacks apply.
const STYLES = `
:host { all: initial; }
.root {
  --bg-page: #FBF7EE; --surface: #FBF7EE; --border: #D9D4C8; --text-primary: #2C2B2B;
  --text-secondary: #6B6A62; --accent: #3E6650; --on-accent: #FBF7EE; --scrim: rgba(26,34,29,.45);
  --font-ui: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: "Newsreader", Georgia, "Times New Roman", serif;
  position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: var(--scrim); font-family: var(--font-ui); color: var(--text-primary);
  animation: fade .16s ease-out;
}
:host([data-theme="dark"]) .root {
  --bg-page: #1A221D; --surface: #1A221D; --border: #33402F; --text-primary: #FBF7EE;
  --text-secondary: #B9B4A6; --accent: #A9C7A6; --on-accent: #2C2B2B; --scrim: rgba(0,0,0,.6);
}
@media (prefers-color-scheme: dark) {
  :host([data-theme="auto"]) .root {
    --bg-page: #1A221D; --surface: #1A221D; --border: #33402F; --text-primary: #FBF7EE;
    --text-secondary: #B9B4A6; --accent: #A9C7A6; --on-accent: #2C2B2B; --scrim: rgba(0,0,0,.6);
  }
}
.dialog {
  box-sizing: border-box; width: 420px; max-width: 100%; display: flex; flex-direction: column; gap: 16px;
  padding: 28px; background: var(--bg-page); border: 1px solid var(--border); border-radius: 16px;
  animation: rise .18s ease-out;
}
.wordmark { margin: 0; font: 500 20px/24px var(--font-ui); }
.title { margin: 0; font: 500 22px/28px var(--font-display); }
.body, .legal, .note, .domain { margin: 0; font: 400 14px/20px var(--font-ui); }
.note { font-weight: 500; }
.legal, .domain { color: var(--text-secondary); }
.dialog:focus { outline: none; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
button { font: 500 14px/20px var(--font-ui); padding: 12px 20px; border: 0; border-radius: 999px; cursor: pointer; }
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

/**
 * Default confirmation UI: vanilla DOM in a shadow root. Resolves true only on the primary
 * button; Esc, the secondary button and the backdrop all resolve false.
 */
export function createConfirmModal(options: ConfirmModalOptions = {}): ConfirmFn {
  return (prompt) =>
    new Promise<boolean>((resolve) => {
      if (typeof document === "undefined") return resolve(false);
      const text = modalText(prompt, options.locale ?? prompt.locale);
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
      dialog.lang = options.locale ?? prompt.locale;

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
      dialog.append(el("p", "wordmark", "spare"), title, domain, body);
      if (text.walletNote) {
        const note = el("p", "note", text.walletNote);
        note.setAttribute("data-role", "wallet-note");
        dialog.append(note);
      }
      const legal = el("p", "legal", text.legal);
      dialog.append(actions, legal);
      root.append(dialog);
      shadow.append(style, root);

      let done = false;
      let restoreInert: () => void = () => undefined;
      const openedAt = Date.now();
      const finish = (answer: boolean) => {
        if (done) return;
        done = true;
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
      dialog.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;
        // Two focusable controls: cycle between them.
        e.preventDefault();
        const order = [primary, secondary];
        const i = order.findIndex((b) => b === shadow.activeElement);
        const next = e.shiftKey ? (i <= 0 ? order.length - 1 : i - 1) : (i + 1) % order.length;
        order[next]?.focus();
      });
      root.addEventListener("click", (e) => {
        if (e.target === root) finish(false); // backdrop
      });
      primary.addEventListener("click", () => {
        if (Date.now() - openedAt >= PRIMARY_GUARD_MS) finish(true);
      });
      secondary.addEventListener("click", () => finish(false));
      document.addEventListener("keydown", onDocKey, true);

      document.body.append(host);
      restoreInert = inertSiblings(host);
      dialog.focus(); // the dialog itself, not a button: the first Enter/Space must not accept
    });
}
