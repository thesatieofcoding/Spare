import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INSTALL_COMMAND, kitSnippet, soroban } from "../src/lib/docs-snippets";

const kitReadme = readFileSync(new URL("../../../packages/spare-wallets-kit/README.md", import.meta.url), "utf8");

describe("docs snippets stay in sync with the published API", () => {
  it("install command is the one in the wallets-kit README", () => {
    expect(kitReadme).toContain(INSTALL_COMMAND);
    expect(INSTALL_COMMAND).toBe(
      "pnpm add spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk",
    );
  });
  it("kit snippet uses withSpare + signTransaction with the documented options", () => {
    const s = kitSnippet("en");
    for (const needle of ["withSpare(StellarWalletsKit", "foundation:", "mode:", "appId:", "maxAmount:", "accounts:", "spare.signTransaction("]) {
      expect(s).toContain(needle);
    }
    expect(s).toContain('locale: "en"');
    expect(kitSnippet("es")).toContain('locale: "es"');
  });
  it("soroban snippet uses offerFollowUp, which the README documents", () => {
    expect(kitReadme).toContain("offerFollowUp");
    expect(soroban).toContain("spare.offerFollowUp(");
  });
  it("never uses the non-existent npm package names from the old mock", () => {
    expect(kitSnippet("en")).not.toMatch(/npm install/);
  });
});
