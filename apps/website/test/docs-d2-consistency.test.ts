import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDocs } from "../src/i18n/docs";
import type { Lang } from "../src/i18n/utils";

const LANGS: Lang[] = ["en", "es"];
const repo = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

describe("D2 docs describe the shipped indexer and dashboard", () => {
  for (const lang of LANGS) {
    it(`${lang}: indexer-dashboard has no planned callout and explains the pipeline`, () => {
      const page = getDocs(lang)["indexer-dashboard"];
      expect(page.blocks.some((b) => b.t === "planned")).toBe(false);
      const text = JSON.stringify(page.blocks);
      for (const needle of ["data", "3", "snapshot.json", "unattributed|sin atribuir"]) {
        expect(text, needle).toMatch(new RegExp(needle, "i"));
      }
    });

    it(`${lang}: introduction does not list the indexer as planned`, () => {
      const rows = JSON.stringify(getDocs(lang).introduction.blocks);
      expect(rows).not.toMatch(/"(Planned|Planificado)"/);
    });

    it(`${lang}: registry TTL text matches the contract (network maximum, 30 day window)`, () => {
      const text = JSON.stringify(getDocs(lang).registry.blocks);
      expect(text).not.toMatch(/about 60 days|unos 60 días/);
      expect(text).toMatch(/max_ttl|network maximum|máximo de la red/);
    });
  }

  it("root README no longer marks indexer/dashboard as pending", () => {
    const readme = repo("README.md");
    expect(readme).not.toMatch(/🔜/);
    expect(readme).toMatch(/## Deliverable 2 evidence/);
    expect(readme).toMatch(/issues\/15/);
    expect(readme).toMatch(/TODO/);
  });

  it("indexer README and registry README have no stale wording", () => {
    expect(repo("packages/spare-indexer/README.md")).not.toMatch(/phase 2|coming soon/i);
    expect(repo("contracts/registry/README.md")).not.toMatch(/phase 2|coming soon|not deployed/i);
  });
});
