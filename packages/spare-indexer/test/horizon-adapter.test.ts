import { describe, expect, it } from "vitest";
import { createHorizonAdapter } from "../src/adapters/horizon.js";
import { classify } from "../src/domain/classify.js";
import { ANCHOR_TX, FOUNDATION_MAINNET, PAYER, rec } from "./fixtures/recorded.js";

const BASE = "https://horizon.stellar.org";

/** Fake fetch serving recorded pages keyed by their cursor; records every URL asked. */
function recordedFetch() {
  const urls: string[] = [];
  const fetchFn = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    const cursor = new URL(url).searchParams.get("cursor");
    const page = cursor === null ? 1 : cursor === "279773946323369985" ? 2 : cursor === "281223124124344322" ? 3 : 0;
    if (page === 0) return new Response("unexpected", { status: 500 });
    return new Response(JSON.stringify(rec(`horizon-payments-page${page}.json`)), { status: 200 });
  };
  return { fetchFn, urls };
}

async function all<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

const page = (records: unknown[], next = `${BASE}/next`) => ({ _links: { next: { href: next } }, _embedded: { records } });
const jsonFetch = (pages: unknown[]) => {
  let i = 0;
  return async () => new Response(JSON.stringify(pages[Math.min(i++, pages.length - 1)]), { status: 200 });
};
const payment = (over: Record<string, unknown> = {}, tx: Record<string, unknown> = {}) => ({
  id: "281223124124344321",
  type: "payment",
  transaction_successful: true,
  created_at: "2026-11-14T16:14:07Z",
  asset_type: "credit_alphanum4",
  asset_code: "USDC",
  asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  from: PAYER,
  to: FOUNDATION_MAINNET,
  amount: "1.2500000",
  transaction: { hash: "ab".repeat(32), ledger: 65477361, successful: true, memo_type: "none", ...tx },
  ...over,
});

describe("createHorizonAdapter.payments", () => {
  it("follows _links.next to exhaustion and asks for join=transactions&order=asc", async () => {
    const { fetchFn, urls } = recordedFetch();
    const out = await all(createHorizonAdapter({ baseUrl: BASE, fetch: fetchFn }).payments(FOUNDATION_MAINNET));
    expect(urls).toHaveLength(3);
    const first = new URL(urls[0]!);
    expect(first.pathname).toBe(`/accounts/${FOUNDATION_MAINNET}/payments`);
    expect(first.searchParams.get("join")).toBe("transactions");
    expect(first.searchParams.get("order")).toBe("asc");
    // 19 recorded records: create_account and invoke_host_function are not payment-like
    expect(out.length).toBe(12);
    expect(out.map((o) => o.opType).every((t) => ["payment", "path_payment_strict_receive", "path_payment_strict_send"].includes(t))).toBe(true);
  });

  it("anchor path payment: opIndex 1 (0-based), text memo bytes, 0.10 USDC, successful", async () => {
    const { fetchFn } = recordedFetch();
    const out = await all(createHorizonAdapter({ baseUrl: BASE, fetch: fetchFn }).payments(FOUNDATION_MAINNET));
    const a = out.find((o) => o.txHash === ANCHOR_TX)!;
    expect(a).toMatchObject({
      opIndex: 1,
      ledger: 65477361,
      closedAt: "2026-11-14T16:14:07Z",
      opType: "path_payment_strict_receive",
      successful: true,
      to: FOUNDATION_MAINNET,
      asset: { code: "USDC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
      amount: 1_000_000n,
    });
    expect(a.memo.type).toBe("text");
    const c = classify(a, { network: "mainnet", foundations: new Set([FOUNDATION_MAINNET]) });
    expect(c).toMatchObject({ kind: "counted", record: { amount: "0.1000000", appId: "spare-demo", id: `${ANCHOR_TX}:1` } });
  });

  it("never propagates the payer address into observations", async () => {
    const { fetchFn } = recordedFetch();
    const out = await all(createHorizonAdapter({ baseUrl: BASE, fetch: fetchFn }).payments(FOUNDATION_MAINNET));
    const anchor = out.find((o) => o.txHash === ANCHOR_TX)!;
    expect(JSON.stringify(anchor, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toContain(PAYER);
    expect(Object.keys(anchor).sort()).toEqual(["amount", "asset", "closedAt", "ledger", "memo", "opIndex", "opType", "successful", "to", "txHash"]);
  });

  it("native amounts, memo none and fromLedger filter", async () => {
    const { fetchFn } = recordedFetch();
    const adapter = createHorizonAdapter({ baseUrl: BASE, fetch: fetchFn });
    const out = await all(adapter.payments(FOUNDATION_MAINNET, 65_477_361));
    expect(out.every((o) => o.ledger >= 65_477_361)).toBe(true);
    const everything = await all(adapter.payments(FOUNDATION_MAINNET));
    expect(everything.some((o) => o.asset === "native" && o.memo.type === "none")).toBe(true);
  });

  it("muxed destination reduces to the base G account; failed tx is reported unsuccessful", async () => {
    const f = jsonFetch([
      page([payment({ to_muxed: "MAAAAAAAAAAAAAB7BQ2L7E5NBWMXDUCMZSIPOBKRDSBYVLMXGSSKF6YNPIB7Y77ITLVL6", to_muxed_id: "123", transaction_successful: false }, { successful: false }), payment({ transaction_successful: false }, { successful: false })]),
      page([]),
    ]);
    const out = await all(createHorizonAdapter({ baseUrl: BASE, fetch: f }).payments(FOUNDATION_MAINNET));
    expect(out.map((o) => [o.to, o.successful])).toEqual([[FOUNDATION_MAINNET, false], [FOUNDATION_MAINNET, false]]);
  });

  it("memo_bytes wins over lossy memo string; id/hash/return carry no bytes", async () => {
    const f = jsonFetch([
      page([
        payment({}, { memo_type: "text", memo: "spare:�", memo_bytes: Buffer.from([0x73, 0xff, 0xfe]).toString("base64") }),
        payment({ id: "281223124124344322" }, { memo_type: "id", memo: "42" }),
        payment({ id: "281223124124344323" }, { memo_type: "text", memo: "spare:shop1" }),
      ]),
      page([]),
    ]);
    const out = await all(createHorizonAdapter({ baseUrl: BASE, fetch: f }).payments(FOUNDATION_MAINNET));
    expect(out[0]!.memo).toEqual({ type: "text", bytes: new Uint8Array([0x73, 0xff, 0xfe]) });
    expect(out[1]!.memo).toEqual({ type: "id" });
    expect(out[2]!.memo).toEqual({ type: "text", bytes: new TextEncoder().encode("spare:shop1") });
  });

  it("latestLedger reads history_latest_ledger from the Horizon root", async () => {
    const urls: string[] = [];
    const fetchFn = async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(JSON.stringify(rec("horizon-root.json")));
    };
    expect(await createHorizonAdapter({ baseUrl: `${BASE}/`, fetch: fetchFn }).latestLedger()).toBe(65483308);
    expect(urls).toEqual([`${BASE}/`]);
  });

  it("throws on non-2xx and refuses to follow next links to another origin", async () => {
    const bad = createHorizonAdapter({ baseUrl: BASE, fetch: async () => new Response("no", { status: 503 }) });
    await expect(all(bad.payments(FOUNDATION_MAINNET))).rejects.toThrow(/503/);
    const evil = createHorizonAdapter({ baseUrl: BASE, fetch: jsonFetch([page([payment()], "https://evil.example/steal")]) });
    await expect(all(evil.payments(FOUNDATION_MAINNET))).rejects.toThrow(/origin/);
  });
});
