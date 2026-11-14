import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { HorizonPathQuotePort } from "../src/index.js";
import { USDC_ISSUER } from "../src/constants.js";
import type { FetchLike } from "../src/ports.js";
import { stroops } from "./helpers.js";

const hopIssuer = Keypair.random().publicKey();
const rec = (source_amount: string, path: object[] = [], source_asset_type = "native") => ({
  source_asset_type, source_amount, destination_asset_type: "credit_alphanum4", destination_asset_code: "USDC",
  destination_asset_issuer: USDC_ISSUER, destination_amount: "0.5000000", path,
});
const reply = (records: object[], status = 200): FetchLike =>
  vi.fn(async () => new Response(JSON.stringify({ _embedded: { records } }), { status }));

describe("HorizonPathQuotePort", () => {
  it("asks Horizon /paths/strict-receive for native -> Circle USDC and keeps the cheapest path", async () => {
    const fetch = reply([rec("2.1000000"), rec("1.9500000", [{ asset_type: "credit_alphanum4", asset_code: "EURC", asset_issuer: hopIssuer }]), rec("2.0000000")]);
    const port = new HorizonPathQuotePort({ network: "mainnet", fetch });
    const q = await port.quoteXlmForUsdc(stroops("0.5"), USDC_ISSUER);
    expect(q?.sendAmount).toBe(stroops("1.95"));
    expect(q?.path).toHaveLength(1);
    expect(q?.path[0]?.getCode()).toBe("EURC");
    const url = new URL(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://horizon.stellar.org/paths/strict-receive");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      source_assets: "native",
      destination_asset_type: "credit_alphanum4",
      destination_asset_code: "USDC",
      destination_asset_issuer: USDC_ISSUER,
      destination_amount: "0.5000000",
    });
    expect(port.network).toBe("mainnet");
  });

  it("uses the testnet Horizon for testnet and an explicit URL when given", async () => {
    const fetch = reply([rec("1")]);
    await new HorizonPathQuotePort({ network: "testnet", fetch }).quoteXlmForUsdc(1n, "GX");
    expect(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toMatch(/^https:\/\/horizon-testnet\.stellar\.org\/paths/);
    const f2 = reply([rec("1")]);
    await new HorizonPathQuotePort({ horizon: "https://h.example/", fetch: f2 }).quoteXlmForUsdc(1n, "GX");
    expect(String((f2 as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toMatch(/^https:\/\/h\.example\/paths\/strict-receive\?/);
  });

  it("resolves null when there is no usable path", async () => {
    const q = (records: object[]) => new HorizonPathQuotePort({ fetch: reply(records) }).quoteXlmForUsdc(1n, USDC_ISSUER);
    expect(await q([])).toBeNull();
    expect(await q([rec("1", [], "credit_alphanum4")])).toBeNull(); // not paid in XLM
    expect(await q([rec("abc")])).toBeNull();
    expect(await q([rec("0")])).toBeNull();
    expect(await q([rec("1", Array.from({ length: 6 }, () => ({ asset_type: "credit_alphanum4", asset_code: "AB", asset_issuer: hopIssuer })))])).toBeNull();
    expect(await q([rec("1", [{ asset_type: "native" }])])).toBeNull(); // loops through XLM
  });

  it("throws on HTTP errors (the SDK maps that to no-path)", async () => {
    await expect(new HorizonPathQuotePort({ fetch: reply([], 503) }).quoteXlmForUsdc(1n, USDC_ISSUER)).rejects.toThrow();
  });

  it("rejects unknown networks", () => {
    expect(() => new HorizonPathQuotePort({ network: "futurenet" as never })).toThrow();
  });
});
