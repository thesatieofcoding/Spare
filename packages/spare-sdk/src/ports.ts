import type { Network } from "./network.js";

/** Injectable fetch (same shape as the global one). */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** What Spare needs to know about an account. All amounts in stroops. */
export interface AccountSnapshot {
  /** Current sequence number (the next tx uses sequence + 1). */
  sequence: string;
  /** XLM spendable on fees: balance minus reserve and selling liabilities. */
  xlmAvailable: bigint;
  /** Circle-USDC trustline, or null when there is none. */
  usdc: {
    /** Spendable balance: balance minus selling liabilities. */
    balance: bigint;
    authorized: boolean;
    /** Room left before the trustline limit: limit - balance - buying liabilities (0 when full). */
    headroom: bigint;
  } | null;
  /** Weight of the account's own (master) key; 0 when it is disabled. */
  masterWeight: number;
  /** Signing thresholds (0-255). The domain decides whether the master key alone is enough. */
  thresholds: { low: number; medium: number; high: number };
  /** SEP-29: the account has `config.memo_required` = "1" and expects a memo on incoming payments. */
  memoRequired: boolean;
}

export interface AccountPort {
  /** Network this port reads from. When set, Spare refuses to pair it with another network. */
  readonly network?: Network;
  /** Resolves null when the account does not exist. May throw on network errors. */
  loadAccount(accountId: string): Promise<AccountSnapshot | null>;
}

export interface Foundation {
  /** Stellar G... account that receives donations. */
  account: string;
  /** Bare hostname whose stellar.toml must list `account`. */
  domain: string;
}
