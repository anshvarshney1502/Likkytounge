import { describe, it, expect } from "vitest";
import { chatgptModule } from "../../src/adapters/chatgpt/adapter";
import { claudeModule } from "../../src/adapters/claude/adapter";
import { geminiModule } from "../../src/adapters/gemini/adapter";
import { genericModule } from "../../src/adapters/generic/adapter";
import { loadFixtureDoc } from "../helpers";

describe("ChatGPT extraction", () => {
  const doc = loadFixtureDoc("chatgpt/basic.html");
  const adapter = chatgptModule.create(doc, "https://chatgpt.com/c/1234-5678-uuid");

  it("extracts messages in order with correct roles", () => {
    const msgs = adapter.getMessages();
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("preserves code blocks with language", () => {
    const assistant = adapter.getMessages()[1];
    const code = assistant.content.find((b) => b.type === "code");
    expect(code).toBeTruthy();
    expect(code && code.type === "code" && code.language).toBe("python");
    expect(code && code.type === "code" && code.code).toContain("def quicksort");
  });

  it("preserves links and strips UI buttons", () => {
    const text = adapter
      .getMessages()[1]
      .content.filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");
    expect(text).toContain("[docs](https://docs.python.org/3/)");
    expect(text).not.toContain("Copy code");
  });

  it("reads metadata and platform conversation id from the URL", () => {
    const meta = adapter.getConversationMetadata();
    expect(meta.title).toBe("Sorting algorithms");
    expect(meta.platformConversationId).toBe("1234-5678-uuid");
  });
});

describe("Claude extraction", () => {
  const doc = loadFixtureDoc("claude/basic.html");
  const adapter = claudeModule.create(doc, "https://claude.ai/chat/abcd");

  it("interleaves user and assistant turns in DOM order", () => {
    const roles = adapter.getMessages().map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user"]);
  });

  it("captures list content and code", () => {
    const assistant = adapter.getMessages()[1];
    const md = assistant.content.map((b) => (b.type === "text" ? b.text : b.type)).join("\n");
    expect(md).toContain("Content scripts");
    expect(assistant.content.some((b) => b.type === "code")).toBe(true);
  });
});

describe("Gemini extraction", () => {
  const doc = loadFixtureDoc("gemini/basic.html");
  const adapter = geminiModule.create(doc, "https://gemini.google.com/app/1");

  it("extracts alternating turns", () => {
    const roles = adapter.getMessages().map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user", "assistant"]);
  });
});

describe("Generic extraction", () => {
  const doc = loadFixtureDoc("generic/basic.html");
  const adapter = genericModule.create(doc, "https://example.com/chat");

  it("infers roles from class hints", () => {
    const msgs = adapter.getMessages();
    expect(msgs.length).toBe(4);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("never emits empty messages", () => {
    for (const m of adapter.getMessages()) {
      expect(m.content.length).toBeGreaterThan(0);
    }
  });
});
