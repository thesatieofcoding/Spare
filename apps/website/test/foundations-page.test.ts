import { existsSync } from "node:fs";
import { join } from "node:path";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import FoundationsDirectory from "../src/components/FoundationsDirectory.astro";
import { loadSnapshot } from "../src/lib/snapshot-source";

const root = join(import.meta.dirname, "..");
const render = async (props: Record<string, unknown>) => (await AstroContainer.create()).renderToString(FoundationsDirectory, { props });

describe("foundations route", () => {
  it("replaces the placeholder route", () => {
    expect(existsSync(join(root, "src/pages/[...lang]/[page].astro"))).toBe(false);
    expect(existsSync(join(root, "src/pages/[...lang]/foundations.astro"))).toBe(true);
  });
});

describe("FoundationsDirectory", () => {
  let view: Awaited<ReturnType<typeof loadSnapshot>>["view"];
  beforeAll(async () => {
    view = (await loadSnapshot({ env: {} })).view;
  });
  it("lists the verified foundation with badge and a dashboard link, never the unverified one", async () => {
    const html = await render({ lang: "en", foundations: view.foundations });
    expect(html).toContain("Sample Foundation");
    expect(html).toContain("Domain verified");
    expect(html).toContain(`href="/dashboard/${view.foundations[0]!.account}/"`);
    expect(html).not.toContain("Unverified Sample");
  });
  it("localizes copy and links in Spanish", async () => {
    const html = await render({ lang: "es", foundations: view.foundations });
    expect(html).toContain("Dominio verificado");
    expect(html).toContain("Ver tablero");
    expect(html).toContain(`href="/es/dashboard/${view.foundations[0]!.account}/"`);
  });
  it("shows a localized empty state when there are no foundations", async () => {
    expect(await render({ lang: "en", foundations: [] })).toContain("No verified foundations yet");
    expect(await render({ lang: "es", foundations: [] })).toContain("Todavía no hay fundaciones verificadas");
  });
});
