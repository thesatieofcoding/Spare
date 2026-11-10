import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  type Transaction,
  type xdr,
} from "@stellar/stellar-sdk";
import { USDC_ISSUER } from "../src/constants.js";
import type { AccountPort, AccountSnapshot, FetchLike } from "../src/ports.js";

export const PASSPHRASE = Networks.TESTNET;
export const USDC = new Asset("USDC", USDC_ISSUER);
export const FAKE_USDC = new Asset("USDC", Keypair.random().publicKey());

export const DOMAIN = "foundation.example";

export const user = Keypair.random();
export const foundationKp = Keypair.random();
export const merchant = Keypair.random();
export const FOUNDATION = { account: foundationKp.publicKey(), domain: DOMAIN };

export const stroops = (usdc: string): bigint => {
  const [i = "0", f = ""] = usdc.split(".");
  return BigInt(i) * 10_000_000n + BigInt(f.padEnd(7, "0"));
};

/** USDC trustline with plenty of headroom unless told otherwise. */
export function line(balance: bigint, authorized = true, headroom = stroops("1000000")): NonNullable<AccountSnapshot["usdc"]> {
  return { balance, authorized, headroom };
}

export function snapshot(over: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    sequence: "100",
    xlmAvailable: stroops("100"),
    usdc: line(stroops("1000"), true),
    masterWeight: 1,
    thresholds: { low: 0, medium: 0, high: 0 },
    memoRequired: false,
    ...over,
  };
}

export class FakeAccounts implements AccountPort {
  constructor(private readonly data = new Map<string, AccountSnapshot | null>()) {}
  set(id: string, s: AccountSnapshot | null): this {
    this.data.set(id, s);
    return this;
  }
  async loadAccount(id: string) {
    const s = this.data.get(id);
    if (s === undefined) throw new Error(`unexpected load ${id}`);
    return s;
  }
}

/** Happy-path world: funded user + foundation with an authorized USDC trustline. */
export function world() {
  return new FakeAccounts()
    .set(user.publicKey(), snapshot())
    .set(merchant.publicKey(), snapshot())
    .set(foundationKp.publicKey(), snapshot({ usdc: line(0n, true) }));
}

export function tomlFetch(accounts: string[], status = 200): FetchLike {
  return async () =>
    new Response(`ACCOUNTS = [${accounts.map((a) => `"${a}"`).join(", ")}]\n`, { status });
}
export const verifiedFetch = tomlFetch([foundationKp.publicKey()]);

export interface TxOpts {
  ops?: xdr.Operation[];
  memo?: Memo;
  fee?: string;
  source?: Keypair;
}

export function payUsdc(amount: string, asset: Asset = USDC): xdr.Operation {
  return Operation.payment({ destination: merchant.publicKey(), asset, amount });
}
export function payXlm(amount: string): xdr.Operation {
  return Operation.payment({ destination: merchant.publicKey(), asset: Asset.native(), amount });
}

export function buildTx({ ops = [payUsdc("4.20")], memo, fee = BASE_FEE, source = user }: TxOpts = {}): Transaction {
  const b = new TransactionBuilder(new Account(source.publicKey(), "100"), {
    fee,
    networkPassphrase: PASSPHRASE,
  }).setTimeout(60);
  for (const op of ops) b.addOperation(op);
  if (memo) b.addMemo(memo);
  return b.build();
}

/** Text memo value as a string (stellar-sdk exposes it as bytes). */
export const memoText = (tx: Transaction): string => Buffer.from(tx.memo.value as Uint8Array).toString();
