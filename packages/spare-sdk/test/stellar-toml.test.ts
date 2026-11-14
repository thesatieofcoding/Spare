import { describe, expect, it } from "vitest";
import { listVerifiedFoundations, verifyFoundation } from "../src/stellar-toml.js";
import { DOMAIN, FOUNDATION, foundationKp, tomlFetch } from "./helpers.js";

describe("verifyFoundation", () => {
  it("is true when the account is listed in ACCOUNTS", async () => {
    const urls: string[] = [];
    const f = async (u: string | URL | Request) => {
      urls.push(String(u));
      return tomlFetch([foundationKp.publicKey()])(u);
    };
    expect(await verifyFoundation(FOUNDATION, f)).toBe(true);
    expect(urls).toEqual([`https://${DOMAIN}/.well-known/stellar.toml`]);
  });
  it("is false when the account is not listed", async () => {
    expect(await verifyFoundation(FOUNDATION, tomlFetch(["GOTHER"]))).toBe(false);
  });
  it("is false on non-200, network error, bad toml, missing ACCOUNTS", async () => {
    expect(await verifyFoundation(FOUNDATION, tomlFetch([foundationKp.publicKey()], 404))).toBe(false);
    expect(await verifyFoundation(FOUNDATION, async () => { throw new Error("boom"); })).toBe(false);
    expect(await verifyFoundation(FOUNDATION, async () => new Response("= not toml ["))).toBe(false);
    expect(await verifyFoundation(FOUNDATION, async () => new Response('VERSION = "2.0.0"'))).toBe(false);
  });
  it("rejects domains that are not bare hostnames (no fetch performed)", async () => {
    let called = false;
    const f = async () => { called = true; return new Response(""); };
    for (const domain of ["x.org:8080", "https://x.org:8080/p", "user@x.org", "https://user@x.org", "https://x.org@evil.com", "", "localhost", "ftp://x.org", "x..org", ".x.org"]) {
      expect(await verifyFoundation({ ...FOUNDATION, domain }, f)).toBe(false);
    }
    expect(called).toBe(false);
  });
  it("rejects oversized stellar.toml (>100KB, SEP-1)", async () => {
    const big = async () => new Response(`# ${"x".repeat(101 * 1024)}\nACCOUNTS = ["${foundationKp.publicKey()}"]`);
    expect(await verifyFoundation(FOUNDATION, big)).toBe(false);
  });
});

describe("verifyFoundation: domain normalization", () => {
  const urls = async (domain: string) => {
    const seen: string[] = [];
    const f = async (u: string | URL | Request) => { seen.push(String(u)); return tomlFetch([foundationKp.publicKey()])(u); };
    const ok = await verifyFoundation({ ...FOUNDATION, domain }, f);
    return { ok, seen };
  };
  it.each([
    ["https://Foundation.Example", "foundation.example"],
    ["http://foundation.example/", "foundation.example"],
    ["https://foundation.example/about/us?x=1#y", "foundation.example"],
    ["FOUNDATION.EXAMPLE.", "foundation.example"],
    ["  HTTP://Sub.Foundation.Example./path/  ", "sub.foundation.example"],
  ])("%s is fetched as https://%s", async (input, host) => {
    expect(await urls(input)).toEqual({ ok: true, seen: [`https://${host}/.well-known/stellar.toml`] });
  });
});

describe("verifyFoundation: hardening", () => {
  const good = `ACCOUNTS = ["${foundationKp.publicKey()}"]\n`;
  it("never follows redirects", async () => {
    let init: RequestInit | undefined;
    const f = async (_u: string | URL | Request, i?: RequestInit) => { init = i; return new Response(good); };
    expect(await verifyFoundation(FOUNDATION, f)).toBe(true);
    expect(init?.redirect).toBe("error");
  });
  it("rejects a response that was redirected even if the fetch impl followed it", async () => {
    const f = async () => Object.defineProperty(new Response(good), "redirected", { value: true });
    expect(await verifyFoundation(FOUNDATION, f)).toBe(false);
  });
  it("rejects when Content-Length declares more than 100KB (body never read)", async () => {
    let read = false;
    const f = async () => {
      const res = new Response(good, { headers: { "content-length": String(101 * 1024) } });
      Object.defineProperty(res, "text", { value: async () => { read = true; return good; } });
      return res;
    };
    expect(await verifyFoundation(FOUNDATION, f)).toBe(false);
    expect(read).toBe(false);
  });
  it("aborts a streamed body beyond 100KB even without Content-Length", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) { pulled += 1; c.enqueue(new Uint8Array(32 * 1024).fill(35)); },
      cancel() { /* reader cancelled */ },
    });
    const f = async () => new Response(stream);
    expect(await verifyFoundation(FOUNDATION, f)).toBe(false);
    expect(pulled).toBeLessThan(10); // stopped early, an endless stream does not hang us
  });
  it("accepts a body just under the cap", async () => {
    const f = async () => new Response(`# ${"x".repeat(99 * 1024)}\n${good}`);
    expect(await verifyFoundation(FOUNDATION, f)).toBe(true);
  });
});

describe("listVerifiedFoundations", () => {
  it("keeps only verified candidates", async () => {
    const bad = { account: "GBAD", domain: "bad.example" };
    const f = async (u: string | URL | Request) =>
      String(u).includes(DOMAIN) ? tomlFetch([foundationKp.publicKey()])(u) : tomlFetch([])(u);
    expect(await listVerifiedFoundations([FOUNDATION, bad], f)).toEqual([FOUNDATION]);
  });
});
