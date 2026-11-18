import { Address, Asset, StrKey, scValToNative, xdr } from "@stellar/stellar-sdk";
import { NETWORKS, type FetchLike, type Network } from "spare-sdk";
import type { RegistryEvent } from "../domain/registry.js";
import type { Memo, ObservedAsset, TransferObservation } from "../domain/types.js";
import type { Cursor, RpcPort } from "../ports.js";

/** Calls one JSON-RPC method and returns `result`; throws on transport or JSON-RPC errors. */
export type RpcTransport = (method: string, params?: unknown) => Promise<unknown>;

export function createJsonRpcTransport(opts: { url: string; fetch: FetchLike }): RpcTransport {
  let id = 0;
  return async (method, params) => {
    const res = await opts.fetch(opts.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { code: number; message: string } };
    if (body.error !== undefined) throw new Error(`RPC ${method}: ${body.error.code} ${body.error.message}`);
    return body.result;
  };
}

export interface RpcAdapterOptions {
  transport: RpcTransport;
  network: Network;
}

interface RawEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  txHash: string;
  operationIndex?: number;
  inSuccessfulContractCall?: boolean;
  topic: string[];
  value: string;
}
interface EventsPage {
  events: RawEvent[];
  cursor?: string;
  latestLedger: number;
}
interface TxInfo {
  memo: Memo;
  opTypes: string[];
  successful: boolean;
}

/** getEvents limits: <=5 contractIds per filter, <=5 topic patterns per filter, <=5 filters per request. */
const MAX = 5;
const PAGE_LIMIT = 200;

function chunks<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

const b64 = (s: xdr.ScVal): string => s.toXDR("base64");
const symbol = (s: string): string => b64(xdr.ScVal.scvSymbol(s));
const decode = (s: string): unknown => scValToNative(xdr.ScVal.fromXDR(s, "base64"));
/** Ledger inside an RPC cursor / event id (TOID: ledger << 32 | tx << 12 | op). */
const ledgerOfCursor = (c: string): number => Number(BigInt(c.split("-")[0]!) >> 32n);
const snake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function toMemo(m: xdr.Memo): Memo {
  switch (m.type) {
    case "memoText":
      // `.bytes` is lossless; the string getter would replace invalid UTF-8.
      return { type: "text", bytes: new Uint8Array(m.text.bytes) };
    case "memoId":
      return { type: "id" };
    case "memoHash":
      return { type: "hash" };
    case "memoReturn":
      return { type: "return" };
    default:
      return { type: "none" };
  }
}

/** Memo and operation types of the (inner, for fee-bump) transaction in an envelope. */
function parseEnvelope(envelopeXdr: string): Pick<TxInfo, "memo" | "opTypes"> {
  const env = xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
  const tx = env.type === "envelopeTypeTxV0" ? env.v0.tx : env.type === "envelopeTypeTx" ? env.v1.tx : env.feeBump.tx.innerTx.v1.tx;
  return { memo: toMemo(tx.memo), opTypes: tx.operations.map((o) => snake(o.body.type)) };
}

const stroops = (v: unknown): bigint => {
  const raw = typeof v === "object" && v !== null && "amount" in v ? (v as { amount: unknown }).amount : v;
  if (typeof raw !== "bigint") throw new Error("SAC transfer event has no i128 amount");
  return raw;
};

function toAsset(s: unknown): ObservedAsset {
  if (s === "native") return "native";
  const [code = "", issuer = ""] = String(s).split(":");
  return { code, issuer };
}

/**
 * RPC adapter (transport injected, so tests replay recorded results). Event rows are decoded with
 * stellar-sdk; the `from` topic is never read, so no payer address can leave this module.
 */
export function createRpcAdapter(opts: RpcAdapterOptions): RpcPort {
  const { transport } = opts;
  const net = NETWORKS[opts.network];
  const sacId = new Asset("USDC", net.usdcIssuer).contractId(net.passphrase);
  const txCache = new Map<string, Promise<TxInfo>>();

  async function health(): Promise<{ oldestLedger: number; latestLedger: number }> {
    const h = (await transport("getHealth")) as { status: string; oldestLedger: number; latestLedger: number };
    if (h.status !== "healthy") throw new Error(`RPC is ${h.status}`);
    return { oldestLedger: h.oldestLedger, latestLedger: h.latestLedger };
  }

  /** Paginates by cursor (empty pages still advance it) until the tip; dedupes by event id. */
  async function* rawEvents(filterGroups: unknown[][], from: Cursor): AsyncGenerator<RawEvent> {
    if (from.ledger > (await health()).latestLedger) return;
    const seen = new Set<string>();
    for (const filters of filterGroups) {
      let cursor: string | undefined;
      for (;;) {
        const pagination = cursor === undefined ? { limit: PAGE_LIMIT } : { limit: PAGE_LIMIT, cursor };
        const page = (await transport("getEvents", { ...(cursor === undefined ? { startLedger: from.ledger } : {}), filters, pagination })) as EventsPage;
        for (const e of page.events) {
          if (seen.has(e.id) || e.inSuccessfulContractCall === false) continue;
          seen.add(e.id);
          yield e;
        }
        if (page.cursor === undefined || page.cursor === cursor || ledgerOfCursor(page.cursor) >= page.latestLedger) break;
        cursor = page.cursor;
      }
    }
  }

  function txInfo(hash: string): Promise<TxInfo> {
    let p = txCache.get(hash);
    if (p === undefined) {
      p = (async () => {
        const t = (await transport("getTransaction", { hash })) as { status: string; envelopeXdr?: string };
        if (t.status === "NOT_FOUND" || t.envelopeXdr === undefined) throw new Error(`getTransaction ${hash}: ${t.status} (outside RPC retention?)`);
        return { ...parseEnvelope(t.envelopeXdr), successful: t.status === "SUCCESS" };
      })();
      txCache.set(hash, p);
    }
    return p;
  }

  return {
    health,

    async liveUntil(contractId, account) {
      // Contract `DataKey::Foundation(Address)` serializes as Vec[Symbol("Foundation"), Address].
      const key = xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: new Address(contractId).toScAddress(),
          key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Foundation"), new Address(account).toScVal()]),
          durability: xdr.ContractDataDurability.persistent,
        }),
      );
      const r = (await transport("getLedgerEntries", { keys: [key.toXDR("base64")] })) as { entries?: Array<{ liveUntilLedgerSeq?: number }> | null };
      return r.entries?.[0]?.liveUntilLedgerSeq ?? null;
    },

    async *registryEvents(contractIds, from) {
      const filters = chunks(contractIds, MAX).map((ids) => ({ type: "contract", contractIds: ids, topics: [[symbol("spare"), "*", "*"]] }));
      for await (const e of rawEvents(chunks(filters, MAX), from)) {
        const kind = decode(e.topic[1] ?? "");
        if ((kind !== "register" && kind !== "update" && kind !== "deactivate") || e.topic[2] === undefined) continue;
        const account = Address.fromScVal(xdr.ScVal.fromXDR(e.topic[2], "base64")).toString();
        // Contracts can register their own C... address; Horizon rejects those, so only G keys are indexed.
        if (!StrKey.isValidEd25519PublicKey(account)) continue;
        const [name, website] = decode(e.value) as [string, string];
        yield { contractId: e.contractId, account, kind, ledger: e.ledger, ...(kind === "deactivate" ? {} : { name, website }) } satisfies RegistryEvent;
      }
    },

    async *usdcTransfers(to, from) {
      const filters = chunks(to, MAX).map((dests) => ({
        type: "contract",
        contractIds: [sacId],
        // CAP-67: topics [transfer, from, to, asset]; match any sender, the given destination.
        topics: dests.map((d) => [symbol("transfer"), "*", b64(new Address(d).toScVal()), "*"]),
      }));
      const wanted = new Set(to);
      for await (const e of rawEvents(chunks(filters, MAX), from)) {
        if (decode(e.topic[0] ?? "") !== "transfer" || e.topic.length < 4) continue;
        const dest = String(decode(e.topic[2]!));
        if (!wanted.has(dest)) continue;
        const tx = await txInfo(e.txHash);
        const opIndex = e.operationIndex ?? Number(BigInt(e.id.split("-")[0]!) & 0xfffn);
        const out: TransferObservation = {
          txHash: e.txHash,
          opIndex,
          ledger: e.ledger,
          closedAt: e.ledgerClosedAt,
          opType: tx.opTypes[opIndex] ?? "unknown",
          successful: tx.successful,
          to: dest,
          asset: toAsset(decode(e.topic[3]!)),
          amount: stroops(decode(e.value)),
          memo: tx.memo,
        };
        yield out;
      }
    },
  };
}
