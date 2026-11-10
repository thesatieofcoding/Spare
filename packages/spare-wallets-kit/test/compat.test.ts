import type { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { describe, expect, it } from "vitest";
import type { SignerLike } from "../src/index.js";

describe("Stellar Wallets Kit v2 compatibility", () => {
  it("the static StellarWalletsKit class satisfies SignerLike (compile-time check)", () => {
    const accepts = (_kit: SignerLike) => true;
    expect(accepts({} as typeof StellarWalletsKit)).toBe(true);
  });
});
