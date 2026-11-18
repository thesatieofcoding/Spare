import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertNoDonorAddresses } from "spare-indexer/domain/privacy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSnapshot, resetSnapshotCache, resolveSource, SNAPSHOT_URL, SnapshotSourceError } from "../src/lib/snapshot-source";
import fixture from "../src/data/snapshot.fixture.json";

const noNetwork = () => {
  throw new Error("network must not be touched");
};
const reply = (body: string, status = 200) => async () => new Response(body, { status });

describe("resolveSource", () => {
  it("defaults to fixture for local dev", () => expect(resolveSource({})).toBe("fixture"));
  it("honours SPARE_SNAPSHOT_SOURCE=remote", () => expect(resolveSource({ SPARE_SNAPSHOT_SOURCE: "remote" })).toBe("remote"));
  it("forces remote when VERCEL_ENV=production, even if fixture is requested", () => {
    expect(resolveSource({ VERCEL_ENV: "production", SPARE_SNAPSHOT_SOURCE: "fixture" })).toBe("remote");
    expect(resolveSource({ VERCEL_ENV: "production" })).toBe("remote");
  });
  it("keeps fixture on preview deploys", () => expect(resolveSource({ VERCEL_ENV: "preview" })).toBe("fixture"));
});

describe("loadSnapshot: fixture mode", () => {
  it("works offline and never calls fetch", async () => {
    const r = await loadSnapshot({ env: {}, fetch: noNetwork });
    expect(r.mode).toBe("fixture");
  });
  it("yields the canonical example: 1.50 via Spare, count 2, unattributed 2.00", async () => {
    const { view } = await loadSnapshot({ env: {} });
    const f = view.foundations[0]!;
    expect(f.totalViaSpare).toBe("1.5000000");
    expect(f.count).toBe(2);
    expect(f.apps).toEqual([{ appId: "app-a", total: "1.5000000", count: 2 }]);
    expect(f.unattributed).toEqual({ total: "2.0000000", count: 1 });
  });
  it("hides the non-verified foundation", async () => {
    const { view } = await loadSnapshot({ env: {} });
    expect(view.foundations).toHaveLength(1);
    expect(view.foundations[0]!.name).toBe("Sample Foundation");
  });
  it("fixture contains no donor address (privacy guard accepts it)", () => {
    const text = readFileSync(join(import.meta.dirname, "../src/data/snapshot.fixture.json"), "utf8");
    const allowed = new Set<string>([
      "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      ...(fixture as { data: { foundations: { account: string }[] } }).data.foundations.map((f) => f.account),
    ]);
    expect(assertNoDonorAddresses(text, allowed)).toEqual({ ok: true });
  });
});

describe("loadSnapshot: remote mode", () => {
  const env = { VERCEL_ENV: "production" };
  it("fetches the data-branch contents API with the raw Accept header", async () => {
    let seen: { url: string; accept: string | null } | undefined;
    const body = JSON.stringify(fixture);
    await loadSnapshot({
      env,
      fetch: async (input, init) => {
        seen = { url: String(input), accept: new Headers(init?.headers).get("accept") };
        return new Response(body);
      },
    });
    expect(seen).toEqual({ url: SNAPSHOT_URL, accept: "application/vnd.github.raw" });
    expect(SNAPSHOT_URL).toBe("https://api.github.com/repos/thesatieofcoding/Spare/contents/snapshot.json?ref=data");
  });
  it("parses a valid remote snapshot", async () => {
    const r = await loadSnapshot({ env, fetch: reply(JSON.stringify(fixture)) });
    expect(r.mode).toBe("remote");
    expect(r.view.foundations).toHaveLength(1);
  });
  it("production + unreachable fails the build", async () => {
    await expect(loadSnapshot({ env, fetch: async () => { throw new Error("ENOTFOUND"); } })).rejects.toBeInstanceOf(SnapshotSourceError);
  });
  it("production + 404 (missing data branch) fails", async () => {
    await expect(loadSnapshot({ env, fetch: reply("Not Found", 404) })).rejects.toThrow(/404/);
  });
  it("production + bad schemaVersion fails", async () => {
    const bad = JSON.stringify({ ...fixture, schemaVersion: 2 });
    await expect(loadSnapshot({ env, fetch: reply(bad) })).rejects.toThrow(/schemaVersion/);
  });
  it("production + non-JSON body fails", async () => {
    await expect(loadSnapshot({ env, fetch: reply("<html>") })).rejects.toThrow(SnapshotSourceError);
  });
  it("never falls back to the fixture when remote is forced", async () => {
    await expect(loadSnapshot({ env: { VERCEL_ENV: "production", SPARE_SNAPSHOT_SOURCE: "fixture" }, fetch: reply("nope", 500) })).rejects.toThrow();
  });
});

describe("loadSnapshot: build-wide cache, timeout and token", () => {
  const env = { VERCEL_ENV: "production" };
  const body = JSON.stringify(fixture);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetSnapshotCache();
  });

  it("default calls share one remote fetch per build", async () => {
    vi.stubEnv("SPARE_SNAPSHOT_SOURCE", "remote");
    const f = vi.fn(async () => new Response(body));
    vi.stubGlobal("fetch", f);
    const [a, b] = [await loadSnapshot(), await loadSnapshot()];
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
  it("injected fetch/env bypasses the cache", async () => {
    const f = vi.fn(async () => new Response(body));
    await loadSnapshot({ env, fetch: f });
    await loadSnapshot({ env, fetch: f });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("a failed default load is not cached", async () => {
    vi.stubEnv("SPARE_SNAPSHOT_SOURCE", "remote");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await expect(loadSnapshot()).rejects.toThrow(/500/);
    const ok = vi.fn(async () => new Response(body));
    vi.stubGlobal("fetch", ok);
    await expect(loadSnapshot()).resolves.toMatchObject({ mode: "remote" });
  });
  it("sends Authorization only when GITHUB_TOKEN is set", async () => {
    const seen: (string | null)[] = [];
    const fetch = async (_i: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("authorization"));
      return new Response(body);
    };
    await loadSnapshot({ env, fetch });
    await loadSnapshot({ env: { ...env, GITHUB_TOKEN: "tok123" }, fetch });
    expect(seen).toEqual([null, "Bearer tok123"]);
  });
  it("passes a timeout abort signal", async () => {
    let signal: AbortSignal | null | undefined;
    await loadSnapshot({ env, fetch: async (_i, init) => { signal = init?.signal; return new Response(body); } });
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
