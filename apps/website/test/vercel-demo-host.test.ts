import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Redirect = { source: string; destination: string; permanent?: boolean; has?: { type: string; value: string }[] };
const vercel = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")) as {
  redirects?: Redirect[];
  rewrites?: unknown[];
};
const HOST = "demo.donatespare.xyz";
// Host-scoped redirects, not rewrites: Vercel serves an existing file (dist/index.html)
// before applying rewrites, so a rewrite of "/" would never reach the demo.
const demo = (vercel.redirects ?? []).filter((r) => r.has?.some((h) => h.type === "host"));
const find = (source: string) => demo.find((r) => r.source === source);

describe("vercel.json demo subdomain redirects", () => {
  it.each([
    ["/", "/demo/"],
    ["/es/", "/es/demo/"],
  ])("redirects %s to %s only on the demo host", (source, destination) => {
    const r = find(source);
    expect(r).toBeDefined();
    expect(r?.destination).toBe(destination);
    expect(r?.permanent).toBe(false);
    expect(r?.has).toEqual([{ type: "host", value: HOST }]);
  });
  it("uses no rewrites for the demo host", () => {
    expect(vercel.rewrites ?? []).toEqual([]);
  });
  it("every host-scoped redirect targets the demo host only", () => {
    expect(demo).toHaveLength(2);
    for (const r of demo) expect(r.has).toEqual([{ type: "host", value: HOST }]);
  });
  it("destinations are real routes of the site", () => {
    const pages = readFileSync(new URL("../src/pages/[...lang]/demo.astro", import.meta.url), "utf8");
    expect(pages).toContain("getStaticPaths");
    for (const r of demo) expect(r.destination).toMatch(/^(\/es)?\/demo\/$/);
    expect(existsSync(new URL("../src/pages/[...lang]/demo.astro", import.meta.url))).toBe(true);
  });
});
