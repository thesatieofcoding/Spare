import { StrKey } from "@stellar/stellar-sdk";
import { isValidAppId } from "./app-id.js";
import type { AccountPort, AccountSnapshot, FetchLike, Foundation } from "./ports.js";
import { verifyFoundation } from "./stellar-toml.js";
import type { NotOfferedReason } from "./types.js";

export interface EligibilityInput {
  accounts: AccountPort;
  fetch?: FetchLike;
  foundation: Foundation;
  appId: string;
  amount: bigint;
  cap: bigint | null;
  /** Account that will sign and pay. */
  source: string;
  user: AccountSnapshot;
  /** Circle-USDC the same tx already spends (0 when none or when it is already settled). */
  usdcSpend: bigint;
  /** Total fee the user will pay, in stroops (XLM). */
  fee: bigint;
  /** XLM the same tx already spends (payments, createAccount...), stroops. Default 0. */
  xlmSpend?: bigint;
}

/**
 * Cheap, offline checks first; network checks after. Returns the first failing reason,
 * or null when a donation may be offered. Fails closed on any lookup error.
 */
export async function checkEligibility(i: EligibilityInput): Promise<NotOfferedReason | null> {
  if (!isValidAppId(i.appId)) return "invalid-app-id";
  if (!StrKey.isValidEd25519PublicKey(i.foundation.account) || i.foundation.account === i.source)
    return "invalid-foundation";
  if (i.cap === null) return "invalid-amount";
  if (i.amount > i.cap) return "amount-over-cap";

  if (!(await verifyFoundation(i.foundation, i.fetch))) return "foundation-not-verified";

  let foundation: AccountSnapshot | null;
  try {
    foundation = await i.accounts.loadAccount(i.foundation.account);
  } catch {
    return "account-lookup-failed";
  }
  if (!foundation?.usdc) return "foundation-trustline-missing";
  if (!foundation.usdc.authorized) return "foundation-trustline-unauthorized";
  if (foundation.usdc.headroom < i.amount) return "foundation-trustline-full";

  if (!i.user.usdc) return "user-trustline-missing";
  if (!i.user.usdc.authorized) return "user-trustline-unauthorized";
  if (i.user.usdc.balance < i.usdcSpend + i.amount) return "insufficient-balance";
  if (i.user.xlmAvailable < i.fee + (i.xlmSpend ?? 0n)) return "insufficient-balance";
  return null;
}
