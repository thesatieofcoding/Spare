/**
 * Ports the demo controller talks to. Concrete adapters (Stellar Wallets Kit, Horizon, Soroban
 * RPC, stellar-sdk tx building) live in the runtime module that is imported lazily, so nothing
 * here may import a heavy library as a value. Type-only imports are erased.
 */
import type { SpareSigner } from "spare-wallets-kit";
import type { DemoFoundation } from "./config";
import type { WalletKind } from "./machine";

export type PortErrorKind =
  | "no-wallet" | "connect-rejected" | "signature-rejected" | "submit-failed" | "simulation-failed";

/** Adapters throw this to say exactly what went wrong; anything else is mapped by the step. */
export class PortError extends Error {
  constructor(readonly kind: PortErrorKind, message: string = kind) {
    super(message);
    this.name = "PortError";
  }
}

export interface WalletPort {
  /** Opens the wallet picker and returns the chosen account. Throws PortError no-wallet / connect-rejected. */
  connect(): Promise<{ address: string; wallet: WalletKind }>;
}

export interface HorizonPort {
  /** Submits a signed classic tx. Throws PortError submit-failed. */
  submit(signedXdr: string): Promise<{ hash: string }>;
}

export type TxStatus = "SUCCESS" | "FAILED" | "NOT_FOUND";

export interface RpcPort {
  /** Simulates and assembles the Soroban tx. Throws PortError simulation-failed. */
  prepare(xdr: string): Promise<string>;
  /** Submits a signed Soroban tx. Throws PortError submit-failed. */
  send(signedXdr: string): Promise<{ hash: string }>;
  getStatus(hash: string): Promise<TxStatus>;
}

export interface PaymentRequest {
  source: string;
  destination: string;
  /** USDC, up to 7 decimals. */
  amount: string;
}

/** Builds unsigned tx XDR. The only place that needs stellar-sdk. */
export interface TxBuilderPort {
  /** Classic USDC payment source -> destination, single op, no memo. */
  buildClassicPayment(req: PaymentRequest): Promise<string>;
  /** USDC SAC `transfer(source, destination, amount)` as an InvokeHostFunction tx. */
  buildSorobanTransfer(req: PaymentRequest): Promise<string>;
}

export interface NetworkPorts {
  /** Passphrase of the network these ports talk to. */
  passphrase: string;
  wallet: WalletPort;
  horizon: HorizonPort;
  /** Null when no RPC is configured for this network (Soroban flow unavailable). */
  rpc: RpcPort | null;
  builder: TxBuilderPort;
  /** Wraps the connected wallet with Spare for this foundation. */
  createSpare(foundation: DemoFoundation, wallet: WalletKind): SpareSigner;
}
