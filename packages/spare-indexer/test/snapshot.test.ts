import { describe, expect, it } from "vitest";
import { assertNoDonorAddresses } from "../src/domain/privacy.js";
import { serializeSnapshot, type SnapshotV1 } from "../src/domain/snapshot.js";
import { FOUNDATION, GDONOR, MAINNET_USDC } from "./fixtures/observations.js";

const snap = (): SnapshotV1 => ({
  schemaVersion: 1,
  network: "mainnet",
  registryContracts: ["C2", "C1"],
  data: {
    foundations: [
      {
        account: FOUNDATION,
        name: "Fund",
        website: "fund.org",
        active: true,
        backfilled: false,
        registrations: [{ contractId: "C1", intervals: [{ from: 100, to: null }] }],
      },
    ],
    donations: [
      { id: "b:0", foundation: FOUNDATION, amount: "1.0000000", appId: "A", ledger: 9, closedAt: "t", txHash: "b" },
      { id: "a:0", foundation: FOUNDATION, amount: "2.0000000", appId: null, ledger: 5, closedAt: "t", txHash: "a" },
    ],
  },
  observations: {
    generatedAt: "2026-11-01T00:00:00Z",
    cursors: { rpcLedger: 10, registryCursor: null, paymentsCursor: null },
    foundations: {
      [FOUNDATION]: { verified: true, checkedAt: "x", ttl: { liveUntilLedger: 999, nearExpiry: false } },
    },
  },
});

describe("serializeSnapshot", () => {
  it("is deterministic: same bytes for shuffled input, 2-space, trailing newline, sorted arrays", () => {
    const a = snap();
    const b = snap();
    b.data.donations.reverse();
    b.registryContracts.reverse();
    const r1 = serializeSnapshot(a);
    const r2 = serializeSnapshot(b);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.json).toBe(r2.json);
    expect(r1.json.endsWith("}\n")).toBe(true);
    expect(r1.json).toContain('\n  "schemaVersion": 1,');
    const parsed = JSON.parse(r1.json);
    expect(parsed.data.donations.map((d: { id: string }) => d.id)).toEqual(["a:0", "b:0"]);
    expect(parsed.registryContracts).toEqual(["C1", "C2"]);
    expect(Object.keys(parsed)).toEqual(["schemaVersion", "network", "registryContracts", "data", "observations"]);
  });

  it("fails closed when a donor address sneaks in", () => {
    const s = snap();
    (s.data.donations[0] as unknown as Record<string, unknown>).appId = GDONOR;
    const r = serializeSnapshot(s);
    expect(r).toEqual({ ok: false, leaked: [GDONOR] });
  });

  it("never serializes extra fields (explicit field list)", () => {
    const s = snap();
    (s.data.donations[0] as unknown as Record<string, unknown>).source = GDONOR;
    const r = serializeSnapshot(s);
    expect(r.ok && r.json.includes(GDONOR)).toBe(false);
    expect(r.ok).toBe(true);
  });
});

describe("assertNoDonorAddresses", () => {
  it("allows foundation and USDC issuer, flags others", () => {
    const allowed = new Set([FOUNDATION, MAINNET_USDC]);
    expect(assertNoDonorAddresses(`${FOUNDATION} ${MAINNET_USDC}`, allowed)).toEqual({ ok: true });
    expect(assertNoDonorAddresses(`x ${GDONOR} y ${GDONOR}`, allowed)).toEqual({ ok: false, leaked: [GDONOR] });
  });
});
