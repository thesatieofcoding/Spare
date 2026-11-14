import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

describe("legacy /en/ URLs", () => {
  // The repo-root vercel.json is the one Vercel deploys with.
  const vercel = () => JSON.parse(read("../../vercel.json"));
  it("vercel.json permanently redirects /en/* to the unprefixed path", () => {
    const { redirects } = vercel();
    expect(redirects).toContainEqual({ source: "/en", destination: "/", permanent: true });
    expect(redirects).toContainEqual({ source: "/en/:path*", destination: "/:path*", permanent: true });
  });
  it("vercel.json does not redirect the root", () => {
    const { redirects } = vercel();
    expect(redirects.some((r: { source: string }) => r.source === "/")).toBe(false);
  });
  it("vercel.json keeps the stellar.toml CORS header", () => {
    const toml = vercel().headers.find((h: { source: string }) => h.source === "/.well-known/stellar.toml");
    expect(toml.headers).toContainEqual({ key: "Access-Control-Allow-Origin", value: "*" });
  });
  it("404 page links to unprefixed English", () => {
    expect(read("src/pages/404.astro")).not.toContain('href="/en/');
  });
});
