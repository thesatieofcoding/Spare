/**
 * Where the dashboard gets its data. Production builds read the snapshot from the `data` branch
 * and fail loudly (no silent fallback, no empty dashboard published); local dev and tests use a
 * committed sample fixture. Fetch is injected so tests never touch the network.
 */
import { parseSnapshot, toPublicView, type PublicView, type SnapshotV1 } from "spare-indexer/public";
import type { FetchLike } from "spare-sdk";
import fixture from "../data/snapshot.fixture.json";

export type SnapshotMode = "remote" | "fixture";

export interface SourceEnv {
  SPARE_SNAPSHOT_SOURCE?: string | undefined;
  VERCEL_ENV?: string | undefined;
  /** Optional: lifts the unauthenticated GitHub API rate limit. Never logged. */
  GITHUB_TOKEN?: string | undefined;
}

export interface LoadedSnapshot {
  mode: SnapshotMode;
  snapshot: SnapshotV1;
  view: PublicView;
}

/** GitHub contents API (not the raw CDN, which can serve a stale snapshot for minutes). */
export const SNAPSHOT_URL = "https://api.github.com/repos/thesatieofcoding/Spare/contents/snapshot.json?ref=data";

export class SnapshotSourceError extends Error {
  override name = "SnapshotSourceError";
}

/** Production is always remote; otherwise opt in with SPARE_SNAPSHOT_SOURCE=remote. */
export function resolveSource(env: SourceEnv): SnapshotMode {
  if (env.VERCEL_ENV === "production") return "remote";
  return env.SPARE_SNAPSHOT_SOURCE === "remote" ? "remote" : "fixture";
}

export const FETCH_TIMEOUT_MS = 15_000;

async function fetchRemote(fetchFn: FetchLike, token: string | undefined): Promise<unknown> {
  let res: Response;
  const headers: Record<string, string> = { Accept: "application/vnd.github.raw" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    res = await fetchFn(SNAPSHOT_URL, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    throw new SnapshotSourceError(`snapshot unreachable (${SNAPSHOT_URL}): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new SnapshotSourceError(`snapshot fetch failed: HTTP ${res.status} for ${SNAPSHOT_URL}`);
  return res.text();
}

export interface LoadOptions {
  env?: SourceEnv;
  fetch?: FetchLike;
}

let cached: Promise<LoadedSnapshot> | undefined;

/** Test hook: forget the build-wide cached load. */
export function resetSnapshotCache(): void {
  cached = undefined;
}

/**
 * One production build renders several pages; with default options they all share one load, so
 * the GitHub API is hit once and every page sees the same snapshot. Injected env/fetch (tests)
 * bypass the cache. A failed load is not cached.
 */
export function loadSnapshot(opts: LoadOptions = {}): Promise<LoadedSnapshot> {
  if (opts.env !== undefined || opts.fetch !== undefined) return load(opts);
  cached ??= load(opts).catch((e: unknown) => {
    cached = undefined;
    throw e;
  });
  return cached;
}

async function load(opts: LoadOptions): Promise<LoadedSnapshot> {
  // process.env, not import.meta.env: Vite only exposes PUBLIC_-prefixed vars there, and VERCEL_ENV is not.
  const env = opts.env ?? process.env;
  const mode = resolveSource(env);
  const raw = mode === "remote" ? await fetchRemote(opts.fetch ?? fetch, env.GITHUB_TOKEN) : fixture;
  const parsed = parseSnapshot(raw);
  if (!parsed.ok) throw new SnapshotSourceError(`invalid snapshot (${mode}): ${parsed.error}`);
  return { mode, snapshot: parsed.snapshot, view: toPublicView(parsed.snapshot) };
}
