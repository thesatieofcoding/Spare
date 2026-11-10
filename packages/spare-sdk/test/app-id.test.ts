import { describe, expect, it } from "vitest";
import { isValidAppId, memoFor } from "../src/app-id.js";

describe("appId", () => {
  it("accepts up to 22 ASCII bytes", () => {
    expect(isValidAppId("a".repeat(22))).toBe(true);
    expect(isValidAppId("my-app_1.0")).toBe(true);
  });
  it.each(["", "a".repeat(23), "café", "emoji🙂", "with space", "line\nbreak"])(
    "rejects %j",
    (s) => expect(isValidAppId(s)).toBe(false),
  );
  it("builds a memo that fits the 28 byte text memo", () => {
    const m = memoFor("a".repeat(22));
    expect(m).toBe(`spare:${"a".repeat(22)}`);
    expect(Buffer.byteLength(m)).toBe(28);
  });
});
