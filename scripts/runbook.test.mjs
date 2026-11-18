import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";

const path = new URL("../docs/ops/d2-runbook.md", import.meta.url);
const doc = existsSync(path) ? readFileSync(path, "utf8") : "";

describe("docs/ops/d2-runbook.md", () => {
  test("exists", () => {
    assert.ok(doc.length > 0, "runbook missing");
  });

  test("review gate comes before the first deploy command", () => {
    const gate = doc.search(/^##\s+Gate/m);
    const deploy = doc.indexOf("stellar contract deploy");
    assert.ok(gate >= 0, "no Gate section");
    assert.ok(deploy >= 0, "no deploy command");
    assert.ok(gate < deploy, "gate must precede the deploy command");
    assert.ok(gate < doc.indexOf("git tag"), "gate must precede tagging");
  });

  test("gate links the review issue and the unreviewed fallback", () => {
    assert.ok(doc.includes("https://github.com/thesatieofcoding/Spare/issues/15"));
    assert.match(doc, /unreviewed/i);
    assert.match(doc, /day 20/i);
  });

  test("contains no secret-looking strings", () => {
    assert.doesNotMatch(doc, /\bS[A-Z2-7]{55}\b/);
  });

  test("uses placeholders for keys instead of values", () => {
    assert.match(doc, /<FOUNDATION_KEY_ALIAS>/);
  });
});
