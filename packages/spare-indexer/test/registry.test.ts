import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { isEligible, reduceRegistry, type RegistryEvent } from "../src/domain/registry.js";
import { FOUNDATION, OTHER_FOUNDATION } from "./fixtures/observations.js";

const ev = (over: Partial<RegistryEvent>): RegistryEvent => ({
  contractId: "C1",
  account: FOUNDATION,
  kind: "register",
  ledger: 100,
  name: "Fund",
  website: "fund.org",
  ...over,
});

describe("reduceRegistry", () => {
  it("reactivation: reg100/deact200/reg300 -> 50,150,350 eligible, 250 not", () => {
    const s = reduceRegistry([
      ev({ kind: "register", ledger: 100 }),
      ev({ kind: "deactivate", ledger: 200 }),
      ev({ kind: "register", ledger: 300 }),
    ]);
    for (const l of [50, 150, 350]) expect(isEligible(s, FOUNDATION, l)).toBe(true);
    expect(isEligible(s, FOUNDATION, 250)).toBe(false);
    expect(s.get(FOUNDATION)?.active).toBe(true);
    expect(s.get(FOUNDATION)?.registrations[0]?.intervals).toEqual([
      { from: 100, to: 200 },
      { from: 300, to: null },
    ]);
  });

  it("deactivated with no re-register: later payments ineligible, earlier kept", () => {
    const s = reduceRegistry([ev({ ledger: 100 }), ev({ kind: "deactivate", ledger: 200 })]);
    expect(isEligible(s, FOUNDATION, 199)).toBe(true);
    expect(isEligible(s, FOUNDATION, 200)).toBe(false);
    expect(isEligible(s, FOUNDATION, 9999)).toBe(false);
    expect(s.get(FOUNDATION)?.active).toBe(false);
  });

  it("same account in two contracts counts once; eligible if any contract active", () => {
    const s = reduceRegistry([
      ev({ contractId: "C1", ledger: 100 }),
      ev({ contractId: "C2", ledger: 100 }),
      ev({ contractId: "C1", kind: "deactivate", ledger: 200 }),
    ]);
    expect([...s.keys()]).toEqual([FOUNDATION]);
    expect(s.get(FOUNDATION)?.registrations).toHaveLength(2);
    expect(isEligible(s, FOUNDATION, 250)).toBe(true);
  });

  it("update changes name/website only, applied in ledger order regardless of input order", () => {
    const s = reduceRegistry([
      ev({ kind: "update", ledger: 150, name: "New", website: "new.org" }),
      ev({ ledger: 100 }),
    ]);
    expect(s.get(FOUNDATION)).toMatchObject({ name: "New", website: "new.org", active: true });
  });

  it("unknown account is not eligible; update/deactivate before register ignored", () => {
    const s = reduceRegistry([ev({ kind: "deactivate", ledger: 90 })]);
    expect(isEligible(s, OTHER_FOUNDATION, 1)).toBe(false);
    expect(s.size).toBe(0);
  });
});

describe("reduceRegistry: non-G accounts", () => {
  it("drops events whose account is not an ed25519 G key", () => {
    const c = StrKey.encodeContract(Buffer.alloc(32, 9));
    const g = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
    const ev = (account: string): RegistryEvent => ({ contractId: "C1", account, kind: "register", ledger: 5, name: "n", website: "w.org" });
    expect([...reduceRegistry([ev(c), ev(g)]).keys()]).toEqual([g]);
  });
});
