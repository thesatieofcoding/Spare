// Testnet USDC funding recipe from the docs. Typechecked in CI, not run (it needs the network).
// Everything between the region markers must equal the docs snippet; apps/website/test/docs-snippets.test.ts checks it.

// #region testnet-fund
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const keypair = Keypair.fromSecret(process.env.SECRET!); // a testnet secret key (S...)
const usdc = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"); // Circle testnet

// 1. Friendbot funds the account with testnet XLM (skip if it already has some).
await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`);

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
console.log("funded:", (await server.submitTransaction(tx)).hash);
// #endregion testnet-fund
