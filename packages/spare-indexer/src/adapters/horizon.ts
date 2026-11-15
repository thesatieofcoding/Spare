import type { FetchLike } from "spare-sdk";
import type { Memo, ObservedAsset, TransferObservation } from "../domain/types.js";
import type { HorizonPort } from "../ports.js";

export interface HorizonAdapterOptions {
  /** e.g. https://horizon.stellar.org (no trailing slash needed). */
  baseUrl: string;
  fetch: FetchLike;
}

const PAYMENT_LIKE = new Set(["payment", "path_payment_strict_receive", "path_payment_strict_send"]);
const PAGE_LIMIT = 200;

interface HorizonRecord {
  id: string;
  type: string;
  transaction_successful?: boolean;
  created_at?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  /** Base G account; the muxed form lives in `to_muxed`, which is deliberately ignored. */
  to?: string;
  amount?: string;
  transaction?: { hash: string; ledger: number; successful?: boolean; memo_type?: string; memo?: string; memo_bytes?: string };
}

interface HorizonPage {
  _links?: { next?: { href?: string } };
  _embedded?: { records?: HorizonRecord[] };
}

/** "0.1000000" -> 1_000_000n (exact, no floats). */
function toStroops(amount: string): bigint {
  const [whole = "0", frac = ""] = amount.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, "0").slice(0, 7));
}

function toMemo(tx: NonNullable<HorizonRecord["transaction"]>): Memo {
  switch (tx.memo_type) {
    case "text":
      // memo_bytes is lossless; `memo` is a sanitized string for non-UTF-8 memos.
      return { type: "text", bytes: tx.memo_bytes !== undefined ? new Uint8Array(Buffer.from(tx.memo_bytes, "base64")) : new TextEncoder().encode(tx.memo ?? "") };
    case "id":
    case "hash":
    case "return":
      return { type: tx.memo_type };
    default:
      return { type: "none" };
  }
}

const toAsset = (r: HorizonRecord): ObservedAsset => (r.asset_type === "native" ? "native" : { code: r.asset_code ?? "", issuer: r.asset_issuer ?? "" });

/**
 * Horizon payments adapter. Source/`from` is never read, so no donor address can leave it.
 * opIndex: Horizon operation ids carry a 1-based op number in the low 12 bits.
 */
export function createHorizonAdapter(opts: HorizonAdapterOptions): HorizonPort {
  const base = new URL(opts.baseUrl);
  const getJson = async (url: string): Promise<unknown> => {
    const res = await opts.fetch(url);
    if (!res.ok) throw new Error(`Horizon ${res.status} for ${url}`);
    return res.json();
  };

  return {
    async latestLedger() {
      const root = (await getJson(`${base.origin}/`)) as { history_latest_ledger?: number };
      if (typeof root.history_latest_ledger !== "number") throw new Error("Horizon root has no history_latest_ledger");
      return root.history_latest_ledger;
    },

    async *payments(account, fromLedger) {
      let url: string | null = `${base.origin}/accounts/${account}/payments?join=transactions&order=asc&limit=${PAGE_LIMIT}`;
      while (url !== null) {
        const page = (await getJson(url)) as HorizonPage;
        const records = page._embedded?.records ?? [];
        for (const r of records) {
          const tx = r.transaction;
          if (!PAYMENT_LIKE.has(r.type) || tx === undefined || r.to === undefined || r.amount === undefined) continue;
          if (fromLedger !== undefined && tx.ledger < fromLedger) continue;
          const out: TransferObservation = {
            txHash: tx.hash,
            opIndex: Number((BigInt(r.id) & 0xfffn) - 1n),
            ledger: tx.ledger,
            closedAt: r.created_at ?? "",
            opType: r.type,
            successful: r.transaction_successful ?? tx.successful ?? false,
            to: r.to,
            asset: toAsset(r),
            amount: toStroops(r.amount),
            memo: toMemo(tx),
          };
          yield out;
        }
        const next = page._links?.next?.href;
        if (records.length === 0 || next === undefined) {
          url = null;
        } else {
          if (new URL(next).origin !== base.origin) throw new Error(`Horizon next link has unexpected origin: ${next}`);
          url = next;
        }
      }
    },
  };
}
