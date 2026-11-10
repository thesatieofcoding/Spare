import { MAX_APP_ID_BYTES, MEMO_PREFIX } from "./constants.js";

/** 1-22 printable ASCII chars (no spaces) so `spare:<appId>` fits a 28-byte text memo. */
export function isValidAppId(appId: string): boolean {
  return appId.length <= MAX_APP_ID_BYTES && /^[\x21-\x7E]+$/.test(appId);
}

export function memoFor(appId: string): string {
  return `${MEMO_PREFIX}${appId}`;
}
