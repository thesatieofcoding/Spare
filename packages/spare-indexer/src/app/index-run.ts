import type { IndexerConfig } from "../config.js";
import { mergeRecords } from "../domain/merge.js";
import { reduceRegistry } from "../domain/registry.js";
import { serializeSnapshot, type FoundationObservation, type SnapshotV1 } from "../domain/snapshot.js";
import { nearExpiry } from "../domain/ttl.js";
import type { ClockPort, DomainVerifier, HorizonPort, RpcPort, SnapshotStore } from "../ports.js";
import { buildSnapshot, collect, eventsFromFoundations, toRecords, verifyAll } from "./shared.js";

export interface IndexDeps {
  rpc: RpcPort;
  horizon: HorizonPort;
  verifier: DomainVerifier;
  clock: ClockPort;
  store: SnapshotStore;
}

export type IndexResult =
  | { status: "ok"; snapshot: SnapshotV1 }
  | { status: "gap"; rpcLedger: number | null; oldestLedger: number }
  | { status: "error"; reason: string };

/**
 * Registry first, then backfill of newly seen foundations (Horizon), then RPC payments.
 * Everything merges into the previous snapshot; overlaps dedupe by `txHash:opIndex`.
 */
export async function runIndex(config: IndexerConfig, deps: IndexDeps): Promise<IndexResult> {
  const prev = await deps.store.read();
  const prevCursors = prev?.observations.cursors ?? { rpcLedger: null, registryCursor: null, paymentsCursor: null };
  const health = await deps.rpc.health();
  const from = prevCursors.rpcLedger === null ? config.startLedger : prevCursors.rpcLedger + 1;
  if (from < health.oldestLedger) return { status: "gap", rpcLedger: prevCursors.rpcLedger, oldestLedger: health.oldestLedger };

  const cursor = { ledger: from };
  const events = [
    ...eventsFromFoundations(prev?.data.foundations ?? []),
    ...(await collect(deps.rpc.registryEvents(config.registryContracts, cursor))),
  ];
  const state = reduceRegistry(events);

  // Verify first: only domain-verified accounts are backfilled (a registered busy account must not stall the run).
  const verified = await verifyAll(state, deps.verifier);
  const backfilled = new Set((prev?.data.foundations ?? []).filter((f) => f.backfilled).map((f) => f.account));
  const observed = [];
  for (const account of state.keys()) {
    if (backfilled.has(account) || verified.get(account) !== true) continue;
    try {
      observed.push(...(await collect(deps.horizon.payments(account))));
      backfilled.add(account);
    } catch {
      // One bad account must not stall the run; it stays un-backfilled and is retried next run.
    }
  }
  observed.push(...(await collect(deps.rpc.usdcTransfers([...state.keys()], cursor))));

  const records = mergeRecords([...(prev?.data.donations ?? []), ...toRecords(observed, state, config.network)]);

  const ttl = new Map<string, FoundationObservation["ttl"]>();
  for (const f of state.values()) {
    if (!f.active) continue;
    const open = f.registrations.filter((r) => r.intervals.at(-1)?.to === null);
    const lives = await Promise.all(open.map((r) => deps.rpc.liveUntil(r.contractId, f.account)));
    const live = lives.some((l) => l === null) ? null : Math.max(...(lives as number[]));
    ttl.set(f.account, { liveUntilLedger: live, nearExpiry: nearExpiry(live, health.latestLedger, config.nearExpiryLedgers) });
  }

  const snapshot = buildSnapshot({
    config,
    state,
    records,
    backfilled,
    verified,
    ttl,
    cursors: { ...prevCursors, rpcLedger: health.latestLedger },
    now: deps.clock.now(),
  });
  const out = serializeSnapshot(snapshot);
  if (!out.ok) return { status: "error", reason: "privacy guard: snapshot contains a non-allowed account address" };
  await deps.store.write(snapshot);
  return { status: "ok", snapshot };
}
