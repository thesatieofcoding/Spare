import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

const leaves = (o: unknown, path = ""): [string, unknown][] =>
  typeof o === "object" && o !== null
    ? Object.entries(o).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
    : [[path, o]];

describe("dashboard copy", () => {
  for (const [lang, t] of [["en", en], ["es", es]] as const) {
    it(`${lang}: foundations, verifiedBadge, dashboard and demo.mainnetWarning are present and non-empty`, () => {
      const copy = {
        foundations: t.foundations,
        verifiedBadge: t.verifiedBadge,
        dashboard: t.dashboard,
        mainnetWarning: t.demo.mainnetWarning,
      };
      const l = leaves(copy);
      expect(l.length).toBeGreaterThan(20);
      for (const [path, v] of l) expect(typeof v === "string" && v.trim().length > 0, path).toBe(true);
    });
    it(`${lang}: verified badge claims exactly stellar.toml ACCOUNTS membership`, () => {
      expect(t.verifiedBadge.explainer).toContain("stellar.toml");
      expect(t.verifiedBadge.explainer).toContain("ACCOUNTS");
    });
    it(`${lang}: unattributed has a one-line explanation and generatedAt has a placeholder`, () => {
      expect(t.dashboard.unattributedNote).not.toContain("\n");
      expect(t.dashboard.generatedAt).toContain("{time}");
    });
  }
  it("en keeps the product wording; es is translated", () => {
    expect(en.dashboard.totalViaSpare).toBe("Total via Spare");
    expect(en.demo.mainnetWarning).toBe("Mainnet: real USDC");
    expect(es.dashboard.totalViaSpare).not.toBe(en.dashboard.totalViaSpare);
    expect(es.demo.mainnetWarning).toContain("USDC");
  });
  it("en and es expose the same key paths", () => {
    expect(leaves(es.dashboard).map(([p]) => p)).toEqual(leaves(en.dashboard).map(([p]) => p));
  });
});
