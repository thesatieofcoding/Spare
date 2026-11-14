import { StrKey } from "@stellar/stellar-sdk";
import { NETWORKS, USDC_CODE, formatStroops, type Network } from "spare-sdk";
import { attribute } from "./memo.js";
import type { Classification, TransferObservation } from "./types.js";

/** Classic operation types whose received amount counts (D7). Soroban SAC transfer/mint are not here. */
const CLASSIC_PAYMENT_OPS: ReadonlySet<string> = new Set([
  "payment",
  "path_payment_strict_send",
  "path_payment_strict_receive",
]);

export interface ClassifyContext {
  network: Network;
  /** Registered foundation G-accounts. Registry-interval eligibility (D8) is layered on top. */
  foundations: ReadonlySet<string>;
}

/** Base G account of a G or muxed M address, or null when unparseable. */
export function baseAccount(addr: string): string | null {
  try {
    if (StrKey.isValidEd25519PublicKey(addr)) return addr;
    if (StrKey.isValidMed25519PublicKey(addr)) {
      return StrKey.encodeEd25519PublicKey(StrKey.decodeMed25519PublicKey(addr).subarray(0, 32));
    }
  } catch {
    // fall through
  }
  return null;
}

/** Pure: decide whether an observed operation is a counted donation. Never throws on bad input. */
export function classify(o: TransferObservation, ctx: ClassifyContext): Classification {
  if (!CLASSIC_PAYMENT_OPS.has(o.opType)) return { kind: "ignored", reason: "not-classic-payment" };
  if (!o.successful) return { kind: "ignored", reason: "failed" };
  if (o.asset === "native" || o.asset.code !== USDC_CODE) return { kind: "ignored", reason: "wrong-asset" };
  if (o.asset.issuer !== NETWORKS[ctx.network].usdcIssuer) return { kind: "ignored", reason: "wrong-issuer" };
  const foundation = baseAccount(o.to);
  if (foundation === null || !ctx.foundations.has(foundation)) {
    return { kind: "ignored", reason: "unknown-foundation" };
  }
  const attribution = attribute(o.memo);
  // Explicit field list: nothing from the observation beyond these is ever copied (privacy).
  return {
    kind: "counted",
    record: {
      id: `${o.txHash}:${o.opIndex}`,
      foundation,
      amount: formatStroops(o.amount),
      appId: attribution.kind === "attributed" ? attribution.appId : null,
      ledger: o.ledger,
      closedAt: o.closedAt,
      txHash: o.txHash,
    },
  };
}
