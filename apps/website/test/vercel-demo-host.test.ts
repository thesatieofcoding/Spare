import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Rewrite = { source: string; destination: string; has?: { type: string; value: string }[] };
const vercel = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")) as { rewrites?: Rewrite[] };
const HOST = "demo.donatespare.xyz";
const rewrites = vercel.rewrites ?? [];
const find = (source: string) => rewrites.find((r) => r.source === source);

describe("vercel.json demo subdomain rewrites", () => {
  it.each([
    ["/", "/demo/"],
    ["/es/", "/es/demo/"],
  ])("rewrites %s to %s only on the demo host", (source, destination) => {
    const r = find(source);
    expect(r).toBeDefined();
    expect(r?.destination).toBe(destination);
    expect(r?.has).toEqual([{ type: "host", value: HOST }]);
  });
  it("every rewrite is host-scoped, so the main site is untouched", () => {
    for (const r of rewrites) expect(r.has).toEqual([{ type: "host", value: HOST }]);
  });
  it("destinations are real routes of the site", () => {
    const pages = readFileSync(new URL("../src/pages/[...lang]/demo.astro", import.meta.url), "utf8");
    expect(pages).toContain("getStaticPaths");
    for (const r of rewrites) expect(r.destination).toMatch(/^(\/es)?\/demo\/$/);
    expect(existsSync(new URL("../src/pages/[...lang]/demo.astro", import.meta.url))).toBe(true);
  });
});
