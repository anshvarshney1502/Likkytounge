// jsdom's Blob implementation lacks arrayBuffer()/text()/stream(). Node's
// built-in Blob (from node:buffer) is spec-complete, so we use it in tests.
// The real extension runs in Chrome where Blob is fully featured.
import { Blob as NodeBlob } from "node:buffer";

// @ts-expect-error override jsdom's partial Blob
globalThis.Blob = NodeBlob;

// jsdom implements none of DataTransfer / ClipboardEvent / DragEvent, so
// neither the synthetic paste path (src/content/insert.ts) nor the file
// attachment path (src/content/attach.ts) can be exercised without them.
// Real Chrome provides all three; these are minimal stand-ins covering only
// the surface those paths use: setData/getData, items.add + files, and the
// event objects that carry them.
if (typeof (globalThis as { DataTransfer?: unknown }).DataTransfer === "undefined") {
  class FakeDataTransfer {
    private data = new Map<string, string>();
    private fileList: File[] = [];
    readonly items = {
      add: (file: File) => {
        this.fileList.push(file);
      },
    };
    get files(): File[] {
      return this.fileList;
    }
    setData(type: string, value: string): void {
      this.data.set(type, value);
    }
    getData(type: string): string {
      return this.data.get(type) ?? "";
    }
  }
  (globalThis as { DataTransfer?: unknown }).DataTransfer = FakeDataTransfer;

  class FakeClipboardEvent extends Event {
    clipboardData: FakeDataTransfer | null;
    constructor(type: string, init?: EventInit & { clipboardData?: FakeDataTransfer }) {
      super(type, init);
      this.clipboardData = init?.clipboardData ?? null;
    }
  }
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = FakeClipboardEvent;

  class FakeDragEvent extends Event {
    dataTransfer: FakeDataTransfer | null;
    constructor(type: string, init?: EventInit & { dataTransfer?: FakeDataTransfer }) {
      super(type, init);
      this.dataTransfer = init?.dataTransfer ?? null;
    }
  }
  (globalThis as { DragEvent?: unknown }).DragEvent = FakeDragEvent;
}

// jsdom does define an HTMLInputElement.files setter, but it rejects
// anything that is not a genuine FileList — and jsdom provides no way to
// construct one. Chrome accepts `input.files = dataTransfer.files`, which is
// how a file is handed to a site's uploader, so the accessor is replaced
// outright here with a permissive one.
{
  const proto = globalThis.HTMLInputElement?.prototype;
  if (proto) {
    const store = new WeakMap<HTMLInputElement, File[] | null>();
    Object.defineProperty(proto, "files", {
      configurable: true,
      get(this: HTMLInputElement) {
        return store.get(this) ?? null;
      },
      set(this: HTMLInputElement, v: File[] | null) {
        store.set(this, v);
      },
    });
  }
}

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
