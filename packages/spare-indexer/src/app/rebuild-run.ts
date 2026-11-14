import type { IndexerConfig } from "../config.js";
import { reduceRegistry } from "../domain/registry.js";
import { serializeSnapshot } from "../domain/snapshot.js";
import type { ClockPort, DomainVerifier, HorizonPort, SnapshotStore } from "../ports.js";
import type { IndexResult } from "./index-run.js";
import { buildSnapshot, collect, eventsFromFoundations, seedEvents, toRecords, verifyAll } from "./shared.js";

/** Deliberately has no RpcPort: rebuild must never read payment history from RPC (D9). */
export interface RebuildDeps {
  horizon: HorizonPort;
  verifier: DomainVerifier;
  clock: ClockPort;
  store: SnapshotStore;
}

/**
 * Registry state = previous snapshot + configured seeds; payments are re-derived from
 * Horizon only. Output `data` equals what incremental indexing produces for the same history.
 */
export async function runRebuild(config: IndexerConfig, deps: RebuildDeps): Promise<IndexResult> {
  const prev = await deps.store.read();
  const known = new Set((prev?.data.foundations ?? []).map((f) => f.account));
  const state = reduceRegistry([...eventsFromFoundations(prev?.data.foundations ?? []), ...seedEvents(config.seedAccounts, known)]);

  const observed = [];
  for (const account of state.keys()) observed.push(...(await collect(deps.horizon.payments(account))));

  const snapshot = buildSnapshot({
    config,
    state,
    records: toRecords(observed, state, config.network),
    backfilled: new Set(state.keys()),
    verified: await verifyAll(state, deps.verifier),
    // No RPC here: carry TTL observations forward; the next `index` run refreshes them.
    ttl: new Map(Object.entries(prev?.observations.foundations ?? {}).map(([k, v]) => [k, v.ttl])),
    cursors: prev?.observations.cursors ?? { rpcLedger: null, registryCursor: null, paymentsCursor: null },
    now: deps.clock.now(),
  });
  if (!serializeSnapshot(snapshot).ok) return { status: "error", reason: "privacy guard: snapshot contains a non-allowed account address" };
  await deps.store.write(snapshot);
  return { status: "ok", snapshot };
}
