import { NETWORKS, type Network } from "spare-sdk";
import { assertNoDonorAddresses } from "./privacy.js";
import type { Interval } from "./registry.js";
import type { DonationRecord } from "./types.js";

export interface FoundationData {
  account: string;
  name: string;
  website: string;
  active: boolean;
  backfilled: boolean;
  registrations: { contractId: string; intervals: Interval[] }[];
}

export interface FoundationObservation {
  verified: boolean;
  checkedAt: string;
  ttl: { liveUntilLedger: number | null; nearExpiry: boolean };
}

export interface SnapshotV1 {
  schemaVersion: 1;
  network: Network;
  registryContracts: string[];
  /** Compared for rebuild == index determinism. */
  data: { foundations: FoundationData[]; donations: DonationRecord[] };
  /** Run metadata; excluded from determinism comparison. */
  observations: {
    generatedAt: string;
    cursors: { rpcLedger: number | null; registryCursor: string | null; paymentsCursor: string | null };
    foundations: Record<string, FoundationObservation>;
  };
}

export type SerializeResult = { ok: true; json: string } | { ok: false; leaked: string[] };

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Explicit field lists + sorted arrays/keys: stable key order, nothing unknown is ever copied. */
function canonical(s: SnapshotV1): SnapshotV1 {
  const obsKeys = Object.keys(s.observations.foundations).sort(cmp);
  return {
    schemaVersion: 1,
    network: s.network,
    registryContracts: [...s.registryContracts].sort(cmp),
    data: {
      foundations: [...s.data.foundations]
        .sort((a, b) => cmp(a.account, b.account))
        .map((f) => ({
          account: f.account,
          name: f.name,
          website: f.website,
          active: f.active,
          backfilled: f.backfilled,
          registrations: [...f.registrations]
            .sort((a, b) => cmp(a.contractId, b.contractId))
            .map((r) => ({ contractId: r.contractId, intervals: r.intervals.map((i) => ({ from: i.from, to: i.to })) })),
        })),
      donations: [...s.data.donations]
        .sort((a, b) => a.ledger - b.ledger || cmp(a.id, b.id))
        .map((d) => ({
          id: d.id,
          foundation: d.foundation,
          amount: d.amount,
          appId: d.appId,
          ledger: d.ledger,
          closedAt: d.closedAt,
          txHash: d.txHash,
        })),
    },
    observations: {
      generatedAt: s.observations.generatedAt,
      cursors: {
        rpcLedger: s.observations.cursors.rpcLedger,
        registryCursor: s.observations.cursors.registryCursor,
        paymentsCursor: s.observations.cursors.paymentsCursor,
      },
      foundations: Object.fromEntries(
        obsKeys.map((k) => {
          const o = s.observations.foundations[k]!;
          return [k, { verified: o.verified, checkedAt: o.checkedAt, ttl: { liveUntilLedger: o.ttl.liveUntilLedger, nearExpiry: o.ttl.nearExpiry } }];
        }),
      ),
    },
  };
}

/** Deterministic JSON (2-space, trailing newline) behind the privacy guard. Fails closed. */
export function serializeSnapshot(s: SnapshotV1): SerializeResult {
  const json = `${JSON.stringify(canonical(s), null, 2)}\n`;
  const allowed = new Set<string>([NETWORKS[s.network].usdcIssuer, ...s.data.foundations.map((f) => f.account)]);
  const guard = assertNoDonorAddresses(json, allowed);
  return guard.ok ? { ok: true, json } : { ok: false, leaked: guard.leaked };
}
