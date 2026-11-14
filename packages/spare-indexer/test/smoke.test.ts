import { USDC_ISSUER } from "spare-sdk";
import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "../src/index.js";

describe("spare-indexer scaffold", () => {
  it("exposes its package name and resolves spare-sdk from the workspace", () => {
    expect(PACKAGE_NAME).toBe("spare-indexer");
    expect(USDC_ISSUER).toMatch(/^G[A-Z2-7]{55}$/);
  });
});
