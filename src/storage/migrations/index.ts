// Versioned IndexedDB schema migrations. Each migration brings the database
// from (version-1) to (version). Add new entries as the schema evolves; old
// saved conversations then upgrade in place on first open.

export const DB_NAME = "localchatvault";
export const DB_VERSION = 1;

export const STORE_CONVERSATIONS = "conversations";
export const STORE_ATTACHMENTS = "attachments";

/** Run structural upgrades. Called from IDBOpenDBRequest.onupgradeneeded. */
export function runMigrations(db: IDBDatabase, oldVersion: number, _tx: IDBTransaction | null): void {
  // v1: initial schema.
  if (oldVersion < 1) {
    const conv = db.createObjectStore(STORE_CONVERSATIONS, { keyPath: "id" });
    conv.createIndex("by_platform", "platformId", { unique: false });
    conv.createIndex("by_savedAt", "savedAt", { unique: false });
    conv.createIndex("by_conversationId", "conversationId", { unique: false });

    const att = db.createObjectStore(STORE_ATTACHMENTS, { keyPath: "key" });
    att.createIndex("by_conversation", "conversationId", { unique: false });
  }

  // Future: if (oldVersion < 2) { ... transform existing records ... }
}
