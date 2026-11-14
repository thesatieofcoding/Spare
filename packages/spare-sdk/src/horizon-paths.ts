import { Asset } from "@stellar/stellar-sdk";
import { formatStroops, toStroops } from "./amount.js";
import { MAX_PATH_LENGTH, USDC_CODE } from "./constants.js";
import { isNetwork, NETWORKS, type Network } from "./network.js";
import type { FetchLike, PathQuotePort, XlmQuote } from "./ports.js";

/**
 * Without `horizon`, `network` (default "mainnet") picks the Horizon URL. A custom `horizon` URL
 * must name its `network`, so the port never claims mainnet for a testnet server.
 */
export type HorizonPathQuotePortOptions =
  | { network?: Network; horizon?: undefined; fetch?: FetchLike }
  | { network: Network; horizon: string; fetch?: FetchLike };

interface PathRecord {
  source_asset_type?: string;
  source_amount?: string;
  path?: { asset_type?: string; asset_code?: string; asset_issuer?: string }[];
}

function toAsset(a: { asset_type?: string; asset_code?: string; asset_issuer?: string }): Asset | null {
  if (a.asset_type === "native" || !a.asset_code || !a.asset_issuer) return null;
  try {
    return new Asset(a.asset_code, a.asset_issuer);
  } catch {
    return null;
  }
}

/**
 * PathQuotePort backed by Horizon `GET /paths/strict-receive` with `source_assets=native`
 * (https://developers.stellar.org/docs/data/apis/horizon/api-reference/list-strict-receive-payment-paths).
 * Keeps the cheapest XLM path of at most 5 hops. Throws on HTTP/network errors.
 */
export class HorizonPathQuotePort implements PathQuotePort {
  readonly network: Network;
  private readonly base: string;
  private readonly fetch: FetchLike;

  constructor(o: HorizonPathQuotePortOptions = {}) {
    if (o.horizon !== undefined && o.network === undefined) {
      throw new Error("HorizonPathQuotePort: a custom horizon URL needs an explicit network");
    }
    const network = o.network ?? "mainnet";
    if (!isNetwork(network)) throw new Error(`unknown network: ${String(network)}`);
    this.network = network;
    this.base = (o.horizon ?? NETWORKS[network].horizonUrl).replace(/\/+$/, "");
    this.fetch = o.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async quoteXlmForUsdc(usdcStroops: bigint, usdcIssuer: string): Promise<XlmQuote | null> {
    const url = new URL(`${this.base}/paths/strict-receive`);
    url.search = new URLSearchParams({
      source_assets: "native",
      destination_asset_type: "credit_alphanum4",
      destination_asset_code: USDC_CODE,
      destination_asset_issuer: usdcIssuer,
      destination_amount: formatStroops(usdcStroops),
    }).toString();
    const res = await this.fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`horizon paths: HTTP ${res.status}`);
    const body = (await res.json()) as { _embedded?: { records?: PathRecord[] } };
    let best: XlmQuote | null = null;
    for (const r of body._embedded?.records ?? []) {
      if (r.source_asset_type !== "native") continue;
      const amount = toStroops(r.source_amount ?? "");
      if (amount === null || amount === 0n) continue;
      const raw = r.path ?? [];
      if (raw.length > MAX_PATH_LENGTH) continue;
      const path = raw.map(toAsset);
      if (path.some((a) => a === null)) continue;
      if (!best || amount < best.sendAmount) best = { sendAmount: amount, path: path as Asset[] };
    }
    return best;
  }
}
