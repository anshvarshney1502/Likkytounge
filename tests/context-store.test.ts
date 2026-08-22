import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  setLatestContext,
  getLatestContext,
  listContexts,
  getContext,
  deleteContext,
  renameContext,
  clearAllContexts,
} from "../src/context/store";
import type { LatestContext } from "../src/context/types";

function makeCtx(overrides: Partial<LatestContext> = {}): LatestContext {
  return {
    markdown: "# Conversation Context\n\n## User\nhi\n\n## Assistant\nhello\n",
    platformId: "chatgpt",
    platformLabel: "ChatGPT",
    conversationUrl: "https://chatgpt.com/c/1",
    conversationTitle: "Test chat",
    messageCount: 2,
    capturedAt: new Date().toISOString(),
    truncated: false,
    ...overrides,
  };
}

describe("context store", () => {
  beforeEach(async () => {
    await clearAllContexts();
  });

  it("saving a context makes it the latest", async () => {
    const { id } = await setLatestContext(makeCtx({ conversationTitle: "A" }));
    const latest = await getLatestContext();
    expect(latest?.id).toBe(id);
    expect(latest?.conversationTitle).toBe("A");
  });

  it("generating B after A makes B the latest, not A", async () => {
    await setLatestContext(makeCtx({ conversationTitle: "A", capturedAt: "2026-01-01T00:00:00.000Z" }));
    const b = await setLatestContext(makeCtx({ conversationTitle: "B", capturedAt: "2026-01-02T00:00:00.000Z" }));
    const latest = await getLatestContext();
    expect(latest?.id).toBe(b.id);
    expect(latest?.conversationTitle).toBe("B");
  });

  it("keeps every generated context in the library, newest first", async () => {
    await setLatestContext(makeCtx({ conversationTitle: "A", capturedAt: "2026-01-01T00:00:00.000Z" }));
    await setLatestContext(makeCtx({ conversationTitle: "B", capturedAt: "2026-01-02T00:00:00.000Z" }));
    await setLatestContext(makeCtx({ conversationTitle: "C", capturedAt: "2026-01-03T00:00:00.000Z" }));
    const list = await listContexts();
    expect(list.map((c) => c.title)).toEqual(["C", "B", "A"]);
  });

  it("deleting an older (non-latest) context does not change the latest pointer", async () => {
    const a = await setLatestContext(makeCtx({ conversationTitle: "A", capturedAt: "2026-01-01T00:00:00.000Z" }));
    const b = await setLatestContext(makeCtx({ conversationTitle: "B", capturedAt: "2026-01-02T00:00:00.000Z" }));
    await deleteContext(a.id);
    const latest = await getLatestContext();
    expect(latest?.id).toBe(b.id);
  });

  it("deleting the latest context falls back to the next-newest survivor", async () => {
    const a = await setLatestContext(makeCtx({ conversationTitle: "A", capturedAt: "2026-01-01T00:00:00.000Z" }));
    const b = await setLatestContext(makeCtx({ conversationTitle: "B", capturedAt: "2026-01-02T00:00:00.000Z" }));
    await deleteContext(b.id);
    const latest = await getLatestContext();
    expect(latest?.id).toBe(a.id);
  });

  it("deleting the only context leaves no latest context", async () => {
    const a = await setLatestContext(makeCtx());
    await deleteContext(a.id);
    expect(await getLatestContext()).toBeNull();
  });

  it("listContexts never includes the markdown body (stays lightweight)", async () => {
    await setLatestContext(makeCtx());
    const list = await listContexts();
    expect((list[0] as unknown as { markdown?: string }).markdown).toBeUndefined();
  });

  it("getContext fetches the full body on demand", async () => {
    const { id } = await setLatestContext(makeCtx());
    const full = await getContext(id);
    expect(full?.markdown).toContain("## User");
  });

  it("renameContext updates the title without touching the body", async () => {
    const { id } = await setLatestContext(makeCtx({ conversationTitle: "Old" }));
    await renameContext(id, "New title");
    const full = await getContext(id);
    expect(full?.title).toBe("New title");
    expect(full?.markdown).toContain("## User");
  });

  it("never marks an unsaved/failed generation as latest (no message = no store call)", async () => {
    // This is really an invariant of the caller (generate.ts only calls
    // setLatestContext after a successful extraction) but we verify the
    // store itself doesn't fabricate a latest context out of nothing.
    expect(await getLatestContext()).toBeNull();
  });
});
