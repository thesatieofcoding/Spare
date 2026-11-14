import {
  Account, Asset, Memo, Operation, Transaction, TransactionBuilder,
} from "@stellar/stellar-sdk";
import { formatStroops, parseUsdc, toStroops } from "./amount.js";
import { memoFor } from "./app-id.js";
import { MAX_TX_FEE, USDC_CODE } from "./constants.js";
import { checkEligibility } from "./eligibility.js";
import { perOpFee } from "./fee.js";
import { hasRequiredOptions } from "./options.js";
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
  /**
   * Ledger the main tx closed in (e.g. RPC `getTransaction().ledger`). With it, `donateAfter`
   * waits until Horizon has ingested that ledger before reading sequence and balance. Works for
   * sponsored txs too, where the donor's account entry is not touched.
   */
  ledger?: number;
  /**
   * Sequence number the main tx used. Only meaningful when the donor was the tx source (its
   * sequence was bumped): the account view must reach it. Extra signal next to `ledger`.
   */
  sequence?: string;
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
  /** Longest wait for the account view to reflect the main tx, in ms. Default 10000. */
  syncTimeoutMs?: number;
  /** Pause between account reads while waiting, in ms. Default 1000. */
  syncIntervalMs?: number;
  /** Injectable pause (tests). Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
};

const isSequence = (s: unknown): s is string => typeof s === "string" && /^\d{1,20}$/.test(s);

/**
 * Whether `s` already includes the main tx. When neither side can tell (no ledger/sequence in the
 * result, or a port that reports neither), assume yes: that is the previous behaviour.
 */
function reflectsMainTx(s: AccountSnapshot, main: MainTxResult): boolean {
  const byLedger = main.ledger !== undefined && s.ledger !== undefined;
  const bySeq = isSequence(main.sequence) && isSequence(s.sequence);
  if (!byLedger && !bySeq) return true;
  if (byLedger && (s.ledger as number) >= (main.ledger as number)) return true;
  return bySeq && BigInt(s.sequence) >= BigInt(main.sequence as string);
}

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
  if (!result?.successful) return no("main-tx-not-successful");
  if (!hasRequiredOptions(opts)) return no("invalid-options");

  const networkName = opts.network ?? "mainnet";
  if (!isNetwork(networkName)) return no("invalid-options");
  const network = NETWORKS[networkName];
  if (opts.networkPassphrase !== undefined && opts.networkPassphrase !== network.passphrase) return no("network-mismatch");
  if (opts.accounts.network !== undefined && opts.accounts.network !== networkName) return no("network-mismatch");

  const amount = parseUsdc(opts.amount);
  if (amount === null) return no("invalid-amount");
  const baseFee = perOpFee(opts.baseFee);
  if (baseFee === null || baseFee > MAX_TX_FEE) return no("invalid-options");

  // Horizon can lag the RPC that reported SUCCESS: building on a stale sequence gives tx_bad_seq,
  // and a stale balance misjudges eligibility. Wait (bounded), never submit stale data.
  const timeout = Number.isFinite(opts.syncTimeoutMs) ? Math.max(0, opts.syncTimeoutMs as number) : 10_000;
  const interval = Number.isFinite(opts.syncIntervalMs) && (opts.syncIntervalMs as number) > 0 ? (opts.syncIntervalMs as number) : 1000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let user: AccountSnapshot | null = null;
  for (let waited = 0; ; waited += interval) {
    try {
      user = await opts.accounts.loadAccount(result.sourceAccount);
    } catch {
      return no("account-lookup-failed");
    }
    if (!user) return no("account-lookup-failed");
    if (reflectsMainTx(user, result)) break;
    if (waited + interval > timeout) return no("account-not-synced");
    await sleep(interval);
  }

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
