import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composeReal } from "../src/compose.js";
import { main, parseCliArgs, type CliIo, type Compose } from "../src/cli.js";
import { parseConfig } from "../src/config.js";
import type { RegistryEvent } from "../src/domain/registry.js";
import { FOUNDATION, obs } from "./fixtures/observations.js";
import { clock, fakeHorizon, fakeRpc, memStore, verifier } from "./fakes.js";

const section = { registryContracts: ["C1"], startLedger: 10, seedAccounts: [] };
const CONFIG = JSON.stringify({ testnet: section, mainnet: section });
const EMPTY_MAINNET = JSON.stringify({ testnet: section, mainnet: { registryContracts: [], startLedger: 0, seedAccounts: [] } });
const reg: RegistryEvent = { contractId: "C1", account: FOUNDATION, kind: "register", ledger: 100, name: "Fund\n::error::pwn", website: "fund.org" };

function harness(o: { config?: string; env?: Record<string, string>; rpc?: ReturnType<typeof fakeRpc>; composed?: string[] } = {}) {
  const logs: string[] = [];
  const store = memStore();
  const seen: { network?: string; out?: string; rpcUrl?: string | undefined }[] = [];
  const compose: Compose = (config, opts) => {
    seen.push({ network: config.network, out: opts.out, rpcUrl: opts.rpcUrl });
    return {
      rpc: opts.rpcUrl === undefined ? undefined : (o.rpc ?? fakeRpc({ events: [reg], transfers: [obs({ ledger: 150 })], liveUntil: null })),
      horizon: fakeHorizon(),
      verifier: verifier(true),
      clock,
      store,
    };
  };
  const io: CliIo = {
    readFile: async (p) => {
      if (o.config === undefined && p.endsWith("missing.json")) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return o.config ?? CONFIG;
    },
    compose,
    env: { SPARE_RPC_URL: "https://rpc.example/", ...o.env },
    log: (l) => logs.push(l),
  };
  return { io, logs, store, seen };
}

describe("parseCliArgs", () => {
  it("parses commands and options with defaults", () => {
    expect(parseCliArgs(["index"])).toEqual({ ok: true, args: { command: "index", config: "indexer.config.json", out: "snapshot.json", network: "mainnet" } });
    expect(parseCliArgs(["rebuild", "--config", "c.json", "--out", "o.json", "--network", "testnet"])).toEqual({
      ok: true,
      args: { command: "rebuild", config: "c.json", out: "o.json", network: "testnet" },
    });
  });
  it("rejects missing/unknown command, unknown flags and bad network", () => {
    for (const argv of [[], ["deploy"], ["index", "--nope"], ["index", "--network", "devnet"], ["index", "extra"], ["index", "--out"]]) {
      expect(parseCliArgs(argv).ok, argv.join(" ")).toBe(false);
    }
  });
});

describe("main exit codes", () => {
  it("0 on a successful index run; passes out path, network and rpc url to compose", async () => {
    const h = harness();
    expect(await main(["index", "--network", "mainnet", "--out", "x/snap.json"], h.io)).toBe(0);
    expect(h.seen).toEqual([{ network: "mainnet", out: "x/snap.json", rpcUrl: "https://rpc.example/" }]);
    expect(h.store.current?.data.donations).toHaveLength(1);
  });

  it("emits a ::warning:: per nearExpiry foundation using only the account (no registry-supplied text)", async () => {
    const h = harness();
    await main(["index", "--network", "testnet"], h.io);
    const warnings = h.logs.filter((l) => l.startsWith("::warning::"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(FOUNDATION);
    expect(h.logs.join("\n")).not.toContain("pwn");
    expect(h.logs.filter((l) => l.startsWith("::error::"))).toEqual([]);
  });

  it("no warning when nothing is near expiry", async () => {
    const h = harness({ rpc: fakeRpc({ events: [reg], liveUntil: 9_000_000 }) });
    expect(await main(["index", "--network", "testnet"], h.io)).toBe(0);
    expect(h.logs.some((l) => l.startsWith("::warning::"))).toBe(false);
  });

  it("2 on an RPC gap, without writing", async () => {
    const h = harness({ rpc: fakeRpc({ oldest: 5000 }) });
    expect(await main(["index", "--network", "testnet"], h.io)).toBe(2);
    expect(h.store.writes).toBe(0);
    expect(h.logs.join("\n")).toMatch(/rebuild/);
  });

  it("1 on runtime errors, single-line message", async () => {
    const rpc = { ...fakeRpc(), health: () => Promise.reject(new Error("boom\nsecond line")) };
    const h = harness({ rpc });
    expect(await main(["index", "--network", "testnet"], h.io)).toBe(1);
    const err = h.logs.filter((l) => l.startsWith("::error::"));
    expect(err).toHaveLength(1);
    expect(err[0]).not.toMatch(/\n/);
  });

  it("3 for empty registry list (mainnet before deploy)", async () => {
    const h = harness({ config: EMPTY_MAINNET });
    expect(await main(["index"], h.io)).toBe(3);
    expect(h.seen).toEqual([]);
  });

  it("3 for bad usage, missing/malformed config, missing section, missing SPARE_RPC_URL (index)", async () => {
    expect(await main(["wat"], harness().io)).toBe(3);
    expect(await main(["index", "--config", "missing.json", "--network", "testnet"], harness().io)).toBe(3);
    expect(await main(["index", "--network", "testnet"], harness({ config: "{not json" }).io)).toBe(3);
    expect(await main(["index", "--network", "testnet"], harness({ config: JSON.stringify({ mainnet: section }) }).io)).toBe(3);
    const noUrl = harness({ env: { SPARE_RPC_URL: "" } });
    expect(await main(["index", "--network", "testnet"], noUrl.io)).toBe(3);
  });

  it("rebuild runs without SPARE_RPC_URL and never hands an rpc url to compose", async () => {
    const h = harness({ env: { SPARE_RPC_URL: "" } });
    expect(await main(["rebuild", "--network", "testnet"], h.io)).toBe(0);
    expect(h.seen[0]?.rpcUrl).toBeUndefined();
  });
});

describe("shipped indexer.config.json", () => {
  const raw = JSON.parse(readFileSync(new URL("../indexer.config.json", import.meta.url), "utf8")) as Record<string, object>;
  it("testnet lists the registry contract and validates", () => {
    const r = parseConfig({ network: "testnet", ...raw.testnet });
    expect(r.ok && r.config.registryContracts).toEqual(["CDCYBSVIKFGGFZLU5O37UV33ECRLTEOWLAQ7XKJEGBNGYCM62UN3I2RF"]);
  });
  it("mainnet is a placeholder that fails with exit 3 until the contract is deployed", () => {
    const r = parseConfig({ network: "mainnet", ...raw.mainnet });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.exitCode).toBe(3);
  });
});

describe("composeReal", () => {
  it("builds adapters without touching the network; rpc only when a url is given", () => {
    const cfg = { network: "testnet" as const, registryContracts: ["C1"], seedAccounts: [], startLedger: 1, nearExpiryLedgers: 1 };
    expect(composeReal(cfg, { out: "/tmp/never-written.json" }).rpc).toBeUndefined();
    const d = composeReal(cfg, { out: "/tmp/never-written.json", rpcUrl: "https://rpc.example/" });
    expect(d.rpc).toBeDefined();
    expect(typeof d.verifier.verify).toBe("function");
  });
});
