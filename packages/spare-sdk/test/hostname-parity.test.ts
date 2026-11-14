import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifyFoundation } from "../src/stellar-toml.js";
import { FOUNDATION, foundationKp, tomlFetch } from "./helpers.js";

// Shared with contracts/registry (src/test.rs). Lowercase bare hosts only: the contract is
// lowercase-only while the SDK regex is case-insensitive, so uppercase is not a shared vector.
const path = fileURLToPath(new URL("../../../fixtures/hostname-vectors.txt", import.meta.url));
const vectors = readFileSync(path, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l !== "" && !l.startsWith("#"))
  .map((l) => {
    const i = l.indexOf("|");
    return { verdict: l.slice(0, i), host: l.slice(i + 1) };
  });

describe("hostname parity with the registry contract", () => {
  it("loads a non-trivial vector set", () => {
    expect(vectors.length).toBeGreaterThanOrEqual(20);
  });
  for (const { verdict, host } of vectors) {
    it(`${verdict} ${host.length > 40 ? `${host.slice(0, 20)}...(${host.length})` : host}`, async () => {
      let fetched = false;
      const inner = tomlFetch([foundationKp.publicKey()]);
      const f = async (u: string | URL | Request) => {
        fetched = true;
        return inner(u);
      };
      await verifyFoundation({ ...FOUNDATION, domain: host }, f);
      // The hostname regex gate is the only thing between the input and the fetch.
      expect(fetched).toBe(verdict === "accept");
    });
  }
});
