import { parse } from "smol-toml";
import { MAX_TOML_BYTES } from "./constants.js";
import type { FetchLike, Foundation } from "./ports.js";

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/**
 * Reduces what a foundation might paste ("https://Example.org/about", "example.org.") to a bare,
 * lowercase hostname. Only http(s) schemes are stripped; the fetch is always https. Anything
 * odd (port, userinfo, other scheme) is left in place so the hostname check rejects it.
 */
function normalizeDomain(domain: unknown): string | null {
  if (typeof domain !== "string") return null;
  let d = domain.trim().toLowerCase().replace(/^https?:\/\//, "");
  d = d.split(/[/?#]/, 1)[0] ?? "";
  return d.replace(/\.$/, "");
}

/** Reads the body as UTF-8 text, giving up (null) as soon as it exceeds `max` bytes. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  const declared = res.headers.get("content-length");
  if (declared !== null && Number(declared) > max) return null;
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * SEP-1 domain verification: true only if `foundation.account` appears in the
 * ACCOUNTS list of https://<domain>/.well-known/stellar.toml, where `domain` is first normalized
 * (scheme, path, trailing slash and dot stripped, lowercased). Fails closed:
 * no redirects, 5s timeout, body capped at 100KB (checked on Content-Length and while streaming).
 * "Verified" means exactly this, nothing more.
 */
export async function verifyFoundation(
  foundation: Foundation,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<boolean> {
  const domain = normalizeDomain(foundation?.domain);
  if (domain === null || !HOSTNAME_RE.test(domain)) return false;
  try {
    const res = await fetchImpl(`https://${domain}/.well-known/stellar.toml`, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok || res.redirected) return false;
    const text = await readCapped(res, MAX_TOML_BYTES);
    if (text === null) return false;
    const accounts = parse(text)["ACCOUNTS"];
    return Array.isArray(accounts) && accounts.includes(foundation.account);
  } catch {
    return false;
  }
}

/** Filters candidates down to those whose stellar.toml lists their account. */
export async function listVerifiedFoundations(
  candidates: readonly Foundation[],
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<Foundation[]> {
  const checks = await Promise.all(candidates.map((c) => verifyFoundation(c, fetchImpl)));
  return candidates.filter((_, i) => checks[i]);
}
