/**
 * Presentational layer: turns a machine state into a plain view model. No DOM and no Stellar
 * imports, so it is testable in node and safe to load eagerly. `main.ts` applies the model to
 * the page. Only the user's own address is ever shown, truncated.
 */
import type { DemoCopy } from "../i18n/types";
import type { DemoNetwork } from "./config";
import type { Availability } from "./controller";
import type { DemoState, FlowResult } from "./machine";

export interface ViewContext {
  copy: DemoCopy;
  availability: Availability;
  /** null until ports are loaded; false disables the Soroban flow. */
  rpcAvailable: boolean | null;
  purchaseAmount: string;
}

export interface View {
  network: DemoNetwork;
  status: string;
  tone: "neutral" | "success" | "error";
  busy: boolean;
  purchase: string;
  notConfigured: string | null;
  connected: string | null;
  sorobanNote: string | null;
  detail: string | null;
  links: { label: string; href: string }[];
  canConnect: boolean;
  canDisconnect: boolean;
  canSwitchNetwork: boolean;
  classicEnabled: boolean;
  sorobanEnabled: boolean;
  canRetry: boolean;
  canAgain: boolean;
}

export const explorerTxUrl = (network: DemoNetwork, hash: string): string =>
  `https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/tx/${hash}`;

/** Focus the status region when a flow ends, so keyboard and screen-reader users land on the result. */
export const shouldFocusResult = (prev: DemoState, next: DemoState): boolean =>
  prev.status !== next.status && (next.status === "done" || next.status === "error")
  && prev.status !== "idle" && prev.status !== "connecting" && prev.status !== "ready"
  && prev.status !== "done" && prev.status !== "error";

export const truncate = (s: string): string => (s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

function reasonText(copy: DemoCopy, reason: string | undefined): string {
  if (reason === undefined) return "";
  const known = (copy.reasons as Record<string, string>)[reason];
  return known ?? copy.reasons.other;
}

function resultText(copy: DemoCopy, r: FlowResult): string {
  const base = fill(copy.outcomes[r.outcome], { amount: fill(copy.donatedAmount, { amount: r.donationAmount ?? "" }) });
  const why = r.outcome === "declined" || r.outcome === "donated" ? "" : reasonText(copy, r.reason);
  return why === "" ? base : `${base} ${why}`;
}

export function buildView(state: DemoState, ctx: ViewContext): View {
  const { copy } = ctx;
  const network = state.network;
  const address = "address" in state ? state.address : undefined;
  const phase = state.status !== "idle" && state.status !== "connecting" && state.status !== "ready"
    && state.status !== "done" && state.status !== "error";
  const ready = state.status === "ready";
  const tx = (label: string, hash: string | undefined) =>
    hash === undefined ? [] : [{ label, href: explorerTxUrl(network, hash) }];

  let status: string = copy.status[state.status];
  let tone: View["tone"] = "neutral";
  let detail: string | null = null;
  let links: View["links"] = [];
  if (state.status === "done") {
    status = resultText(copy, state.result);
    tone = state.result.outcome === "donated" ? "success" : "neutral";
    links = [...tx(copy.mainTx, state.result.mainHash), ...tx(copy.donationTx, state.result.donationHash)];
  } else if (state.status === "error") {
    status = copy.errors[state.reason];
    tone = "error";
    detail = state.detail?.slice(0, 200) || null;
    links = tx(copy.mainTx, state.mainHash);
  } else if (phase && state.mainHash !== undefined) {
    links = tx(copy.mainTx, state.mainHash);
  }

  const rpcOff = ctx.rpcAvailable === false;
  return {
    network,
    status,
    tone,
    busy: phase || state.status === "connecting",
    purchase: fill(copy.purchase, { amount: ctx.purchaseAmount }),
    notConfigured: ctx.availability.enabled ? null : copy.notConfigured,
    connected: address === undefined ? null : fill(copy.connectedAs, { address: truncate(address) }),
    sorobanNote: ready && rpcOff ? copy.rpcUnavailable : null,
    detail,
    links,
    canConnect: state.status === "idle" && ctx.availability.enabled,
    canDisconnect: ready || state.status === "done",
    canSwitchNetwork: !phase,
    classicEnabled: ready,
    sorobanEnabled: ready && !rpcOff,
    canRetry: state.status === "error",
    canAgain: state.status === "done",
  };
}
