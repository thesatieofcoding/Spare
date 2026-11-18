import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import DashboardIndex from "../src/components/DashboardIndex.astro";
import FoundationDashboard from "../src/components/FoundationDashboard.astro";
import { formatUtc, sumUsdc } from "../src/lib/dashboard-model";
import { loadSnapshot } from "../src/lib/snapshot-source";

const root = join(import.meta.dirname, "..");
const render = async (c: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown>) =>
  (await AstroContainer.create()).renderToString(c, { props });
const G_ADDRESS = /G[A-Z2-7]{55}/g;

describe("dashboard-model", () => {
  it("sums 7dp amounts exactly, no float drift", () => {
    expect(sumUsdc(["0.1000000", "0.2000000"])).toBe("0.3000000");
    expect(sumUsdc([])).toBe("0.0000000");
    expect(sumUsdc(["1.5000000", "10.0000001"])).toBe("11.5000001");
  });
  it("formats ISO time as UTC minutes", () => {
    expect(formatUtc("2026-01-02T03:04:05Z")).toBe("2026-01-02 03:04 UTC");
  });
});

describe("dashboard routes", () => {
  it("exist as static pages", () => {
    expect(existsSync(join(root, "src/pages/[...lang]/dashboard/index.astro"))).toBe(true);
    expect(existsSync(join(root, "src/pages/[...lang]/dashboard/[account].astro"))).toBe(true);
  });
  it("derive paths from the public view only", () => {
    expect(readFileSync(join(root, "src/pages/[...lang]/dashboard/[account].astro"), "utf8")).toMatch(/view\.foundations/);
  });
});

describe("FoundationDashboard", () => {
  let loaded: Awaited<ReturnType<typeof loadSnapshot>>;
  beforeAll(async () => {
    loaded = await loadSnapshot({ env: {} });
  });
  const props = (lang: string, sample = true) => ({
    lang,
    foundation: loaded.view.foundations[0],
    network: loaded.snapshot.network,
    generatedAt: loaded.view.generatedAt,
    sample,
  });

  it("shows total 1.50, count 2, app breakdown and unattributed 2.00 apart from the total", async () => {
    const html = await render(FoundationDashboard, props("en"));
    expect(html).toContain("Total via Spare");
    const stats = html.slice(0, html.indexOf("data-unattributed"));
    expect(stats).toContain("1.50");
    expect(html).toMatch(/Donations[\s\S]*?>2</);
    expect(html).toContain("app-a");
    const un = html.slice(html.indexOf("data-unattributed"));
    expect(un).toContain("2.00");
    expect(un).toContain("Unattributed");
    expect(stats).not.toContain("2.00</");
  });
  it("links every tx to the network-correct explorer and never renders a donor address", async () => {
    const html = await render(FoundationDashboard, props("en"));
    for (const tx of loaded.view.foundations[0]!.txs)
      expect(html).toContain(`href="https://stellar.expert/explorer/public/tx/${tx.txHash}"`);
    const found = (html.match(G_ADDRESS) ?? []).filter((a) => a !== loaded.view.foundations[0]!.account);
    expect(found).toEqual([]);
  });
  it("uses the testnet explorer for a testnet snapshot", async () => {
    const html = await render(FoundationDashboard, { ...props("en"), network: "testnet" });
    expect(html).toContain("https://stellar.expert/explorer/testnet/tx/");
  });
  it("shows generation time and the sample-data banner only for sample data", async () => {
    const sample = await render(FoundationDashboard, props("en", true));
    expect(sample).toContain("Sample data");
    expect(sample).toContain("2026-01-05 00:00 UTC");
    expect(await render(FoundationDashboard, props("en", false))).not.toContain("Sample data");
  });
  it("renders Spanish copy", async () => {
    const html = await render(FoundationDashboard, props("es"));
    expect(html).toContain("Total vía Spare");
    expect(html).toContain("Sin atribuir");
    expect(html).toContain("Datos de muestra");
  });
  it("renders empty states", async () => {
    const f = { ...loaded.view.foundations[0]!, apps: [], txs: [], count: 0, totalViaSpare: "0.0000000", unattributed: { total: "0.0000000", count: 0 } };
    const html = await render(FoundationDashboard, { ...props("en"), foundation: f });
    expect(html).toContain("No tagged donations yet");
    expect(html).toContain("No transactions yet");
  });
});

describe("DashboardIndex", () => {
  it("aggregates all foundations and links each dashboard", async () => {
    const { view } = await loadSnapshot({ env: {} });
    const html = await render(DashboardIndex, { lang: "es", foundations: view.foundations, generatedAt: view.generatedAt, sample: true });
    expect(html).toContain("Sample Foundation");
    expect(html).toContain(`href="/es/dashboard/${view.foundations[0]!.account}/"`);
    expect(html).toContain("1.50");
    expect(html).toContain("Datos de muestra");
  });
  it("renders a localized empty state", async () => {
    const html = await render(DashboardIndex, { lang: "en", foundations: [], generatedAt: "2026-01-05T00:00:00Z", sample: false });
    expect(html).toContain("No foundations to show yet");
  });
});
