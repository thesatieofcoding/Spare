/**
 * Real adapters for the demo ports: Stellar Wallets Kit, Horizon, Soroban RPC and stellar-sdk
 * transaction building. This is the only module that imports those libraries as values, and
 * `main.ts` only reaches it through a dynamic import() on the first Connect, so no other page
 * (and not the demo page's initial load) ever downloads them. Covered by a build-output check
 * plus manual wallet testing; the logic around it is tested with fakes.
 */
import { Address, Asset, Horizon, Operation, TransactionBuilder, nativeToScVal, rpc } from "@stellar/stellar-sdk";
import { StellarWalletsKit, type Networks as KitNetworks } from "@creit.tech/stellar-wallets-kit";
import { VarialModule } from "@creit.tech/stellar-wallets-kit/modules/varial";
import { LobstrModule } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { HorizonAccountPort, NETWORKS } from "spare-sdk";
import { withSpare, type SignerLike } from "spare-wallets-kit";
import type { DemoNetwork } from "./config";
import { PortError, type NetworkPorts, type PaymentRequest, type TxStatus } from "./ports";

const TESTNET_RPC = "https://soroban-testnet.stellar.org";
const APP_ID = "spare-demo";
const FOLLOW_UP_AMOUNT = "0.50";
const MAX_DONATION = "5";

const messageOf = (e: unknown): string =>
  typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : String(e);

/** "2.35" -> 23500000n (USDC has 7 decimals on Stellar). */
const toStroops = (amount: string): bigint => {
  const [whole = "0", frac = ""] = amount.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, "0").slice(0, 7));
};

/**
 * The Ledger module's hardware libraries expect a global Buffer. Browsers do not have one, so
 * the demo (and only the demo) installs the `buffer` package before loading that module.
 */
async function loadLedger(): Promise<InstanceType<typeof import("@creit.tech/stellar-wallets-kit/modules/ledger").LedgerModule> | null> {
  try {
    const g = globalThis as { Buffer?: unknown };
    g.Buffer ??= (await import("buffer")).Buffer;
    const { LedgerModule } = await import("@creit.tech/stellar-wallets-kit/modules/ledger");
    return new LedgerModule();
  } catch (e) {
    console.warn("Ledger support unavailable", e);
    return null;
  }
}

let kitReady: Promise<void> | null = null;
function initKit(passphrase: string): Promise<void> {
  kitReady ??= (async () => {
    const ledger = await loadLedger();
    StellarWalletsKit.init({
      modules: [new VarialModule(), new LobstrModule(), ...(ledger ? [ledger] : [])],
      network: passphrase as KitNetworks,
    });
  })();
  return kitReady;
}

const signer: SignerLike = {
  async signTransaction(xdr, opts) {
    try {
      return await StellarWalletsKit.signTransaction(xdr, opts);
    } catch (e) {
      throw new PortError("signature-rejected", messageOf(e));
    }
  },
  get selectedModule() {
    return StellarWalletsKit.selectedModule;
  },
};

export async function createPorts(network: DemoNetwork): Promise<NetworkPorts> {
  const cfg = NETWORKS[network];
  const passphrase = cfg.passphrase;
  const usdc = new Asset("USDC", cfg.usdcIssuer);
  const horizon = new Horizon.Server(cfg.horizonUrl);
  const rpcUrl = network === "testnet" ? TESTNET_RPC : (import.meta.env.PUBLIC_SPARE_MAINNET_RPC_URL as string | undefined)?.trim();
  const server = rpcUrl ? new rpc.Server(rpcUrl) : null;
  const parse = (xdr: string) => TransactionBuilder.fromXdr(xdr, passphrase);

  const buildTx = async (req: PaymentRequest, op: ReturnType<typeof Operation.payment>): Promise<string> => {
    const account = await horizon.loadAccount(req.source);
    return new TransactionBuilder(account, { fee: "100", networkPassphrase: passphrase })
      .addOperation(op).setTimeout(300).build().toXdr();
  };

  return {
    passphrase,
    wallet: {
      async connect() {
        try {
          await initKit(passphrase);
          StellarWalletsKit.setNetwork(passphrase as KitNetworks);
          const { address } = await StellarWalletsKit.authModal();
          const wallet = StellarWalletsKit.selectedModule.productId === "LEDGER" ? "ledger" : "classic";
          return { address, wallet };
        } catch (e) {
          const message = messageOf(e);
          throw new PortError(/not (installed|available|found)|no wallet/i.test(message) ? "no-wallet" : "connect-rejected", message);
        }
      },
    },
    horizon: {
      async submit(signedXdr) {
        try {
          const res = await horizon.submitTransaction(parse(signedXdr));
          return { hash: res.hash };
        } catch (e) {
          const codes = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } }).response?.data?.extras?.result_codes;
          throw new PortError("submit-failed", codes ? JSON.stringify(codes) : messageOf(e), !codes);
        }
      },
      async lookup(signedXdr) {
        try {
          const rec = await horizon.transactions().transaction(Array.from(parse(signedXdr).hash(), (b) => b.toString(16).padStart(2, "0")).join("")).call();
          return rec.successful ? { hash: rec.hash } : null;
        } catch (e) {
          if ((e as { response?: { status?: number } }).response?.status === 404) return null;
          throw e;
        }
      },
    },
    rpc: server && {
      async prepare(xdr) {
        try {
          return (await server.prepareTransaction(parse(xdr) as never)).toXdr();
        } catch (e) {
          throw new PortError("simulation-failed", messageOf(e));
        }
      },
      async send(signedXdr) {
        try {
          const res = await server.sendTransaction(parse(signedXdr) as never);
          if (res.status === "ERROR" || res.status === "TRY_AGAIN_LATER") throw new Error(res.status);
          return { hash: res.hash };
        } catch (e) {
          throw new PortError("submit-failed", messageOf(e));
        }
      },
      async getStatus(hash): Promise<TxStatus> {
        return (await server.getTransaction(hash)).status as TxStatus;
      },
      async getLedger(hash) {
        const res = await server.getTransaction(hash);
        return "ledger" in res ? res.ledger : undefined;
      },
    },
    builder: {
      buildClassicPayment: (req) =>
        buildTx(req, Operation.payment({ destination: req.destination, asset: usdc, amount: req.amount })),
      buildSorobanTransfer: (req) =>
        buildTx(req, Operation.invokeContractFunction({
          contract: usdc.contractId(passphrase),
          function: "transfer",
          args: [
            new Address(req.source).toScVal(),
            new Address(req.destination).toScVal(),
            nativeToScVal(toStroops(req.amount), { type: "i128" }),
          ],
        })),
    },
    createSpare: (foundation) =>
      withSpare(signer, {
        foundation: { account: foundation.account, domain: foundation.domain },
        foundationName: foundation.name,
        mode: { roundUp: true },
        followUpAmount: FOLLOW_UP_AMOUNT,
        appId: APP_ID,
        maxAmount: MAX_DONATION,
        accounts: new HorizonAccountPort({ network }),
        network,
        locale: document.documentElement.lang === "es" ? "es" : "en",
      }),
  };
}
