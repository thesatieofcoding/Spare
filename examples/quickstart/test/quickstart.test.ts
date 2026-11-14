import { Operation, Transaction } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { NETWORKS } from "spare-sdk";
import { FOUNDATION_ACCOUNT, NETWORK_PASSPHRASE, TESTNET_USDC, address, merchant, xdr } from "../src/fixture.js";

// Fakes only: no network, no real wallet. The quickstart file itself is the docs snippet, untouched.
const wallet = vi.hoisted(() => ({
  signTransaction: vi.fn(async (signedXdr: string) => ({ signedTxXdr: signedXdr })),
}));
vi.mock("@creit.tech/stellar-wallets-kit", () => ({ StellarWalletsKit: wallet }));

vi.mock("spare-sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("spare-sdk")>();
  const fx = await import("../src/fixture.js");
  const snap = (usdc: bigint) => ({
    sequence: "100",
    xlmAvailable: 1_000_000_000n,
    usdc: { balance: usdc, authorized: true, headroom: 10n ** 13n },
    masterWeight: 1,
    thresholds: { low: 0, medium: 0, high: 0 },
    memoRequired: false,
  });
  class FakeHorizonAccountPort {
    readonly network = "testnet" as const;
    constructor(_opts: unknown) {}
    async loadAccount(id: string) {
      if (id === fx.address) return snap(10_000_000_000n);
      if (id === fx.FOUNDATION_ACCOUNT) return snap(0n);
      return null;
    }
  }
  return {
    ...real,
    HorizonAccountPort: FakeHorizonAccountPort,
    // The docs show the placeholder "G...": swap in the fixture foundation at this seam only.
    addDonation: (tx: unknown, opts: { foundation: object }) =>
      (real.addDonation as (t: unknown, o: unknown) => unknown)(tx, {
        ...opts,
        foundation: { ...opts.foundation, account: fx.FOUNDATION_ACCOUNT },
      }),
  };
});

vi.stubGlobal("fetch", async () => new Response(`ACCOUNTS = ["${FOUNDATION_ACCOUNT}"]\n`, { status: 200 }));

/** Accept the Spare confirmation as the user would (the modal ignores clicks for 400 ms). */
async function acceptModal() {
  const host = await vi.waitFor(() => {
    const el = document.querySelector("[data-spare-confirm]");
    if (!el) throw new Error("no modal yet");
    return el;
  });
  await new Promise((r) => setTimeout(r, 450));
  host.shadowRoot!.querySelector<HTMLButtonElement>("[data-action=primary]")!.click();
}

describe("docs quickstart, run against fakes", () => {
  it("fixture USDC is the SDK testnet issuer", () => {
    expect(TESTNET_USDC.issuer).toBe(NETWORKS.testnet.usdcIssuer);
  });

  it("signs a transaction with the donation appended and the spare memo set", async () => {
    const accepted = acceptModal();
    const { signedTxXdr } = await import("../src/quickstart.js");
    await accepted;

    expect(wallet.signTransaction).toHaveBeenCalledTimes(1);
    expect(signedTxXdr).not.toBe(xdr);
    const tx = new Transaction(signedTxXdr, NETWORK_PASSPHRASE);
    expect(tx.operations).toHaveLength(2);
    const original = new Transaction(xdr, NETWORK_PASSPHRASE).operations[0] as Operation.Payment;
    expect(tx.operations[0]).toMatchObject({ type: "payment", destination: merchant.publicKey(), amount: original.amount });
    expect(tx.operations[1]).toMatchObject({
      type: "payment",
      destination: FOUNDATION_ACCOUNT,
      amount: "0.5000000",
      asset: { code: "USDC", issuer: TESTNET_USDC.issuer },
    });
    expect(Buffer.from(tx.memo.value as Uint8Array).toString()).toBe("spare:my-app");
    expect(Number(tx.fee)).toBeGreaterThan(Number(new Transaction(xdr, NETWORK_PASSPHRASE).fee));
  });
});
