import { describe, expect, it } from "vitest";
import { createSafeFetch, createSafeLookup, createTomlVerifier, isBlockedAddress } from "../src/adapters/toml.js";

describe("isBlockedAddress", () => {
  const blocked: Record<string, string[]> = {
    loopback: ["127.0.0.1", "127.255.255.254", "::1"],
    "private 10/8": ["10.0.0.1", "10.255.255.255"],
    "private 172.16/12": ["172.16.0.1", "172.31.255.255"],
    "private 192.168/16": ["192.168.0.1", "192.168.255.255"],
    "link-local v4": ["169.254.0.1", "169.254.255.255"],
    "cloud metadata": ["169.254.169.254"],
    "link-local v6 fe80::/10": ["fe80::1", "febf::1"],
    "CGNAT 100.64/10": ["100.64.0.1", "100.127.255.255"],
    "ULA fc00::/7": ["fc00::1", "fd12:3456:789a::1"],
    unspecified: ["0.0.0.0", "0.1.2.3", "::"],
    "ipv4-mapped private/loopback": ["::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "::ffff:c0a8:1"],
    "nat64 embedding private": ["64:ff9b::a00:1"],
    "multicast/reserved": ["224.0.0.1", "255.255.255.255"],
    "unparseable (fail closed)": ["not-an-ip", "", "999.1.1.1"],
  };
  for (const [name, ips] of Object.entries(blocked)) {
    it(`blocks ${name}`, () => {
      for (const ip of ips) expect(isBlockedAddress(ip), ip).toBe(true);
    });
  }

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "2001:4860:4860::8888"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

type Addr = { address: string; family: number };
const resolverOf = (addrs: Addr[] | Error) => (_h: string, _o: unknown, cb: (e: Error | null, a: Addr[]) => void) => {
  if (addrs instanceof Error) cb(addrs, []);
  else cb(null, addrs);
};

function lookup(addrs: Addr[] | Error, opts: { all?: boolean } = {}) {
  return new Promise<{ err: Error | null; res: unknown }>((resolve) => {
    const fn = createSafeLookup(resolverOf(addrs)) as unknown as (h: string, o: unknown, cb: (err: Error | null, a: unknown, f?: number) => void) => void;
    fn("foundation.org", opts, (err, a, f) => resolve({ err, res: opts.all ? a : [a, f] }));
  });
}

describe("createSafeLookup", () => {
  it("rejects when any resolved address is blocked", async () => {
    const r = await lookup([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.5", family: 4 }]);
    expect(r.err?.message).toMatch(/blocked/);
  });

  it("rejects a hostname that rebinds to loopback or metadata", async () => {
    expect((await lookup([{ address: "127.0.0.1", family: 4 }])).err).not.toBeNull();
    expect((await lookup([{ address: "169.254.169.254", family: 4 }])).err).not.toBeNull();
  });

  it("rejects empty resolution and resolver errors", async () => {
    expect((await lookup([])).err).not.toBeNull();
    expect((await lookup(new Error("ENOTFOUND"))).err?.message).toBe("ENOTFOUND");
  });

  it("passes public addresses through (single and all forms)", async () => {
    const pub = [{ address: "93.184.216.34", family: 4 }];
    expect(await lookup(pub)).toEqual({ err: null, res: ["93.184.216.34", 4] });
    expect(await lookup(pub, { all: true })).toEqual({ err: null, res: pub });
  });
});

describe("createSafeFetch", () => {
  it("refuses to connect to a hostname that resolves to loopback, without any network", async () => {
    const f = createSafeFetch();
    const err = await f("https://localhost/.well-known/stellar.toml", { redirect: "error", signal: AbortSignal.timeout(3000) }).then(
      () => null,
      (e: Error & { cause?: Error }) => e,
    );
    expect(err?.cause?.message).toMatch(/blocked/);
  });
});

const ACCOUNT = "GBTDED5SUJIHELB6YIVIEBXKOCCDAHCTJFMKT3T6JJDF3XU2ZNJ7TFPQ";
const tomlResponse = (accounts: string[]) => new Response(`ACCOUNTS = [${accounts.map((a) => `"${a}"`).join(", ")}]\n`, { status: 200 });

describe("createTomlVerifier", () => {
  it("true only when the account is listed in ACCOUNTS", async () => {
    const urls: string[] = [];
    const v = createTomlVerifier({
      fetch: async (u) => {
        urls.push(String(u));
        return tomlResponse([ACCOUNT]);
      },
    });
    expect(await v.verify({ account: ACCOUNT, domain: "foundation.org" })).toBe(true);
    expect(urls).toEqual(["https://foundation.org/.well-known/stellar.toml"]);
    expect(await createTomlVerifier({ fetch: async () => tomlResponse(["GOTHER"]) }).verify({ account: ACCOUNT, domain: "foundation.org" })).toBe(false);
  });

  it("fails closed on fetch errors, non-200, bad toml and bad domains", async () => {
    const t = (fetch: () => Promise<Response>, domain = "foundation.org") => createTomlVerifier({ fetch }).verify({ account: ACCOUNT, domain });
    expect(await t(async () => Promise.reject(new Error("boom")))).toBe(false);
    expect(await t(async () => new Response("nope", { status: 404 }))).toBe(false);
    expect(await t(async () => new Response("{{ not toml", { status: 200 }))).toBe(false);
    expect(await t(async () => tomlResponse([ACCOUNT]), "127.0.0.1")).toBe(false);
  });

  it("never throws, even when the fetch throws synchronously", async () => {
    const v = createTomlVerifier({
      fetch: () => {
        throw new Error("sync");
      },
    });
    await expect(v.verify({ account: ACCOUNT, domain: "foundation.org" })).resolves.toBe(false);
  });

  it("limits in-flight fetches to 4", async () => {
    let inflight = 0;
    let peak = 0;
    const v = createTomlVerifier({
      fetch: async () => {
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight--;
        return tomlResponse([ACCOUNT]);
      },
    });
    const results = await Promise.all(Array.from({ length: 12 }, () => v.verify({ account: ACCOUNT, domain: "foundation.org" })));
    expect(results.every(Boolean)).toBe(true);
    expect(peak).toBe(4);
  });
});
