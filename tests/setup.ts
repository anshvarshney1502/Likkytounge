// jsdom's Blob implementation lacks arrayBuffer()/text()/stream(). Node's
// built-in Blob (from node:buffer) is spec-complete, so we use it in tests.
// The real extension runs in Chrome where Blob is fully featured.
import { Blob as NodeBlob } from "node:buffer";

// @ts-expect-error override jsdom's partial Blob
globalThis.Blob = NodeBlob;

// Minimal chrome.storage.local mock so background-side code (settings-store,
// context/store.ts) can run under vitest without a real extension host.
// Cast through unknown: this is intentionally a partial stub, not a
// structurally complete implementation of the chrome.* types.
const memoryStore: Record<string, unknown> = {};
globalThis.chrome = {
  storage: {
    local: {
      get: (key: string) =>
        Promise.resolve(key in memoryStore ? { [key]: memoryStore[key] } : {}),
      set: (items: Record<string, unknown>) => {
        Object.assign(memoryStore, items);
        return Promise.resolve();
      },
      remove: (key: string) => {
        delete memoryStore[key];
        return Promise.resolve();
      },
    },
    onChanged: { addListener: () => {} },
  },
} as unknown as typeof chrome;
