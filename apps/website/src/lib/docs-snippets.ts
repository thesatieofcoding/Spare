import type { Lang } from "../i18n/utils";

/** Same line as packages/spare-wallets-kit/README.md (a test keeps them in sync). */
export const INSTALL_COMMAND =
  "pnpm add spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk";

export function kitSnippet(locale: Lang): string {
  return `import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { Networks } from "@stellar/stellar-sdk";
import { HorizonAccountPort } from "spare-sdk";
import { withSpare } from "spare-wallets-kit";

const spare = withSpare(StellarWalletsKit, {
  foundation: { account: "G...", domain: "foundation.org" }, // listed in its stellar.toml
  foundationName: "Tellus Cooperative",
  mode: { amount: "0.50" }, // or { roundUp: true } for USDC purchases
  appId: "my-app", // <= 22 ASCII bytes
  maxAmount: "5",
  accounts: new HorizonAccountPort("https://horizon.stellar.org"),
  networkPassphrase: Networks.PUBLIC,
  locale: "${locale}",
});

// Same signature as the kit: use it wherever you called kit.signTransaction.
const { signedTxXdr } = await spare.signTransaction(xdr, { address });`;
}

export const soroban = `// A Soroban tx holds one operation: the donation is a separate payment after success.
const follow = await spare.offerFollowUp({ successful: true, sourceAccount: address, hash });
if (follow.status === "signed") await submit(follow.signedTxXdr); // submitting is your job`;
