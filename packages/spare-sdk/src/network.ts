import { USDC_ISSUER } from "./constants.js";

export type Network = "mainnet" | "testnet";

export interface NetworkConfig {
  network: Network;
  passphrase: string;
  /** The one USDC issuer Spare accepts on this network. There is no override. */
  usdcIssuer: string;
  horizonUrl: string;
}

/** Circle's testnet USDC issuer (Horizon testnet home_domain centre.io, verified 2026-11-13). */
const TESTNET_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export const NETWORKS: Readonly<Record<Network, NetworkConfig>> = Object.freeze({
  mainnet: Object.freeze({
    network: "mainnet",
    passphrase: "Public Global Stellar Network ; September 2015",
    usdcIssuer: USDC_ISSUER,
    horizonUrl: "https://horizon.stellar.org",
  }),
  testnet: Object.freeze({
    network: "testnet",
    passphrase: "Test SDF Network ; September 2015",
    usdcIssuer: TESTNET_USDC_ISSUER,
    horizonUrl: "https://horizon-testnet.stellar.org",
  }),
});

/** Runtime guard: the type says Network, but JS callers can pass anything. */
export const isNetwork = (n: unknown): n is Network =>
  typeof n === "string" && Object.hasOwn(NETWORKS, n);
