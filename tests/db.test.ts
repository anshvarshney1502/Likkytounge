import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/storage/db";
import type { Capsule, Folder } from "../src/shared/types";
import { randomId } from "../src/utils/id";

function makeCap(overrides: Partial<Capsule> = {}): Capsule {
  const now = new Date().toISOString();
  return {
    id: randomId("cap"),
    title: "Sample",
    body: "context body",
    summary: "context body",
    folderId: null,
    tags: [],
    useCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
function makeFolder(name = "Engineering"): Folder {
  return { id: randomId("fld"), name, order: 0, createdAt: new Date().toISOString() };
}

describe("Capsule + Folder IndexedDB", () => {
  beforeEach(async () => {
    await db.clearAll();
  });

  it("stores and lists capsules newest-first", async () => {
    const older = makeCap({ updatedAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeCap({ updatedAt: "2026-08-22T00:00:00.000Z" });
    await db.upsertCapsule(older);
    await db.upsertCapsule(newer);
    const list = await db.listCapsules();
    expect(list.map((c) => c.id)).toEqual([newer.id, older.id]);
  });

  it("bumps use count", async () => {
    const c = makeCap();
    await db.upsertCapsule(c);
    await db.bumpUsage(c.id);
    await db.bumpUsage(c.id);
    const got = await db.getCapsule(c.id);
    expect(got?.useCount).toBe(2);
  });

  it("deleting a folder detaches its capsules (moves them to Uncategorized)", async () => {
    const f = makeFolder();
    await db.upsertFolder(f);
    const c = makeCap({ folderId: f.id });
    await db.upsertCapsule(c);
    await db.deleteFolder(f.id);
    const got = await db.getCapsule(c.id);
    expect(got?.folderId).toBeNull();
    const folders = await db.listFolders();
    expect(folders).toHaveLength(0);
  });

  it("mergeImport only adds items whose ids don't already exist", async () => {
    const existing = makeCap({ id: "cap_keep" });
    await db.upsertCapsule(existing);
    const importedNew = makeCap({ id: "cap_new" });
    const importedDupe = makeCap({ id: "cap_keep", title: "IMPORTED" });
    const result = await db.mergeImport([importedNew, importedDupe], []);
    expect(result.capsulesAdded).toBe(1);
    const list = await db.listCapsules();
    expect(list.find((c) => c.id === "cap_keep")?.title).toBe("Sample"); // original preserved
    expect(list.find((c) => c.id === "cap_new")).toBeTruthy();
  });

  it("replaceAll wipes and reloads the vault", async () => {
    await db.upsertCapsule(makeCap());
    await db.upsertFolder(makeFolder());
    const c2 = makeCap({ id: "only" });
    const f2 = makeFolder("Marketing");
    await db.replaceAll([c2], [f2]);
    expect(await db.listCapsules()).toHaveLength(1);
    expect((await db.listFolders())[0].name).toBe("Marketing");
  });
});
