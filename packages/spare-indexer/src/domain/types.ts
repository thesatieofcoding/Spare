/**
 * Domain types. PRIVACY: nothing here carries a donor/source address. The
 * observation type deliberately has no `source` field, so no downstream
 * record (donation, aggregate, snapshot) can leak one.
 */

export type Memo =
  | { type: "none" }
  | { type: "text"; bytes: Uint8Array }
  | { type: "id" | "hash" | "return" };

export type UnattributedReason = "no-text-memo" | "no-spare-tag" | "malformed-tag";

export type Attribution =
  | { kind: "attributed"; appId: string }
  | { kind: "unattributed"; reason: UnattributedReason };

export type ObservedAsset = { code: string; issuer: string } | "native";

/** One payment-like operation, normalized from RPC or Horizon. */
export interface TransferObservation {
  txHash: string;
  /** 0-based operation index inside the transaction. */
  opIndex: number;
  ledger: number;
  closedAt: string;
  /** Operation type as named by Horizon, e.g. "payment", "path_payment_strict_send". */
  opType: string;
  successful: boolean;
  /** Destination account; may be muxed (M...), classification reduces it to its base G. */
  to: string;
  asset: ObservedAsset;
  /** Amount received, in stroops. */
  amount: bigint;
  memo: Memo;
}

export interface DonationRecord {
  /** `txHash:opIndex`, source-independent dedupe key. */
  id: string;
  foundation: string;
  /** USDC with exactly 7 decimals. */
  amount: string;
  appId: string | null;
  ledger: number;
  closedAt: string;
  txHash: string;
}

export type IgnoredReason =
  | "wrong-asset"
  | "wrong-issuer"
  | "not-classic-payment"
  | "failed"
  | "unknown-foundation"
  | "inactive-gap";

export type Classification =
  | { kind: "counted"; record: DonationRecord }
  | { kind: "ignored"; reason: IgnoredReason };
