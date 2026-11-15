import { describe, expect, it } from "vitest";
import { parseSnapshot, toPublicView } from "../src/public.js";
import { serializeSnapshot, type SnapshotV1 } from "../src/domain/snapshot.js";
import { FOUNDATION, OTHER_FOUNDATION, MAINNET_USDC } from "./fixtures/observations.js";

const rec = (id: string, f: string, amount: string, appId: string | null, ledger: number) => ({
  id: `${id}:0`, foundation: f, amount, appId, ledger, closedAt: "2026-11-01T00:00:00Z", txHash: id,
});
const fnd = (account: string, active: boolean) => ({
  account, name: `n-${account.slice(0, 3)}`, website: "fund.org", active, backfilled: true,
  registrations: [{ contractId: "C1", intervals: [{ from: 1, to: active ? null : 5 }] }],
});
const obsF = (verified: boolean) => ({ verified, checkedAt: "t", ttl: { liveUntilLedger: 9, nearExpiry: false } });

const snap = (): SnapshotV1 => ({
  schemaVersion: 1, network: "mainnet", registryContracts: ["C1"],
  data: {
    foundations: [fnd(FOUNDATION, true), fnd(OTHER_FOUNDATION, true)],
    donations: [
      rec("t1", FOUNDATION, "1.0000000", "A", 10),
      rec("t2", FOUNDATION, "0.5000000", "A", 20),
      rec("t3", FOUNDATION, "2.0000000", null, 30),
      rec("t4", OTHER_FOUNDATION, "9.0000000", "B", 40),
    ],
  },
  observations: { generatedAt: "2026-11-14T00:00:00Z", cursors: { rpcLedger: 1, registryCursor: null, paymentsCursor: null },
    foundations: { [FOUNDATION]: obsF(true), [OTHER_FOUNDATION]: obsF(false) } },
});

describe("parseSnapshot", () => {
  it("round-trips serialized JSON text and plain objects", () => {
    const s = snap();
    const ser = serializeSnapshot(s);
    expect(ser.ok).toBe(true);
    const r = parseSnapshot(ser.ok ? ser.json : "");
    expect(r.ok && r.snapshot.data.donations).toHaveLength(4);
    expect(parseSnapshot(JSON.parse(JSON.stringify(s))).ok).toBe(true);
  });

  it.each([
    ["bad schemaVersion", { ...snap(), schemaVersion: 2 }],
    ["missing schemaVersion", { ...snap(), schemaVersion: undefined }],
    ["not an object", 42],
    ["null", null],
    ["no data", { ...snap(), data: undefined }],
    ["donations not array", { ...snap(), data: { foundations: [], donations: {} } }],
    ["no observations", { ...snap(), observations: undefined }],
    ["invalid JSON text", "{nope"],
  ])("rejects %s with an error and no throw", (_n, input) => {
    const r = parseSnapshot(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it("names the schema version problem", () => {
    const r = parseSnapshot({ ...snap(), schemaVersion: 2 });
    expect(!r.ok && r.error).toMatch(/schemaVersion/);
  });
});

describe("toPublicView", () => {
  it("lists verified AND active foundations only, with exact aggregates", () => {
    const s = snap();
    const v = toPublicView(s);
    expect(v.generatedAt).toBe("2026-11-14T00:00:00Z");
    expect(v.foundations.map((f) => f.account)).toEqual([FOUNDATION]);
    const f = v.foundations[0]!;
    expect(f).toMatchObject({
      totalViaSpare: "1.5000000", count: 2,
      apps: [{ appId: "A", total: "1.5000000", count: 2 }],
      unattributed: { total: "2.0000000", count: 1 },
    });
    expect(f.txs.map((t) => t.txHash)).toEqual(["t3", "t2", "t1"]); // newest first
    expect(Object.keys(f.txs[0]!).sort()).toEqual(["amount", "appId", "closedAt", "ledger", "txHash"]);
  });

  it("excludes verified-but-inactive and active-but-unverified, and keeps a record-less foundation", () => {
    const s = snap();
    s.data.foundations[0] = fnd(FOUNDATION, false);
    expect(toPublicView(s).foundations).toEqual([]);
    const t = snap();
    t.observations.foundations[OTHER_FOUNDATION] = obsF(true);
    t.data.donations = [];
    const v = toPublicView(t);
    expect(v.foundations.map((f) => f.totalViaSpare)).toEqual(["0.0000000", "0.0000000"]);
  });

  it("contains no addresses beyond the foundation and issuer", () => {
    const text = JSON.stringify(toPublicView(snap()));
    const found = new Set(text.match(/G[A-Z2-7]{55}/g));
    expect([...found].every((a) => a === FOUNDATION || a === MAINNET_USDC)).toBe(true);
  });
});
