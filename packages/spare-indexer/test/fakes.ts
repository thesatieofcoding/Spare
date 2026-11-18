import type { RegistryEvent } from "../src/domain/registry.js";
import type { SnapshotV1 } from "../src/domain/snapshot.js";
import type { TransferObservation } from "../src/domain/types.js";
import type { ClockPort, Cursor, DomainVerifier, HorizonPort, RpcPort, SnapshotStore } from "../src/ports.js";

async function* from<T>(xs: readonly T[]): AsyncIterable<T> {
  for (const x of xs) yield x;
}

export interface FakeRpcOpts {
  oldest?: number;
  latest?: number;
  events?: RegistryEvent[];
  transfers?: TransferObservation[];
  liveUntil?: number | null;
  /** Simulates overlapping windows by ignoring the cursor. */
  ignoreCursor?: boolean;
}

export function fakeRpc(o: FakeRpcOpts = {}): RpcPort & { cursors: Cursor[] } {
  const cursors: Cursor[] = [];
  const keep = (ledger: number, c: Cursor): boolean => o.ignoreCursor === true || ledger >= c.ledger;
  return {
    cursors,
    health: async () => ({ oldestLedger: o.oldest ?? 1, latestLedger: o.latest ?? 1000 }),
    registryEvents: (ids, c) => {
      cursors.push(c);
      return from((o.events ?? []).filter((e) => ids.includes(e.contractId) && keep(e.ledger, c)));
    },
    usdcTransfers: (to, c) => from((o.transfers ?? []).filter((t) => to.includes(t.to) && keep(t.ledger, c))),
    liveUntil: async () => (o.liveUntil === undefined ? 5_000_000 : o.liveUntil),
  };
}

export const throwingRpc: RpcPort = {
  health: () => Promise.reject(new Error("RPC must not be called")),
  registryEvents: () => {
    throw new Error("RPC must not be called");
  },
  usdcTransfers: () => {
    throw new Error("RPC must not be called");
  },
  liveUntil: () => Promise.reject(new Error("RPC must not be called")),
};

export function fakeHorizon(payments: TransferObservation[] = [], pageSize = 2, latest = 1000, failFor: readonly string[] = []): HorizonPort & { calls: string[]; latestLedger(): Promise<number> } {
  const calls: string[] = [];
  return {
    calls,
    latestLedger: async () => latest,
    // Yields in pages to exercise "follow pagination to exhaustion" consumers.
    async *payments(account) {
      calls.push(account);
      if (failFor.includes(account)) throw new Error(`Horizon 400 for ${account}`);
      const mine = payments.filter((p) => p.to === account);
      for (let i = 0; i < mine.length; i += pageSize) yield* mine.slice(i, i + pageSize);
    },
  };
}

export const verifier = (ok: boolean | "throw"): DomainVerifier => ({
  verify: async () => {
    if (ok === "throw") throw new Error("toml fetch failed");
    return ok;
  },
});

export const clock: ClockPort = { now: () => new Date("2026-11-14T12:00:00Z") };

export function memStore(initial: SnapshotV1 | null = null): SnapshotStore & { current: SnapshotV1 | null; writes: number } {
  const s = {
    current: initial,
    writes: 0,
    read: async () => s.current,
    write: async (n: SnapshotV1) => {
      s.writes += 1;
      s.current = n;
    },
  };
  return s;
}
