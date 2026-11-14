import type { Lang } from "../i18n/utils";

/** Same line as packages/spare-wallets-kit/README.md (a test keeps them in sync). */
export const INSTALL_COMMAND =
  "pnpm add spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk";

export function kitSnippet(locale: Lang): string {
  return `import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { HorizonAccountPort } from "spare-sdk";
import { withSpare } from "spare-wallets-kit";

const network = "testnet"; // "mainnet" in production

const spare = withSpare(StellarWalletsKit, {
  foundation: { account: "G...", domain: "foundation.org" }, // listed in its stellar.toml
  foundationName: "Tellus Cooperative",
  mode: { amount: "0.50" }, // or { roundUp: true } for USDC purchases
  appId: "my-app", // <= 22 ASCII bytes
  maxAmount: "5",
  accounts: new HorizonAccountPort({ network }),
  network,
  locale: "${locale}",
});

// Same signature as the kit: use it wherever you called kit.signTransaction.
const { signedTxXdr } = await spare.signTransaction(xdr, { address });`;
}

export const soroban = `// A Soroban tx holds one operation: the donation is a separate payment after success.
const follow = await spare.offerFollowUp({ successful: true, sourceAccount: address, hash });
if (follow.status === "signed") await submit(follow.signedTxXdr); // submitting is your job`;


export const addDonationSnippet = `import { addDonation, HorizonAccountPort } from "spare-sdk";

const network = "testnet"; // "mainnet" in production

const result = await addDonation(unsignedTx, {
  foundation: { account: "G...", domain: "foundation.org" }, // must be listed in its stellar.toml
  amount: "0.50",            // or: roundUp: true (only when the purchase is USDC)
  appId: "my-app",           // <= 22 ASCII bytes, memo becomes "spare:my-app"
  maxAmount: "5",            // your cap per donation
  accounts: new HorizonAccountPort({ network }),
  network,
});

switch (result.status) {
  case "offered":      // ask the user "Add US$<result.donation.amount>?", then sign result.transaction
  case "not-offered":  // sign the original tx; result.reason says why (e.g. "insufficient-balance")
  case "passthrough":  // signed / fee-bump / multisig / extra signers / Soroban: sign the original tx
}`;

export const donateAfterSnippet = `import { donateAfter } from "spare-sdk";

const follow = await donateAfter(
  { successful: true, sourceAccount: userAccount, hash },
  { foundation, amount: "0.50", appId: "my-app", maxAmount: "5",
    accounts, network },
);
if (follow.status === "offered") { /* confirm, then sign follow.transaction */ }`;
