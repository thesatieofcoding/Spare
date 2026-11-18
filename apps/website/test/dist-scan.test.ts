import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findAddresses, findInlineHex, listFiles } from "./helpers/dist-scan";

const A = "GBSAMPLEFOUNDATIONAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2";
const DONOR = "GDONOR".padEnd(56, "A");

const fakeDist = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "dist-"));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  return dir;
};

describe("dist scan helpers", () => {
  it("lists files recursively", () => {
    const dir = fakeDist({ "a.html": "x", "b/c.js": "y" });
    expect(listFiles(dir).map((f) => f.slice(dir.length)).sort()).toEqual(["/a.html", "/b/c.js"]);
  });
  it("reports addresses outside the allowed set, per file", () => {
    const dir = fakeDist({ "ok.html": `<a href="/dashboard/${A}/">`, "leak.js": `const d="${DONOR}"` });
    const hits = findAddresses(dir, new Set([A]));
    expect(hits).toEqual([{ file: join(dir, "leak.js"), address: DONOR }]);
  });
  it("finds raw hex colors only inside html style blocks and style attributes", () => {
    const dir = fakeDist({
      "p.html": `<style>.a{color:#3E6650}</style><p style="background:#fff">#anchor</p>`,
      "q.html": `<style>.a{color:var(--accent)}</style><a href="#abc123">x</a>`,
    });
    const hits = findInlineHex(dir);
    expect(hits.map((h) => h.file)).toEqual([join(dir, "p.html"), join(dir, "p.html")]);
    expect(hits.map((h) => h.color).sort()).toEqual(["#3E6650", "#fff"]);
  });
  it("ignores hex values defined by the tokens", () => {
    const dir = fakeDist({ "p.html": `<style>.a{color:#3E6650;background:#123456}</style>` });
    expect(findInlineHex(dir, new Set(["#3e6650"]))).toEqual([{ file: join(dir, "p.html"), color: "#123456" }]);
  });
  it("can be scoped to a subset of files", () => {
    const dir = fakeDist({ "dashboard/x.html": `<p>${DONOR}</p><style>a{color:#123456}</style>`, "docs/y.html": `<p>${DONOR}</p><style>a{color:#123456}</style>` });
    const only = (f: string) => f.includes("/dashboard/");
    expect(findAddresses(dir, new Set(), only).map((h) => h.file)).toEqual([join(dir, "dashboard/x.html")]);
    expect(findInlineHex(dir, new Set(), only).map((h) => h.file)).toEqual([join(dir, "dashboard/x.html")]);
  });
});
