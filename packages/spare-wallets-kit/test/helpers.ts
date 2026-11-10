import {
  Account, Asset, BASE_FEE, Keypair, Memo, Networks, Operation, TransactionBuilder, type Transaction,
} from "@stellar/stellar-sdk";
import { vi } from "vitest";
import type { AccountPort, AccountSnapshot, FetchLike } from "spare-sdk";
import type { DonationPrompt, SignerLike } from "../src/index.js";

export const PASSPHRASE = Networks.TESTNET;
export const USDC = new Asset("USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
export const user = Keypair.random();
export const foundationKp = Keypair.random();
export const merchant = Keypair.random();
export const FOUNDATION = { account: foundationKp.publicKey(), domain: "foundation.example" };

const stroops = (usdc: string) => {
  const [i = "0", f = ""] = usdc.split(".");
  return BigInt(i) * 10_000_000n + BigInt(f.padEnd(7, "0"));
};

const snapshot = (over: Partial<AccountSnapshot> = {}): AccountSnapshot => ({
  sequence: "100",
  xlmAvailable: stroops("100"),
  usdc: { balance: stroops("1000"), authorized: true, headroom: stroops("1000000") },
  masterWeight: 1,
  thresholds: { low: 0, medium: 0, high: 0 },
  memoRequired: false,
  ...over,
});

export function world(): AccountPort {
  const data = new Map<string, AccountSnapshot>([
    [user.publicKey(), snapshot()],
    [merchant.publicKey(), snapshot()],
    [foundationKp.publicKey(), snapshot({ usdc: { balance: 0n, authorized: true, headroom: stroops("1000000") } })],
  ]);
  return { loadAccount: async (id) => data.get(id) ?? null };
}

export const verifiedFetch: FetchLike = async () =>
  new Response(`ACCOUNTS = ["${foundationKp.publicKey()}"]\n`, { status: 200 });

export function buildPathTx(sendAmount: string): Transaction {
  return new TransactionBuilder(new Account(user.publicKey(), "100"), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .setTimeout(60)
    .addOperation(Operation.pathPaymentStrictSend({
      sendAsset: USDC, sendAmount, destination: merchant.publicKey(), destAsset: Asset.native(), destMin: "1",
    }))
    .build();
}

export function buildTx(opts: { usdc?: string; memo?: Memo } = {}): Transaction {
  const b = new TransactionBuilder(new Account(user.publicKey(), "100"), {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  }).setTimeout(60);
  b.addOperation(Operation.payment({ destination: merchant.publicKey(), asset: USDC, amount: opts.usdc ?? "4.20" }));
  if (opts.memo) b.addMemo(opts.memo);
  return b.build();
}

/** Fake wallet kit: "signs" by prefixing the XDR so tests can see exactly what was signed. */
export function fakeKit(extra: Partial<SignerLike> = {}) {
  const signTransaction = vi.fn(async (xdr: string, _opts?: unknown) => ({
    signedTxXdr: `signed:${xdr}`,
    signerAddress: user.publicKey(),
  }));
  return Object.assign({ signTransaction }, extra) as SignerLike & { signTransaction: typeof signTransaction };
}

export const baseOptions = (over: Record<string, unknown> = {}) => ({
  foundation: FOUNDATION,
  foundationName: "Fundación Ejemplo",
  mode: { amount: "0.50" },
  appId: "demo-app",
  maxAmount: "5",
  accounts: world(),
  fetch: verifiedFetch,
  networkPassphrase: PASSPHRASE,
  ...over,
});

export const yes = vi.fn(async (_p: DonationPrompt) => true);
