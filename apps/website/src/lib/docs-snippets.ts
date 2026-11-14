import type { Lang } from "../i18n/utils";

/** Same line as packages/spare-wallets-kit/README.md (a test keeps them in sync). */
export const INSTALL_COMMAND =
  "pnpm add spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk";

export const INSTALL_NPM =
  "npm install spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk";
export const INSTALL_YARN =
  "yarn add spare-wallets-kit spare-sdk @creit.tech/stellar-wallets-kit @stellar/stellar-sdk";

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


/** Item of the quick start: sign through the kit, read `outcome`, then submit. */
export const signWithDonationSnippet = `const result = await spare.signWithDonation(xdr, { address });

// result.outcome: "donated" | "declined" | "not-offered" | "passthrough" | "error"
// result.changed is true only for "donated" (the hash changed); result.donation has the details.
// For the other outcomes the original tx was signed; result.reason says why (when there is one).
if (result.outcome === "donated") console.log("Donated", result.donation!.amount, "USDC");
else console.log(result.outcome, result.reason ?? "");

// Submitting is your job: send result.signedTxXdr as it is (it may carry a different hash).
const signed = TransactionBuilder.fromXDR(result.signedTxXdr, Networks.TESTNET);
await server.submitTransaction(signed);`;

/** Same text as examples/quickstart/src/testnet-fund.ts (a test keeps them in sync). */
export const testnetFundSnippet = `import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const keypair = Keypair.fromSecret(process.env.SECRET!); // a testnet secret key (S...)
const usdc = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"); // Circle testnet

// 1. Friendbot funds the account with testnet XLM (skip if it already has some).
await fetch(\`https://friendbot.stellar.org?addr=\${keypair.publicKey()}\`);

// 2. Trust Circle's testnet USDC, then swap XLM for exactly 5 USDC on the testnet DEX.
const tx = new TransactionBuilder(await server.loadAccount(keypair.publicKey()), {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.changeTrust({ asset: usdc }))
  .addOperation(
    Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax: "500", // XLM you are willing to spend
      destination: keypair.publicKey(),
      destAsset: usdc,
      destAmount: "5",
    }),
  )
  .setTimeout(60)
  .build();
tx.sign(keypair);
console.log("funded:", (await server.submitTransaction(tx)).hash);`;

/** Same text as examples/quickstart/src/testnet-donate.ts (a test keeps them in sync). */
export const testnetDonateSnippet = `import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { HorizonAccountPort } from "spare-sdk";
import { withSpare } from "spare-wallets-kit";

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const keypair = Keypair.fromSecret(process.env.SECRET!); // a testnet secret key (S...)

// 1. The transaction your app already builds: pay 1 XLM to a (freshly funded) merchant.
const merchant = Keypair.random();
await fetch(\`https://friendbot.stellar.org?addr=\${merchant.publicKey()}\`);
const tx = new TransactionBuilder(await server.loadAccount(keypair.publicKey()), {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.payment({ destination: merchant.publicKey(), asset: Asset.native(), amount: "1" }))
  .setTimeout(60)
  .build();

// 2. A headless "wallet". The kit only needs a signTransaction(xdr, opts) that returns { signedTxXdr }.
const signer = {
  async signTransaction(xdr: string, opts?: { networkPassphrase?: string }) {
    const toSign = TransactionBuilder.fromXDR(xdr, opts?.networkPassphrase ?? Networks.TESTNET);
    toSign.sign(keypair);
    return { signedTxXdr: toSign.toXDR() };
  },
};

// 3. Spare wraps it. A custom \`confirm\` replaces the browser modal: return true only on an explicit yes.
const spare = withSpare(signer, {
  foundation: { account: "GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ", domain: "donatespare.xyz" },
  foundationName: "Spare demo foundation",
  mode: { amount: "0.50" },
  appId: "quickstart",
  maxAmount: "5",
  accounts: new HorizonAccountPort({ network: "testnet" }),
  network: "testnet",
  confirm: async (prompt) => {
    console.log(\`Add US$\${prompt.amount} for \${prompt.foundationName}? (auto-yes in this demo)\`);
    return true;
  },
});

// Pass the passphrase so the kit can parse the XDR.
const result = await spare.signWithDonation(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
console.log(result.outcome, result.reason ?? "", "changed:", result.changed);
// "donated": changed is true and the signed tx carries the donation.
// "declined" | "not-offered" | "passthrough" | "error": the original tx was signed.

// 4. Submitting is your job.
const signed = TransactionBuilder.fromXDR(result.signedTxXdr, Networks.TESTNET);
console.log("submitted:", (await server.submitTransaction(signed)).hash);`;
