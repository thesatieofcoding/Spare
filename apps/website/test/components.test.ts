import { readFileSync } from "node:fs";
import { join } from "node:path";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Chip from "../src/components/Chip.astro";
import DashboardStat from "../src/components/DashboardStat.astro";
import FoundationCard from "../src/components/FoundationCard.astro";
import TransactionRow from "../src/components/TransactionRow.astro";
import VerifiedBadge from "../src/components/VerifiedBadge.astro";

const render = async (c: Parameters<AstroContainer["renderToString"]>[0], opts: Parameters<AstroContainer["renderToString"]>[1] = {}) =>
  (await AstroContainer.create()).renderToString(c, opts);
const ACCOUNT = "GBSAMPLEFOUNDATIONAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2";
const G_ADDRESS = /G[A-Z2-7]{55}/;

describe("Chip", () => {
  it("renders its slot", async () => expect(await render(Chip, { slots: { default: "app-a" } })).toContain("app-a"));
});

describe("VerifiedBadge", () => {
  it("shows the given label and is static (no link, no title tooltip)", async () => {
    const html = await render(VerifiedBadge, { props: { label: "Domain verified" } });
    expect(html).toContain("Domain verified");
    expect(html).not.toMatch(/<a\b|<button\b|\btitle=/);
  });
  it("has no hover or active styles", () => {
    expect(readFileSync(join(import.meta.dirname, "../src/components/VerifiedBadge.astro"), "utf8")).not.toMatch(/:hover|:active/);
  });
});

describe("DashboardStat", () => {
  it("renders label and value, plus an optional note", async () => {
    const html = await render(DashboardStat, { props: { label: "Total via Spare", value: "1.50", note: "USDC" } });
    expect(html).toContain("Total via Spare");
    expect(html).toContain("1.50");
    expect(html).toContain("USDC");
  });
  it("omits the note element when none is given", async () => {
    expect(await render(DashboardStat, { props: { label: "Donations", value: "2" } })).not.toContain("stat__note");
  });
});

describe("TransactionRow", () => {
  const props = { amount: "1.00", app: "app-a", time: "2026-01-01", href: "https://stellar.expert/explorer/public/tx/abc", linkLabel: "View transaction" };
  it("links to the explorer and shows amount, app and time", async () => {
    const html = await render(TransactionRow, { props });
    expect(html).toContain(`href="${props.href}"`);
    for (const t of ["1.00", "app-a", "2026-01-01", "View transaction"]) expect(html).toContain(t);
  });
  it("opens the explorer safely and never renders an address", async () => {
    const html = await render(TransactionRow, { props });
    expect(html).toMatch(/rel="noopener noreferrer"/);
    expect(html).not.toMatch(G_ADDRESS);
  });
});

describe("FoundationCard", () => {
  const props = { name: "Sample Foundation", website: "sample-foundation.example.org", href: `/en/dashboard/${ACCOUNT}/`, badgeLabel: "Domain verified", viewLabel: "View dashboard" };
  it("shows name, website, static badge and a link to its dashboard", async () => {
    const html = await render(FoundationCard, { props });
    for (const t of ["Sample Foundation", "sample-foundation.example.org", "Domain verified", "View dashboard"]) expect(html).toContain(t);
    expect(html).toContain(`href="${props.href}"`);
  });
});

describe("design rules", () => {
  for (const name of ["Chip", "VerifiedBadge", "DashboardStat", "TransactionRow", "FoundationCard"]) {
    const src = readFileSync(join(import.meta.dirname, `../src/components/${name}.astro`), "utf8");
    it(`${name}: semantic tokens only, no raw hex`, () => expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/));
    it(`${name}: no hardcoded user-facing text node outside slots/props`, () => expect(src).not.toMatch(/>\s*[A-Z][a-z]+ [a-z]+\s*</));
  }
  it("amounts use Newsreader, UI uses Instrument Sans", () => {
    const stat = readFileSync(join(import.meta.dirname, "../src/components/DashboardStat.astro"), "utf8");
    const row = readFileSync(join(import.meta.dirname, "../src/components/TransactionRow.astro"), "utf8");
    expect(stat).toContain("var(--font-serif)");
    expect(row).toContain("var(--font-serif)");
    expect(stat).toContain("var(--font-sans)");
  });
});
