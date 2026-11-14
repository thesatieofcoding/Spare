/**
 * Demo controller: drives the pure machine through the classic and Soroban flows using injected
 * ports. It imports no heavy library as a value (ports arrive through `loadPorts`, which the
 * page resolves with a dynamic import), so it is fully testable with fakes and safe to import
 * eagerly. Nothing is added to a transaction here: Spare's confirmation step decides, and the
 * Soroban follow-up goes to Horizon, never RPC.
 */
import type { DemoConfig, DemoNetwork } from "./config";
import {
  initialState, reduce, type DemoEvent, type DemoState, type ErrorReason, type Flow, type FlowResult,
} from "./machine";
import { PortError, type NetworkPorts } from "./ports";

export interface Availability {
  enabled: boolean;
  /** Which account is missing from the config, or null when the network is usable. */
  missing: "foundation" | "merchant" | null;
}

export interface ControllerOptions {
  config: DemoConfig;
  /** Resolves the adapters for a network. Called on connect; lazily imports the heavy runtime. */
  loadPorts(network: DemoNetwork): Promise<NetworkPorts>;
  initialNetwork?: DemoNetwork;
  /** Demo purchase in USDC. Not a whole number so round-up has something to do. */
  purchaseAmount?: string;
  sleep?(ms: number): Promise<void>;
  pollIntervalMs?: number;
  maxPolls?: number;
  /**
   * How long a follow-up tx can still land: its timebound (SDK default 300 s) plus slack. A lookup
   * after an uncertain submit polls this long before the demo calls it failed.
   */
  followUpWindowMs?: number;
  /** Injectable clock (tests). Defaults to Date.now. */
  now?(): number;
}

export interface DemoController {
  getState(): DemoState;
  subscribe(listener: (state: DemoState) => void): () => void;
  availability(network: DemoNetwork): Availability;
  selectNetwork(network: DemoNetwork): void;
  connect(): Promise<void>;
  disconnect(): void;
  start(flow: Flow): Promise<void>;
  retry(): void;
  again(): void;
}

/** Thrown after the failure was dispatched, to unwind the current flow. */
class Abort extends Error {}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function createController(opts: ControllerOptions): DemoController {
  const purchaseAmount = opts.purchaseAmount ?? "2.35";
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollIntervalMs = opts.pollIntervalMs ?? 2000;
  const maxPolls = opts.maxPolls ?? 30;
  const followUpWindowMs = opts.followUpWindowMs ?? 315_000;
  const now = opts.now ?? Date.now;
  const MAX_BACKOFF_MS = 10_000;

  let state: DemoState = initialState(opts.initialNetwork ?? "testnet");
  let ports: NetworkPorts | null = null;
  /** Bumped by every reset; async work from an older epoch is dropped silently. */
  let epoch = 0;
  const listeners = new Set<(s: DemoState) => void>();

  const dispatch = (event: DemoEvent): void => {
    const next = reduce(state, event);
    if (next === state) return;
    state = next;
    for (const l of [...listeners]) l(state);
  };

  const availability = (network: DemoNetwork): Availability => {
    const c = opts.config[network];
    if (c.foundation === null) return { enabled: false, missing: "foundation" };
    if (c.merchant === null) return { enabled: false, missing: "merchant" };
    return { enabled: true, missing: null };
  };

  const flowRunning = (): boolean => "flow" in state && state.status !== "done";

  function reset(event: DemoEvent): void {
    epoch++;
    ports = null;
    dispatch(event);
  }

  /** Runs one step; on failure dispatches the mapped error and unwinds. */
  async function step<T>(token: number, fallback: ErrorReason, fn: () => Promise<T>): Promise<T> {
    let value: T;
    try {
      value = await fn();
    } catch (e) {
      if (token === epoch) {
        const reason = e instanceof PortError ? e.kind : fallback;
        dispatch({ type: "fail", reason, detail: messageOf(e) });
      }
      throw new Abort();
    }
    if (token !== epoch) throw new Abort();
    return value;
  }

  /**
   * Asks Horizon whether a submitted tx landed. Polls only when the submit outcome is unknown, and
   * then until the tx's own timebound has passed (it cannot land after that), backing off to 10 s.
   * A tx that lands late is "donated", not "failed".
   */
  async function findLanded(p: NetworkPorts, signedXdr: string, uncertain: boolean): Promise<{ hash: string } | null> {
    const lookup = p.horizon.lookup;
    if (!lookup) return null;
    const deadline = now() + followUpWindowMs;
    let delay = pollIntervalMs;
    for (;;) {
      try {
        const found = await lookup.call(p.horizon, signedXdr);
        if (found) return found;
      } catch {
        return null; // cannot tell: report the original failure
      }
      if (!uncertain || now() >= deadline) return null;
      await sleep(delay);
      delay = Math.min(Math.ceil(delay * 1.5), MAX_BACKOFF_MS);
    }
  }

  async function connect(): Promise<void> {
    if (state.status !== "idle") return;
    const network = state.network;
    if (!availability(network).enabled) {
      dispatch({ type: "fail", reason: "not-configured" });
      return;
    }
    const token = epoch;
    dispatch({ type: "connect" });
    try {
      const p = await step(token, "unexpected", () => opts.loadPorts(network));
      const who = await step(token, "connect-rejected", () => p.wallet.connect());
      ports = p;
      dispatch({ type: "connected", address: who.address, wallet: who.wallet });
    } catch (e) {
      if (!(e instanceof Abort)) throw e;
    }
  }

  async function start(flow: Flow): Promise<void> {
    if (state.status === "done" || state.status === "error") return;
    const network = state.network;
    const av = availability(network);
    const cfg = opts.config[network];
    if (!av.enabled || cfg.foundation === null || cfg.merchant === null) {
      dispatch({ type: "fail", reason: "not-configured", detail: av.missing ?? "" });
      return;
    }
    if (state.status !== "ready" || ports === null) return;
    const p = ports;
    const { address, wallet } = state;
    if (flow === "soroban" && p.rpc === null) {
      dispatch({ type: "fail", reason: "rpc-unavailable" });
      return;
    }
    const token = epoch;
    const foundation = cfg.foundation;
    const signOpts = { address, networkPassphrase: p.passphrase };
    const payment = { source: address, destination: cfg.merchant, amount: purchaseAmount };
    dispatch({ type: "start", flow });
    try {
      const spare = p.createSpare(foundation, wallet);
      const finish = (result: FlowResult): void => dispatch({ type: "finish", result });

      if (flow === "classic") {
        const xdr = await step(token, "unexpected", () => p.builder.buildClassicPayment(payment));
        dispatch({ type: "advance", to: "signing" });
        const signed = await step(token, "signature-rejected", () => spare.signWithDonation(xdr, signOpts));
        dispatch({ type: "advance", to: "submitting" });
        const sent = await step(token, "submit-failed", () => p.horizon.submit(signed.signedTxXdr));
        if (signed.outcome === "donated") {
          finish({ mainHash: sent.hash, outcome: "donated", donationAmount: signed.donation?.amount ?? "" });
        } else {
          // "error" means Spare failed closed and the original was signed: surface it as not offered.
          const outcome = signed.outcome === "error" ? "not-offered" : signed.outcome;
          finish({ mainHash: sent.hash, outcome, ...(signed.reason !== undefined && { reason: signed.reason }) });
        }
        return;
      }

      const rpc = p.rpc;
      if (rpc === null) return;
      const raw = await step(token, "unexpected", () => p.builder.buildSorobanTransfer(payment));
      dispatch({ type: "advance", to: "simulating" });
      const prepared = await step(token, "simulation-failed", () => rpc.prepare(raw));
      dispatch({ type: "advance", to: "signing" });
      // Soroban tx: Spare passes it through unchanged. The donation is the follow-up below.
      const signed = await step(token, "signature-rejected", () => spare.signWithDonation(prepared, signOpts));
      dispatch({ type: "advance", to: "submitting" });
      const sent = await step(token, "submit-failed", () => rpc.send(signed.signedTxXdr));
      dispatch({ type: "advance", to: "polling" });
      for (let i = 0; ; i++) {
        const status = await step(token, "unexpected", () => rpc.getStatus(sent.hash));
        if (status === "SUCCESS") break;
        if (status === "FAILED") {
          dispatch({ type: "fail", reason: "main-tx-failed", detail: sent.hash });
          return;
        }
        if (i + 1 >= maxPolls) {
          dispatch({ type: "fail", reason: "poll-timeout", detail: sent.hash });
          return;
        }
        await step(token, "unexpected", () => sleep(pollIntervalMs));
      }
      dispatch({ type: "main-confirmed", hash: sent.hash });
      dispatch({ type: "advance", to: "offering-follow-up" });

      // From here the main tx is final: nothing below may turn it into an error.
      const main = { mainHash: sent.hash };
      // Best effort: with the ledger, the follow-up waits for Horizon to catch up with RPC.
      let ledger: number | undefined;
      try {
        ledger = await rpc.getLedger?.(sent.hash);
      } catch {
        ledger = undefined;
      }
      let follow: Awaited<ReturnType<typeof spare.offerFollowUp>>;
      try {
        follow = await spare.offerFollowUp({
          successful: true, sourceAccount: address, hash: sent.hash,
          ...(ledger !== undefined && { ledger }),
        }, signOpts);
      } catch (e) {
        if (token === epoch) finish({ ...main, outcome: "follow-up-failed", reason: messageOf(e) });
        return;
      }
      if (token !== epoch) return;
      if (follow.status === "skipped") {
        finish(follow.reason === "declined"
          ? { ...main, outcome: "declined" }
          : { ...main, outcome: "follow-up-skipped", reason: follow.reason });
        return;
      }
      dispatch({ type: "advance", to: "submitting-follow-up" });
      try {
        const donation = await p.horizon.submit(follow.signedTxXdr); // Horizon, never RPC; never resubmitted
        if (token === epoch) {
          finish({ ...main, donationHash: donation.hash, outcome: "donated", donationAmount: follow.donation.amount });
        }
      } catch (e) {
        // A timeout or dropped connection does not mean the tx failed: look it up before saying so.
        const landed = await findLanded(p, follow.signedTxXdr, e instanceof PortError && e.uncertain);
        if (token !== epoch) return;
        if (landed) {
          finish({ ...main, donationHash: landed.hash, outcome: "donated", donationAmount: follow.donation.amount });
        } else {
          finish({ ...main, outcome: "follow-up-failed", reason: messageOf(e) });
        }
      }
    } catch (e) {
      if (!(e instanceof Abort)) {
        if (token === epoch) dispatch({ type: "fail", reason: "unexpected", detail: messageOf(e) });
      }
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    availability,
    selectNetwork: (network) => {
      if (flowRunning()) return; // would drop the main tx hash the user needs
      if (network !== state.network) reset({ type: "switch-network", network });
    },
    connect,
    disconnect: () => {
      if (!flowRunning()) reset({ type: "disconnect" });
    },
    start,
    retry: () => dispatch({ type: "retry" }),
    again: () => dispatch({ type: "again" }),
  };
}
