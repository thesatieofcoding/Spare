/**
 * Demo configuration: pinned foundation per network plus optional merchant accounts.
 * Mainnet values and merchant accounts are not hardcoded; they come from PUBLIC_* env
 * vars and stay null (feature disabled) until provided. The SDK still re-verifies every
 * foundation against its stellar.toml at runtime; this list is never trusted on its own.
 */
export type DemoNetwork = "mainnet" | "testnet";

export interface DemoFoundation {
  name: string;
  /** Bare hostname serving /.well-known/stellar.toml. */
  domain: string;
  account: string;
}

export interface DemoNetworkConfig {
  foundation: DemoFoundation | null;
  /** G account that receives the demo purchase; null until provided. */
  merchant: string | null;
  /** False when a required account is missing, so the UI can show "unavailable". */
  enabled: boolean;
}

export interface DemoConfig {
  testnet: DemoNetworkConfig;
  mainnet: DemoNetworkConfig;
}

export const DEMO_DOMAIN = "donatespare.xyz";
export const DEMO_FOUNDATION_NAME = "Spare demo foundation";
/** User-controlled testnet account. Manual prerequisite: authorized USDC trustline. */
export const TESTNET_FOUNDATION_ACCOUNT = "GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ";

export interface DemoEnv {
  PUBLIC_SPARE_MAINNET_FOUNDATION?: string | undefined;
  PUBLIC_SPARE_TESTNET_MERCHANT?: string | undefined;
  PUBLIC_SPARE_MAINNET_MERCHANT?: string | undefined;
}

const G_ACCOUNT_RE = /^G[A-Z2-7]{55}$/;

function account(value: string | undefined): string | null {
  const v = value?.trim();
  return v !== undefined && G_ACCOUNT_RE.test(v) ? v : null;
}

function foundation(acct: string | null): DemoFoundation | null {
  return acct === null ? null : { name: DEMO_FOUNDATION_NAME, domain: DEMO_DOMAIN, account: acct };
}

export function createDemoConfig(env: DemoEnv): DemoConfig {
  const testnetFoundation = foundation(TESTNET_FOUNDATION_ACCOUNT);
  const mainnetFoundation = foundation(account(env.PUBLIC_SPARE_MAINNET_FOUNDATION));
  return {
    testnet: { foundation: testnetFoundation, merchant: account(env.PUBLIC_SPARE_TESTNET_MERCHANT), enabled: testnetFoundation !== null },
    mainnet: { foundation: mainnetFoundation, merchant: account(env.PUBLIC_SPARE_MAINNET_MERCHANT), enabled: mainnetFoundation !== null },
  };
}

export const demoConfig: DemoConfig = createDemoConfig(import.meta.env as DemoEnv);
