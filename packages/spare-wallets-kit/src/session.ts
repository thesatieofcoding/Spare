import type { AccountPort, AccountSnapshot, FetchLike, PathQuotePort, XlmQuote } from "spare-sdk";

/**
 * Ports for one confirmation prompt. The first evaluation reads live (so donateAfter can wait for
 * Horizon to catch up); after `freeze()` every account, stellar.toml and quote already read is
 * reused, so re-checking amounts and pay assets costs no extra lookups. Failures are not cached.
 */
export interface PromptSession {
  accounts: AccountPort;
  fetch: FetchLike | undefined;
  quotes: PathQuotePort | undefined;
  freeze(): void;
}

/** SEP-1 caps stellar.toml at 100KB. */
const MAX_BODY = 100 * 1024;

async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(received);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(all);
  } catch {
    return null; // not UTF-8: the SDK rejects it, and so does the replacement body
  }
}

function memo<K, V>(frozen: () => boolean) {
  const store = new Map<K, V>();
  return async (key: K, load: () => Promise<V>): Promise<V> => {
    if (frozen() && store.has(key)) return store.get(key) as V;
    const v = await load();
    store.set(key, v);
    return v;
  };
}

export function promptSession(
  accounts: AccountPort, fetch: FetchLike | undefined, quotes: PathQuotePort | undefined,
): PromptSession {
  let frozen = false;
  const isFrozen = () => frozen;
  const acct = memo<string, AccountSnapshot | null>(isFrozen);
  const toml = memo<string, { body: string; status: number; headers: [string, string][] }>(isFrozen);
  const quote = memo<string, XlmQuote | null>(isFrozen);

  return {
    accounts: {
      ...(accounts.network !== undefined && { network: accounts.network }),
      loadAccount: (id) => acct(id, () => accounts.loadAccount(id)),
    },
    fetch: fetch && (async (input, init) => {
      const key = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const r = await toml(key, async () => {
        const res = await fetch(input, init);
        // Same 100KB cap as the SDK: an oversized body is replaced by one the SDK rejects too.
        const body = (await readCapped(res, MAX_BODY)) ?? " ".repeat(MAX_BODY + 1);
        const headers: [string, string][] = [];
        res.headers.forEach((v, k) => {
          if (k.toLowerCase() !== "content-length") headers.push([k, v]);
        });
        return { body, status: res.status, headers };
      });
      return new Response(r.body, { status: r.status, headers: r.headers });
    }),
    quotes: quotes && {
      ...(quotes.network !== undefined && { network: quotes.network }),
      quoteXlmForUsdc: (usdc, issuer) => quote(`${usdc}:${issuer}`, () => quotes.quoteXlmForUsdc(usdc, issuer)),
    },
    freeze() {
      frozen = true;
    },
  };
}
