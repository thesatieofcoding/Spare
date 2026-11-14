/**
 * Wires the controller to the demo page. Eager and small: it never imports stellar-sdk or the
 * wallets kit. `./runtime` (which does) is loaded with a dynamic import() on the first Connect.
 */
import type { DemoCopy } from "../i18n/types";
import { demoConfig, type DemoNetwork } from "./config";
import { createController } from "./controller";
import { buildView, shouldFocusResult } from "./view";

const root = document.querySelector<HTMLElement>("[data-demo]");
const copy = JSON.parse(document.getElementById("demo-copy")?.textContent ?? "null") as DemoCopy | null;

if (root && copy) {
  const page: HTMLElement = root;
  const $ = <T extends HTMLElement>(sel: string): T => page.querySelector<T>(sel) as T;
  const PURCHASE = "2.35";
  let rpcAvailable: boolean | null = null;

  const controller = createController({
    config: demoConfig,
    purchaseAmount: PURCHASE,
    async loadPorts(network) {
      const { createPorts } = await import("./runtime");
      const ports = await createPorts(network);
      rpcAvailable = ports.rpc !== null;
      render();
      return ports;
    },
  });

  function render(): void {
    const state = controller.getState();
    if (state.status === "idle") rpcAvailable = null;
    const v = buildView(state, {
      copy: copy as DemoCopy, availability: controller.availability(state.network), rpcAvailable, purchaseAmount: PURCHASE,
    });
    const show = (sel: string, on: boolean, text?: string): void => {
      const el = $(sel);
      el.hidden = !on;
      if (on && text !== undefined) el.textContent = text;
    };
    page.querySelectorAll<HTMLInputElement>("[data-network]").forEach((r) => {
      r.checked = r.value === v.network;
      r.disabled = !v.canSwitchNetwork;
    });
    show("[data-not-configured]", v.notConfigured !== null, v.notConfigured ?? "");
    show("[data-connected]", v.connected !== null, v.connected ?? "");
    show("[data-soroban-note]", v.sorobanNote !== null, v.sorobanNote ?? "");
    show("[data-detail]", v.detail !== null, v.detail !== null ? `${(copy as DemoCopy).details}: ${v.detail}` : "");
    show("[data-connect]", state.status === "idle" || state.status === "connecting");
    $<HTMLButtonElement>("[data-connect]").disabled = !v.canConnect;
    show("[data-disconnect]", v.canDisconnect);
    show("[data-retry]", v.canRetry);
    show("[data-again]", v.canAgain);
    $("[data-purchase]").textContent = v.purchase;
    $<HTMLButtonElement>('[data-flow="classic"]').disabled = !v.classicEnabled;
    $<HTMLButtonElement>('[data-flow="soroban"]').disabled = !v.sorobanEnabled;
    $("[data-status]").textContent = v.status;
    $("[data-result]").dataset.tone = v.tone;
    $("[data-result]").setAttribute("aria-busy", String(v.busy));
    [0, 1].forEach((i) => {
      const a = $<HTMLAnchorElement>(`[data-link="${i}"]`);
      const link = v.links[i];
      a.hidden = link === undefined;
      if (link) {
        a.href = link.href;
        a.textContent = `${link.label}: ${(copy as DemoCopy).explorer} `;
        const hint = document.createElement("span");
        hint.className = "sr-only";
        hint.textContent = (copy as DemoCopy).newTab;
        a.append(hint);
      }
    });
  }

  page.querySelectorAll<HTMLInputElement>("[data-network]").forEach((r) =>
    r.addEventListener("change", () => controller.selectNetwork(r.value as DemoNetwork)));
  $("[data-connect]").addEventListener("click", () => void controller.connect());
  $("[data-disconnect]").addEventListener("click", () => controller.disconnect());
  $('[data-flow="classic"]').addEventListener("click", () => void controller.start("classic"));
  $('[data-flow="soroban"]').addEventListener("click", () => void controller.start("soroban"));
  $("[data-retry]").addEventListener("click", () => controller.retry());
  $("[data-again]").addEventListener("click", () => controller.again());
  let prev = controller.getState();
  controller.subscribe((next) => {
    render();
    if (shouldFocusResult(prev, next)) $("[data-status]").focus();
    prev = next;
  });
  render();
}
