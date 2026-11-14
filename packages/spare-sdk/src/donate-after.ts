import {
  Account, Asset, Memo, Operation, Transaction, TransactionBuilder,
} from "@stellar/stellar-sdk";
import { formatStroops, parseUsdc, toStroops } from "./amount.js";
import { memoFor } from "./app-id.js";
import { USDC_CODE } from "./constants.js";
import { checkEligibility } from "./eligibility.js";
import { perOpFee } from "./fee.js";
import { isNetwork, NETWORKS } from "./network.js";
import { canSignAlone } from "./signing.js";
import type { AccountSnapshot } from "./ports.js";
import type { CommonOptions, DonationInfo, NotOfferedReason } from "./types.js";

/** Outcome of the user's main (Soroban) transaction. */
export interface MainTxResult {
  successful: boolean;
  /** Account that signed the main tx and will pay the donation. */
  sourceAccount: string;
  hash?: string;
}

export type DonateAfterOptions = CommonOptions & {
  /** Fixed amount in USDC. Round-up is not available on this path. */
  amount: string;
  /**
   * @deprecated Derived from `network`. If given, it must equal that network's passphrase,
   * else `not-offered` / `network-mismatch`.
   */
  networkPassphrase?: string | undefined;
  /** Seconds the follow-up tx stays valid. Default 300. */
  timeoutSeconds?: number;
};

export type DonateAfterResult =
  | {
      status: "offered";
      transaction: Transaction;
      donation: DonationInfo;
      fee: bigint;
      /** Always true: the UI must say so before the user accepts. */
      requiresSecondSignature: true;
    }
  | { status: "not-offered"; reason: NotOfferedReason };

/**
 * Soroban path: an InvokeHostFunction tx holds a single operation, so the donation is a separate
 * payment tx, built only after the main tx succeeded. Needs a second signature. Never throws for
 * ineligible input.
 */
export async function donateAfter(
  result: MainTxResult,
  opts: DonateAfterOptions,
): Promise<DonateAfterResult> {
  const no = (reason: NotOfferedReason): DonateAfterResult => ({ status: "not-offered", reason });
  if (!result.successful) return no("main-tx-not-successful");

  const networkName = opts.network ?? "mainnet";
  if (!isNetwork(networkName)) return no("invalid-options");
  const network = NETWORKS[networkName];
  if (opts.networkPassphrase !== undefined && opts.networkPassphrase !== network.passphrase) return no("network-mismatch");
  if (opts.accounts.network !== undefined && opts.accounts.network !== networkName) return no("network-mismatch");

  const amount = parseUsdc(opts.amount);
  if (amount === null) return no("invalid-amount");
  const baseFee = perOpFee(opts.baseFee);
  if (baseFee === null) return no("invalid-options");

  let user: AccountSnapshot | null;
  try {
    user = await opts.accounts.loadAccount(result.sourceAccount);
  } catch {
    return no("account-lookup-failed");
  }
  if (!user) return no("account-lookup-failed");

  // The follow-up is a single payment: medium threshold. If the master key is not enough the
  // user would need other signers, which this flow cannot collect.
  if (!canSignAlone(user, "medium")) return no("multisig");

  const reason = await checkEligibility({
    accounts: opts.accounts,
    ...(opts.fetch && { fetch: opts.fetch }),
    foundation: opts.foundation,
    appId: opts.appId,
    amount,
    cap: toStroops(opts.maxAmount),
    source: result.sourceAccount,
    user,
    usdcSpend: 0n, // the main tx already settled
    fee: baseFee,
  });
  if (reason) return no(reason);

  const tx = new TransactionBuilder(new Account(result.sourceAccount, user.sequence), {
    fee: baseFee.toString(),
    networkPassphrase: network.passphrase,
    memo: Memo.text(memoFor(opts.appId)),
  })
    .addOperation(
      Operation.payment({
        destination: opts.foundation.account,
        asset: new Asset(USDC_CODE, network.usdcIssuer),
        amount: formatStroops(amount),
      }),
    )
    .setTimeout(opts.timeoutSeconds ?? 300)
    .build();

  return {
    status: "offered",
    transaction: tx,
    fee: BigInt(tx.fee),
    requiresSecondSignature: true,
    donation: {
      amount: formatStroops(amount),
      amountStroops: amount,
      foundation: opts.foundation.account,
      attributed: true,
    },
  };
}
