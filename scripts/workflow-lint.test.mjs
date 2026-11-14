import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const dir = new URL(".github/workflows/", root);
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

test("workflow files are found", () => {
  assert.ok(files.length >= 3);
});

for (const f of files) {
  test(`${f}: every uses: is pinned to a 40-hex SHA with a version comment`, () => {
    const lines = readFileSync(new URL(f, dir), "utf8").split("\n");
    for (const [i, line] of lines.entries()) {
      const m = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/);
      if (!m) continue;
      const [, ref, rest] = m;
      if (ref.startsWith("./")) continue;
      assert.match(ref, /@[0-9a-f]{40}$/, `${f}:${i + 1} not SHA-pinned: ${ref}`);
      assert.match(rest, /#\s*\S+/, `${f}:${i + 1} missing trailing version comment`);
    }
  });
}

test("rust toolchain is pinned by rust-toolchain.toml", () => {
  const t = readFileSync(new URL("rust-toolchain.toml", root), "utf8");
  assert.match(t, /channel\s*=\s*"1\.90\.0"/);
  assert.match(t, /targets\s*=\s*\[[^\]]*"wasm32v1-none"/);
});

test("no workflow uses a floating rust toolchain action", () => {
  for (const f of files) {
    assert.doesNotMatch(readFileSync(new URL(f, dir), "utf8"), /dtolnay\/rust-toolchain/, f);
  }
});
