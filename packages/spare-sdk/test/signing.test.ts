import { Operation } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { canSignAlone, requiredThreshold } from "../src/signing.js";
import { merchant, payUsdc, snapshot } from "./helpers.js";

const ops = (...x: ReturnType<typeof payUsdc>[]) => x.map((o) => Operation.fromXDRObject(o));

describe("requiredThreshold", () => {
  it("is medium for payments", () => expect(requiredThreshold(ops(payUsdc("1")))).toBe("medium"));
  it("is high for setOptions or accountMerge", () => {
    expect(requiredThreshold(ops(payUsdc("1"), Operation.setOptions({ homeDomain: "a.example" })))).toBe("high");
    expect(requiredThreshold(ops(Operation.accountMerge({ destination: merchant.publicKey() })))).toBe("high");
  });
});

describe("canSignAlone", () => {
  const s = (masterWeight: number, medium: number, high: number) =>
    snapshot({ masterWeight, thresholds: { low: 0, medium, high } });
  it("compares master weight with the needed threshold", () => {
    expect(canSignAlone(s(1, 1, 2), "medium")).toBe(true);
    expect(canSignAlone(s(1, 1, 2), "high")).toBe(false);
    expect(canSignAlone(s(1, 2, 2), "medium")).toBe(false);
  });
  it("needs weight of at least 1 even when thresholds are 0", () => {
    expect(canSignAlone(s(1, 0, 0), "medium")).toBe(true);
    expect(canSignAlone(s(0, 0, 0), "medium")).toBe(false);
  });
});
