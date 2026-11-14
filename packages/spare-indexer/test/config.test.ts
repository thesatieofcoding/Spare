import { describe, expect, it } from "vitest";
import { EXIT, parseConfig } from "../src/config.js";
import { NEAR_EXPIRY_LEDGERS } from "../src/domain/ttl.js";
import { FOUNDATION } from "./fixtures/observations.js";

const base = { network: "mainnet", registryContracts: ["CREG1"], startLedger: 100 };

describe("parseConfig", () => {
  it("accepts a minimal config and applies defaults", () => {
    const r = parseConfig(base);
    expect(r).toEqual({
      ok: true,
      config: { network: "mainnet", registryContracts: ["CREG1"], seedAccounts: [], startLedger: 100, nearExpiryLedgers: NEAR_EXPIRY_LEDGERS },
    });
  });

  it("empty registry list is a config error with exit code 3", () => {
    const r = parseConfig({ ...base, registryContracts: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.exitCode).toBe(EXIT.config);
      expect(r.exitCode).toBe(3);
    }
  });

  it.each([
    ["non-object", 5],
    ["bad network", { ...base, network: "devnet" }],
    ["missing list", { network: "mainnet", startLedger: 1 }],
    ["blank contract id", { ...base, registryContracts: [""] }],
    ["negative startLedger", { ...base, startLedger: -1 }],
    ["fractional startLedger", { ...base, startLedger: 1.5 }],
    ["bad seed account", { ...base, seedAccounts: [{ account: "nope", contractId: "C", name: "n", website: "w.org", fromLedger: 1 }] }],
  ])("rejects %s without throwing", (_n, raw) => {
    const r = parseConfig(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.exitCode).toBe(3);
  });

  it("keeps valid seed accounts and a custom threshold", () => {
    const seed = { account: FOUNDATION, contractId: "CREG1", name: "Fund", website: "fund.org", fromLedger: 90 };
    const r = parseConfig({ ...base, seedAccounts: [seed], nearExpiryLedgers: 10 });
    expect(r.ok && r.config.seedAccounts).toEqual([seed]);
    expect(r.ok && r.config.nearExpiryLedgers).toBe(10);
  });
});
