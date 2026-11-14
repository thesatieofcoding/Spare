import { describe, expect, it } from "vitest";
import { USDC_ISSUER } from "../src/constants.js";
import { NETWORKS } from "../src/index.js";

describe("NETWORKS", () => {
  it("mainnet is Circle's issuer on the public network", () => {
    expect(NETWORKS.mainnet).toEqual({
      network: "mainnet",
      passphrase: "Public Global Stellar Network ; September 2015",
      usdcIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      horizonUrl: "https://horizon.stellar.org",
    });
  });

  it("testnet is Circle's testnet issuer on the test network", () => {
    expect(NETWORKS.testnet).toEqual({
      network: "testnet",
      passphrase: "Test SDF Network ; September 2015",
      usdcIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      horizonUrl: "https://horizon-testnet.stellar.org",
    });
  });

  it("is frozen, entries included", () => {
    expect(Object.isFrozen(NETWORKS)).toBe(true);
    expect(Object.isFrozen(NETWORKS.mainnet)).toBe(true);
    expect(Object.isFrozen(NETWORKS.testnet)).toBe(true);
  });

  it("keeps USDC_ISSUER as the mainnet issuer", () => {
    expect(USDC_ISSUER).toBe(NETWORKS.mainnet.usdcIssuer);
  });

  it("has no entry for an unknown network", () => {
    expect((NETWORKS as Record<string, unknown>)["devnet"]).toBeUndefined();
  });
});
