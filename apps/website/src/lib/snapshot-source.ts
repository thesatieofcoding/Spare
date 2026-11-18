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

async function fetchRemote(fetchFn: FetchLike): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(SNAPSHOT_URL, { headers: { Accept: "application/vnd.github.raw" } });
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

export async function loadSnapshot(opts: LoadOptions = {}): Promise<LoadedSnapshot> {
  // process.env, not import.meta.env: Vite only exposes PUBLIC_-prefixed vars there, and VERCEL_ENV is not.
  const env = opts.env ?? process.env;
  const mode = resolveSource(env);
  const raw = mode === "remote" ? await fetchRemote(opts.fetch ?? fetch) : fixture;
  const parsed = parseSnapshot(raw);
  if (!parsed.ok) throw new SnapshotSourceError(`invalid snapshot (${mode}): ${parsed.error}`);
  return { mode, snapshot: parsed.snapshot, view: toPublicView(parsed.snapshot) };
}
