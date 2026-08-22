import { describe, it, expect } from "vitest";
import { messagesToMarkdown } from "../src/context/markdown";
import type { ContextMessage } from "../src/context/types";

describe("messagesToMarkdown", () => {
  it("produces the exact requested structure and preserves order", () => {
    const messages: ContextMessage[] = [
      { role: "user", text: "Hello" },
      { role: "assistant", text: "Hi there" },
      { role: "user", text: "Second question" },
      { role: "assistant", text: "Second answer" },
    ];
    const md = messagesToMarkdown(messages, "My chat");
    expect(md.startsWith("# Conversation Context")).toBe(true);
    const order = [...md.matchAll(/^## (User|Assistant)$/gm)].map((m) => m[1]);
    expect(order).toEqual(["User", "Assistant", "User", "Assistant"]);
    expect(md).toContain("Hello");
    expect(md).toContain("Second answer");
    // Order in the raw string too (not just heading order).
    expect(md.indexOf("Hello")).toBeLessThan(md.indexOf("Hi there"));
    expect(md.indexOf("Hi there")).toBeLessThan(md.indexOf("Second question"));
  });

  it("never truncates a long message", () => {
    const long = "x".repeat(50_000);
    const md = messagesToMarkdown([{ role: "user", text: long }], "");
    expect(md).toContain(long);
  });

  it("handles a single very short message", () => {
    const md = messagesToMarkdown([{ role: "user", text: "hi" }], "");
    expect(md).toContain("## User");
    expect(md).toContain("hi");
  });

  it("handles zero messages without throwing", () => {
    const md = messagesToMarkdown([], "");
    expect(md.startsWith("# Conversation Context")).toBe(true);
  });
});
