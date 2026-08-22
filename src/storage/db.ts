import type { Capsule, Folder } from "../shared/types";

const DB_NAME = "likky-tounge";
const DB_VERSION = 1;
const STORE_CAPSULES = "capsules";
const STORE_FOLDERS = "folders";

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

class CapsuleDb {
  private p: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.p) return this.p;
    this.p = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(STORE_CAPSULES)) {
          const s = db.createObjectStore(STORE_CAPSULES, { keyPath: "id" });
          s.createIndex("by_folder", "folderId", { unique: false });
          s.createIndex("by_updatedAt", "updatedAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
          const f = db.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
          f.createIndex("by_order", "order", { unique: false });
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return this.p;
  }

  async listCapsules(): Promise<Capsule[]> {
    const db = await this.open();
    const tx = db.transaction(STORE_CAPSULES, "readonly");
    const all = (await req(tx.objectStore(STORE_CAPSULES).getAll())) as Capsule[];
    return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async getCapsule(id: string): Promise<Capsule | null> {
    const db = await this.open();
    const tx = db.transaction(STORE_CAPSULES, "readonly");
    return ((await req(tx.objectStore(STORE_CAPSULES).get(id))) as Capsule) ?? null;
  }

  async upsertCapsule(c: Capsule): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE_CAPSULES, "readwrite");
    tx.objectStore(STORE_CAPSULES).put(c);
    await done(tx);
  }

  async deleteCapsule(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE_CAPSULES, "readwrite");
    tx.objectStore(STORE_CAPSULES).delete(id);
    await done(tx);
  }

  async bumpUsage(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE_CAPSULES, "readwrite");
    const store = tx.objectStore(STORE_CAPSULES);
    const existing = (await req(store.get(id))) as Capsule | undefined;
    if (existing) {
      existing.useCount = (existing.useCount ?? 0) + 1;
      store.put(existing);
    }
    await done(tx);
  }

  async listFolders(): Promise<Folder[]> {
    const db = await this.open();
    const tx = db.transaction(STORE_FOLDERS, "readonly");
    const all = (await req(tx.objectStore(STORE_FOLDERS).getAll())) as Folder[];
    return all.sort((a, b) =>
      a.order === b.order ? a.name.localeCompare(b.name) : a.order - b.order,
    );
  }

  async upsertFolder(f: Folder): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE_FOLDERS, "readwrite");
    tx.objectStore(STORE_FOLDERS).put(f);
    await done(tx);
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_FOLDERS, STORE_CAPSULES], "readwrite");
    tx.objectStore(STORE_FOLDERS).delete(id);
    // Detach capsules in this folder (move to Uncategorized = null).
    const store = tx.objectStore(STORE_CAPSULES);
    const idx = store.index("by_folder");
    const keys = await req(idx.getAllKeys(IDBKeyRange.only(id)));
    for (const k of keys) {
      const existing = (await req(store.get(k as IDBValidKey))) as Capsule;
      existing.folderId = null;
      store.put(existing);
    }
    await done(tx);
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_FOLDERS, STORE_CAPSULES], "readwrite");
    tx.objectStore(STORE_FOLDERS).clear();
    tx.objectStore(STORE_CAPSULES).clear();
    await done(tx);
  }

  async replaceAll(capsules: Capsule[], folders: Folder[]): Promise<void> {
    await this.clearAll();
    const db = await this.open();
    const tx = db.transaction([STORE_FOLDERS, STORE_CAPSULES], "readwrite");
    for (const f of folders) tx.objectStore(STORE_FOLDERS).put(f);
    for (const c of capsules) tx.objectStore(STORE_CAPSULES).put(c);
    await done(tx);
  }

  async mergeImport(capsules: Capsule[], folders: Folder[]): Promise<{ capsulesAdded: number; foldersAdded: number }> {
    const db = await this.open();
    const tx = db.transaction([STORE_FOLDERS, STORE_CAPSULES], "readwrite");
    let cAdded = 0;
    let fAdded = 0;
    for (const f of folders) {
      const existing = await req(tx.objectStore(STORE_FOLDERS).get(f.id));
      if (!existing) {
        tx.objectStore(STORE_FOLDERS).put(f);
        fAdded++;
      }
    }
    for (const c of capsules) {
      const existing = await req(tx.objectStore(STORE_CAPSULES).get(c.id));
      if (!existing) {
        tx.objectStore(STORE_CAPSULES).put(c);
        cAdded++;
      }
    }
    await done(tx);
    return { capsulesAdded: cAdded, foldersAdded: fAdded };
  }
}

export const db = new CapsuleDb();
