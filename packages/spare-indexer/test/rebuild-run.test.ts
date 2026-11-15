import { describe, expect, it } from "vitest";
import { runIndex } from "../src/app/index-run.js";
import { runRebuild } from "../src/app/rebuild-run.js";
import type { IndexerConfig } from "../src/config.js";
import { FOUNDATION, obs } from "./fixtures/observations.js";
import { clock, fakeHorizon, fakeRpc, memStore, throwingRpc, verifier } from "./fakes.js";

const config: IndexerConfig = { network: "mainnet", registryContracts: ["C1"], seedAccounts: [], startLedger: 10, nearExpiryLedgers: 518_400 };
const seed = { account: FOUNDATION, contractId: "C1", name: "Fund", website: "fund.org", fromLedger: 100 };
const pay = (ledger: number, hash: string) => obs({ txHash: hash.padEnd(64, "0"), ledger });
const history = [pay(10, "p1"), pay(120, "p2"), pay(130, "p3"), pay(140, "p4"), pay(150, "p5")];

describe("runRebuild", () => {
  it("never touches RPC: a throwing RPC is irrelevant and pagination is followed to exhaustion", async () => {
    const store = memStore();
    const deps = { horizon: fakeHorizon(history, 2), verifier: verifier(true), clock, store, rpc: throwingRpc };
    const r = await runRebuild({ ...config, seedAccounts: [seed] }, deps);
    expect(r.status).toBe("ok");
    expect(store.current!.data.donations).toHaveLength(5);
  });

  it("rebuild.data deep-equals index.data over the same fixture", async () => {
    const store = memStore();
    const horizon = fakeHorizon(history);
    const events = [{ contractId: "C1", account: FOUNDATION, kind: "register" as const, ledger: 100, name: "Fund", website: "fund.org" }];
    await runIndex(config, { rpc: fakeRpc({ events, transfers: history.slice(1) }), horizon, verifier: verifier(true), clock, store });
    const indexed = structuredClone(store.current!.data);
    // from previous snapshot
    await runRebuild(config, { horizon, verifier: verifier(true), clock, store });
    expect(store.current!.data).toEqual(indexed);
    // from seeds only
    const fresh = memStore();
    await runRebuild({ ...config, seedAccounts: [seed] }, { horizon, verifier: verifier(true), clock, store: fresh });
    expect(fresh.current!.data).toEqual(indexed);
  });

  it("registry state comes from the previous snapshot (deactivation survives) plus seeds", async () => {
    const store = memStore();
    const events = [
      { contractId: "C1", account: FOUNDATION, kind: "register" as const, ledger: 100, name: "Fund", website: "fund.org" },
      { contractId: "C1", account: FOUNDATION, kind: "deactivate" as const, ledger: 200 },
    ];
    await runIndex(config, { rpc: fakeRpc({ events }), horizon: fakeHorizon(), verifier: verifier(true), clock, store });
    const horizon = fakeHorizon([pay(150, "a"), pay(250, "b")]);
    await runRebuild({ ...config, seedAccounts: [seed] }, { horizon, verifier: verifier(true), clock, store });
    expect(store.current!.data.foundations[0]!.registrations[0]!.intervals).toEqual([{ from: 100, to: 200 }]);
    expect(store.current!.data.donations.map((d) => d.ledger)).toEqual([150]);
  });

  it("sets the rpc cursor to the Horizon latest ledger it covered, so the next index run resumes without a gap", async () => {
    const store = memStore();
    const events = [{ contractId: "C1", account: FOUNDATION, kind: "register" as const, ledger: 100, name: "Fund", website: "fund.org" }];
    await runIndex(config, { rpc: fakeRpc({ events, latest: 777 }), horizon: fakeHorizon(), verifier: verifier(true), clock, store });
    // time passes beyond RPC retention: oldest 3000 > cursor 777 + 1
    const stale = await runIndex(config, { rpc: fakeRpc({ events, oldest: 3000, latest: 5100 }), horizon: fakeHorizon(), verifier: verifier(true), clock, store });
    expect(stale.status).toBe("gap");
    await runRebuild(config, { horizon: fakeHorizon(history, 2, 5000), verifier: verifier(true), clock, store });
    expect(store.current!.observations.cursors.rpcLedger).toBe(5000);
    const next = await runIndex(config, { rpc: fakeRpc({ events, oldest: 3000, latest: 5100 }), horizon: fakeHorizon(), verifier: verifier(true), clock, store });
    expect(next.status).toBe("ok");
  });

  it("unverified domain is recorded, not thrown; previous ttl is kept and the cursor follows Horizon", async () => {
    const store = memStore();
    const events = [{ contractId: "C1", account: FOUNDATION, kind: "register" as const, ledger: 100, name: "Fund", website: "fund.org" }];
    await runIndex(config, { rpc: fakeRpc({ events, latest: 777, liveUntil: 9_000_000 }), horizon: fakeHorizon(), verifier: verifier(true), clock, store });
    await runRebuild(config, { horizon: fakeHorizon([], 2, 900), verifier: verifier("throw"), clock, store });
    const o = store.current!.observations;
    expect(o.foundations[FOUNDATION]).toMatchObject({ verified: false, ttl: { liveUntilLedger: 9_000_000, nearExpiry: false } });
    expect(o.cursors.rpcLedger).toBe(900);
  });
});
