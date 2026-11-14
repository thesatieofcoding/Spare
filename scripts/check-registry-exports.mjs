#!/usr/bin/env node
// Asserts the built registry WASM exports exactly the allowed contract functions
// (no admin/upgrade entry points). Usage: node scripts/check-registry-exports.mjs [path.wasm]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ALLOWLIST = ["register", "update", "deactivate", "get", "is_active"];
const FUNC_KIND = 0;
const DEFAULT_WASM = "target/wasm32v1-none/release/spare_registry.wasm";

function readLeb(buf, pos) {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (pos >= buf.length) throw new Error("invalid wasm: truncated LEB128");
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return [result >>> 0, pos];
    shift += 7;
  }
}

/** Returns [{name, kind}] from the export section (kind 0 = function). */
export function parseWasmExports(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x0061736d || buf.readUInt32LE(4) !== 1) {
    throw new Error("not a wasm module (bad magic/version)");
  }
  let pos = 8;
  while (pos < buf.length) {
    const id = buf[pos++];
    let size;
    [size, pos] = readLeb(buf, pos);
    const end = pos + size;
    if (end > buf.length) throw new Error("invalid wasm: section overruns file");
    if (id === 7) {
      let count;
      let p;
      [count, p] = readLeb(buf, pos);
      const out = [];
      for (let i = 0; i < count; i++) {
        let len;
        [len, p] = readLeb(buf, p);
        const name = buf.toString("utf8", p, p + len);
        p += len;
        const kind = buf[p++];
        [, p] = readLeb(buf, p); // index
        out.push({ name, kind });
      }
      return out;
    }
    pos = end;
  }
  return [];
}

export function checkExports(buf) {
  const fns = parseWasmExports(buf).filter((e) => e.kind === FUNC_KIND).map((e) => e.name);
  const extra = fns.filter((n) => !ALLOWLIST.includes(n)).sort();
  const missing = ALLOWLIST.filter((n) => !fns.includes(n)).sort();
  return { ok: extra.length === 0 && missing.length === 0, extra, missing };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? DEFAULT_WASM;
  const r = checkExports(readFileSync(file));
  if (!r.ok) {
    console.error(`registry exports mismatch in ${file}: extra=[${r.extra}] missing=[${r.missing}]`);
    process.exit(1);
  }
  console.log(`registry exports OK: ${[...ALLOWLIST].sort().join(",")}`);
}
