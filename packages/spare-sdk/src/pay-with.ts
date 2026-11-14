import { Asset, Operation, type xdr } from "@stellar/stellar-sdk";
import { formatStroops, parseUsdc } from "./amount.js";
import { DEFAULT_SLIPPAGE_BPS, MAX_PATH_LENGTH, MAX_SLIPPAGE_BPS, USDC_CODE } from "./constants.js";
import type { Network } from "./network.js";
import type { PathQuotePort, XlmQuote } from "./ports.js";
import type { CommonOptions, DonationInfo, NotOfferedReason, PayWith } from "./types.js";

/** sendMax for a quote: quote + margin, rounded UP to the stroop so it is never below the quote. */
export function xlmSendMax(quoted: bigint, slippageBps: number): bigint {
  const bps = BigInt(slippageBps);
  return (quoted * (10_000n + bps) + 9_999n) / 10_000n;
}

export type PayPlan =
  | { payWith: "usdc" }
  | { payWith: "xlm"; quotes: PathQuotePort; slippageBps: number; cap?: bigint };

/** Validates the pay options. Never throws: JS callers can pass anything. */
export function payPlan(opts: CommonOptions, network: Network): PayPlan | NotOfferedReason {
  const payWith: unknown = opts.payWith ?? "usdc";
  if (payWith === "usdc") return opts.sendMax === undefined ? { payWith } : "invalid-options";
  if (payWith !== "xlm") return "invalid-options";
  const q = opts.quotes as PathQuotePort | undefined;
  if (typeof q !== "object" || q === null || typeof q.quoteXlmForUsdc !== "function") return "invalid-options";
  if (q.network !== undefined && q.network !== network) return "network-mismatch";
  const bps = opts.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_SLIPPAGE_BPS) return "invalid-options";
  if (opts.sendMax === undefined) return { payWith, quotes: q, slippageBps: bps };
  const cap = parseUsdc(opts.sendMax); // same 7-decimal positive amount format
  return cap === null ? "invalid-options" : { payWith, quotes: q, slippageBps: bps, cap };
}

export interface PricedXlm {
  quote: XlmQuote;
  sendMax: bigint;
}

/** Asks the port for a quote; null when there is none, it failed, or it is unusable. */
export async function priceInXlm(
  plan: Extract<PayPlan, { payWith: "xlm" }>, amount: bigint, usdcIssuer: string,
): Promise<PricedXlm | null> {
  let quote: XlmQuote | null;
  try {
    quote = await plan.quotes.quoteXlmForUsdc(amount, usdcIssuer);
  } catch {
    return null;
  }
  if (!quote || typeof quote.sendAmount !== "bigint" || quote.sendAmount <= 0n) return null;
  if (!Array.isArray(quote.path) || quote.path.length > MAX_PATH_LENGTH) return null;
  if (quote.path.some((a) => !(a instanceof Asset) || a.isNative())) return null;
  if (plan.cap !== undefined) return quote.sendAmount > plan.cap ? null : { quote, sendMax: plan.cap };
  return { quote, sendMax: xlmSendMax(quote.sendAmount, plan.slippageBps) };
}

/** The donation operation: a USDC payment, or an XLM -> USDC strict-receive path payment. */
export function donationOperation(
  destination: string, amount: bigint, usdcIssuer: string, priced: PricedXlm | null,
): xdr.Operation {
  const usdc = new Asset(USDC_CODE, usdcIssuer);
  if (!priced) return Operation.payment({ destination, asset: usdc, amount: formatStroops(amount) });
  return Operation.pathPaymentStrictReceive({
    sendAsset: Asset.native(),
    sendMax: formatStroops(priced.sendMax),
    destination,
    destAsset: usdc,
    destAmount: formatStroops(amount),
    path: priced.quote.path,
  });
}

/** The pay-asset fields of DonationInfo. */
export function payInfo(payWith: PayWith, priced: PricedXlm | null): Pick<DonationInfo, "payWith" | "sendMax" | "sendMaxStroops" | "quotedXlm" | "quotedXlmStroops"> {
  if (!priced) return { payWith };
  return {
    payWith,
    sendMax: formatStroops(priced.sendMax),
    sendMaxStroops: priced.sendMax,
    quotedXlm: formatStroops(priced.quote.sendAmount),
    quotedXlmStroops: priced.quote.sendAmount,
  };
}
