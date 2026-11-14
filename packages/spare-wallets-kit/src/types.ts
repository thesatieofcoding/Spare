import type { AccountPort, DonationInfo, FetchLike, Foundation, Network } from "spare-sdk";

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

/** Everything the confirmation step needs to show. No XDR, no addresses of the user. */
export interface DonationPrompt {
  /** Donation in USDC (7 decimals, e.g. "0.5000000"). */
  amount: string;
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
}

export type ConfirmFn = (prompt: DonationPrompt) => Promise<boolean>;

export interface SpareOptions {
  foundation: Foundation;
  /** Display name. Defaults to the foundation's domain. */
  foundationName?: string;
  /** Fixed donation, or round-up to the next whole dollar (USDC purchases only). */
  mode: { amount: string } | { roundUp: true };
  appId: string;
  /** Your cap per donation, in USDC. */
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
  /** Soroban follow-up amount. Defaults to the fixed `mode.amount`; required with round-up. */
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
