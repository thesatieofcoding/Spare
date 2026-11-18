import { describe, expect, it } from "vitest";
import { TESTNET_FOUNDATION_ACCOUNT, createDemoConfig } from "../src/demo/config";

const MAINNET_ACCOUNT = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

describe("demo config", () => {
  it("testnet foundation is pinned with name, domain and account (R4.1, R4.4)", () => {
    const f = createDemoConfig({}).testnet.foundation;
    expect(f).toEqual({
      name: "Spare demo foundation",
      domain: "donatespare.xyz",
      account: TESTNET_FOUNDATION_ACCOUNT,
    });
  });
  it("mainnet is disabled when the foundation is unset (S4.4)", () => {
    const m = createDemoConfig({}).mainnet;
    expect(m.foundation).toBeNull();
    expect(m.enabled).toBe(false);
  });
  it("treats blank or malformed mainnet values as unset", () => {
    for (const v of ["", "  ", "not-an-account", "SA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"]) {
      expect(createDemoConfig({ PUBLIC_SPARE_DEMO_MAINNET: "on", PUBLIC_SPARE_MAINNET_FOUNDATION: v }).mainnet.foundation).toBeNull();
    }
  });
  it("uses a provided mainnet foundation without code changes (S4.5)", () => {
    const m = createDemoConfig({ PUBLIC_SPARE_DEMO_MAINNET: "on", PUBLIC_SPARE_MAINNET_FOUNDATION: ` ${MAINNET_ACCOUNT} ` }).mainnet;
    expect(m.foundation?.account).toBe(MAINNET_ACCOUNT);
    expect(m.foundation?.domain).toBe("donatespare.xyz");
    expect(m.enabled).toBe(true);
  });
  it("merchant accounts are unset by default and read from env when valid", () => {
    const c = createDemoConfig({});
    expect(c.testnet.merchant).toBeNull();
    expect(c.mainnet.merchant).toBeNull();
    const d = createDemoConfig({
      PUBLIC_SPARE_TESTNET_MERCHANT: MAINNET_ACCOUNT,
      PUBLIC_SPARE_MAINNET_MERCHANT: "junk",
    });
    expect(d.testnet.merchant).toBe(MAINNET_ACCOUNT);
    expect(d.mainnet.merchant).toBeNull();
  });
  describe("PUBLIC_SPARE_DEMO_MAINNET switch (DEMO-03)", () => {
    it("defaults to off: an account alone does not enable mainnet", () => {
      const m = createDemoConfig({ PUBLIC_SPARE_MAINNET_FOUNDATION: MAINNET_ACCOUNT }).mainnet;
      expect(m.enabled).toBe(false);
      expect(m.foundation).toBeNull();
    });
    it.each(["off", "", "true", "ON", "1"])("only the exact value 'on' enables (%j)", (v) => {
      expect(createDemoConfig({ PUBLIC_SPARE_DEMO_MAINNET: v, PUBLIC_SPARE_MAINNET_FOUNDATION: MAINNET_ACCOUNT }).mainnet.enabled).toBe(false);
    });
    it("on without an account stays disabled (testnet only)", () => {
      const c = createDemoConfig({ PUBLIC_SPARE_DEMO_MAINNET: "on" });
      expect(c.mainnet.enabled).toBe(false);
      expect(c.mainnet.foundation).toBeNull();
      expect(c.testnet.enabled).toBe(true);
    });
    it("on with an account enables mainnet", () => {
      const m = createDemoConfig({ PUBLIC_SPARE_DEMO_MAINNET: "on", PUBLIC_SPARE_MAINNET_FOUNDATION: MAINNET_ACCOUNT }).mainnet;
      expect(m.enabled).toBe(true);
      expect(m.foundation?.account).toBe(MAINNET_ACCOUNT);
    });
    it("testnet is unaffected by the switch", () => {
      expect(createDemoConfig({ PUBLIC_SPARE_DEMO_MAINNET: "on" }).testnet).toEqual(createDemoConfig({}).testnet);
    });
  });
});
