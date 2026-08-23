import { describe, it, expect } from "vitest";
import { messagesToMarkdown } from "../src/context/markdown";
import { splitConversationMarkdown } from "../src/export/markdown-render";
import { markdownToPlaintext } from "../src/export/to-plaintext";
import type { ContextMessage } from "../src/context/types";

describe("messagesToMarkdown + splitConversationMarkdown integration", () => {
  const messages: ContextMessage[] = [
    { role: "user", text: "How should I structure this?" },
    { role: "assistant", text: "Here's a plan:\n\n- step one\n- step two" },
    { role: "user", text: "Make it scalable." },
    { role: "assistant", text: "For scalability, consider caching." },
  ];

  it("splits generated markdown back into the correct role sequence", () => {
    const md = messagesToMarkdown(messages, { title: "Test chat", platformLabel: "ChatGPT" });
    const sections = splitConversationMarkdown(md).filter((s) => s.role !== "meta");
    expect(sections.map((s) => s.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(sections[0].html).toContain("How should I structure this?");
    expect(sections[3].html).toContain("caching");
  });

  it("does not treat a standalone bold line inside a message as a new turn", () => {
    // This is the exact ambiguity a naive "**Label**-alone-on-a-line" parser
    // would misfire on: the assistant's own reply legitimately contains a
    // standalone bolded line that is NOT a speaker change.
    const withBoldNote: ContextMessage[] = [
      { role: "user", text: "Any gotchas?" },
      { role: "assistant", text: "Sure, one thing:\n\n**Note:**\n\nWatch for rate limits." },
    ];
    const md = messagesToMarkdown(withBoldNote, { title: "T", platformLabel: "Claude" });
    const sections = splitConversationMarkdown(md).filter((s) => s.role !== "meta");
    expect(sections.map((s) => s.role)).toEqual(["user", "assistant"]);
    expect(sections[1].html).toContain("Watch for rate limits");
  });

  it("preserves paragraph breaks in a multi-paragraph reply", () => {
    const multiPara: ContextMessage[] = [
      { role: "user", text: "Explain X." },
      { role: "assistant", text: "First paragraph.\n\nSecond paragraph.\n\nThird paragraph." },
    ];
    const md = messagesToMarkdown(multiPara, { title: "T", platformLabel: "Gemini" });
    const sections = splitConversationMarkdown(md).filter((s) => s.role !== "meta");
    const html = sections[1].html;
    expect((html.match(/<p>/g) ?? []).length).toBe(3);
  });

  it("plain text export reads as a labeled chat transcript", () => {
    const md = messagesToMarkdown(messages, { title: "Test chat", platformLabel: "ChatGPT" });
    const txt = markdownToPlaintext(md);
    expect(txt).toContain("YOU");
    expect(txt).toContain("CHATGPT");
    expect(txt).not.toContain("**");
    expect(txt).not.toContain("<!--");
    expect(txt.indexOf("How should I structure this?")).toBeLessThan(txt.indexOf("Here's a plan"));
  });

  it("never truncates a long reply in the plaintext export", () => {
    const long = "y".repeat(30_000);
    const md = messagesToMarkdown([{ role: "assistant", text: long }], { title: "", platformLabel: "ChatGPT" });
    const txt = markdownToPlaintext(md);
    expect(txt).toContain(long);
  });
});
