import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { serializeSnapshot } from "../domain/snapshot.js";
import type { SnapshotStore } from "../ports.js";
import { parseSnapshot } from "../public.js";

/** Injectable for failure tests; defaults to node:fs/promises. */
export interface FsOps {
  rename: typeof rename;
}

/**
 * File-backed store. Writes go to a sibling tmp file, then `rename` (atomic on POSIX),
 * so a failed run never corrupts the prior snapshot. The privacy guard runs before any write.
 */
export function createFsStore(path: string, ops: FsOps = { rename }): SnapshotStore {
  return {
    async read() {
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
      const r = parseSnapshot(text);
      if (!r.ok) throw new Error(`invalid snapshot at ${path}: ${r.error}`);
      return r.snapshot;
    },
    async write(s) {
      const out = serializeSnapshot(s);
      if (!out.ok) throw new Error("privacy guard: refusing to write snapshot with non-allowed account addresses");
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      try {
        await writeFile(tmp, out.json, "utf8");
        await ops.rename(tmp, path);
      } catch (e) {
        await rm(tmp, { force: true });
        throw e;
      }
    },
  };
}
