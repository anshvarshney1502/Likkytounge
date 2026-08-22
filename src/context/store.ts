import type { LatestContext } from "./types";
import { randomId } from "../utils/id";
import { getSettings } from "../shared/settings-store";

// Every successfully generated context is kept forever (until the user
// deletes it) so it shows up in the Context Library sidebar. A separate
// "latestId" pointer tracks which one Upload Context should use — it is
// updated ONLY by setLatestContext(), i.e. only by a successful Generate.
// Deleting or browsing older contexts never changes this pointer, except
// the one safe fallback case: if the current latest context is deleted,
// the pointer moves to the next-newest surviving context (never further
// back than that — if none remain, it's cleared to null).
//
// Split into two object stores — lightweight metadata (fast list scans for
// the sidebar) and bodies (full markdown, fetched only when a context is
// actually opened) — so the sidebar stays fast even with a large library
// full of very long conversations.

const DB_NAME = "likky-tounge-context";
const DB_VERSION = 2;
const STORE_META = "meta";
const STORE_BODY = "bodies";
const STORE_KV = "kv";
const KEY_LATEST = "latestId";
// v1 legacy single-slot store, migrated on upgrade then left empty.
const STORE_V1_LEGACY = "latestContext";
const KEY_V1_LEGACY = "current";

export interface SavedContextMeta {
  id: string;
  title: string;
  platformId: string;
  platformLabel: string;
  conversationUrl: string;
  messageCount: number;
  capturedAt: string;
  truncated: boolean;
  truncatedReason?: string;
  approxSizeBytes: number;
}
export interface SavedContext extends SavedContextMeta {
  markdown: string;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const o = indexedDB.open(DB_NAME, DB_VERSION);
    o.onupgradeneeded = (e) => {
      const db = o.result;
      const tx = o.transaction!;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "id" }).createIndex("by_capturedAt", "capturedAt");
      }
      if (!db.objectStoreNames.contains(STORE_BODY)) {
        db.createObjectStore(STORE_BODY, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV);
      }
      // Migrate the old single-slot v1 store, if present, into the new shape.
      if (e.oldVersion < 2 && db.objectStoreNames.contains(STORE_V1_LEGACY)) {
        try {
          const legacy = tx.objectStore(STORE_V1_LEGACY);
          const getLegacy = legacy.get(KEY_V1_LEGACY);
          getLegacy.onsuccess = () => {
            const old = getLegacy.result as LatestContext | undefined;
            if (old && old.markdown) {
              const id = randomId("ctx");
              const meta: SavedContextMeta = {
                id,
                title: old.conversationTitle || "Untitled conversation",
                platformId: old.platformId,
                platformLabel: old.platformLabel,
                conversationUrl: old.conversationUrl,
                messageCount: old.messageCount,
                capturedAt: old.capturedAt,
                truncated: old.truncated,
                truncatedReason: old.truncatedReason,
                approxSizeBytes: old.markdown.length,
              };
              tx.objectStore(STORE_META).put(meta);
              tx.objectStore(STORE_BODY).put({ id, markdown: old.markdown });
              tx.objectStore(STORE_KV).put(id, KEY_LATEST);
            }
          };
        } catch {
          /* best-effort migration only */
        }
      }
    };
    o.onsuccess = () => resolve(o.result);
    o.onerror = () => reject(o.error);
  });
  return dbPromise;
}

function sizeOf(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Save a newly generated context, and mark it as the latest. */
export async function setLatestContext(ctx: LatestContext): Promise<{ id: string }> {
  const db = await open();
  const id = randomId("ctx");
  const settings = await getSettings();
  const title = settings.autoGenerateTitles
    ? ctx.conversationTitle?.trim() || "Untitled conversation"
    : `${ctx.platformLabel} context — ${new Date(ctx.capturedAt).toLocaleString()}`;
  const meta: SavedContextMeta = {
    id,
    title,
    platformId: ctx.platformId,
    platformLabel: ctx.platformLabel,
    conversationUrl: ctx.conversationUrl,
    messageCount: ctx.messageCount,
    capturedAt: ctx.capturedAt,
    truncated: ctx.truncated,
    truncatedReason: ctx.truncatedReason,
    approxSizeBytes: sizeOf(ctx.markdown),
  };
  const tx = db.transaction([STORE_META, STORE_BODY, STORE_KV], "readwrite");
  tx.objectStore(STORE_META).put(meta);
  tx.objectStore(STORE_BODY).put({ id, markdown: ctx.markdown });
  tx.objectStore(STORE_KV).put(id, KEY_LATEST);
  await txDone(tx);
  return { id };
}

/** The context Upload Context should use — always the most recent successful Generate. */
export async function getLatestContext(): Promise<LatestContext | null> {
  const db = await open();
  const tx = db.transaction([STORE_KV, STORE_META, STORE_BODY], "readonly");
  const latestId = (await req(tx.objectStore(STORE_KV).get(KEY_LATEST))) as string | undefined;
  if (!latestId) return null;
  const meta = (await req(tx.objectStore(STORE_META).get(latestId))) as SavedContextMeta | undefined;
  const body = (await req(tx.objectStore(STORE_BODY).get(latestId))) as { id: string; markdown: string } | undefined;
  if (!meta || !body) return null;
  return {
    id: meta.id,
    markdown: body.markdown,
    platformId: meta.platformId,
    platformLabel: meta.platformLabel,
    conversationUrl: meta.conversationUrl,
    conversationTitle: meta.title,
    messageCount: meta.messageCount,
    capturedAt: meta.capturedAt,
    truncated: meta.truncated,
    truncatedReason: meta.truncatedReason,
  };
}

export async function getLatestContextId(): Promise<string | null> {
  const db = await open();
  const tx = db.transaction(STORE_KV, "readonly");
  const id = (await req(tx.objectStore(STORE_KV).get(KEY_LATEST))) as string | undefined;
  return id ?? null;
}

/** Lightweight list for the sidebar — no markdown bodies loaded. */
export async function listContexts(): Promise<SavedContextMeta[]> {
  const db = await open();
  const tx = db.transaction(STORE_META, "readonly");
  const all = (await req(tx.objectStore(STORE_META).getAll())) as SavedContextMeta[];
  return all.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
}

/** Full record (metadata + markdown) for the viewer — fetched on demand. */
export async function getContext(id: string): Promise<SavedContext | null> {
  const db = await open();
  const tx = db.transaction([STORE_META, STORE_BODY], "readonly");
  const meta = (await req(tx.objectStore(STORE_META).get(id))) as SavedContextMeta | undefined;
  const body = (await req(tx.objectStore(STORE_BODY).get(id))) as { id: string; markdown: string } | undefined;
  if (!meta || !body) return null;
  return { ...meta, markdown: body.markdown };
}

export async function renameContext(id: string, title: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE_META, "readwrite");
  const store = tx.objectStore(STORE_META);
  const meta = (await req(store.get(id))) as SavedContextMeta | undefined;
  if (meta) {
    meta.title = title.trim() || meta.title;
    store.put(meta);
  }
  await txDone(tx);
}

/** Delete a context. If it was the latest, fall back to the next-newest survivor. */
export async function deleteContext(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction([STORE_META, STORE_BODY, STORE_KV], "readwrite");
  const metaStore = tx.objectStore(STORE_META);
  const kvStore = tx.objectStore(STORE_KV);
  const currentLatest = (await req(kvStore.get(KEY_LATEST))) as string | undefined;
  metaStore.delete(id);
  tx.objectStore(STORE_BODY).delete(id);
  if (currentLatest === id) {
    const remaining = (await req(metaStore.getAll())) as SavedContextMeta[];
    const next = remaining.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0];
    if (next) kvStore.put(next.id, KEY_LATEST);
    else kvStore.delete(KEY_LATEST);
  }
  await txDone(tx);
}

/** Delete every context older than `olderThanDays`, keeping the latest safe (never deletes it). */
export async function clearOldContexts(olderThanDays: number): Promise<number> {
  const cutoff = Date.now() - olderThanDays * 86_400_000;
  const list = await listContexts();
  const latestId = await getLatestContextId();
  const toDelete = list.filter((c) => c.id !== latestId && new Date(c.capturedAt).getTime() < cutoff);
  for (const c of toDelete) await deleteContext(c.id);
  return toDelete.length;
}

export async function clearAllContexts(): Promise<void> {
  const db = await open();
  const tx = db.transaction([STORE_META, STORE_BODY, STORE_KV], "readwrite");
  tx.objectStore(STORE_META).clear();
  tx.objectStore(STORE_BODY).clear();
  tx.objectStore(STORE_KV).clear();
  await txDone(tx);
}

/**
 * Full-text search over message bodies. Guarded by a count cap so a very
 * large library doesn't turn every keystroke into a slow full scan — beyond
 * the cap, callers should rely on metadata search (title/platform/date)
 * which stays instant regardless of library size.
 */
const BODY_SEARCH_MAX_CONTEXTS = 300;
export async function searchContextBodies(query: string, candidateIds: string[]): Promise<Set<string>> {
  const q = query.trim().toLowerCase();
  if (!q || candidateIds.length === 0) return new Set();
  const ids = candidateIds.slice(0, BODY_SEARCH_MAX_CONTEXTS);
  const db = await open();
  const tx = db.transaction(STORE_BODY, "readonly");
  const store = tx.objectStore(STORE_BODY);
  const matches = new Set<string>();
  await Promise.all(
    ids.map(async (id) => {
      const body = (await req(store.get(id))) as { id: string; markdown: string } | undefined;
      if (body && body.markdown.toLowerCase().includes(q)) matches.add(id);
    }),
  );
  return matches;
}
export { BODY_SEARCH_MAX_CONTEXTS };

export async function estimateContextStorage(): Promise<{ count: number; usage: number; quota: number }> {
  const list = await listContexts();
  let usage = 0;
  let quota = 0;
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    usage = est.usage ?? 0;
    quota = est.quota ?? 0;
  }
  return { count: list.length, usage, quota };
}
