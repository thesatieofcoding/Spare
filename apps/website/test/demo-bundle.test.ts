import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Build-output assertions. They need `pnpm build` first, so they are skipped on a clean checkout
 * locally, but FAIL when `CI` is set and dist is missing (CI builds before testing). Marker strings only live in stellar-sdk / the wallets kit.
 */
const dist = join(import.meta.dirname, "..", "dist");
const built = existsSync(join(dist, "en", "demo", "index.html"));
const MARKERS = ["Test SDF Network ; September 2015", "Public Global Stellar Network"];

const html = (rel: string) => readFileSync(join(dist, rel), "utf8");
const pagesIn = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? pagesIn(join(dir, f)) : f.endsWith(".html") ? [join(dir, f)] : []));

/** Chunks loaded eagerly by a page: scripts + modulepreloads, followed through static imports only. */
function eagerChunks(page: string): string[] {
  const seen = new Set<string>();
  const visit = (href: string) => {
    const file = join(dist, href.replace(/^\//, ""));
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[^"'()]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g)) {
      visit(`/_astro/${m[1]}`);
    }
  };
  for (const m of page.matchAll(/(?:src|href)="(\/_astro\/[^"]+\.js)"/g)) visit(m[1] as string);
  return [...seen];
}

if (process.env.CI && !built) {
  describe("built output", () => {
    it("requires a build in CI (run `pnpm build` before `pnpm test`)", () => {
      expect(built, `dist missing at ${dist}`).toBe(true);
    });
  });
}

describe.skipIf(!built)("built output", () => {
  const heavy = (files: string[]) =>
    files.filter((f) => MARKERS.some((m) => readFileSync(f, "utf8").includes(m)));

  it("demo page eagerly loads no stellar-sdk / wallets kit code", () => {
    for (const lang of ["en", "es"]) {
      const chunks = eagerChunks(html(`${lang}/demo/index.html`));
      expect(chunks.length).toBeGreaterThan(0);
      expect(heavy(chunks)).toEqual([]);
    }
  });

  it("the demo script reaches the runtime only through a dynamic import", () => {
    const chunks = eagerChunks(html("en/demo/index.html"));
    const main = chunks.find((f) => readFileSync(f, "utf8").includes("import("));
    expect(main).toBeDefined();
    expect(readFileSync(main as string, "utf8")).toMatch(/import\(["'`]\.\/runtime\.[^"'`]+\.js["'`]\)/);
  });

  it("markers are meaningful: the lazy chunks do contain stellar-sdk", () => {
    const lazy = readdirSync(join(dist, "_astro")).filter((f) => /^(runtime|transaction)\..*\.js$/.test(f));
    expect(heavy(lazy.map((f) => join(dist, "_astro", f))).length).toBeGreaterThan(0);
  });

  it("no other page loads the demo or any heavy chunk", () => {
    const others = pagesIn(dist).filter((p) => !p.includes(join("demo", "index.html")));
    expect(others.length).toBeGreaterThan(10);
    for (const p of others) {
      const page = readFileSync(p, "utf8");
      expect(page, p).not.toMatch(/demo\.astro|runtime\./);
      expect(heavy(eagerChunks(page)), p).toEqual([]);
    }
  });
});
