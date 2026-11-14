import { formatStroops, parseUsdc } from "spare-sdk";
import type { DonationRecord } from "./types.js";

export interface AppTotal {
  appId: string;
  total: string;
  count: number;
}

export interface FoundationAggregate {
  foundation: string;
  /** Attributed only; unattributed is never included. */
  total: string;
  count: number;
  apps: AppTotal[];
  unattributed: { total: string; count: number };
  txHashes: string[];
}

const stroops = (s: string): bigint => parseUsdc(s) ?? 0n;

/** Exact bigint (stroop) aggregation per foundation. `include` forces entries for record-less foundations. */
export function aggregate(
  records: readonly DonationRecord[],
  include: readonly string[] = [],
): Map<string, FoundationAggregate> {
  type Acc = { total: bigint; count: number; apps: Map<string, { t: bigint; c: number }>; un: bigint; unc: number; tx: string[] };
  const accs = new Map<string, Acc>();
  const get = (f: string): Acc => {
    let a = accs.get(f);
    if (!a) accs.set(f, (a = { total: 0n, count: 0, apps: new Map(), un: 0n, unc: 0, tx: [] }));
    return a;
  };
  for (const f of include) get(f);
  for (const r of records) {
    const a = get(r.foundation);
    const v = stroops(r.amount);
    if (!a.tx.includes(r.txHash)) a.tx.push(r.txHash);
    if (r.appId === null) {
      a.un += v;
      a.unc += 1;
    } else {
      a.total += v;
      a.count += 1;
      const p = a.apps.get(r.appId) ?? { t: 0n, c: 0 };
      p.t += v;
      p.c += 1;
      a.apps.set(r.appId, p);
    }
  }
  const out = new Map<string, FoundationAggregate>();
  for (const [foundation, a] of [...accs].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
    out.set(foundation, {
      foundation,
      total: formatStroops(a.total),
      count: a.count,
      apps: [...a.apps]
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([appId, p]) => ({ appId, total: formatStroops(p.t), count: p.c })),
      unattributed: { total: formatStroops(a.un), count: a.unc },
      txHashes: a.tx,
    });
  }
  return out;
}
