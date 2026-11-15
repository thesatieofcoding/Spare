import type { RegistryEvent } from "./domain/registry.js";
import type { SnapshotV1 } from "./domain/snapshot.js";
import type { TransferObservation } from "./domain/types.js";

/** Resume point for RPC reads: first ledger to read from (inclusive). */
export interface Cursor {
  ledger: number;
}

export interface RpcPort {
  health(): Promise<{ oldestLedger: number; latestLedger: number }>;
  registryEvents(contractIds: string[], from: Cursor): AsyncIterable<RegistryEvent>;
  usdcTransfers(to: string[], from: Cursor): AsyncIterable<TransferObservation>;
  /** Ledger until which the registry entry lives, or null when archived/missing. */
  liveUntil(contractId: string, account: string): Promise<number | null>;
}

export interface HorizonPort {
  /** Full payment history of an account, paginated to exhaustion by the adapter. */
  payments(account: string, fromLedger?: number): AsyncIterable<TransferObservation>;
  /** Latest ledger Horizon has ingested (`history_latest_ledger`); rebuild uses it as the RPC resume point. */
  latestLedger(): Promise<number>;
}

/** Boolean only: true iff the account is listed in ACCOUNTS of the domain's stellar.toml. */
export interface DomainVerifier {
  verify(f: { account: string; domain: string }): Promise<boolean>;
}

export interface ClockPort {
  now(): Date;
}

export interface SnapshotStore {
  read(): Promise<SnapshotV1 | null>;
  write(s: SnapshotV1): Promise<void>;
}
