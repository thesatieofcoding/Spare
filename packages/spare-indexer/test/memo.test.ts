import { describe, expect, it } from "vitest";
import { attribute } from "../src/domain/memo.js";
import type { Memo } from "../src/domain/types.js";

const text = (s: string): Memo => ({ type: "text", bytes: new TextEncoder().encode(s) });
const raw = (...b: number[]): Memo => ({ type: "text", bytes: Uint8Array.from(b) });

describe("attribute (memo -> attribution)", () => {
  it("attributes spare:<appId>", () => {
    expect(attribute(text("spare:shop1"))).toEqual({ kind: "attributed", appId: "shop1" });
  });

  it("accepts the maximum 22-byte appId", () => {
    const id = "a".repeat(22);
    expect(attribute(text(`spare:${id}`))).toEqual({ kind: "attributed", appId: id });
  });

  it("no memo is unattributed (no-text-memo)", () => {
    expect(attribute({ type: "none" })).toEqual({ kind: "unattributed", reason: "no-text-memo" });
  });

  it.each(["id", "hash", "return"] as const)("%s memo is unattributed (no-text-memo)", (type) => {
    expect(attribute({ type })).toEqual({ kind: "unattributed", reason: "no-text-memo" });
  });

  it("a text memo without the tag is no-spare-tag", () => {
    expect(attribute(text("hello"))).toEqual({ kind: "unattributed", reason: "no-spare-tag" });
  });

  it("tag prefix is case-sensitive and exact", () => {
    expect(attribute(text("Spare:shop1"))).toEqual({ kind: "unattributed", reason: "no-spare-tag" });
    expect(attribute(text("spare;shop1"))).toEqual({ kind: "unattributed", reason: "no-spare-tag" });
    expect(attribute(text("xspare:shop1"))).toEqual({ kind: "unattributed", reason: "no-spare-tag" });
  });

  it("an empty appId (`spare:`) is malformed-tag", () => {
    expect(attribute(text("spare:"))).toEqual({ kind: "unattributed", reason: "malformed-tag" });
  });

  it("an appId over 22 bytes (23 chars) is malformed-tag", () => {
    expect(attribute(text(`spare:${"a".repeat(23)}`))).toEqual({
      kind: "unattributed",
      reason: "malformed-tag",
    });
  });

  it("non-ASCII appId (spare:café) is malformed-tag", () => {
    expect(attribute(text("spare:café"))).toEqual({ kind: "unattributed", reason: "malformed-tag" });
  });

  it("invalid UTF-8 after the tag is malformed-tag and never throws", () => {
    const m = raw(0x73, 0x70, 0x61, 0x72, 0x65, 0x3a, 0xff, 0xfe);
    expect(attribute(m)).toEqual({ kind: "unattributed", reason: "malformed-tag" });
  });

  it("invalid UTF-8 without the tag is no-spare-tag", () => {
    expect(attribute(raw(0xff, 0xfe, 0x00))).toEqual({ kind: "unattributed", reason: "no-spare-tag" });
  });

  it("whitespace or control chars in the appId are malformed-tag", () => {
    expect(attribute(text("spare:a b"))).toEqual({ kind: "unattributed", reason: "malformed-tag" });
    expect(attribute(text("spare:a\nb"))).toEqual({ kind: "unattributed", reason: "malformed-tag" });
  });
});
