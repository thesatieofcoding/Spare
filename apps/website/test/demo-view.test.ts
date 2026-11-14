import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { buildView, explorerTxUrl, shouldFocusResult, truncate, type ViewContext } from "../src/demo/view";
import { initialState, reduce, type DemoEvent, type DemoState } from "../src/demo/machine";

const ADDR = "GCAEBBLSVFM2RLNBYMEZLFWHCXFHOGVJAXQK2K3WVHS2UGVDVWJOXGQJ";
const ok = { enabled: true, missing: null } as const;
const ctx = (over: Partial<ViewContext> = {}): ViewContext => ({
  copy: en.demo, availability: ok, rpcAvailable: null, purchaseAmount: "2.35", ...over,
});
const events: DemoEvent[] = [{ type: "connect" }, { type: "connected", address: ADDR, wallet: "classic" }];
const ready = (network: "testnet" | "mainnet" = "testnet"): Extract<DemoState, { status: "ready" }> =>
  events.reduce(reduce, initialState(network)) as Extract<DemoState, { status: "ready" }>;

describe("explorerTxUrl", () => {
  it("links to stellar.expert per network", () => {
    expect(explorerTxUrl("testnet", "abc")).toBe("https://stellar.expert/explorer/testnet/tx/abc");
    expect(explorerTxUrl("mainnet", "abc")).toBe("https://stellar.expert/explorer/public/tx/abc");
  });
});

describe("truncate", () => {
  it("keeps the ends", () => expect(truncate(ADDR)).toBe("GCAE…XGQJ"));
  it("leaves short strings", () => expect(truncate("abc")).toBe("abc"));
});

describe("buildView", () => {
  it("idle: can connect, flows disabled, purchase text shows the amount", () => {
    const v = buildView(initialState("testnet"), ctx());
    expect(v.canConnect).toBe(true);
    expect(v.classicEnabled).toBe(false);
    expect(v.sorobanEnabled).toBe(false);
    expect(v.status).toBe(en.demo.status.idle);
    expect(v.purchase).toContain("2.35");
  });

  it("while a flow runs the network cannot be switched nor the wallet disconnected", () => {
    const running = reduce(ready(), { type: "start", flow: "classic" });
    const v = buildView(running, ctx());
    expect(v.busy).toBe(true);
    expect(v.canSwitchNetwork).toBe(false);
    expect(v.canDisconnect).toBe(false);
  });

  it("not configured: connect disabled and a visible message", () => {
    const v = buildView(initialState("mainnet"), ctx({ availability: { enabled: false, missing: "foundation" } }));
    expect(v.canConnect).toBe(false);
    expect(v.notConfigured).toBe(en.demo.notConfigured);
  });

  it("ready: shows only the truncated own address and enables both flows", () => {
    const v = buildView(ready(), ctx());
    expect(v.connected).toBe("Connected as GCAE…XGQJ");
    expect(v.connected).not.toContain(ADDR);
    expect(v.classicEnabled && v.sorobanEnabled).toBe(true);
    expect(v.canDisconnect).toBe(true);
    expect(v.canSwitchNetwork).toBe(true);
  });

  it("ready with no RPC: Soroban disabled with a reason, classic still works", () => {
    const v = buildView(ready("mainnet"), ctx({ rpcAvailable: false }));
    expect(v.classicEnabled).toBe(true);
    expect(v.sorobanEnabled).toBe(false);
    expect(v.sorobanNote).toBe(en.demo.rpcUnavailable);
  });

  it("in-flight phases are busy and disable everything", () => {
    const v = buildView(reduce(ready(), { type: "start", flow: "soroban" }), ctx());
    expect(v.busy).toBe(true);
    expect(v.classicEnabled || v.sorobanEnabled || v.canConnect).toBe(false);
    expect(v.status).toBe(en.demo.status.building);
  });

  it("done donated: both tx links on the right explorer, amount in the text", () => {
    const s: DemoState = { ...ready(), status: "done", flow: "soroban",
      result: { mainHash: "m1", donationHash: "d1", outcome: "donated", donationAmount: "0.5000000" } };
    const v = buildView(s, ctx());
    expect(v.tone).toBe("success");
    expect(v.status).toContain("0.5000000");
    expect(v.links).toEqual([
      { label: en.demo.mainTx, href: "https://stellar.expert/explorer/testnet/tx/m1" },
      { label: en.demo.donationTx, href: "https://stellar.expert/explorer/testnet/tx/d1" },
    ]);
    expect(v.canAgain).toBe(true);
  });

  it("done not-offered: human reason, no raw code", () => {
    const s: DemoState = { ...ready(), status: "done", flow: "classic",
      result: { mainHash: "m1", outcome: "not-offered", reason: "insufficient-balance" } };
    const v = buildView(s, ctx());
    expect(v.status).toContain(en.demo.reasons["insufficient-balance"]);
    expect(v.status).not.toContain("insufficient-balance");
    expect(v.links).toHaveLength(1);
  });

  it("unknown SDK reason falls back to the generic text", () => {
    const s: DemoState = { ...ready(), status: "done", flow: "classic",
      result: { mainHash: "m1", outcome: "not-offered", reason: "brand-new-reason" } };
    expect(buildView(s, ctx()).status).toContain(en.demo.reasons.other);
  });

  it("error: tone, mapped message, retry; keeps the main hash link", () => {
    let s = reduce(ready(), { type: "start", flow: "soroban" });
    s = reduce(s, { type: "main-confirmed", hash: "m1" });
    s = reduce(s, { type: "fail", reason: "unexpected", detail: "boom" });
    const v = buildView(s, ctx());
    expect(v.tone).toBe("error");
    expect(v.status).toBe(en.demo.errors.unexpected);
    expect(v.detail).toBe("boom");
    expect(v.canRetry).toBe(true);
    expect(v.links[0]?.href).toContain("/tx/m1");
  });

  it("renders in Spanish from the same state", () => {
    expect(buildView(initialState("testnet"), ctx({ copy: es.demo })).status).toBe(es.demo.status.idle);
  });
});

describe("a11y helpers", () => {
  const r = ready();
  const running = reduce(r, { type: "start", flow: "classic" });
  const done = reduce(
    reduce(reduce(reduce(running, { type: "advance", to: "signing" }), { type: "advance", to: "submitting" }), { type: "main-confirmed", hash: "H" }),
    { type: "finish", result: { mainHash: "H", outcome: "declined" } },
  );
  it("moves focus to the status only when a flow ends (done or error), not on every update", () => {
    expect(shouldFocusResult(running, done)).toBe(true);
    expect(shouldFocusResult(running, reduce(running, { type: "fail", reason: "unexpected" }))).toBe(true);
    expect(shouldFocusResult(r, running)).toBe(false);
    expect(shouldFocusResult(done, done)).toBe(false);
    expect(shouldFocusResult(initialState("testnet"), r)).toBe(false);
  });
  it("new-tab hint exists in both languages and is not empty", () => {
    expect(en.demo.newTab.trim()).toBeTruthy();
    expect(es.demo.newTab.trim()).toBeTruthy();
    expect(es.demo.newTab).not.toBe(en.demo.newTab);
  });
});
