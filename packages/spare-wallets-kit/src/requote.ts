import { Asset, Transaction, TransactionBuilder, type Operation } from "@stellar/stellar-sdk";

/**
 * True when the re-quoted tx makes exactly the donation the donor approved: same source, fee,
 * memo and purchase operations, and a final XLM -> USDC path payment with the same destination,
 * received asset, received amount and sendMax cap. Only the intermediate path may differ (it comes
 * from the fresh quote). Anything unparseable is false: the caller then fails closed.
 */
export function sameDonation(shownXdr: string, freshXdr: string, passphrase: string): boolean {
  try {
    const a = TransactionBuilder.fromXDR(shownXdr, passphrase);
    const b = TransactionBuilder.fromXDR(freshXdr, passphrase);
    if (!(a instanceof Transaction) || !(b instanceof Transaction)) return false;
    if (a.source !== b.source || a.fee !== b.fee || a.sequence !== b.sequence) return false;
    if (a.memo.type !== b.memo.type || String(a.memo.value ?? "") !== String(b.memo.value ?? "")) return false;
    if (a.operations.length !== b.operations.length || a.operations.length === 0) return false;
    // The app's own operations must be untouched (parsed fields, assets as CODE:ISSUER).
    const plain = (op: unknown) => JSON.stringify(op, (_k, v: unknown) =>
      v instanceof Asset ? v.toString() : typeof v === "bigint" ? v.toString() : v);
    for (let i = 0; i < a.operations.length - 1; i++) {
      if (plain(a.operations[i]) !== plain(b.operations[i])) return false;
    }
    const x = a.operations.at(-1) as Operation.PathPaymentStrictReceive;
    const y = b.operations.at(-1) as Operation.PathPaymentStrictReceive;
    return x.type === "pathPaymentStrictReceive" && y.type === "pathPaymentStrictReceive"
      && x.destination === y.destination && x.destAsset.equals(y.destAsset) && x.destAmount === y.destAmount
      && x.sendAsset.isNative() && y.sendAsset.isNative() && x.sendMax === y.sendMax
      && x.source === y.source;
  } catch {
    return false;
  }
}
