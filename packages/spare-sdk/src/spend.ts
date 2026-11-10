import type { Asset, Transaction } from "@stellar/stellar-sdk";
import { toStroops } from "./amount.js";
import { USDC_CODE, USDC_ISSUER } from "./constants.js";

export const isCircleUsdc = (a: Asset): boolean =>
  a.getCode() === USDC_CODE && a.getIssuer() === USDC_ISSUER;

export interface Spend {
  /** Circle-USDC the tx can spend, stroops (an upper bound for strictReceive). */
  usdc: bigint;
  /** Native XLM the tx can spend through payments, path payments, offers and createAccount, stroops. */
  xlm: bigint;
  /** True if the tx also spends or does anything not modelled as Circle USDC (XLM, lookalikes, unknown ops). */
  other: boolean;
  /** True when the USDC spend is only a ceiling (pathPaymentStrictReceive): round-up cannot know it. */
  uncertain: boolean;
  /** True when an op can spend funds in a way Spare does not model. Never guess: offer nothing. */
  unsupported: boolean;
}

/** Ops that move no funds out of the source for our purposes. */
const NO_SPEND = new Set([
  "changeTrust", "allowTrust", "setTrustLineFlags", "setOptions", "manageData", "bumpSequence",
  "claimClaimableBalance", "beginSponsoringFutureReserves", "endSponsoringFutureReserves",
  "revokeSponsorship",
]);

/** Ops that can spend USDC/XLM in ways we do not model (amounts depend on the book, a pool or the whole balance). */
const UNSUPPORTED = new Set([
  "manageBuyOffer", "createClaimableBalance", "liquidityPoolDeposit", "accountMerge",
]);

/**
 * What the tx's operations spend. Modelled: payment, createAccount, path payments and sell offers.
 * Ops that can spend but are not modelled are flagged `unsupported`; any other unknown op type
 * sets `other` so a purchase is never mistaken for a pure USDC one.
 */
export function analyzeSpend(ops: Transaction["operations"]): Spend {
  const s: Spend = { usdc: 0n, xlm: 0n, other: false, uncertain: false, unsupported: false };
  const add = (asset: Asset, amount: string) => {
    const v = toStroops(amount) ?? 0n;
    if (isCircleUsdc(asset)) s.usdc += v;
    else {
      s.other = true;
      if (asset.isNative()) s.xlm += v;
    }
  };
  for (const op of ops) {
    switch (op.type) {
      case "payment": add(op.asset, op.amount); break;
      case "pathPaymentStrictSend": add(op.sendAsset, op.sendAmount); break;
      case "pathPaymentStrictReceive":
        add(op.sendAsset, op.sendMax);
        s.uncertain = true;
        break;
      case "manageSellOffer":
      case "createPassiveSellOffer": add(op.selling, op.amount); break;
      case "createAccount":
        s.other = true;
        s.xlm += toStroops(op.startingBalance) ?? 0n;
        break;
      default:
        if (UNSUPPORTED.has(op.type)) s.unsupported = true;
        else if (!NO_SPEND.has(op.type)) s.other = true;
    }
  }
  return s;
}
