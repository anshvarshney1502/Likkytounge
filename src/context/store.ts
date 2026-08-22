import type { LatestContext } from "./types";

// Single-slot "latest generated context", stored in IndexedDB rather than
// chrome.storage.local because chrome.storage.local caps around 10MB by
// default — a context built from thousands of long messages could exceed
// that. IndexedDB has no such practical ceiling.

const DB_NAME = "likky-tounge-context";
const DB_VERSION = 1;
const STORE = "latestContext";
const KEY = "current";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const o = indexedDB.open(DB_NAME, DB_VERSION);
    o.onupgradeneeded = () => {
      if (!o.result.objectStoreNames.contains(STORE)) {
        o.result.createObjectStore(STORE);
      }
    };
    o.onsuccess = () => resolve(o.result);
    o.onerror = () => reject(o.error);
  });
}

export async function getLatestContext(): Promise<LatestContext | null> {
  const db = await open();
  const tx = db.transaction(STORE, "readonly");
  const val = await req(tx.objectStore(STORE).get(KEY));
  return (val as LatestContext | undefined) ?? null;
}

export async function setLatestContext(ctx: LatestContext): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(ctx, KEY);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearLatestContext(): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(KEY);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
