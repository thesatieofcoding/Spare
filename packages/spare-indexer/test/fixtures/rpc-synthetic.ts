import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

/** Synthetic RPC getEvents rows built from real ScVal shapes (registry events had none in testnet retention). */
const sym = (s: string): string => nativeToScVal(s, { type: "symbol" }).toXDR("base64");
const addr = (a: string): string => new Address(a).toScVal().toXDR("base64");
const str = (s: string): xdr.ScVal => xdr.ScVal.scvString(s);

export interface RawEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  txHash: string;
  operationIndex: number;
  inSuccessfulContractCall: boolean;
  topic: string[];
  value: string;
}

const base = (id: string, ledger: number, contractId: string): Omit<RawEvent, "topic" | "value"> => ({
  id,
  ledger,
  ledgerClosedAt: "2026-11-14T16:14:07Z",
  contractId,
  txHash: "cd".repeat(32),
  operationIndex: 0,
  inSuccessfulContractCall: true,
});

/** Contract event shape: topics ("spare", kind, account), data Vec[name, website]. */
export function registryEvent(o: { id: string; ledger: number; contractId: string; kind: string; account: string; name?: string; website?: string }): RawEvent {
  return {
    ...base(o.id, o.ledger, o.contractId),
    topic: [sym("spare"), sym(o.kind), addr(o.account)],
    value: xdr.ScVal.scvVec([str(o.name ?? "Fund"), str(o.website ?? "fund.org")]).toXDR("base64"),
  };
}

export const cursorAt = (ledger: number): string => `${(BigInt(ledger) << 32n).toString().padStart(19, "0")}-4294967295`;
