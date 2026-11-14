import type { AccountPort, DonationInfo, FetchLike, Foundation, Network, PathQuotePort, PayWith } from "spare-sdk";

export type { PayWith };

export type Locale = "en" | "es";
export type Theme = "light" | "dark" | "auto";
export type WalletKind = "classic" | "soroban" | "ledger";

/** Options understood by `signTransaction` in Stellar Wallets Kit (v1 and v2). */
export interface SignOptions {
  networkPassphrase?: string;
  address?: string;
  path?: string;
}

export interface SignResult {
  signedTxXdr: string;
  signerAddress?: string;
}

/**
 * The minimum a wallet kit must offer. Satisfied by a Stellar Wallets Kit v1 instance and by
 * the v2 `StellarWalletsKit` class (static API), and by plain fakes in tests.
 */
export interface SignerLike {
  signTransaction(xdr: string, opts?: SignOptions): Promise<SignResult>;
  /** Optional. v2 exposes the active wallet module here; `productId` identifies Ledger. */
  readonly selectedModule?: { readonly productId?: string };
}

/** What the donor picked in the confirmation step: an amount in USD (or round-up) and a pay asset. */
export type DonationChoice =
  | { amount: string; roundUp?: never; payWith: PayWith }
  | { roundUp: true; amount?: never; payWith: PayWith };

/** Result of evaluating a choice: the same checks the SDK runs before offering anything. */
export type ChoiceCheck =
  | {
      status: "offered";
      /** USD amount the foundation receives, in USDC (7 decimals). */
      amount: string;
      payWith: PayWith;
      /** XLM only: the most XLM the donor can spend (quote + margin), 7 decimals. */
      xlmSendMax?: string;
      purchaseTotal?: string;
      roundUpTotal?: string;
    }
  | { status: "not-offered"; reason: string };

/** Interactive part of the prompt: what the donor may pick, and how to evaluate a pick. */
export interface DonationChoices {
  /** Preset amounts in USD, ascending, already within [min, max]. */
  presets: string[];
  /** Smallest amount accepted, in USD ("0.01"). */
  min: string;
  /** App cap per donation, in USD. */
  max: string;
  /** Whether round-up is available (USDC purchase only; never on the Soroban follow-up). */
  roundUp: boolean;
  /** Pay assets the app enabled ("xlm" only when a quote port was given). */
  payWith: PayWith[];
  /** The choice the prompt's own fields describe. */
  selected: DonationChoice;
  /** Evaluate a choice without changing what will be signed. */
  check(choice: DonationChoice): Promise<ChoiceCheck>;
  /**
   * Evaluate a choice and make it the one signed if confirm resolves true. If the latest
   * selection is not offered, a true answer is treated as declined: nothing is added.
   */
  select(choice: DonationChoice): Promise<ChoiceCheck>;
}

/** Everything the confirmation step needs to show. No XDR, no addresses of the user. */
export interface DonationPrompt {
  /** Donation in USD, received by the foundation as USDC (7 decimals, e.g. "0.5000000"). */
  amount: string;
  /** What the donor pays with for the preselected choice. Absent means "usdc". */
  payWith?: PayWith;
  /** XLM only: the most XLM the donor can spend, 7 decimals. */
  xlmSendMax?: string;
  foundationName: string;
  foundationDomain: string;
  mode: "fixed" | "round-up";
  wallet: WalletKind;
  locale: Locale;
  /** True for the Soroban follow-up: the user will be asked to sign twice. */
  secondSignature: boolean;
  /** Round-up only: what the purchase costs before the donation, in USDC. */
  purchaseTotal?: string;
  /** Round-up only: the total the purchase rounds up to, in USDC. */
  roundUpTotal?: string;
  /** Present when the donor may change amount or pay asset before confirming. */
  choices?: DonationChoices;
}

export type ConfirmFn = (prompt: DonationPrompt) => Promise<boolean>;

export interface SpareOptions {
  foundation: Foundation;
  /** Display name. Defaults to the foundation's domain. */
  foundationName?: string;
  /**
   * Preselected donation: a fixed USD amount, or round-up to the next whole dollar (USDC purchases
   * only). Default: the smallest preset. A fixed amount is added to the presets.
   */
  mode?: { amount: string } | { roundUp: true };
  /** Preset amounts in USD offered in the confirmation step. Default ["0.10", "0.25", "0.50"]. */
  presets?: string[];
  /**
   * Enables paying the donation in XLM (path payment to USDC). The foundation still receives
   * Circle USDC. USDC stays the default when the donor holds enough of it.
   */
  quotes?: PathQuotePort;
  /** XLM margin over the quote, basis points (0-1000). Default 200 (2%). */
  slippageBps?: number;
  appId: string;
  /** Your cap per donation, in USD. */
  maxAmount: string;
  accounts: AccountPort;
  fetch?: FetchLike;
  baseFee?: string;
  /** Network the donation is made on. Defaults to "mainnet". Forwarded to the SDK, which checks the tx against it. */
  network?: Network;
  /** Used to parse XDR when `signTransaction` is not given one. Defaults to the passphrase of `network`; with neither, the tx is signed unchanged. */
  networkPassphrase?: string;
  /** Replaces the built-in modal. Return true only on an explicit yes. */
  confirm?: ConfirmFn;
  locale?: Locale;
  theme?: Theme;
  /** Wallet id (e.g. "LEDGER") or a getter. Defaults to `kit.selectedModule.productId`. */
  wallet?: string | (() => string | undefined);
  /** Soroban follow-up amount. Defaults to the fixed `mode.amount` (or the smallest preset); required with round-up. */
  followUpAmount?: string;
}

export type SignOutcome = "donated" | "declined" | "not-offered" | "passthrough" | "error";

export interface SignWithDonationResult extends SignResult {
  /** The donation that was signed, or null when the original tx was signed. */
  donation: DonationInfo | null;
  /** True when the signed tx is NOT the one the app passed in (its hash changed). */
  changed: boolean;
  outcome: SignOutcome;
  /** Spare reason code for not-offered / passthrough / error. */
  reason?: string;
}

export type FollowUpResult =
  | { status: "signed"; signedTxXdr: string; signerAddress?: string; donation: DonationInfo }
  | { status: "skipped"; reason: string };

export interface MainTxResult {
  successful: boolean;
  sourceAccount: string;
  hash?: string;
  /** Ledger the main tx closed in. Lets the follow-up wait until Horizon has caught up. */
  ledger?: number;
  /** Sequence the main tx used; alternative to `ledger`. */
  sequence?: string;
}

export interface SpareSigner {
  /** Same signature as the kit. Drop-in replacement. */
  signTransaction(xdr: string, opts?: SignOptions): Promise<SignResult>;
  /** Like `signTransaction`, but tells you whether the tx changed and what was donated. */
  signWithDonation(xdr: string, opts?: SignOptions): Promise<SignWithDonationResult>;
  /** Soroban path: after the main tx succeeded, offer and sign the follow-up payment. Submit it yourself. */
  offerFollowUp(main: MainTxResult, opts?: SignOptions): Promise<FollowUpResult>;
  /** Donation signed by the latest call, or null. */
  readonly lastDonation: DonationInfo | null;
}
