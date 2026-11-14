// Stand-ins for what an app already has when it reaches the quickstart: an unsigned transaction
// (`xdr`) and the connected account (`address`). Testnet, because the quickstart uses "testnet".
import { Account, Asset, BASE_FEE, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

export const NETWORK_PASSPHRASE = Networks.TESTNET;
// Not imported from spare-sdk: the test mocks that module and its factory loads this file.
// The test asserts this equals NETWORKS.testnet.usdcIssuer.
export const TESTNET_USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

const user = Keypair.random();
export const merchant = Keypair.random();
/** The docs show "G..." for the foundation; tests swap this account in (see quickstart.test.ts). */
export const FOUNDATION_ACCOUNT = Keypair.random().publicKey();

export const address = user.publicKey();
export const xdr = new TransactionBuilder(new Account(address, "100"), {
  fee: BASE_FEE,
  networkPassphrase: NETWORK_PASSPHRASE,
})
  .setTimeout(60)
  .addOperation(Operation.payment({ destination: merchant.publicKey(), asset: TESTNET_USDC, amount: "4.20" }))
  .build()
  .toXDR();
