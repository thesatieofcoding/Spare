/**
 * Registry reducer + eligibility (D8). Pure: events in, state out.
 * An interval is the half-open ledger range [from, to) during which a
 * registration is active; `to: null` means still active.
 */

export interface RegistryEvent {
  contractId: string;
  account: string;
  kind: "register" | "update" | "deactivate";
  ledger: number;
  name?: string;
  website?: string;
}

export interface Interval {
  from: number;
  to: number | null;
}

export interface Registration {
  contractId: string;
  intervals: Interval[];
}

export interface RegisteredFoundation {
  account: string;
  name: string;
  website: string;
  /** Active in at least one registry contract. */
  active: boolean;
  registrations: Registration[];
}

export type RegistryState = Map<string, RegisteredFoundation>;

/** Applies events in (ledger, input order) so the result is independent of arrival order. */
export function reduceRegistry(events: readonly RegistryEvent[]): RegistryState {
  const ordered = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.ledger - b.e.ledger || a.i - b.i);
  const state: RegistryState = new Map();
  for (const { e } of ordered) {
    let f = state.get(e.account);
    if (e.kind === "register") {
      if (!f) {
        f = { account: e.account, name: e.name ?? "", website: e.website ?? "", active: true, registrations: [] };
        state.set(e.account, f);
      }
      let reg = f.registrations.find((r) => r.contractId === e.contractId);
      if (!reg) {
        reg = { contractId: e.contractId, intervals: [] };
        f.registrations.push(reg);
      }
      const last = reg.intervals[reg.intervals.length - 1];
      if (last && last.to === null) continue; // duplicate register while active
      reg.intervals.push({ from: e.ledger, to: null });
      f.name = e.name ?? f.name;
      f.website = e.website ?? f.website;
    } else if (f) {
      const reg = f.registrations.find((r) => r.contractId === e.contractId);
      if (!reg) continue;
      if (e.kind === "update") {
        f.name = e.name ?? f.name;
        f.website = e.website ?? f.website;
      } else {
        const last = reg.intervals[reg.intervals.length - 1];
        if (last && last.to === null) last.to = e.ledger;
      }
    }
    if (f) f.active = f.registrations.some((r) => r.intervals.at(-1)?.to === null);
  }
  return state;
}

/** True when `ledger` lies in an inactive gap [to, nextFrom) (or [to, inf)) of this registration. */
function inGap(reg: Registration, ledger: number): boolean {
  return reg.intervals.some((iv, i) => {
    if (iv.to === null || ledger < iv.to) return false;
    const next = reg.intervals[i + 1];
    return next === undefined || ledger < next.from;
  });
}

/**
 * D8: a payment counts unless its ledger is in an inactive gap for EVERY
 * registration of the account. Pre-registration payments therefore count.
 */
export function isEligible(state: RegistryState, account: string, ledger: number): boolean {
  const f = state.get(account);
  if (!f || f.registrations.length === 0) return false;
  return !f.registrations.every((r) => inGap(r, ledger));
}
