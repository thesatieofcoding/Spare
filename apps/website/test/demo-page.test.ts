import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { DEMO_ERRORS, DEMO_OUTCOMES, DEMO_REASONS, DEMO_STATUSES } from "../src/i18n/types";

const root = join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

describe("demo route", () => {
  it("has its own page and is no longer a placeholder", () => {
    expect(existsSync(join(root, "src/pages/[...lang]/demo.astro"))).toBe(true);
    expect(read("src/pages/[...lang]/[page].astro")).not.toMatch(/"demo"/);
  });
});

describe("demo copy", () => {
  for (const [lang, t] of [["en", en], ["es", es]] as const) {
    it(`${lang}: covers every status, error, outcome and reason, none empty`, () => {
      for (const k of DEMO_STATUSES) expect(t.demo.status[k]?.trim()).toBeTruthy();
      for (const k of DEMO_ERRORS) expect(t.demo.errors[k]?.trim()).toBeTruthy();
      for (const k of DEMO_OUTCOMES) expect(t.demo.outcomes[k]?.trim()).toBeTruthy();
      for (const k of DEMO_REASONS) expect(t.demo.reasons[k]?.trim()).toBeTruthy();
    });
    it(`${lang}: keeps the placeholders and the required notices`, () => {
      expect(t.demo.connectedAs).toContain("{address}");
      expect(t.demo.purchase).toContain("{amount}");
      expect(t.demo.outcomes.donated).toContain("{amount}");
      expect(t.demo.privacy).toContain("spare:spare-demo");
      expect(t.demo.soroban.notice.length).toBeGreaterThan(40);
      expect(t.demo.badge.length).toBeGreaterThan(20);
    });
  }
});

describe("demo styling and privacy", () => {
  const page = () => read("src/pages/[...lang]/demo.astro");
  it("uses semantic tokens only (no raw hex, no rgb())", () => {
    const css = page().match(/<style[\s\S]*?<\/style>/g)?.join("") ?? "";
    expect(css.length).toBeGreaterThan(200);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    expect(css).toContain("var(--accent)");
  });
  it("has a live region and no hardcoded addresses or amounts in markup", () => {
    const html = page();
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).not.toMatch(/G[A-Z2-7]{55}/);
  });
  it("external links are noopener and the status region can take focus", () => {
    const html = page();
    for (const m of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) expect(m[0]).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/data-status[^>]*tabindex="-1"|tabindex="-1"[^>]*data-status/);
    expect(read("src/demo/main.ts")).toContain("newTab");
  });
  it("no donor addresses in copy", () => {
    expect(JSON.stringify([en.demo, es.demo])).not.toMatch(/G[A-Z2-7]{55}/);
  });
});

describe("lazy loading seam", () => {
  const demoFiles = files(join(root, "src/demo")).filter((f) => f.endsWith(".ts"));
  it("only main.ts reaches runtime, and only through import()", () => {
    for (const f of demoFiles) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/^\s*(import|export)[^;]*from\s+["']\.\/runtime["']/m);
    }
    expect(read("src/demo/main.ts")).toMatch(/import\(\s*["']\.\/runtime["']\s*\)/);
  });
  it("nothing but runtime imports stellar-sdk or the wallets kit as a value", () => {
    const heavy = /^\s*import\s+(?!type\b)[^;]*from\s+["'](@stellar\/stellar-sdk|@creit\.tech[^"']*|spare-sdk|spare-wallets-kit)["']/m;
    for (const f of demoFiles.filter((f) => !f.endsWith("runtime.ts"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(heavy);
    }
  });
  it("pages and components never import the demo runtime", () => {
    for (const f of files(join(root, "src/pages")).concat(files(join(root, "src/components")))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/demo\/runtime/);
    }
  });
});
