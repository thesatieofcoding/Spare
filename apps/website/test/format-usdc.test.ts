import { describe, expect, it } from "vitest";
import { formatUsdc } from "../src/lib/format-usdc";
import { formatUsdDisplay } from "../src/demo/view";

describe("formatUsdc", () => {
  it("trims 7-decimal stroop strings to cents", () => {
    expect(formatUsdc("1.5000000")).toBe("1.50");
    expect(formatUsdc("2.0000000")).toBe("2.00");
    expect(formatUsdc("0.1000000")).toBe("0.10");
  });
  it("keeps significant decimals", () => expect(formatUsdc("0.6500001")).toBe("0.6500001"));
  it("pads an amount without a fraction", () => expect(formatUsdc("2")).toBe("2.00"));
  it("never goes through floating point", () => expect(formatUsdc("9007199254740993.0000001")).toBe("9007199254740993.0000001"));
  it("is the single implementation behind the demo's formatUsdDisplay", () => expect(formatUsdDisplay).toBe(formatUsdc));
});
