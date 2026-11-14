import { describe, expect, it } from "vitest";
import { initialState, reduce, type DemoEvent, type DemoState } from "../src/demo/machine";

const run = (events: DemoEvent[], from: DemoState = initialState("testnet")): DemoState =>
  events.reduce(reduce, from);

const connected: DemoEvent[] = [
  { type: "connect" },
  { type: "connected", address: "GUSER", wallet: "classic" },
];
const adv = (to: Extract<DemoEvent, { type: "advance" }>["to"]): DemoEvent => ({ type: "advance", to });

describe("demo machine", () => {
  it("starts idle on the given network", () => {
    expect(initialState("mainnet")).toEqual({ status: "idle", network: "mainnet" });
  });

  it("connect -> connected -> ready", () => {
    expect(run(connected)).toMatchObject({ status: "ready", address: "GUSER", wallet: "classic", network: "testnet" });
    expect(run([{ type: "connect" }]).status).toBe("connecting");
  });

  it("connect failure goes to error with the reason, and retry returns to idle", () => {
    const s = run([{ type: "connect" }, { type: "fail", reason: "no-wallet" }]);
    expect(s).toMatchObject({ status: "error", reason: "no-wallet" });
    expect(reduce(s, { type: "retry" })).toEqual({ status: "idle", network: "testnet" });
  });

  it("classic flow: building -> signing -> submitting -> done", () => {
    const s = run([...connected, { type: "start", flow: "classic" }, adv("signing"), adv("submitting"),
      { type: "finish", result: { mainHash: "H1", outcome: "donated", donationAmount: "0.5000000" } }]);
    expect(s).toMatchObject({ status: "done", flow: "classic", result: { mainHash: "H1", outcome: "donated" } });
  });

  it("soroban flow: building -> simulating -> signing -> submitting -> polling -> offering -> submitting follow-up -> done", () => {
    const s = run([...connected, { type: "start", flow: "soroban" }, adv("simulating"), adv("signing"),
      adv("submitting"), adv("polling"), adv("offering-follow-up"), adv("submitting-follow-up"),
      { type: "finish", result: { mainHash: "H1", donationHash: "H2", outcome: "donated" } }]);
    expect(s).toMatchObject({ status: "done", flow: "soroban", result: { donationHash: "H2" } });
  });

  it("soroban may finish straight from offering-follow-up (declined)", () => {
    const s = run([...connected, { type: "start", flow: "soroban" }, adv("simulating"), adv("signing"),
      adv("submitting"), adv("polling"), adv("offering-follow-up"),
      { type: "finish", result: { mainHash: "H1", outcome: "declined" } }]);
    expect(s.status).toBe("done");
  });

  it("ignores illegal transitions (state unchanged)", () => {
    const ready = run(connected);
    expect(reduce(ready, adv("signing"))).toBe(ready);
    expect(reduce(ready, { type: "finish", result: { mainHash: "x", outcome: "donated" } })).toBe(ready);
    const building = run([...connected, { type: "start", flow: "classic" }]);
    expect(reduce(building, adv("simulating"))).toBe(building); // classic never simulates
    expect(reduce(building, adv("polling"))).toBe(building);
    const idle = initialState("testnet");
    expect(reduce(idle, { type: "start", flow: "classic" })).toBe(idle);
    expect(reduce(idle, { type: "connected", address: "G", wallet: "classic" })).toBe(idle);
  });

  it("a flow error keeps the connection and the main hash for retry", () => {
    const s = run([...connected, { type: "start", flow: "soroban" }, adv("simulating"), adv("signing"),
      adv("submitting"), { type: "fail", reason: "submit-failed", detail: "tx_bad_seq" }]);
    expect(s).toMatchObject({ status: "error", reason: "submit-failed", detail: "tx_bad_seq", address: "GUSER" });
    expect(reduce(s, { type: "retry" })).toMatchObject({ status: "ready", address: "GUSER" });
  });

  it("an error after main success retains the main hash", () => {
    const s = run([...connected, { type: "start", flow: "soroban" }, adv("simulating"), adv("signing"),
      adv("submitting"), adv("polling"), { type: "main-confirmed", hash: "H1" }, { type: "fail", reason: "poll-timeout" }]);
    expect(s).toMatchObject({ status: "error", mainHash: "H1" });
  });

  it("done -> again returns to ready", () => {
    const s = run([...connected, { type: "start", flow: "classic" }, adv("signing"), adv("submitting"),
      { type: "finish", result: { mainHash: "H", outcome: "declined" } }, { type: "again" }]);
    expect(s).toMatchObject({ status: "ready", address: "GUSER" });
  });

  it("switching network resets everything, from any state", () => {
    const mid = run([...connected, { type: "start", flow: "soroban" }, adv("simulating")]);
    expect(reduce(mid, { type: "switch-network", network: "mainnet" })).toEqual({ status: "idle", network: "mainnet" });
    expect(reduce(run(connected), { type: "switch-network", network: "mainnet" })).toEqual({ status: "idle", network: "mainnet" });
  });

  it("switching to the same network is a no-op", () => {
    const ready = run(connected);
    expect(reduce(ready, { type: "switch-network", network: "testnet" })).toBe(ready);
  });

  it("not-configured is reachable from idle and clears on retry", () => {
    const s = reduce(initialState("mainnet"), { type: "fail", reason: "not-configured" });
    expect(s).toMatchObject({ status: "error", reason: "not-configured" });
    expect(reduce(s, { type: "retry" })).toEqual({ status: "idle", network: "mainnet" });
  });

  it("disconnect returns to idle", () => {
    expect(reduce(run(connected), { type: "disconnect" })).toEqual({ status: "idle", network: "testnet" });
  });
});
