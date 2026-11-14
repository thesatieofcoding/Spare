import type { IndexerConfig, SeedAccount } from "../config.js";
import { classify } from "../domain/classify.js";
import { mergeRecords } from "../domain/merge.js";
import { isEligible, type RegistryEvent, type RegistryState } from "../domain/registry.js";
import type { FoundationData, FoundationObservation, SnapshotV1 } from "../domain/snapshot.js";
import type { DonationRecord, TransferObservation } from "../domain/types.js";
import type { DomainVerifier } from "../ports.js";

export type Cursors = SnapshotV1["observations"]["cursors"];

export async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

/** Replays persisted registry state as events so new events layer on top of it. */
export function eventsFromFoundations(fs: readonly FoundationData[]): RegistryEvent[] {
  return fs.flatMap((f) =>
    f.registrations.flatMap((r) =>
      r.intervals.flatMap((iv): RegistryEvent[] => [
        { contractId: r.contractId, account: f.account, kind: "register", ledger: iv.from, name: f.name, website: f.website },
        ...(iv.to === null ? [] : [{ contractId: r.contractId, account: f.account, kind: "deactivate" as const, ledger: iv.to }]),
      ]),
    ),
  );
}

/** Seeds only fill accounts the snapshot does not know (D9). */
export function seedEvents(seeds: readonly SeedAccount[], known: ReadonlySet<string>): RegistryEvent[] {
  return seeds
    .filter((s) => !known.has(s.account))
    .map((s) => ({ contractId: s.contractId, account: s.account, kind: "register" as const, ledger: s.fromLedger, name: s.name, website: s.website }));
}

/** classify + D8 eligibility: payments inside an inactive gap never become records. */
export function toRecords(obs: Iterable<TransferObservation>, state: RegistryState, network: IndexerConfig["network"]): DonationRecord[] {
  const foundations = new Set(state.keys());
  const out: DonationRecord[] = [];
  for (const o of obs) {
    const c = classify(o, { network, foundations });
    if (c.kind === "counted" && isEligible(state, c.record.foundation, c.record.ledger)) out.push(c.record);
  }
  return mergeRecords(out);
}

/** Fail closed: verifier false or error both mean not verified. */
export async function verifyAll(state: RegistryState, verifier: DomainVerifier): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  for (const f of state.values()) {
    out.set(f.account, await verifier.verify({ account: f.account, domain: f.website }).catch(() => false));
  }
  return out;
}

export function buildSnapshot(a: {
  config: IndexerConfig;
  state: RegistryState;
  records: DonationRecord[];
  backfilled: ReadonlySet<string>;
  verified: ReadonlyMap<string, boolean>;
  ttl: ReadonlyMap<string, FoundationObservation["ttl"]>;
  cursors: Cursors;
  now: Date;
}): SnapshotV1 {
  const checkedAt = a.now.toISOString();
  return {
    schemaVersion: 1,
    network: a.config.network,
    registryContracts: [...a.config.registryContracts],
    data: {
      foundations: [...a.state.values()].map((f) => ({
        account: f.account,
        name: f.name,
        website: f.website,
        active: f.active,
        backfilled: a.backfilled.has(f.account),
        registrations: f.registrations,
      })),
      donations: a.records,
    },
    observations: {
      generatedAt: checkedAt,
      cursors: a.cursors,
      foundations: Object.fromEntries(
        [...a.state.keys()].map((k) => [
          k,
          { verified: a.verified.get(k) ?? false, checkedAt, ttl: a.ttl.get(k) ?? { liveUntilLedger: null, nearExpiry: false } },
        ]),
      ),
    },
  };
}
