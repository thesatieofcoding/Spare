// End-to-end Node example from the docs: build a payment, add a Spare donation, sign, submit.
// Typechecked in CI, not run (it needs the network). The region must equal the docs snippet;
// apps/website/test/docs-snippets.test.ts checks it.

// #region testnet-donate
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { HorizonAccountPort } from "spare-sdk";
import { withSpare } from "spare-wallets-kit";

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const keypair = Keypair.fromSecret(process.env.SECRET!); // a testnet secret key (S...)

// 1. The transaction your app already builds: pay 1 XLM to a (freshly funded) merchant.
const merchant = Keypair.random();
await fetch(`https://friendbot.stellar.org?addr=${merchant.publicKey()}`);
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

// 3. Spare wraps it. A custom `confirm` replaces the browser modal: return true only on an explicit yes.
const spare = withSpare(signer, {
  foundation: { account: "GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ", domain: "donatespare.xyz" },
  foundationName: "Spare demo foundation",
  mode: { amount: "0.50" },
  appId: "quickstart",
  maxAmount: "5",
  accounts: new HorizonAccountPort({ network: "testnet" }),
  network: "testnet",
  confirm: async (prompt) => {
    console.log(`Add US$${prompt.amount} for ${prompt.foundationName}? (auto-yes in this demo)`);
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
console.log("submitted:", (await server.submitTransaction(signed)).hash);
// #endregion testnet-donate
