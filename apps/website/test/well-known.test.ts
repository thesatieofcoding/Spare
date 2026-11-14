import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyFoundation } from "spare-sdk";
import { assertFoundationsInToml, tomlAccounts } from "../src/demo/foundation-guard";
import { DEMO_DOMAIN, TESTNET_FOUNDATION_ACCOUNT, createDemoConfig } from "../src/demo/config";

const TOML_URL = new URL("../public/.well-known/stellar.toml", import.meta.url);
const toml = readFileSync(TOML_URL, "utf8");
const vercel = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")) as {
  trailingSlash?: boolean;
  headers?: { source: string; headers: { key: string; value: string }[] }[];
};
const astroConfig = readFileSync(new URL("../astro.config.mjs", import.meta.url), "utf8");

/** Serves the static file exactly as the site would, with no network. */
const fileFetch = (async (url: string) => {
  expect(url).toBe(`https://${DEMO_DOMAIN}/.well-known/stellar.toml`);
  return new Response(toml, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
}) as unknown as typeof fetch;

const OTHER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

describe("demo foundation stellar.toml", () => {
  it("pins the testnet foundation account", () => {
    expect(TESTNET_FOUNDATION_ACCOUNT).toBe("GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ");
    expect(toml).toContain(TESTNET_FOUNDATION_ACCOUNT);
  });
  it("domain matches the astro site", () => {
    expect(astroConfig).toContain(`https://${DEMO_DOMAIN}`);
  });
  it("passes the SDK's verifyFoundation for the testnet foundation", async () => {
    const cfg = createDemoConfig({});
    expect(await verifyFoundation(cfg.testnet.foundation!, fileFetch)).toBe(true);
  });
  it("rejects an account that is not in ACCOUNTS (S4.3)", async () => {
    expect(await verifyFoundation({ account: OTHER, domain: DEMO_DOMAIN }, fileFetch)).toBe(false);
  });
  it("is labelled as a demo and does not impersonate a real organisation", () => {
    expect(toml).toMatch(/ORG_NAME\s*=\s*"Spare demo foundation"/);
    expect(toml).toMatch(/ORG_DESCRIPTION\s*=\s*".*demo.*"/i);
  });
  it("lists every configured account (superset of the demo config)", async () => {
    const cfg = createDemoConfig({
      PUBLIC_SPARE_MAINNET_FOUNDATION: undefined,
    });
    for (const n of [cfg.testnet, cfg.mainnet]) {
      if (n.foundation) expect(await verifyFoundation(n.foundation, fileFetch)).toBe(true);
    }
  });
});

describe("build-time foundation guard", () => {
  it("reads ACCOUNTS from the real toml", () => {
    expect(tomlAccounts(toml)).toContain(TESTNET_FOUNDATION_ACCOUNT);
  });
  it("passes for the real toml with the default config and with a toml-listed mainnet foundation", () => {
    expect(() => assertFoundationsInToml(createDemoConfig({}), toml)).not.toThrow();
    const listed = tomlAccounts(toml)[0]!;
    expect(() => assertFoundationsInToml(createDemoConfig({ PUBLIC_SPARE_MAINNET_FOUNDATION: listed }), toml)).not.toThrow();
  });
  it("throws when PUBLIC_SPARE_MAINNET_FOUNDATION is set but missing from ACCOUNTS", () => {
    const cfg = createDemoConfig({ PUBLIC_SPARE_MAINNET_FOUNDATION: OTHER });
    expect(() => assertFoundationsInToml(cfg, toml)).toThrow(/mainnet foundation .* not in .*ACCOUNTS/);
  });
});

describe("vercel.json headers for stellar.toml", () => {
  const rule = vercel.headers?.find((h) => h.source === "/.well-known/stellar.toml");
  const header = (k: string) => rule?.headers.find((h) => h.key.toLowerCase() === k)?.value;

  it("has an exact-path rule with CORS * and a text content type", () => {
    expect(rule).toBeDefined();
    expect(header("access-control-allow-origin")).toBe("*");
    expect(header("content-type")).toBe("text/plain; charset=utf-8");
  });
  it("source is an exact path with no trailing slash (a .toml file is not slash-redirected)", () => {
    expect(rule?.source.endsWith("/")).toBe(false);
    expect(rule?.source).not.toMatch(/[(*:]/);
    expect(vercel.trailingSlash).toBe(true);
  });
});
