import { describe, it, expect } from "vitest";
import { matchPlatform, selectAdapter, supportedPlatforms } from "../../src/adapters/registry";
import { loadFixtureDoc } from "../helpers";

describe("adapter matching", () => {
  it("matches known platforms by host", () => {
    expect(matchPlatform("https://chatgpt.com/c/abc")?.id).toBe("chatgpt");
    expect(matchPlatform("https://chat.openai.com/c/abc")?.id).toBe("chatgpt");
    expect(matchPlatform("https://claude.ai/chat/xyz")?.id).toBe("claude");
    expect(matchPlatform("https://gemini.google.com/app/1")?.id).toBe("gemini");
  });

  it("returns null for unknown hosts (generic handled separately)", () => {
    expect(matchPlatform("https://example.com/chat")).toBeNull();
  });

  it("falls back to the generic adapter when no platform matches", () => {
    const doc = loadFixtureDoc("generic/basic.html");
    const adapter = selectAdapter(doc, "https://example.com/chat");
    expect(adapter.id).toBe("generic");
    expect(adapter.generic).toBe(true);
  });

  it("exposes the supported platform list", () => {
    const ids = supportedPlatforms().map((p) => p.id);
    expect(ids).toEqual(["chatgpt", "claude", "gemini"]);
  });
});
