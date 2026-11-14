import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INSTALL_COMMAND, INSTALL_NPM, INSTALL_YARN, addDonationSnippet, donateAfterSnippet, kitSnippet, signWithDonationSnippet,
  soroban, testnetDonateSnippet, testnetFundSnippet,
} from "../src/lib/docs-snippets";

const rootReadme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
const sdkReadme = readFileSync(new URL("../../../packages/spare-sdk/README.md", import.meta.url), "utf8");
const quickstart = readFileSync(new URL("../../../examples/quickstart/src/quickstart.ts", import.meta.url), "utf8");
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
  it("kit snippet uses the network option, not a hard-coded passphrase", () => {
    const s = kitSnippet("en");
    expect(s).toContain('const network = "testnet"; // "mainnet" in production');
    expect(s).toContain("accounts: new HorizonAccountPort({ network }),");
    expect(s).toMatch(/^ {2}network,$/m);
    expect(s).not.toContain("networkPassphrase");
    expect(s).not.toContain("Networks.PUBLIC");
  });
  it("both READMEs show the same network form", () => {
    for (const readme of [rootReadme, kitReadme]) {
      expect(readme).toContain('const network = "testnet"; // "mainnet" in production');
      expect(readme).toContain("accounts: new HorizonAccountPort({ network }),");
      expect(readme).not.toContain("Networks.PUBLIC");
    }
  });
  it("soroban snippet uses offerFollowUp, which the README documents", () => {
    expect(kitReadme).toContain("offerFollowUp");
    expect(soroban).toContain("spare.offerFollowUp(");
  });
  it("never uses the non-existent npm package names from the old mock", () => {
    expect(kitSnippet("en")).not.toMatch(/npm install/);
  });
  it("examples/quickstart runs the docs snippet verbatim (region parity)", () => {
    const m = quickstart.match(/^\/\/ #region quickstart\n([\s\S]*?)\n\/\/ #endregion quickstart$/m);
    expect(m, "region markers missing in examples/quickstart/src/quickstart.ts").not.toBeNull();
    expect(m![1]).toBe(kitSnippet("en"));
  });
  it("drift in the example region is detected", () => {
    const edited = quickstart.replace('appId: "my-app"', 'appId: "other-app"');
    const m = edited.match(/^\/\/ #region quickstart\n([\s\S]*?)\n\/\/ #endregion quickstart$/m);
    expect(m![1]).not.toBe(kitSnippet("en"));
  });
  it("addDonation and donateAfter snippets use the network option, not URLs or passphrases", () => {
    for (const s of [addDonationSnippet, donateAfterSnippet]) {
      expect(s).not.toContain("Networks.PUBLIC");
      expect(s).not.toContain("networkPassphrase");
      expect(s).not.toContain("horizon.stellar.org");
    }
    expect(addDonationSnippet).toContain('const network = "testnet"; // "mainnet" in production');
    expect(addDonationSnippet).toContain("accounts: new HorizonAccountPort({ network }),");
    expect(addDonationSnippet).toMatch(/^ {2}network,$/m);
    expect(donateAfterSnippet).toMatch(/accounts, network/);
  });
  it("sdk README and both docs locales carry the same addDonation/donateAfter snippets", async () => {
    expect(sdkReadme).toContain(addDonationSnippet);
    expect(sdkReadme).toContain(donateAfterSnippet);
    const { enDocs: en } = await import("../src/i18n/docs/en");
    const { esDocs: es } = await import("../src/i18n/docs/es");
    for (const doc of [en, es]) {
      const text = JSON.stringify(doc);
      expect(text).toContain(JSON.stringify(addDonationSnippet).slice(1, -1));
      expect(text).toContain(JSON.stringify(donateAfterSnippet).slice(1, -1));
    }
  });

  const region = (file: string, name: string) => {
    const src = readFileSync(new URL(`../../../examples/quickstart/src/${file}`, import.meta.url), "utf8");
    return src.match(new RegExp(`^// #region ${name}\\n([\\s\\S]*?)\\n// #endregion ${name}$`, "m"))?.[1];
  };
  it("npm and yarn install lines install the same packages as the pnpm one", () => {
    const pkgs = INSTALL_COMMAND.replace("pnpm add ", "");
    expect(INSTALL_NPM).toBe(`npm install ${pkgs}`);
    expect(INSTALL_YARN).toBe(`yarn add ${pkgs}`);
  });
  it("testnet fund and donate snippets are the typechecked example files, verbatim", () => {
    expect(region("testnet-fund.ts", "testnet-fund")).toBe(testnetFundSnippet);
    expect(region("testnet-donate.ts", "testnet-donate")).toBe(testnetDonateSnippet);
  });
  it("testnet snippets use the real demo foundation and Circle testnet USDC", () => {
    expect(testnetDonateSnippet).toContain("GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ");
    expect(testnetDonateSnippet).toContain('domain: "donatespare.xyz"');
    expect(testnetDonateSnippet).toContain('network: "testnet"');
    expect(testnetDonateSnippet).toContain("signWithDonation(");
    expect(testnetFundSnippet).toContain("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
    expect(testnetFundSnippet).toContain("pathPaymentStrictReceive");
    expect(testnetFundSnippet).toContain("friendbot");
  });
  it("wallets-kit README carries the same Node example", () => {
    expect(kitReadme).toContain(testnetDonateSnippet);
    expect(kitReadme).toContain("outcome");
  });
  it("signWithDonation snippet reads outcome and submits the signed xdr", () => {
    for (const needle of ["signWithDonation(", "result.outcome", "result.changed", "submitTransaction("]) {
      expect(signWithDonationSnippet).toContain(needle);
    }
  });
  it("quick start (both locales) carries the testnet block, install variants and outcome snippet", async () => {
    const { enDocs } = await import("../src/i18n/docs/en");
    const { esDocs } = await import("../src/i18n/docs/es");
    for (const doc of [enDocs["quick-start"], esDocs["quick-start"]]) {
      const codes = doc.blocks.flatMap((b) => (b.t === "code" ? [b.code] : []));
      for (const c of [INSTALL_NPM, INSTALL_COMMAND, INSTALL_YARN, testnetFundSnippet, testnetDonateSnippet, signWithDonationSnippet]) {
        expect(codes).toContain(c);
      }
      expect(doc.blocks.some((b) => b.t === "h2" && b.id === "testnet")).toBe(true);
    }
  });
});
