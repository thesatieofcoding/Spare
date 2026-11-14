import { NETWORKS, type Network } from "spare-sdk";
import { baseAccount } from "./domain/classify.js";
import { NEAR_EXPIRY_LEDGERS } from "./domain/ttl.js";

/** CLI exit codes (D17). */
export const EXIT = { ok: 0, error: 1, gap: 2, config: 3 } as const;

/** Known registration used when RPC event history is unavailable (rebuild, D9). */
export interface SeedAccount {
  account: string;
  contractId: string;
  name: string;
  website: string;
  fromLedger: number;
}

export interface IndexerConfig {
  network: Network;
  registryContracts: string[];
  seedAccounts: SeedAccount[];
  startLedger: number;
  nearExpiryLedgers: number;
}

export type ConfigResult =
  | { ok: true; config: IndexerConfig }
  | { ok: false; error: string; exitCode: typeof EXIT.config };

const fail = (error: string): ConfigResult => ({ ok: false, error, exitCode: EXIT.config });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isLedger = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Validates untrusted config JSON. Never throws. */
export function parseConfig(raw: unknown): ConfigResult {
  if (!isObj(raw)) return fail("config must be an object");
  if (typeof raw.network !== "string" || !Object.hasOwn(NETWORKS, raw.network)) return fail("network must be mainnet or testnet");
  const contracts = raw.registryContracts;
  if (!Array.isArray(contracts) || contracts.length === 0) return fail("registryContracts must list at least one contract id");
  if (!contracts.every(isStr)) return fail("registryContracts entries must be non-empty strings");
  if (!isLedger(raw.startLedger)) return fail("startLedger must be a non-negative integer");
  const threshold = raw.nearExpiryLedgers ?? NEAR_EXPIRY_LEDGERS;
  if (!isLedger(threshold)) return fail("nearExpiryLedgers must be a non-negative integer");
  const seeds: SeedAccount[] = [];
  for (const s of (raw.seedAccounts ?? []) as unknown[]) {
    if (!isObj(s) || !isStr(s.account) || baseAccount(s.account) !== s.account) return fail("seed account must be a G address");
    if (!isStr(s.contractId) || !isStr(s.name) || !isStr(s.website) || !isLedger(s.fromLedger)) return fail("seed account is malformed");
    seeds.push({ account: s.account, contractId: s.contractId, name: s.name, website: s.website, fromLedger: s.fromLedger });
  }
  return {
    ok: true,
    config: { network: raw.network as Network, registryContracts: [...(contracts as string[])], seedAccounts: seeds, startLedger: raw.startLedger, nearExpiryLedgers: threshold },
  };
}
