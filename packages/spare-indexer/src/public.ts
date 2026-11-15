/**
 * Website-facing entry (alias `spare-indexer/public`): pure, no node imports.
 * Only verified AND active foundations are exposed (fail closed).
 */
import { aggregate } from "./domain/aggregate.js";
import type { SnapshotV1 } from "./domain/snapshot.js";

export type { SnapshotV1 } from "./domain/snapshot.js";

export type ParseResult = { ok: true; snapshot: SnapshotV1 } | { ok: false; error: string };

export interface PublicTx {
  txHash: string;
  amount: string;
  appId: string | null;
  ledger: number;
  closedAt: string;
}

export interface PublicFoundation {
  account: string;
  name: string;
  website: string;
  /** Attributed donations only; unattributed is reported separately. */
  totalViaSpare: string;
  count: number;
  apps: { appId: string; total: string; count: number }[];
  unattributed: { total: string; count: number };
  txs: PublicTx[];
}

export interface PublicView {
  generatedAt: string;
  foundations: PublicFoundation[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Validates an untrusted snapshot (JSON text or parsed value). Never throws. */
export function parseSnapshot(input: unknown): ParseResult {
  let v = input;
  if (typeof input === "string") {
    try {
      v = JSON.parse(input);
    } catch {
      return { ok: false, error: "snapshot is not valid JSON" };
    }
  }
  if (!isObj(v)) return { ok: false, error: "snapshot must be an object" };
  if (v.schemaVersion !== 1) return { ok: false, error: `unsupported schemaVersion: ${String(v.schemaVersion)}` };
  const data = v.data;
  if (!isObj(data) || !Array.isArray(data.foundations) || !Array.isArray(data.donations)) {
    return { ok: false, error: "snapshot data.foundations and data.donations must be arrays" };
  }
  const obs = v.observations;
  if (!isObj(obs) || typeof obs.generatedAt !== "string" || !isObj(obs.foundations)) {
    return { ok: false, error: "snapshot observations are missing or malformed" };
  }
  return { ok: true, snapshot: v as unknown as SnapshotV1 };
}

export function toPublicView(s: SnapshotV1): PublicView {
  const shown = s.data.foundations
    .filter((f) => f.active && s.observations.foundations[f.account]?.verified === true)
    .sort((a, b) => (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
  const agg = aggregate(
    s.data.donations,
    shown.map((f) => f.account),
  );
  return {
    generatedAt: s.observations.generatedAt,
    foundations: shown.map((f) => {
      const a = agg.get(f.account)!;
      return {
        account: f.account,
        name: f.name,
        website: f.website,
        totalViaSpare: a.total,
        count: a.count,
        apps: a.apps,
        unattributed: a.unattributed,
        txs: s.data.donations
          .filter((d) => d.foundation === f.account)
          .sort((x, y) => y.ledger - x.ledger || (x.id < y.id ? 1 : -1))
          .map((d) => ({ txHash: d.txHash, amount: d.amount, appId: d.appId, ledger: d.ledger, closedAt: d.closedAt })),
      };
    }),
  };
}
