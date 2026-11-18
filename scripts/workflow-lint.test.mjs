import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";

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

describe("indexer.yml", () => {
  const text = () => readFileSync(new URL("indexer.yml", dir), "utf8");
  const lines = () => text().split("\n");

  test("runs on cron 17 */3 and manual dispatch only (no pull_request_target)", () => {
    assert.match(text(), /schedule:\s*\n\s*-\s*cron:\s*["']17 \*\/3 \* \* \*["']/);
    assert.match(text(), /^\s*workflow_dispatch:/m);
    assert.doesNotMatch(text(), /pull_request/);
  });

  test("is guarded by the SPARE_INDEXER_ENABLED variable", () => {
    assert.match(text(), /^\s*if:\s*vars\.SPARE_INDEXER_ENABLED == 'true'\s*$/m);
  });

  test("serializes runs without cancelling an in-flight one", () => {
    assert.match(text(), /concurrency:\s*\n\s*group:\s*indexer\s*\n\s*cancel-in-progress:\s*false/);
  });

  test("permissions are exactly contents: write", () => {
    const m = text().match(/^permissions:\n((?:[ \t]+\S.*\n)+)/m);
    assert.ok(m, "top-level permissions block missing");
    assert.deepEqual(m[1].trim().split("\n").map((l) => l.trim()), ["contents: write"]);
  });

  test("every git push targets the data branch, and nothing references pushing to main", () => {
    const pushes = lines().filter((l) => /\bgit\b.*\bpush\b/.test(l));
    assert.ok(pushes.length >= 1, "expected a git push");
    for (const l of pushes) assert.match(l.trim(), /^git -c http\.extraheader="[^"]*" push origin HEAD:refs\/heads\/data$/, l);
    assert.doesNotMatch(text(), /refs\/heads\/main|origin\s+main|HEAD:main|git\s+push\b.*(--force|\s-f\b)/);
    assert.match(text(), /ref:\s*data\s*\n\s*path:\s*data-branch/);
  });

  const steps = () => text().split(/^      - /m).slice(1);

  test("every checkout sets persist-credentials: false", () => {
    const checkouts = steps().filter((st) => /uses:\s*actions\/checkout@/.test(st));
    assert.equal(checkouts.length, 2);
    for (const st of checkouts) assert.match(st, /persist-credentials:\s*false\b/, st);
  });

  test("the GitHub token is exposed only to the push step", () => {
    const withToken = steps().filter((st) => /secrets\.GITHUB_TOKEN|GH_TOKEN/.test(st));
    assert.equal(withToken.length, 1);
    assert.match(withToken[0], /^name: Push snapshot to data/);
    assert.match(withToken[0], /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
    assert.match(withToken[0], /git -c http\.extraheader=.* push origin HEAD:refs\/heads\/data/);
    assert.doesNotMatch(text(), /persist-credentials:\s*true/);
  });

  test("no expression is interpolated into a run: script (secrets and inputs go through env)", () => {
    let inRun = false;
    let indent = 0;
    for (const [i, line] of lines().entries()) {
      const run = line.match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
      const cur = line.match(/^(\s*)/)[1].length;
      if (run) {
        inRun = run[2] === "|" || run[2] === ">";
        indent = run[1].length;
        if (!inRun) assert.doesNotMatch(run[2], /\$\{\{/, `indexer.yml:${i + 1}`);
      } else if (inRun && line.trim() !== "" && cur <= indent) {
        inRun = false;
      } else if (inRun) {
        assert.doesNotMatch(line, /\$\{\{/, `indexer.yml:${i + 1} interpolates into run:`);
      }
    }
  });

  test("the deploy hook is only called when the secret is set", () => {
    assert.match(text(), /VERCEL_DEPLOY_HOOK_URL:\s*\$\{\{\s*secrets\.VERCEL_DEPLOY_HOOK_URL\s*\}\}/);
    assert.match(text(), /if \[ -n "\$VERCEL_DEPLOY_HOOK_URL" \]/);
  });

  test("RPC URL comes from secrets only", () => {
    assert.match(text(), /SPARE_RPC_URL:\s*\$\{\{\s*secrets\.SPARE_RPC_URL\s*\}\}/);
    assert.doesNotMatch(text(), /https?:\/\/[^\s"']*(rpc|lightsail)/i);
  });
});

test("ci.yml has an indexer job that typechecks and tests spare-indexer", () => {
  const ci = readFileSync(new URL("ci.yml", dir), "utf8");
  const job = ci.match(/^  indexer:\n((?:    .*\n|\n)+)/m);
  assert.ok(job, "indexer job missing");
  assert.match(job[1], /pnpm -C packages\/spare-indexer typecheck/);
  assert.match(job[1], /pnpm -C packages\/spare-indexer test/);
});
