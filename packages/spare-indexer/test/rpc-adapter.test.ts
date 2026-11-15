import { Account, Address, Asset, Memo as SdkMemo, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { createHorizonAdapter } from "../src/adapters/horizon.js";
import { createRpcAdapter, type RpcTransport } from "../src/adapters/rpc.js";
import type { RegistryEvent } from "../src/domain/registry.js";
import { ANCHOR_LEDGER, ANCHOR_TX, FOUNDATION_MAINNET, PAYER, rec } from "./fixtures/recorded.js";
import { cursorAt, registryEvent } from "./fixtures/rpc-synthetic.js";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const SAC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const sym = (s: string): string => nativeToScVal(s, { type: "symbol" }).toXDR("base64");

interface Call {
  method: string;
  params: any;
}

/** Fake transport serving recorded results; counts calls per method. */
function recorded(over: Partial<Record<string, (p: any) => unknown>> = {}) {
  const calls: Call[] = [];
  const transport: RpcTransport = async (method, params) => {
    calls.push({ method, params });
    const h = over[method];
    if (h) return h(params);
    if (method === "getHealth") return rec("rpc-getHealth.json");
    if (method === "getEvents") return rec("rpc-getEvents-usdc-anchor.json");
    if (method === "getTransaction") return rec("rpc-getTransaction-anchor.json");
    throw new Error(`unexpected ${method}`);
  };
  return { transport, calls, of: (m: string) => calls.filter((c) => c.method === m) };
}

async function all<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}
const adapter = (t: RpcTransport) => createRpcAdapter({ transport: t, network: "mainnet" });
const jsonSafe = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

describe("rpc adapter: health", () => {
  it("maps getHealth to oldest/latest ledger", async () => {
    const { transport } = recorded();
    expect(await adapter(transport).health()).toEqual({ oldestLedger: 65362379, latestLedger: 65483338 });
  });
  it("unhealthy node is an error, not a silent empty window", async () => {
    const { transport } = recorded({ getHealth: () => ({ status: "unhealthy", latestLedger: 1, oldestLedger: 1 }) });
    await expect(adapter(transport).health()).rejects.toThrow(/unhealthy/);
  });
});

describe("rpc adapter: usdcTransfers", () => {
  it("anchor: CAP-67 transfer filter on the USDC SAC, destination topic, opIndex 1, memo from the envelope", async () => {
    const r = recorded();
    const out = await all(adapter(r.transport).usdcTransfers([FOUNDATION_MAINNET], { ledger: ANCHOR_LEDGER }));
    const req = r.of("getEvents")[0]!.params;
    expect(req.startLedger).toBe(ANCHOR_LEDGER);
    expect(req.filters).toHaveLength(1);
    expect(req.filters[0].contractIds).toEqual([SAC]);
    expect(req.filters[0].topics).toEqual([[sym("transfer"), "*", new Address(FOUNDATION_MAINNET).toScVal().toXDR("base64"), "*"]]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      txHash: ANCHOR_TX,
      opIndex: 1,
      ledger: ANCHOR_LEDGER,
      closedAt: "2026-11-14T16:14:07Z",
      opType: "path_payment_strict_receive",
      successful: true,
      to: FOUNDATION_MAINNET,
      asset: { code: "USDC", issuer: USDC_ISSUER },
      amount: 1_000_000n,
    });
    expect(out[0]!.memo).toEqual({ type: "text", bytes: new TextEncoder().encode("spare:spare-demo") });
  });

  it("D6 parity: RPC-derived opIndex/amount/memo equal the Horizon-derived ones for the same payment", async () => {
    const [fromRpc] = await all(adapter(recorded().transport).usdcTransfers([FOUNDATION_MAINNET], { ledger: ANCHOR_LEDGER }));
    const pages = [1, 2, 3].map((n) => rec(`horizon-payments-page${n}.json`));
    let i = 0;
    const horizon = createHorizonAdapter({ baseUrl: "https://horizon.stellar.org", fetch: async () => new Response(JSON.stringify(pages[i++])) });
    const fromHorizon = (await all(horizon.payments(FOUNDATION_MAINNET))).find((o) => o.txHash === ANCHOR_TX)!;
    expect(fromRpc).toEqual(fromHorizon);
  });

  it("never propagates the payer (source/from) address", async () => {
    const out = await all(adapter(recorded().transport).usdcTransfers([FOUNDATION_MAINNET], { ledger: ANCHOR_LEDGER }));
    expect(jsonSafe(out)).not.toContain(PAYER);
    expect(Object.keys(out[0]!).sort()).toEqual(["amount", "asset", "closedAt", "ledger", "memo", "opIndex", "opType", "successful", "to", "txHash"]);
  });

  it("getTransaction is cached per hash, even when the same page repeats the event", async () => {
    const page = rec("rpc-getEvents-usdc-anchor.json") as { events: Array<{ id: string }> };
    const dup = { ...page, events: [page.events[0]!, { ...page.events[0]!, id: "0281223124124344321-0000000009" }] };
    const r = recorded({ getEvents: () => dup });
    const out = await all(adapter(r.transport).usdcTransfers([FOUNDATION_MAINNET], { ledger: ANCHOR_LEDGER }));
    expect(out).toHaveLength(2);
    expect(r.of("getTransaction")).toHaveLength(1);
  });

  it("chunks destinations: 5 topic patterns per filter, 5 filters per request", async () => {
    const accounts = Array.from({ length: 27 }, (_, n) => nth(n));
    const r = recorded({ getEvents: () => ({ events: [], cursor: cursorAt(ANCHOR_LEDGER + 1), latestLedger: ANCHOR_LEDGER, oldestLedger: 1 }) });
    await all(adapter(r.transport).usdcTransfers(accounts, { ledger: ANCHOR_LEDGER }));
    const reqs = r.of("getEvents").map((c) => c.params.filters as Array<{ topics: unknown[] }>);
    expect(reqs.map((f) => f.length)).toEqual([5, 1]);
    expect(reqs.flat().map((f) => f.topics.length)).toEqual([5, 5, 5, 5, 5, 2]);
  });

  it("follows empty pages by cursor until the cursor reaches the latest ledger, deduping by event id", async () => {
    const page = rec("rpc-getEvents-usdc-anchor.json") as { events: unknown[] };
    const latest = ANCHOR_LEDGER + 20_000;
    const seen: Array<string | undefined> = [];
    const r = recorded({
      getEvents: (p) => {
        const c: string | undefined = p.pagination?.cursor;
        seen.push(c);
        if (c === undefined) return { events: [], cursor: cursorAt(ANCHOR_LEDGER + 10_000), latestLedger: latest, oldestLedger: 1 };
        if (c === cursorAt(ANCHOR_LEDGER + 10_000)) return { events: page.events, cursor: cursorAt(ANCHOR_LEDGER + 15_000), latestLedger: latest, oldestLedger: 1 };
        // overlapping window repeats the event, then the cursor reaches the tip
        return { events: page.events, cursor: cursorAt(latest), latestLedger: latest, oldestLedger: 1 };
      },
    });
    const out = await all(adapter(r.transport).usdcTransfers([FOUNDATION_MAINNET], { ledger: ANCHOR_LEDGER }));
    expect(out).toHaveLength(1);
    expect(seen).toEqual([undefined, cursorAt(ANCHOR_LEDGER + 10_000), cursorAt(ANCHOR_LEDGER + 15_000)]);
    expect(r.of("getEvents")[1]!.params.startLedger).toBeUndefined();
  });

  it("a start ledger beyond the node tip yields nothing without querying events", async () => {
    const r = recorded();
    const out = await all(adapter(r.transport).usdcTransfers([FOUNDATION_MAINNET], { ledger: 65483339 }));
    expect(out).toEqual([]);
    expect(r.of("getEvents")).toHaveLength(0);
  });

  it("unknown transaction (outside retention) fails loudly instead of guessing a memo", async () => {
    const r = recorded({ getTransaction: () => ({ status: "NOT_FOUND", latestLedger: 1, oldestLedger: 1 }) });
    await expect(all(adapter(r.transport).usdcTransfers([FOUNDATION_MAINNET], { ledger: ANCHOR_LEDGER }))).rejects.toThrow(/NOT_FOUND/);
  });

  it("fee-bump envelopes expose the inner memo and op types", async () => {
    const src = new Account(nth(40), "1");
    const inner = new TransactionBuilder(src, { fee: "100", networkPassphrase: Networks.PUBLIC })
      .addOperation(Operation.payment({ destination: FOUNDATION_MAINNET, asset: new Asset("USDC", USDC_ISSUER), amount: "0.1" }))
      .addMemo(SdkMemo.id("42"))
      .setTimeout(0)
      .build();
    const bumped = TransactionBuilder.buildFeeBumpTransaction(nth(41), "200", inner, Networks.PUBLIC);
    const ev = (rec("rpc-getEvents-usdc-anchor.json") as { events: Array<Record<string, unknown>> }).events[0]!;
    const r = recorded({
      getEvents: () => ({ events: [{ ...ev, operationIndex: 0 }], cursor: cursorAt(ANCHOR_LEDGER + 1), latestLedger: ANCHOR_LEDGER, oldestLedger: 1 }),
      getTransaction: () => ({ status: "SUCCESS", ledger: ANCHOR_LEDGER, envelopeXdr: bumped.toEnvelope().toXDR("base64") }),
    });
    const [o] = await all(adapter(r.transport).usdcTransfers([FOUNDATION_MAINNET], { ledger: ANCHOR_LEDGER }));
    expect(o).toMatchObject({ opType: "payment", opIndex: 0, memo: { type: "id" } });
  });
});

describe("rpc adapter: registryEvents", () => {
  const A = nth(1);
  it("chunks contract ids 5 per filter, filters on topic0 'spare', and decodes register/update/deactivate", async () => {
    const ids = Array.from({ length: 7 }, (_, n) => nthContract(n));
    const evs = [
      registryEvent({ id: "1-0", ledger: 100, contractId: ids[0]!, kind: "register", account: A, name: "Fund", website: "fund.org" }),
      registryEvent({ id: "2-0", ledger: 120, contractId: ids[0]!, kind: "update", account: A, name: "Fund 2", website: "fund2.org" }),
      registryEvent({ id: "3-0", ledger: 130, contractId: ids[0]!, kind: "deactivate", account: A }),
      registryEvent({ id: "4-0", ledger: 140, contractId: ids[0]!, kind: "mystery", account: A }),
    ];
    const r = recorded({ getEvents: () => ({ events: evs, cursor: cursorAt(200), latestLedger: 200, oldestLedger: 1 }) });
    const out: RegistryEvent[] = await all(adapter(r.transport).registryEvents(ids, { ledger: 50 }));
    const filters = r.of("getEvents")[0]!.params.filters as Array<{ contractIds: string[]; topics: string[][] }>;
    expect(filters.map((f) => f.contractIds.length)).toEqual([5, 2]);
    expect(filters[0]!.topics).toEqual([[sym("spare"), "*", "*"]]);
    expect(out.map((e) => [e.kind, e.ledger, e.account, e.name, e.website])).toEqual([
      ["register", 100, A, "Fund", "fund.org"],
      ["update", 120, A, "Fund 2", "fund2.org"],
      ["deactivate", 130, A, undefined, undefined],
    ]);
    expect(out[0]!.contractId).toBe(ids[0]);
  });
});

describe("rpc adapter: liveUntil", () => {
  const CID = nthContract(3);
  const ACCOUNT = nth(5);

  it("asks getLedgerEntries for persistent contract data Vec[Symbol(Foundation), Address] (DataKey::Foundation)", async () => {
    const r = recorded({ getLedgerEntries: () => rec("rpc-getLedgerEntries-missing.json") });
    await adapter(r.transport).liveUntil(CID, ACCOUNT);
    const keys = r.of("getLedgerEntries")[0]!.params.keys as string[];
    expect(keys).toHaveLength(1);
    const k = xdr.LedgerKey.fromXDR(keys[0]!, "base64");
    if (k.type !== "contractData") throw new Error("expected contractData key");
    expect(Address.fromScAddress(k.contractData.contract).toString()).toBe(CID);
    expect(k.contractData.durability).toBe(xdr.ContractDataDurability.persistent);
    expect(k.contractData.key.toXDR("base64")).toBe(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Foundation"), new Address(ACCOUNT).toScVal()]).toXDR("base64"));
  });

  it("returns liveUntilLedgerSeq for a live entry and null when the entry is missing or archived", async () => {
    const live = recorded({ getLedgerEntries: () => ({ entries: [{ key: "k", xdr: "x", lastModifiedLedgerSeq: 10, liveUntilLedgerSeq: 5_123_456 }], latestLedger: 11 }) });
    expect(await adapter(live.transport).liveUntil(CID, ACCOUNT)).toBe(5_123_456);
    const missing = recorded({ getLedgerEntries: () => rec("rpc-getLedgerEntries-missing.json") });
    expect(await adapter(missing.transport).liveUntil(CID, ACCOUNT)).toBeNull();
    const none = recorded({ getLedgerEntries: () => ({ latestLedger: 11 }) });
    expect(await adapter(none.transport).liveUntil(CID, ACCOUNT)).toBeNull();
  });
});

const nth = (n: number): string => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n));
const nthContract = (n: number): string => StrKey.encodeContract(Buffer.alloc(32, n));
