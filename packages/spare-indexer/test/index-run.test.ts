import { describe, expect, it } from "vitest";
import { runIndex } from "../src/app/index-run.js";
import type { IndexerConfig } from "../src/config.js";
import type { RegistryEvent } from "../src/domain/registry.js";
import { FOUNDATION, GDONOR, OTHER_FOUNDATION, obs, txt } from "./fixtures/observations.js";
import { clock, fakeHorizon, fakeRpc, memStore, verifier } from "./fakes.js";

const config: IndexerConfig = { network: "mainnet", registryContracts: ["C1"], seedAccounts: [], startLedger: 10, nearExpiryLedgers: 518_400 };
const reg = (ledger: number, kind: RegistryEvent["kind"] = "register", account = FOUNDATION): RegistryEvent => ({
  contractId: "C1",
  account,
  kind,
  ledger,
  name: "Fund",
  website: "fund.org",
});
const pay = (ledger: number, hash: string, extra = {}) => obs({ txHash: hash.padEnd(64, "0"), ledger, ...extra });

function deps(o: { rpc?: ReturnType<typeof fakeRpc>; horizon?: ReturnType<typeof fakeHorizon>; ok?: boolean | "throw"; store?: ReturnType<typeof memStore> } = {}) {
  return {
    rpc: o.rpc ?? fakeRpc(),
    horizon: o.horizon ?? fakeHorizon(),
    verifier: verifier(o.ok ?? true),
    clock,
    store: o.store ?? memStore(),
  };
}

describe("runIndex", () => {
  it("indexes registry + payments into a snapshot and persists it", async () => {
    const d = deps({ rpc: fakeRpc({ events: [reg(100)], transfers: [pay(150, "aa")], latest: 900 }) });
    const r = await runIndex(config, d);
    expect(r.status).toBe("ok");
    const s = d.store.current!;
    expect(s.data.donations.map((x) => [x.foundation, x.amount, x.appId])).toEqual([[FOUNDATION, "0.5000000", "shop1"]]);
    expect(s.observations.cursors.rpcLedger).toBe(900);
    expect(s.observations.generatedAt).toBe("2026-11-14T12:00:00.000Z");
    expect(s.observations.foundations[FOUNDATION]).toMatchObject({ verified: true, ttl: { nearExpiry: false } });
    expect(JSON.stringify(s)).not.toContain(GDONOR);
  });

  it("empty RPC window keeps the N existing records", async () => {
    const store = memStore();
    await runIndex(config, deps({ store, rpc: fakeRpc({ events: [reg(100)], transfers: [pay(150, "aa"), pay(160, "bb")], latest: 500 }) }));
    expect(store.current!.data.donations).toHaveLength(2);
    await runIndex(config, deps({ store, rpc: fakeRpc({ latest: 600 }) }));
    expect(store.current!.data.donations).toHaveLength(2);
    expect(store.current!.data.foundations).toHaveLength(1);
    expect(store.current!.observations.cursors.rpcLedger).toBe(600);
  });

  it("overlapping windows do not duplicate records", async () => {
    const store = memStore();
    const rpc = fakeRpc({ events: [reg(100)], transfers: [pay(150, "aa")], ignoreCursor: true });
    await runIndex(config, deps({ store, rpc }));
    await runIndex(config, deps({ store, rpc }));
    expect(store.current!.data.donations).toHaveLength(1);
    expect(store.current!.data.foundations[0]!.registrations[0]!.intervals).toEqual([{ from: 100, to: null }]);
  });

  it("resumes from the stored cursor (rpcLedger + 1), startLedger on first run", async () => {
    const store = memStore();
    const first = fakeRpc({ events: [reg(100)], latest: 700 });
    await runIndex(config, deps({ store, rpc: first }));
    expect(first.cursors[0]).toEqual({ ledger: 10 });
    const second = fakeRpc({ latest: 800 });
    await runIndex(config, deps({ store, rpc: second }));
    expect(second.cursors[0]).toEqual({ ledger: 701 });
  });

  it("reports a gap (no write) when the cursor fell out of RPC retention", async () => {
    const store = memStore();
    await runIndex(config, deps({ store, rpc: fakeRpc({ events: [reg(100)], latest: 700 }) }));
    const writes = store.writes;
    const r = await runIndex(config, deps({ store, rpc: fakeRpc({ oldest: 900, latest: 1000 }) }));
    expect(r).toEqual({ status: "gap", rpcLedger: 700, oldestLedger: 900 });
    expect(store.writes).toBe(writes);
    const first = await runIndex(config, deps({ rpc: fakeRpc({ oldest: 50 }) }));
    expect(first.status).toBe("gap"); // startLedger 10 + ... < oldest 50
  });

  it.each([[false], ["throw" as const]])("verifier %s excludes the foundation without throwing", async (ok) => {
    const d = deps({ ok, rpc: fakeRpc({ events: [reg(100)] }) });
    const r = await runIndex(config, d);
    expect(r.status).toBe("ok");
    expect(d.store.current!.observations.foundations[FOUNDATION]!.verified).toBe(false);
  });

  it("backfills pre-registration payments once; a second run keeps the same totals", async () => {
    const store = memStore();
    const horizon = fakeHorizon([pay(10, "p1"), pay(20, "p2"), pay(30, "p3")]);
    const rpc = fakeRpc({ events: [reg(100)] });
    await runIndex(config, deps({ store, rpc, horizon }));
    expect(store.current!.data.donations).toHaveLength(3);
    expect(store.current!.data.foundations[0]!.backfilled).toBe(true);
    const before = JSON.stringify(store.current!.data);
    await runIndex(config, deps({ store, rpc: fakeRpc({ events: [reg(100)], ignoreCursor: true }), horizon }));
    expect(JSON.stringify(store.current!.data)).toBe(before);
    expect(horizon.calls).toEqual([FOUNDATION]); // not backfilled again
  });

  it("maps payments inside an inactive gap to ignored and keeps the rest (D8)", async () => {
    const rpc = fakeRpc({
      events: [reg(100), reg(200, "deactivate")],
      transfers: [pay(50, "a1"), pay(150, "a2"), pay(250, "a3")],
    });
    const d = deps({ rpc });
    await runIndex(config, d);
    expect(d.store.current!.data.donations.map((x) => x.ledger)).toEqual([50, 150]);
    expect(d.store.current!.data.foundations[0]!.active).toBe(false);
  });

  it("ignores payments to unregistered accounts and untagged memos stay unattributed", async () => {
    const rpc = fakeRpc({
      events: [reg(100)],
      transfers: [pay(150, "a1", { memo: { type: "none" } }), pay(160, "a2", { to: OTHER_FOUNDATION }), pay(170, "a3", { memo: txt("hello") })],
    });
    const d = deps({ rpc });
    await runIndex(config, d);
    expect(d.store.current!.data.donations.map((x) => x.appId)).toEqual([null, null]);
  });

  it("flags near-expiry from liveUntil and null (archived)", async () => {
    const near = deps({ rpc: fakeRpc({ events: [reg(100)], latest: 1000, liveUntil: 1000 + 100 }) });
    await runIndex(config, near);
    expect(near.store.current!.observations.foundations[FOUNDATION]!.ttl).toEqual({ liveUntilLedger: 1100, nearExpiry: true });
    const gone = deps({ rpc: fakeRpc({ events: [reg(100)], liveUntil: null }) });
    await runIndex(config, gone);
    expect(gone.store.current!.observations.foundations[FOUNDATION]!.ttl.nearExpiry).toBe(true);
  });
});
