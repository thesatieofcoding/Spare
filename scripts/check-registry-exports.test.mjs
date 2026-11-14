import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLOWLIST, checkExports, parseWasmExports } from "./check-registry-exports.mjs";

const u8 = (n) => {
  const out = [];
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return out;
};
const str = (s) => [...u8(s.length), ...Buffer.from(s, "utf8")];

/** Minimal valid wasm module whose export section holds `exports` as [name, kind]. */
function wasm(exports) {
  const body = [...u8(exports.length), ...exports.flatMap(([n, k]) => [...str(n), k, 0])];
  const section = [7, ...u8(body.length), ...body];
  return Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, ...section]);
}

test("allowlist is exactly the five registry functions", () => {
  assert.deepEqual([...ALLOWLIST].sort(), ["deactivate", "get", "is_active", "register", "update"]);
});

test("parses export names and kinds", () => {
  assert.deepEqual(parseWasmExports(wasm([["register", 0], ["memory", 2]])), [
    { name: "register", kind: 0 },
    { name: "memory", kind: 2 },
  ]);
});

test("passes when function exports equal the allowlist", () => {
  const fns = [...ALLOWLIST].map((n) => [n, 0]);
  assert.deepEqual(checkExports(wasm(fns)), { ok: true, extra: [], missing: [] });
});

test("non-function exports (memory) are ignored", () => {
  const fns = [...ALLOWLIST].map((n) => [n, 0]);
  assert.equal(checkExports(wasm([...fns, ["memory", 2]])).ok, true);
});

test("fails on an extra function export", () => {
  const fns = [...ALLOWLIST, "upgrade"].map((n) => [n, 0]);
  const r = checkExports(wasm(fns));
  assert.equal(r.ok, false);
  assert.deepEqual(r.extra, ["upgrade"]);
});

test("fails on a missing function export", () => {
  const r = checkExports(wasm([["register", 0]]));
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["deactivate", "get", "is_active", "update"]);
});

test("rejects non-wasm input", () => {
  assert.throws(() => parseWasmExports(Buffer.from("nope")), /wasm/i);
});
