import { parseArgs } from "node:util";
import { EXIT, parseConfig, type IndexerConfig } from "./config.js";
import { runIndex } from "./app/index-run.js";
import { runRebuild } from "./app/rebuild-run.js";
import type { SnapshotV1 } from "./domain/snapshot.js";
import type { ClockPort, DomainVerifier, HorizonPort, RpcPort, SnapshotStore } from "./ports.js";

export type NetworkName = IndexerConfig["network"];
export interface CliArgs {
  command: "index" | "rebuild";
  config: string;
  out: string;
  network: NetworkName;
}
export type ParsedArgs = { ok: true; args: CliArgs } | { ok: false; error: string };

export function parseCliArgs(argv: string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        config: { type: "string", default: "indexer.config.json" },
        out: { type: "string", default: "snapshot.json" },
        network: { type: "string", default: "mainnet" },
      },
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const [command, ...rest] = parsed.positionals;
  if (command !== "index" && command !== "rebuild") return { ok: false, error: "usage: spare-indexer <index|rebuild> [--config <path>] [--out <path>] [--network mainnet|testnet]" };
  if (rest.length > 0) return { ok: false, error: `unexpected argument: ${rest[0]}` };
  const { config, out, network } = parsed.values;
  if (network !== "mainnet" && network !== "testnet") return { ok: false, error: "network must be mainnet or testnet" };
  return { ok: true, args: { command, config: config as string, out: out as string, network } };
}

export interface Deps {
  /** Present only when an RPC URL was supplied. */
  rpc: RpcPort | undefined;
  horizon: HorizonPort;
  verifier: DomainVerifier;
  clock: ClockPort;
  store: SnapshotStore;
}
export type Compose = (config: IndexerConfig, opts: { out: string; rpcUrl?: string }) => Deps;

export interface CliIo {
  readFile(path: string): Promise<string>;
  compose: Compose;
  env: Record<string, string | undefined>;
  /** One workflow-command-safe line per call. */
  log(line: string): void;
}

const oneLine = (s: string): string => s.replace(/[\r\n]+/g, " ").slice(0, 300);

/** Only the (validated, public) account goes into annotations: registry-supplied text could inject commands. */
function warnNearExpiry(s: SnapshotV1, log: CliIo["log"]): void {
  for (const [account, o] of Object.entries(s.observations.foundations)) {
    if (o.ttl.nearExpiry) log(`::warning::Registry entry for ${account} is near expiry (liveUntilLedger=${o.ttl.liveUntilLedger ?? "archived"}); re-register or update to extend its TTL`);
  }
}

/** Exit codes: 0 ok, 1 runtime error, 2 RPC gap (run rebuild), 3 config/usage error. */
export async function main(argv: string[], io: CliIo): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    io.log(`::error::${oneLine(parsed.error)}`);
    return EXIT.config;
  }
  const { args } = parsed;

  let section: unknown;
  try {
    const all = JSON.parse(await io.readFile(args.config)) as Record<string, unknown>;
    section = all[args.network];
  } catch (e) {
    io.log(`::error::cannot read config ${oneLine(args.config)}: ${oneLine((e as Error).message)}`);
    return EXIT.config;
  }
  if (typeof section !== "object" || section === null) {
    io.log(`::error::config has no "${args.network}" section`);
    return EXIT.config;
  }
  const cfg = parseConfig({ ...section, network: args.network });
  if (!cfg.ok) {
    io.log(`::error::config: ${oneLine(cfg.error)}`);
    return cfg.exitCode;
  }

  const rpcUrl = args.command === "index" ? io.env.SPARE_RPC_URL || undefined : undefined;
  if (args.command === "index" && rpcUrl === undefined) {
    io.log("::error::SPARE_RPC_URL is required for index");
    return EXIT.config;
  }

  try {
    const deps = io.compose(cfg.config, { out: args.out, rpcUrl });
    let result;
    if (args.command === "index") {
      if (!deps.rpc) throw new Error("rpc adapter missing");
      result = await runIndex(cfg.config, { ...deps, rpc: deps.rpc });
    } else {
      result = await runRebuild(cfg.config, deps);
    }
    if (result.status === "gap") {
      io.log(`::error::RPC history gap (cursor ${result.rpcLedger ?? "none"}, RPC oldest ledger ${result.oldestLedger}); run \`rebuild\` to recover from Horizon`);
      return EXIT.gap;
    }
    if (result.status === "error") {
      io.log(`::error::${oneLine(result.reason)}`);
      return EXIT.error;
    }
    warnNearExpiry(result.snapshot, io.log);
    io.log(`${args.command} ok: ${result.snapshot.data.donations.length} donations, ${result.snapshot.data.foundations.length} foundations`);
    return EXIT.ok;
  } catch (e) {
    io.log(`::error::${oneLine((e as Error).message)}`);
    return EXIT.error;
  }
}
