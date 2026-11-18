import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSnapshot } from "../src/lib/snapshot-source";
import { findAddresses, findInlineHex, listFiles } from "./helpers/dist-scan";

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

const NEW_STYLED_SOURCES = [
  "src/components/DashboardIndex.astro",
  "src/components/DashboardMeta.astro",
  "src/components/FoundationDashboard.astro",
  "src/components/FoundationsDirectory.astro",
  "src/components/DashboardStat.astro",
  "src/components/TransactionRow.astro",
  "src/components/FoundationCard.astro",
  "src/components/VerifiedBadge.astro",
  "src/components/Chip.astro",
  "src/pages/[...lang]/foundations.astro",
  "src/pages/[...lang]/dashboard/index.astro",
  "src/pages/[...lang]/dashboard/[account].astro",
];

describe("new dashboard styles use semantic tokens only", () => {
  for (const rel of NEW_STYLED_SOURCES)
    it(`${rel} has no raw hex colors`, () => {
      expect(readFileSync(join(root, rel), "utf8").match(HEX) ?? []).toEqual([]);
    });
});

// The build-output checks need `astro build` (fixture mode) to have run. CI builds before testing,
// so there a missing dist/ is a failure, never a silent skip. Locally they skip with a clear reason.
const hasDist = existsSync(join(dist, "index.html"));
const SKIP_REASON = "dist/ not found: run `pnpm -C apps/website build` first (skipped locally; required in CI)";

describe("CI guard", () => {
  it.skipIf(!process.env.CI)("dist/ exists when running in CI (build must precede tests)", () => {
    expect(hasDist, "run `pnpm -C apps/website build` before `pnpm -C apps/website test` in CI").toBe(true);
  });
});

describe.skipIf(!hasDist)(`build output (${hasDist ? "dist/ present" : SKIP_REASON})`, () => {
  let loaded: Awaited<ReturnType<typeof loadSnapshot>>;
  beforeAll(async () => {
    loaded = await loadSnapshot();
  });

  const publicAccounts = () => loaded.view.foundations.map((f) => f.account);
  const hiddenAccounts = () =>
    loaded.snapshot.data.foundations.map((f) => f.account).filter((a) => !publicAccounts().includes(a));
  /** The new pages: foundations directory and every dashboard page, in both languages. */
  const newPage = (f: string) => /[\\/](foundations|dashboard)[\\/]/.test(f) && f.endsWith(".html");
  const anyFileHas = (needle: string) => listFiles(dist).some((f) => readFileSync(f, "utf8").includes(needle));
  const html = (rel: string) => readFileSync(join(dist, rel), "utf8");

  it("renders only public-foundation addresses on the new pages (no donors)", () => {
    expect(findAddresses(dist, new Set(publicAccounts()), newPage)).toEqual([]);
  });

  it("never ships a hidden (unverified/inactive) foundation address anywhere in dist", () => {
    for (const a of hiddenAccounts()) expect(anyFileHas(a), a).toBe(false);
  });

  it("never ships the indexer's donor sentinel", () => {
    expect(anyFileHas("GDONOR")).toBe(false);
  });

  it("builds foundations, dashboard index and one page per public foundation in en and es", () => {
    for (const prefix of ["", "es/"]) {
      expect(existsSync(join(dist, prefix, "foundations", "index.html"))).toBe(true);
      expect(existsSync(join(dist, prefix, "dashboard", "index.html"))).toBe(true);
      for (const a of publicAccounts()) expect(existsSync(join(dist, prefix, "dashboard", a, "index.html"))).toBe(true);
      for (const a of hiddenAccounts()) expect(existsSync(join(dist, prefix, "dashboard", a))).toBe(false);
    }
  });

  it("shows the sample banner and the spec numbers in fixture mode", () => {
    if (loaded.mode !== "fixture") return;
    const page = html(join("dashboard", publicAccounts()[0]!, "index.html"));
    expect(page).toContain("Sample data");
    expect(page).toContain("1.50");
    expect(page).toContain("2.00");
    expect(html(join("es", "dashboard", publicAccounts()[0]!, "index.html"))).toContain("Datos de muestra");
  });

  it("has no raw hex colors in the new pages' inline styles beyond the design tokens", () => {
    const tokens = new Set((readFileSync(join(root, "src/styles/tokens.css"), "utf8").match(HEX) ?? []).map((c) => c.toLowerCase()));
    expect(findInlineHex(dist, tokens, newPage)).toEqual([]);
  });
});
