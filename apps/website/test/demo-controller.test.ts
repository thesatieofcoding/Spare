import { describe, expect, it, vi } from "vitest";
import type { SpareSigner } from "spare-wallets-kit";
import { createDemoConfig, type DemoConfig } from "../src/demo/config";
import { createController, type DemoController } from "../src/demo/controller";
import type { DemoState } from "../src/demo/machine";
import { PortError, type NetworkPorts, type TxStatus } from "../src/demo/ports";

const FOUNDATION = "GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ";
const MERCHANT = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const PASS = "Test SDF Network ; September 2015";

const config = (merchant = true): DemoConfig =>
  createDemoConfig({ ...(merchant && { PUBLIC_SPARE_TESTNET_MERCHANT: MERCHANT }) });

interface Opts {
  spare?: Partial<SpareSigner>;
  signResult?: Awaited<ReturnType<SpareSigner["signWithDonation"]>>;
  statuses?: TxStatus[];
  rpc?: boolean;
  wallet?: () => Promise<{ address: string; wallet: "classic" | "soroban" | "ledger" }>;
  horizonSubmit?: (x: string) => Promise<{ hash: string }>;
  prepare?: (x: string) => Promise<string>;
  send?: (x: string) => Promise<{ hash: string }>;
  followUp?: SpareSigner["offerFollowUp"];
  cfg?: DemoConfig;
}

function setup(o: Opts = {}) {
  const submitted: string[] = [];
  const statuses = [...(o.statuses ?? ["SUCCESS"])];
  const signWithDonation = vi.fn(async (_xdr: string, _opts?: unknown) =>
    o.signResult ?? { signedTxXdr: "SIGNED_MOD", changed: true, outcome: "donated" as const,
      donation: { amount: "0.5000000", amountStroops: 5000000n, foundation: FOUNDATION, attributed: true } });
  const offerFollowUp = vi.fn(o.followUp ?? (async () => ({
    status: "signed" as const, signedTxXdr: "SIGNED_DONATION",
    donation: { amount: "0.5000000", amountStroops: 5000000n, foundation: FOUNDATION, attributed: true },
  })));
  const spare = { signWithDonation, offerFollowUp, signTransaction: vi.fn(), lastDonation: null, ...o.spare } as unknown as SpareSigner;
  const createSpare = vi.fn(() => spare);
  const ports: NetworkPorts = {
    passphrase: PASS,
    wallet: { connect: o.wallet ?? (async () => ({ address: USER, wallet: "classic" as const })) },
    horizon: { submit: o.horizonSubmit ?? (async (x) => { submitted.push(x); return { hash: x === "SIGNED_DONATION" ? "HDON" : "HMAIN" }; }) },
    rpc: o.rpc === false ? null : {
      prepare: o.prepare ?? (async (x) => `PREPARED(${x})`),
      send: o.send ?? (async () => ({ hash: "HSOR" })),
      getStatus: vi.fn(async () => statuses.shift() ?? "NOT_FOUND"),
    },
    builder: {
      buildClassicPayment: vi.fn(async () => "XDR_CLASSIC"),
      buildSorobanTransfer: vi.fn(async () => "XDR_SOROBAN"),
    },
    createSpare,
  };
  const loadPorts = vi.fn(async () => ports);
  const c = createController({
    config: o.cfg ?? config(), loadPorts, initialNetwork: "testnet",
    sleep: async () => {}, pollIntervalMs: 0, maxPolls: 3,
  });
  const states: DemoState[] = [];
  c.subscribe((s) => states.push(s));
  return { c, ports, loadPorts, spare, signWithDonation, offerFollowUp, createSpare, submitted, states };
}

const ready = async (o?: Opts) => { const t = setup(o); await t.c.connect(); return t; };
const statusTrail = (states: DemoState[]) => states.map((s) => s.status);

describe("availability / not configured", () => {
  it("reports missing merchant, then missing foundation (mainnet)", () => {
    const { c } = setup({ cfg: config(false) });
    expect(c.availability("testnet")).toEqual({ enabled: false, missing: "merchant" });
    expect(c.availability("mainnet")).toEqual({ enabled: false, missing: "foundation" });
    expect(setup().c.availability("testnet")).toEqual({ enabled: true, missing: null });
  });

  it("connect on an unconfigured network surfaces not-configured and never loads ports", async () => {
    const t = setup({ cfg: config(false) });
    await t.c.connect();
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "not-configured" });
    expect(t.loadPorts).not.toHaveBeenCalled();
  });

  it("mainnet with foundation+merchant unset is not-configured after switching", async () => {
    const t = setup();
    t.c.selectNetwork("mainnet");
    await t.c.connect();
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "not-configured", network: "mainnet" });
  });
});

describe("connect", () => {
  it("connects through the wallet port", async () => {
    const t = await ready();
    expect(t.c.getState()).toMatchObject({ status: "ready", address: USER, wallet: "classic", network: "testnet" });
  });

  it("maps no-wallet and rejected connects; retry works", async () => {
    for (const kind of ["no-wallet", "connect-rejected"] as const) {
      const t = setup({ wallet: async () => { throw new PortError(kind); } });
      await t.c.connect();
      expect(t.c.getState()).toMatchObject({ status: "error", reason: kind });
      t.c.retry();
      expect(t.c.getState().status).toBe("idle");
    }
  });

  it("an unknown wallet error becomes connect-rejected, never throws", async () => {
    const t = setup({ wallet: async () => { throw new Error("boom"); } });
    await expect(t.c.connect()).resolves.toBeUndefined();
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "connect-rejected" });
  });

  it("a failing port loader is reported, not thrown", async () => {
    const c = createController({ config: config(), loadPorts: async () => { throw new Error("chunk failed"); } });
    await c.connect();
    expect(c.getState()).toMatchObject({ status: "error", reason: "unexpected", detail: "chunk failed" });
  });
});

describe("classic flow", () => {
  it("happy path: builds user->merchant payment, signs with Spare, submits to Horizon", async () => {
    const t = await ready();
    await t.c.start("classic");
    expect(t.ports.builder.buildClassicPayment).toHaveBeenCalledWith({ source: USER, destination: MERCHANT, amount: "2.35" });
    expect(t.createSpare).toHaveBeenCalledWith(expect.objectContaining({ account: FOUNDATION, domain: "spare-vert.vercel.app" }), "classic");
    expect(t.signWithDonation).toHaveBeenCalledWith("XDR_CLASSIC", { address: USER, networkPassphrase: PASS });
    expect(t.submitted).toEqual(["SIGNED_MOD"]);
    expect(t.c.getState()).toMatchObject({
      status: "done", flow: "classic",
      result: { mainHash: "HMAIN", outcome: "donated", donationAmount: "0.5000000" },
    });
    expect(statusTrail(t.states)).toEqual(["connecting", "ready", "building", "signing", "submitting", "done"]);
  });

  it("declined: original is signed and submitted, outcome declined, no amount", async () => {
    const t = await ready({ signResult: { signedTxXdr: "SIGNED_ORIG", changed: false, donation: null, outcome: "declined" } });
    await t.c.start("classic");
    expect(t.submitted).toEqual(["SIGNED_ORIG"]);
    const s = t.c.getState();
    expect(s).toMatchObject({ status: "done", result: { outcome: "declined" } });
    expect(s.status === "done" && s.result.donationAmount).toBeUndefined();
  });

  it.each([
    ["not-offered", "user-trustline-missing"],
    ["not-offered", "insufficient-balance"],
    ["not-offered", "amount-over-cap"],
    ["not-offered", "foundation-not-verified"],
    ["passthrough", "multisig"],
  ] as const)("%s (%s): original proceeds, reason surfaced", async (outcome, reason) => {
    const t = await ready({ signResult: { signedTxXdr: "SIGNED_ORIG", changed: false, donation: null, outcome, reason } });
    await t.c.start("classic");
    expect(t.submitted).toEqual(["SIGNED_ORIG"]);
    expect(t.c.getState()).toMatchObject({ status: "done", result: { outcome, reason } });
  });

  it("a Spare-side error outcome fails closed as not-offered with the reason", async () => {
    const t = await ready({ signResult: { signedTxXdr: "SIGNED_ORIG", changed: false, donation: null, outcome: "error", reason: "boom" } });
    await t.c.start("classic");
    expect(t.c.getState()).toMatchObject({ status: "done", result: { outcome: "not-offered", reason: "boom" } });
  });

  it("the user rejecting the signature is signature-rejected and nothing is submitted", async () => {
    const t = await ready({ spare: { signWithDonation: vi.fn(async () => { throw new Error("User declined"); }) } });
    await t.c.start("classic");
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "signature-rejected" });
    expect(t.submitted).toEqual([]);
  });

  it("submit failure is submit-failed with detail", async () => {
    const t = await ready({ horizonSubmit: async () => { throw new PortError("submit-failed", "tx_bad_seq"); } });
    await t.c.start("classic");
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "submit-failed", detail: "tx_bad_seq" });
  });

  it("retry after an error returns to ready with the same account", async () => {
    const t = await ready({ horizonSubmit: async () => { throw new PortError("submit-failed"); } });
    await t.c.start("classic");
    t.c.retry();
    expect(t.c.getState()).toMatchObject({ status: "ready", address: USER });
  });

  it("start without a connection does nothing; without a merchant it is not-configured", async () => {
    const t = setup();
    await t.c.start("classic");
    expect(t.c.getState().status).toBe("idle");
    const u = setup({ cfg: config(false) });
    await u.c.start("classic");
    expect(u.c.getState()).toMatchObject({ status: "error", reason: "not-configured" });
  });

  it("Ledger wallet kind is passed to the Spare factory", async () => {
    const t = await ready({ wallet: async () => ({ address: USER, wallet: "ledger" }) });
    await t.c.start("classic");
    expect(t.createSpare).toHaveBeenCalledWith(expect.anything(), "ledger");
  });
});

describe("soroban flow", () => {
  it("happy path: prepare -> sign (pass-through) -> send -> poll -> follow-up -> Horizon", async () => {
    const t = await ready({
      statuses: ["NOT_FOUND", "SUCCESS"],
      signResult: { signedTxXdr: "SIGNED_SOR", changed: false, donation: null, outcome: "passthrough", reason: "soroban" },
    });
    await t.c.start("soroban");
    expect(t.ports.builder.buildSorobanTransfer).toHaveBeenCalledWith({ source: USER, destination: MERCHANT, amount: "2.35" });
    expect(t.signWithDonation).toHaveBeenCalledWith("PREPARED(XDR_SOROBAN)", { address: USER, networkPassphrase: PASS });
    expect(t.offerFollowUp).toHaveBeenCalledWith({ successful: true, sourceAccount: USER, hash: "HSOR" }, { address: USER, networkPassphrase: PASS });
    expect(t.submitted).toEqual(["SIGNED_DONATION"]);
    expect(t.c.getState()).toMatchObject({
      status: "done", flow: "soroban",
      result: { mainHash: "HSOR", donationHash: "HDON", outcome: "donated", donationAmount: "0.5000000" },
    });
    expect(statusTrail(t.states)).toEqual([
      "connecting", "ready", "building", "simulating", "signing", "submitting", "polling",
      "polling", "offering-follow-up", "submitting-follow-up", "done",
    ]);
  });

  it("never submits the main Soroban tx to Horizon, only the follow-up", async () => {
    const t = await ready();
    await t.c.start("soroban");
    expect(t.submitted).toEqual(["SIGNED_DONATION"]);
    expect(t.submitted).not.toContain("SIGNED_MOD");
  });

  it("follow-up declined: only the main hash, outcome declined", async () => {
    const t = await ready({ followUp: async () => ({ status: "skipped", reason: "declined" }) });
    await t.c.start("soroban");
    expect(t.submitted).toEqual([]);
    const s = t.c.getState();
    expect(s).toMatchObject({ status: "done", result: { mainHash: "HSOR", outcome: "declined" } });
    expect(s.status === "done" && s.result.donationHash).toBeUndefined();
  });

  it("follow-up not offered keeps the SDK reason", async () => {
    const t = await ready({ followUp: async () => ({ status: "skipped", reason: "user-trustline-missing" }) });
    await t.c.start("soroban");
    expect(t.c.getState()).toMatchObject({ status: "done", result: { mainHash: "HSOR", outcome: "follow-up-skipped", reason: "user-trustline-missing" } });
  });

  it("follow-up submit fails: main result retained, outcome follow-up-failed, never retried", async () => {
    const submit = vi.fn(async () => { throw new PortError("submit-failed", "tx_failed"); });
    const t = await ready({ horizonSubmit: submit });
    await t.c.start("soroban");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(t.c.getState()).toMatchObject({
      status: "done", result: { mainHash: "HSOR", outcome: "follow-up-failed", reason: "tx_failed" },
    });
  });

  it("user rejects the second signature: main retained, follow-up-failed", async () => {
    const t = await ready({ followUp: async () => { throw new Error("User declined"); } });
    await t.c.start("soroban");
    expect(t.submitted).toEqual([]);
    expect(t.c.getState()).toMatchObject({ status: "done", result: { mainHash: "HSOR", outcome: "follow-up-failed" } });
  });

  it("simulation failure", async () => {
    const t = await ready({ prepare: async () => { throw new PortError("simulation-failed", "HostError"); } });
    await t.c.start("soroban");
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "simulation-failed", detail: "HostError" });
    expect(t.signWithDonation).not.toHaveBeenCalled();
  });

  it("send failure", async () => {
    const t = await ready({ send: async () => { throw new PortError("submit-failed", "rpc down"); } });
    await t.c.start("soroban");
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "submit-failed", detail: "rpc down" });
    expect(t.offerFollowUp).not.toHaveBeenCalled();
  });

  it("signature rejected on the main tx", async () => {
    const t = await ready({ spare: { signWithDonation: vi.fn(async () => { throw new Error("rejected"); }) } });
    await t.c.start("soroban");
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "signature-rejected" });
  });

  it("main tx FAILED on chain: main-tx-failed and no follow-up offered", async () => {
    const t = await ready({ statuses: ["FAILED"] });
    await t.c.start("soroban");
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "main-tx-failed", detail: "HSOR" });
    expect(t.offerFollowUp).not.toHaveBeenCalled();
  });

  it("poll timeout: poll-timeout with the hash as detail, no follow-up", async () => {
    const t = await ready({ statuses: ["NOT_FOUND", "NOT_FOUND", "NOT_FOUND", "SUCCESS"] });
    await t.c.start("soroban");
    expect(t.ports.rpc?.getStatus).toHaveBeenCalledTimes(3);
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "poll-timeout", detail: "HSOR" });
    expect(t.offerFollowUp).not.toHaveBeenCalled();
  });

  it("no RPC configured: rpc-unavailable before anything is built", async () => {
    const t = await ready({ rpc: false });
    await t.c.start("soroban");
    expect(t.c.getState()).toMatchObject({ status: "error", reason: "rpc-unavailable" });
    expect(t.ports.builder.buildSorobanTransfer).not.toHaveBeenCalled();
  });
});

describe("network switch and lifecycle", () => {
  it("network switch and disconnect are ignored while a flow runs, so the main tx hash is not lost", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const t = await ready({ horizonSubmit: async () => { await gate; return { hash: "HLATE" }; } });
    const flow = t.c.start("classic");
    await vi.waitFor(() => expect(t.c.getState().status).toBe("submitting"));
    t.c.selectNetwork("mainnet");
    t.c.disconnect();
    expect(t.c.getState().status).toBe("submitting");
    expect(t.c.getState().network).toBe("testnet");
    release();
    await flow;
    expect(t.c.getState()).toMatchObject({ status: "done", network: "testnet", result: { mainHash: "HLATE" } });
  });

  it("a network switch is allowed again once the flow is done", async () => {
    const t = await ready();
    await t.c.start("classic");
    t.c.selectNetwork("mainnet");
    expect(t.c.getState()).toEqual({ status: "idle", network: "mainnet" });
  });

  it("selecting the current network keeps the session and ports", async () => {
    const t = await ready();
    t.c.selectNetwork("testnet");
    expect(t.c.getState().status).toBe("ready");
    await t.c.start("classic");
    expect(t.c.getState().status).toBe("done");
  });

  it("disconnect resets to idle and subscribers can unsubscribe", async () => {
    const t = await ready();
    const seen = vi.fn();
    const off = t.c.subscribe(seen);
    t.c.disconnect();
    expect(t.c.getState()).toEqual({ status: "idle", network: "testnet" });
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    t.c.selectNetwork("mainnet");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("again after done returns to ready", async () => {
    const t = await ready();
    await t.c.start("classic");
    t.c.again();
    expect(t.c.getState()).toMatchObject({ status: "ready", address: USER });
  });
});

describe("module hygiene", () => {
  it("controller/ports/machine import no heavy library as a value", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["controller", "ports", "machine"]) {
      const src = readFileSync(new URL(`../src/demo/${f}.ts`, import.meta.url), "utf8");
      const imports = src.split("\n").filter((l) => /^import\s/.test(l) && !/^import type\s/.test(l));
      expect(imports.filter((l) => /stellar|spare-|creit/.test(l))).toEqual([]);
    }
  });
});

export type { DemoController };
