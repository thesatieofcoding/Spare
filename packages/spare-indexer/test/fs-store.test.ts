import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFsStore } from "../src/adapters/fs-store.js";
import { serializeSnapshot, type SnapshotV1 } from "../src/domain/snapshot.js";
import { FOUNDATION, GDONOR } from "./fixtures/observations.js";

const snap = (name = "Fund"): SnapshotV1 => ({
  schemaVersion: 1, network: "mainnet", registryContracts: ["C1"],
  data: { foundations: [{ account: FOUNDATION, name, website: "fund.org", active: true, backfilled: true, registrations: [{ contractId: "C1", intervals: [{ from: 1, to: null }] }] }], donations: [] },
  observations: { generatedAt: "t", cursors: { rpcLedger: 1, registryCursor: null, paymentsCursor: null }, foundations: {} },
});

let dir: string;
let file: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "spare-fs-store-"));
  file = join(dir, "nested", "snapshot.json");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("createFsStore", () => {
  it("reads null when missing, then round-trips a written snapshot (deterministic text)", async () => {
    const store = createFsStore(file);
    expect(await store.read()).toBeNull();
    await store.write(snap());
    expect(await store.read()).toEqual(snap());
    const ser = serializeSnapshot(snap());
    expect(await readFile(file, "utf8")).toBe(ser.ok ? ser.json : "");
    expect(await readdir(join(dir, "nested"))).toEqual(["snapshot.json"]); // no tmp left behind
  });

  it("a failing rename leaves the prior snapshot unchanged and cleans the tmp file", async () => {
    await createFsStore(file).write(snap("Old"));
    const before = await readFile(file, "utf8");
    const failing = createFsStore(file, { rename: () => Promise.reject(new Error("disk full")) });
    await expect(failing.write(snap("New"))).rejects.toThrow("disk full");
    expect(await readFile(file, "utf8")).toBe(before);
    expect(await readdir(join(dir, "nested"))).toEqual(["snapshot.json"]);
  });

  it("refuses to write a snapshot leaking a donor address and keeps the prior file", async () => {
    const store = createFsStore(file);
    await store.write(snap("Old"));
    const before = await readFile(file, "utf8");
    const leaky = snap("New");
    leaky.data.foundations[0]!.name = GDONOR;
    await expect(store.write(leaky)).rejects.toThrow(/privacy/);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("rejects an unreadable/invalid stored snapshot instead of treating it as empty", async () => {
    await createFsStore(file).write(snap());
    await writeFile(file, "{not json");
    await expect(createFsStore(file).read()).rejects.toThrow(/snapshot/);
  });
});
