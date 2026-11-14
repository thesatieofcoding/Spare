import { NETWORKS } from "spare-sdk";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import type { TransferObservation } from "../../src/domain/types.js";

/** Deterministic synthetic accounts (no real keys). */
const acct = (n: number): string => StrKey.encodeEd25519PublicKey(Buffer.alloc(32, n));
export const FOUNDATION = acct(1);
export const OTHER_FOUNDATION = acct(2);
/** Donor sentinel: must never appear in any output. */
export const GDONOR = acct(9);
export const MAINNET_USDC = NETWORKS.mainnet.usdcIssuer;
export const TESTNET_USDC = NETWORKS.testnet.usdcIssuer;
/** Same code, different issuer. */
export const LOOKALIKE_ISSUER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7)).publicKey();

export const txt = (s: string) => ({ type: "text" as const, bytes: new TextEncoder().encode(s) });

export function obs(over: Partial<TransferObservation> = {}): TransferObservation {
  return {
    txHash: "a".repeat(64),
    opIndex: 0,
    ledger: 1000,
    closedAt: "2026-11-01T00:00:00Z",
    opType: "payment",
    successful: true,
    to: FOUNDATION,
    asset: { code: "USDC", issuer: MAINNET_USDC },
    amount: 5_000_000n, // 0.5 USDC
    memo: txt("spare:shop1"),
    ...over,
  };
}

export function muxedOf(g: string, id: bigint): string {
  const key = StrKey.decodeEd25519PublicKey(g);
  const buf = Buffer.alloc(40);
  Buffer.from(key).copy(buf, 0);
  buf.writeBigUInt64BE(id, 32);
  return StrKey.encodeMed25519PublicKey(buf);
}
