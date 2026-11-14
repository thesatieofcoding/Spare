import type { FeeBumpTransaction, Transaction } from "@stellar/stellar-sdk";
import type { Network } from "./network.js";
import type { AccountPort, FetchLike, Foundation } from "./ports.js";

/** The tx is left untouched: Spare cannot safely modify it. */
export type PassthroughReason =
  | "fee-bump"
  | "already-signed"
  | "soroban"
  | "multiple-sources"
  | "multisig"
  | "extra-signers";

/** The tx is fine but a donation must not be offered. */
export type NotOfferedReason =
  | "invalid-options"
  | "network-mismatch"
  | "invalid-app-id"
  | "invalid-amount"
  | "invalid-foundation"
  | "amount-over-cap"
  | "round-up-needs-usdc-purchase"
  | "round-up-already-whole"
  | "foundation-not-verified"
  | "foundation-trustline-missing"
  | "foundation-trustline-unauthorized"
  | "foundation-trustline-full"
  | "user-trustline-missing"
  | "user-trustline-unauthorized"
  | "unsupported-operation"
  | "multisig"
  | "insufficient-balance"
  | "account-lookup-failed"
  | "main-tx-not-successful";

export interface DonationInfo {
  /** Amount in USDC, 7 decimals. Show this to the user before signing. */
  amount: string;
  amountStroops: bigint;
  foundation: string;
  /** False when the tx already had a memo, so the donation cannot be tagged for the app. */
  attributed: boolean;
  /**
   * Round-up only (addDonation): the USDC purchase the tx already makes, and that plus the
   * donation. Show these instead of recomputing them.
   */
  purchase?: string;
  purchaseStroops?: bigint;
  roundedTotal?: string;
  roundedTotalStroops?: bigint;
}

export type DonationResult =
  | { status: "offered"; transaction: Transaction; donation: DonationInfo; fee: bigint }
  | { status: "not-offered"; reason: NotOfferedReason; transaction: Transaction }
  | { status: "passthrough"; reason: PassthroughReason; transaction: Transaction | FeeBumpTransaction };

export interface CommonOptions {
  /**
   * Network the donation targets: picks the one USDC issuer Spare accepts. Default "mainnet".
   * The tx passphrase and the account port (when it declares a network) must agree, else
   * `not-offered` / `network-mismatch`.
   */
  network?: Network;
  foundation: Foundation;
  appId: string;
  /** App-set cap per donation, in USDC. */
  maxAmount: string;
  accounts: AccountPort;
  /** Defaults to global fetch. */
  fetch?: FetchLike;
  /**
   * Per-operation fee rate in stroops (digits only, minimum 100). Defaults to the tx's own
   * per-op rate (addDonation) or 100 (donateAfter). Total fee = rate x operation count.
   * Anything malformed yields `not-offered` / `invalid-options`.
   */
  baseFee?: string;
}
