import { Horizon } from "@stellar/stellar-sdk";
import { toStroops } from "./amount.js";
import { USDC_CODE, USDC_ISSUER } from "./constants.js";
import type { AccountPort, AccountSnapshot } from "./ports.js";

/** The subset of Horizon's account record that Spare reads. */
export interface HorizonAccountRecord {
  account_id: string;
  sequence: string;
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

export function toAccountSnapshot(r: HorizonAccountRecord): AccountSnapshot {
  const native = r.balances.find((b) => b.asset_type === "native");
  const reserve = BigInt(2 + r.subentry_count + r.num_sponsoring - r.num_sponsored) * RESERVE_UNIT;
  const nativeNet = net(
    toStroops(native?.balance ?? "0") ?? 0n,
    (toStroops(native?.selling_liabilities ?? "0") ?? 0n) + reserve,
  );

  const line = r.balances.find(
    (b) => b.asset_code === USDC_CODE && b.asset_issuer === USDC_ISSUER && b.asset_type !== "native",
  );

  const masterWeight = r.signers.find((s) => s.key === r.account_id)?.weight ?? 0;
  // SEP-29: data entry config.memo_required = "1" (base64 "MQ==").
  const memoRequired = r.data_attr?.["config.memo_required"] === "MQ==";

  return {
    sequence: r.sequence,
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

/** AccountPort backed by a Horizon server. */
export class HorizonAccountPort implements AccountPort {
  private readonly server: Horizon.Server;
  constructor(horizon: string | Horizon.Server = "https://horizon.stellar.org") {
    this.server = typeof horizon === "string" ? new Horizon.Server(horizon) : horizon;
  }

  async loadAccount(accountId: string): Promise<AccountSnapshot | null> {
    try {
      const rec = await this.server.accounts().accountId(accountId).call();
      return toAccountSnapshot(rec as unknown as HorizonAccountRecord);
    } catch (e) {
      if ((e as { response?: { status?: number } }).response?.status === 404) return null;
      throw e;
    }
  }
}
