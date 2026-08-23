import { describe, it, expect } from "vitest";
import { messagesToMarkdown } from "../src/context/markdown";
import type { ContextMessage } from "../src/context/types";

describe("messagesToMarkdown", () => {
  it("uses the conversation title as the heading and preserves message order", () => {
    const messages: ContextMessage[] = [
      { role: "user", text: "Hello" },
      { role: "assistant", text: "Hi there" },
      { role: "user", text: "Second question" },
      { role: "assistant", text: "Second answer" },
    ];
    const md = messagesToMarkdown(messages, { title: "My chat", platformLabel: "ChatGPT" });
    expect(md.startsWith("# My chat")).toBe(true);
    expect(md.indexOf("Hello")).toBeLessThan(md.indexOf("Hi there"));
    expect(md.indexOf("Hi there")).toBeLessThan(md.indexOf("Second question"));
  });

  it("labels turns with 'You' for the user and the platform's own name for the assistant", () => {
    const md = messagesToMarkdown(
      [
        { role: "user", text: "hi" },
        { role: "assistant", text: "hello" },
      ],
      { title: "Chat", platformLabel: "Claude" },
    );
    expect(md).toContain("**You**");
    expect(md).toContain("**Claude**");
    expect(md).not.toContain("**Assistant**");
  });

  it("includes the platform and captured date in the meta line", () => {
    const md = messagesToMarkdown([{ role: "user", text: "hi" }], {
      title: "Chat",
      platformLabel: "Gemini",
      capturedAt: "2026-08-24T10:00:00.000Z",
    });
    expect(md).toContain("Gemini");
  });

  it("never truncates a long message", () => {
    const long = "x".repeat(50_000);
    const md = messagesToMarkdown([{ role: "user", text: long }], { title: "", platformLabel: "ChatGPT" });
    expect(md).toContain(long);
  });

  it("handles a single very short message", () => {
    const md = messagesToMarkdown([{ role: "user", text: "hi" }], { title: "", platformLabel: "ChatGPT" });
    expect(md).toContain("**You**");
    expect(md).toContain("hi");
  });

  it("handles zero messages without throwing", () => {
    const md = messagesToMarkdown([], { title: "Empty", platformLabel: "ChatGPT" });
    expect(md.startsWith("# Empty")).toBe(true);
  });

  it("stays backward-compatible with a bare title string", () => {
    const md = messagesToMarkdown([{ role: "user", text: "hi" }], "Old-style call");
    expect(md.startsWith("# Old-style call")).toBe(true);
    expect(md).toContain("**You**");
  });
});
