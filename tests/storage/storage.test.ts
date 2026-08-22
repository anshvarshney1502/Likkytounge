import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { IndexedDbStorage } from "../../src/storage/indexeddb";
import type { StoredConversation } from "../../src/shared/types";
import { sampleConversation } from "../export/export.test";
import { makeBlob } from "../../src/utils/bytes";

function record(idSuffix = ""): StoredConversation {
  const conv = sampleConversation();
  conv.metadata.conversationId = `chatgpt:abc${idSuffix}`;
  conv.attachments = [
    { id: "att1", filename: "note.txt", mimeType: "text/plain", availableLocally: true, localPath: "attachments/note.txt" },
  ];
  return {
    id: conv.metadata.conversationId,
    conversationId: conv.metadata.conversationId,
    snapshotId: "snap1",
    platform: conv.metadata.platform,
    platformId: conv.metadata.platformId,
    title: conv.metadata.conversationTitle,
    url: conv.metadata.conversationUrl,
    savedAt: conv.metadata.savedAt,
    messageCount: conv.metadata.messageCount,
    attachmentCount: conv.attachments.length,
    generic: false,
    schemaVersion: conv.metadata.schemaVersion,
    conversation: conv,
  };
}

describe("IndexedDbStorage", () => {
  let storage: IndexedDbStorage;
  beforeEach(async () => {
    storage = new IndexedDbStorage();
    await storage.deleteAll();
  });

  it("saves and retrieves a conversation with attachment blob", async () => {
    const rec = record();
    const blob = makeBlob([new Uint8Array([104, 105])], "text/plain"); // "hi"
    await storage.saveConversation(rec, [{ attachmentId: "att1", filename: "note.txt", blob }]);

    const got = await storage.getConversation(rec.id);
    expect(got?.title).toBe(rec.title);
    const blobs = await storage.getAttachmentBlobs(rec.conversationId);
    expect(blobs).toHaveLength(1);
    expect(await blobs[0].blob.text()).toBe("hi");
  });

  it("lists conversations sorted newest-first", async () => {
    const a = record("-1");
    a.savedAt = "2026-08-20T00:00:00.000Z";
    const b = record("-2");
    b.savedAt = "2026-08-22T00:00:00.000Z";
    await storage.saveConversation(a, []);
    await storage.saveConversation(b, []);
    const list = await storage.listConversations();
    expect(list.map((c) => c.id)).toEqual([b.id, a.id]);
  });

  it("prevents duplicates: re-saving the same id updates in place", async () => {
    await storage.saveConversation(record(), []);
    const rec2 = record();
    rec2.title = "Updated title";
    await storage.saveConversation(rec2, []);
    const list = await storage.listConversations();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Updated title");
    expect(await storage.has(rec2.id)).toBe(true);
  });

  it("deletes a conversation and its attachments", async () => {
    const rec = record();
    await storage.saveConversation(rec, [
      { attachmentId: "att1", filename: "note.txt", blob: makeBlob([new Uint8Array([1])]) },
    ]);
    await storage.deleteConversation(rec.id);
    expect(await storage.getConversation(rec.id)).toBeNull();
    expect(await storage.getAttachmentBlobs(rec.conversationId)).toHaveLength(0);
  });
});
