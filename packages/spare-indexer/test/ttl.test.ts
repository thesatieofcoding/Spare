import { describe, expect, it } from "vitest";
import { NEAR_EXPIRY_LEDGERS, nearExpiry } from "../src/domain/ttl.js";

describe("nearExpiry", () => {
  it("default threshold is 30 days of ledgers", () => expect(NEAR_EXPIRY_LEDGERS).toBe(518_400));
  it("missing/archived entry is flagged", () => expect(nearExpiry(null, 1000)).toBe(true));
  it("below threshold flagged, at/above not", () => {
    expect(nearExpiry(1000 + 518_399, 1000)).toBe(true);
    expect(nearExpiry(1000 + 518_400, 1000)).toBe(false);
    expect(nearExpiry(5_000_000, 1000)).toBe(false);
  });
  it("custom threshold; already expired flagged", () => {
    expect(nearExpiry(1100, 1000, 50)).toBe(false);
    expect(nearExpiry(900, 1000)).toBe(true);
  });
});
