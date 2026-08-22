import type { StoredConversation } from "../shared/types";
import type { AttachmentBlob, ConversationSummary, StorageProvider } from "./provider";
import { toSummary } from "./provider";
import {
  DB_NAME,
  DB_VERSION,
  STORE_ATTACHMENTS,
  STORE_CONVERSATIONS,
  runMigrations,
} from "./migrations/index";

interface AttachmentRecord {
  key: string;
  conversationId: string;
  attachmentId: string;
  filename: string;
  mimeType?: string;
  blob: Blob;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class IndexedDbStorage implements StorageProvider {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = (e) => {
        runMigrations(open.result, e.oldVersion, open.transaction);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return this.dbPromise;
  }

  async saveConversation(record: StoredConversation, attachments: AttachmentBlob[]): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_CONVERSATIONS, STORE_ATTACHMENTS], "readwrite");
    const convStore = tx.objectStore(STORE_CONVERSATIONS);
    const attStore = tx.objectStore(STORE_ATTACHMENTS);

    // Replace any previous attachments for this conversation id.
    const idx = attStore.index("by_conversation");
    const oldKeys = await req(idx.getAllKeys(IDBKeyRange.only(record.conversationId)));
    for (const k of oldKeys) attStore.delete(k as IDBValidKey);

    convStore.put(record);
    for (const a of attachments) {
      const rec: AttachmentRecord = {
        key: `${record.conversationId}:${a.attachmentId}`,
        conversationId: record.conversationId,
        attachmentId: a.attachmentId,
        filename: a.filename,
        mimeType: a.mimeType,
        blob: a.blob,
      };
      attStore.put(rec);
    }
    await done(tx);
  }

  async getConversation(id: string): Promise<StoredConversation | null> {
    const db = await this.open();
    const tx = db.transaction(STORE_CONVERSATIONS, "readonly");
    const r = await req(tx.objectStore(STORE_CONVERSATIONS).get(id));
    return (r as StoredConversation) ?? null;
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const db = await this.open();
    const tx = db.transaction(STORE_CONVERSATIONS, "readonly");
    const all = (await req(tx.objectStore(STORE_CONVERSATIONS).getAll())) as StoredConversation[];
    return all
      .map(toSummary)
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_CONVERSATIONS, STORE_ATTACHMENTS], "readwrite");
    tx.objectStore(STORE_CONVERSATIONS).delete(id);
    const idx = tx.objectStore(STORE_ATTACHMENTS).index("by_conversation");
    const keys = await req(idx.getAllKeys(IDBKeyRange.only(id)));
    for (const k of keys) tx.objectStore(STORE_ATTACHMENTS).delete(k as IDBValidKey);
    await done(tx);
  }

  async deleteAll(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_CONVERSATIONS, STORE_ATTACHMENTS], "readwrite");
    tx.objectStore(STORE_CONVERSATIONS).clear();
    tx.objectStore(STORE_ATTACHMENTS).clear();
    await done(tx);
  }

  async getAttachmentBlobs(conversationId: string): Promise<AttachmentBlob[]> {
    const db = await this.open();
    const tx = db.transaction(STORE_ATTACHMENTS, "readonly");
    const idx = tx.objectStore(STORE_ATTACHMENTS).index("by_conversation");
    const recs = (await req(idx.getAll(IDBKeyRange.only(conversationId)))) as AttachmentRecord[];
    return recs.map((r) => ({
      attachmentId: r.attachmentId,
      filename: r.filename,
      mimeType: r.mimeType,
      blob: r.blob,
    }));
  }

  async has(id: string): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction(STORE_CONVERSATIONS, "readonly");
    const key = await req(tx.objectStore(STORE_CONVERSATIONS).getKey(id));
    return key !== undefined;
  }

  async estimate(): Promise<{ usage: number; quota: number }> {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    }
    return { usage: 0, quota: 0 };
  }
}

/** Shared singleton for extension pages / service worker. */
export const storage: StorageProvider = new IndexedDbStorage();
