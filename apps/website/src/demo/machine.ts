/**
 * Pure state machine for the demo. No I/O, no DOM, no Stellar imports: the controller drives it
 * with events and the view renders whatever state it holds. Illegal events return the same state
 * object, so a late or duplicate event can never corrupt a flow.
 */
import type { DemoNetwork } from "./config";

export type Flow = "classic" | "soroban";
export type WalletKind = "classic" | "soroban" | "ledger";

export type Phase =
  | "building" | "simulating" | "signing" | "submitting" | "polling"
  | "offering-follow-up" | "submitting-follow-up";

export type ErrorReason =
  | "not-configured" | "rpc-unavailable" | "no-wallet" | "connect-rejected" | "signature-rejected"
  | "submit-failed" | "simulation-failed" | "poll-timeout" | "main-tx-failed" | "unexpected";

/** What Spare did with the donation. `not-offered` / `passthrough` carry the SDK reason. */
export type DonationOutcome =
  | "donated" | "declined" | "not-offered" | "passthrough" | "follow-up-skipped" | "follow-up-failed";

export interface FlowResult {
  mainHash: string;
  donationHash?: string;
  outcome: DonationOutcome;
  /** SDK reason code (not-offered / passthrough / skipped), or a failure detail. */
  reason?: string;
  /** Donation amount in USDC, only when donated. */
  donationAmount?: string;
}

interface Session { network: DemoNetwork; address: string; wallet: WalletKind }

export type DemoState =
  | { status: "idle"; network: DemoNetwork }
  | { status: "connecting"; network: DemoNetwork }
  | ({ status: "ready" } & Session)
  | ({ status: Phase; flow: Flow; mainHash?: string } & Session)
  | ({ status: "done"; flow: Flow; result: FlowResult } & Session)
  | {
      status: "error"; network: DemoNetwork; reason: ErrorReason; detail?: string;
      /** Set when the main tx already succeeded (Soroban), so the UI keeps showing it. */
      mainHash?: string; address?: string; wallet?: WalletKind;
    };

export type DemoEvent =
  | { type: "connect" }
  | { type: "connected"; address: string; wallet: WalletKind }
  | { type: "disconnect" }
  | { type: "start"; flow: Flow }
  | { type: "advance"; to: Phase }
  | { type: "main-confirmed"; hash: string }
  | { type: "finish"; result: FlowResult }
  | { type: "fail"; reason: ErrorReason; detail?: string }
  | { type: "retry" }
  | { type: "again" }
  | { type: "switch-network"; network: DemoNetwork };

export const initialState = (network: DemoNetwork): DemoState => ({ status: "idle", network });

const PHASES: ReadonlySet<string> = new Set<Phase>([
  "building", "simulating", "signing", "submitting", "polling", "offering-follow-up", "submitting-follow-up",
]);
type InFlow = Extract<DemoState, { status: Phase }>;
const inFlow = (s: DemoState): s is InFlow => PHASES.has(s.status);

/** Allowed next phases per flow. Classic never simulates, polls or offers a follow-up. */
const NEXT: Record<Flow, Partial<Record<Phase, readonly Phase[]>>> = {
  classic: { building: ["signing"], signing: ["submitting"] },
  soroban: {
    building: ["simulating"], simulating: ["signing"], signing: ["submitting"], submitting: ["polling"],
    polling: ["offering-follow-up"], "offering-follow-up": ["submitting-follow-up"],
  },
};
/** Phases a flow may finish from. */
const FINISH: Record<Flow, readonly Phase[]> = {
  classic: ["submitting"],
  soroban: ["offering-follow-up", "submitting-follow-up"],
};

const session = (s: Session): Session => ({ network: s.network, address: s.address, wallet: s.wallet });

export function reduce(state: DemoState, event: DemoEvent): DemoState {
  if (event.type === "switch-network") {
    return event.network === state.network ? state : initialState(event.network);
  }
  switch (event.type) {
    case "connect":
      return state.status === "idle" ? { status: "connecting", network: state.network } : state;
    case "connected":
      return state.status === "connecting"
        ? { status: "ready", network: state.network, address: event.address, wallet: event.wallet }
        : state;
    case "disconnect":
      return initialState(state.network);
    case "start":
      return state.status === "ready" ? { ...session(state), status: "building", flow: event.flow } : state;
    case "advance": {
      if (!inFlow(state)) return state;
      const allowed = NEXT[state.flow][state.status];
      return allowed?.includes(event.to) ? { ...state, status: event.to } : state;
    }
    case "main-confirmed":
      return inFlow(state) ? { ...state, mainHash: event.hash } : state;
    case "finish": {
      if (!inFlow(state)) return state;
      if (!FINISH[state.flow].includes(state.status)) return state;
      return { ...session(state), status: "done", flow: state.flow, result: event.result };
    }
    case "fail": {
      if (state.status === "done" || state.status === "error") return state;
      const err: DemoState = {
        status: "error", network: state.network, reason: event.reason,
        ...(event.detail !== undefined && { detail: event.detail }),
      };
      if (!("address" in state)) return err;
      return {
        ...err, address: state.address, wallet: state.wallet,
        ...(inFlow(state) && state.mainHash !== undefined && { mainHash: state.mainHash }),
      };
    }
    case "retry":
      if (state.status !== "error") return state;
      return state.address !== undefined && state.wallet !== undefined
        ? { status: "ready", network: state.network, address: state.address, wallet: state.wallet }
        : initialState(state.network);
    case "again":
      return state.status === "done" ? { status: "ready", ...session(state) } : state;
  }
}
