import { describe, expect, it } from "vitest";
import { formatStroops, parseUsdc, roundUpToWholeDollar } from "../src/amount.js";

describe("parseUsdc", () => {
  it("parses decimals into stroops without floats", () => {
    expect(parseUsdc("0.5")).toBe(5_000_000n);
    expect(parseUsdc("1")).toBe(10_000_000n);
    expect(parseUsdc("0.1234567")).toBe(1_234_567n);
    expect(parseUsdc("0.1")! + parseUsdc("0.2")!).toBe(parseUsdc("0.3"));
  });
  it.each(["", "abc", "-1", "1e3", "0.12345678", "1.", ".5", " 1", "0", "0.0000000"])(
    "rejects %j",
    (s) => expect(parseUsdc(s)).toBeNull(),
  );
});

describe("formatStroops", () => {
  it("renders 7 decimals", () => {
    expect(formatStroops(5_000_000n)).toBe("0.5000000");
    expect(formatStroops(12_345_678_901n)).toBe("1234.5678901");
  });
});

describe("roundUpToWholeDollar", () => {
  it("returns the gap to the next whole dollar", () => {
    expect(roundUpToWholeDollar(parseUsdc("4.20")!)).toBe(parseUsdc("0.8"));
    expect(roundUpToWholeDollar(parseUsdc("4.9999999")!)).toBe(1n);
    expect(roundUpToWholeDollar(parseUsdc("0.01")!)).toBe(parseUsdc("0.99"));
  });
  it("returns 0n (no donation) when already whole", () => {
    expect(roundUpToWholeDollar(parseUsdc("5")!)).toBe(0n);
  });
});
