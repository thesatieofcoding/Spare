// The quickstart from the docs, run by CI (see test/quickstart.test.ts). Everything between the
// region markers must equal the docs snippet; apps/website/test/docs-snippets.test.ts checks it.
import { address, xdr } from "./fixture.js";

// #region quickstart
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
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
  locale: "en",
});

// Same signature as the kit: use it wherever you called kit.signTransaction.
const { signedTxXdr } = await spare.signTransaction(xdr, { address });
// #endregion quickstart

export { signedTxXdr };
