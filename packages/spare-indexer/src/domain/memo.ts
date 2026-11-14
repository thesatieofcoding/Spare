import { isValidAppId } from "spare-sdk";
import type { Attribution, Memo } from "./types.js";

const PREFIX = new TextEncoder().encode("spare:");

/** Attribute a donation from its memo. Only a text memo `spare:<appId>` attributes. Never throws. */
export function attribute(memo: Memo): Attribution {
  if (memo.type !== "text") return { kind: "unattributed", reason: "no-text-memo" };
  const bytes = memo.bytes;
  if (bytes.length < PREFIX.length || !PREFIX.every((b, i) => bytes[i] === b)) {
    return { kind: "unattributed", reason: "no-spare-tag" };
  }
  const idBytes = bytes.subarray(PREFIX.length);
  // appId is printable ASCII (0x21-0x7E); decode bytewise so invalid UTF-8 cannot throw.
  if (idBytes.some((b) => b > 0x7e)) return { kind: "unattributed", reason: "malformed-tag" };
  const appId = String.fromCharCode(...idBytes);
  if (!isValidAppId(appId)) return { kind: "unattributed", reason: "malformed-tag" };
  return { kind: "attributed", appId };
}
