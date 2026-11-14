import { Horizon } from "@stellar/stellar-sdk";
import { toStroops } from "./amount.js";
import { USDC_CODE, USDC_ISSUER } from "./constants.js";
import { isNetwork, NETWORKS, type Network } from "./network.js";
import type { AccountPort, AccountSnapshot } from "./ports.js";

/** The subset of Horizon's account record that Spare reads. */
export interface HorizonAccountRecord {
  account_id: string;
  sequence: string;
  /** Ledger that last changed this account entry. Not a freshness signal; see `ingestedLedger`. */
  last_modified_ledger?: number;
  subentry_count: number;
  num_sponsoring: number;
  num_sponsored: number;
  thresholds: { low_threshold: number; med_threshold: number; high_threshold: number };
  signers: { key: string; weight: number }[];
  /** Account data entries, base64-encoded values. */
  data_attr?: Record<string, string>;
  balances: {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
    limit?: string;
    buying_liabilities?: string;
    selling_liabilities?: string;
    is_authorized?: boolean;
  }[];
}

const RESERVE_UNIT = 5_000_000n; // 0.5 XLM
const net = (balance: bigint, liabilities: bigint) => (balance > liabilities ? balance - liabilities : 0n);

export function toAccountSnapshot(
  r: HorizonAccountRecord,
  issuer: string = USDC_ISSUER,
  /** Latest ledger Horizon had ingested when the account was read. */
  ingestedLedger?: number,
): AccountSnapshot {
  const native = r.balances.find((b) => b.asset_type === "native");
  const reserve = BigInt(2 + r.subentry_count + r.num_sponsoring - r.num_sponsored) * RESERVE_UNIT;
  const nativeNet = net(
    toStroops(native?.balance ?? "0") ?? 0n,
    (toStroops(native?.selling_liabilities ?? "0") ?? 0n) + reserve,
  );

  const line = r.balances.find(
    (b) => b.asset_code === USDC_CODE && b.asset_issuer === issuer && b.asset_type !== "native",
  );

  const masterWeight = r.signers.find((s) => s.key === r.account_id)?.weight ?? 0;
  // SEP-29: data entry config.memo_required = "1" (base64 "MQ==").
  const memoRequired = r.data_attr?.["config.memo_required"] === "MQ==";

  return {
    sequence: r.sequence,
    ...(typeof ingestedLedger === "number" && { ledger: ingestedLedger }),
    xlmAvailable: nativeNet,
    usdc: line
      ? {
          balance: net(toStroops(line.balance) ?? 0n, toStroops(line.selling_liabilities ?? "0") ?? 0n),
          authorized: line.is_authorized === true,
          // A missing limit is unknown: zero headroom keeps us from donating into a full line.
          headroom: net(
            toStroops(line.limit ?? "0") ?? 0n,
            (toStroops(line.balance) ?? 0n) + (toStroops(line.buying_liabilities ?? "0") ?? 0n),
          ),
        }
      : null,
    masterWeight,
    thresholds: {
      low: r.thresholds.low_threshold,
      medium: r.thresholds.med_threshold,
      high: r.thresholds.high_threshold,
    },
    memoRequired,
  };
}

export interface HorizonAccountPortOptions {
  /** Default "mainnet". Picks the Horizon URL (unless `horizon` is set) and the USDC issuer. */
  network?: Network;
  /** Horizon URL or server; overrides the network's default URL. */
  horizon?: string | Horizon.Server;
}

/** AccountPort backed by a Horizon server. A string or Server argument means mainnet. */
export class HorizonAccountPort implements AccountPort {
  readonly network: Network;
  private readonly server: Horizon.Server;
  constructor(arg: string | Horizon.Server | HorizonAccountPortOptions = {}) {
    const o: HorizonAccountPortOptions = typeof arg === "string" || arg instanceof Horizon.Server ? { horizon: arg } : arg;
    const network = o.network ?? "mainnet";
    if (!isNetwork(network)) throw new Error(`unknown network: ${String(network)}`);
    this.network = network;
    const h = o.horizon ?? NETWORKS[network].horizonUrl;
    this.server = typeof h === "string" ? new Horizon.Server(h) : h;
  }

  /**
   * Latest ledger Horizon has ingested (`history_latest_ledger` on the root endpoint), or undefined.
   * Horizon's "Consistency" doc: it sends a `Latest-Ledger` header, the latest ledger known to
   * Horizon when the request was served, to tell how fresh a response is
   * (https://developers.stellar.org/docs/data/apis/horizon/api-reference/structure/consistency).
   * The SDK's account call exposes only the body, so we read the same value from the root
   * endpoint. It is read BEFORE the account: the account view is then at least this fresh.
   */
  private async ingestedLedger(): Promise<number | undefined> {
    try {
      const root = await this.server.root();
      const n = (root as { history_latest_ledger?: unknown }).history_latest_ledger;
      return typeof n === "number" && Number.isFinite(n) ? n : undefined;
    } catch {
      return undefined;
    }
  }

  async loadAccount(accountId: string): Promise<AccountSnapshot | null> {
    const ingested = await this.ingestedLedger();
    try {
      const rec = await this.server.accounts().accountId(accountId).call();
      return toAccountSnapshot(rec as unknown as HorizonAccountRecord, NETWORKS[this.network].usdcIssuer, ingested);
    } catch (e) {
      if ((e as { response?: { status?: number } }).response?.status === 404) return null;
      throw e;
    }
  }
}
