import { describe, it, expect } from "vitest";
import { conversationToPlaintext } from "../../src/export/plaintext";
import { sampleConversation } from "./export.test";

describe("plaintext export", () => {
  it("contains title, roles, and no markdown decorations", () => {
    const txt = conversationToPlaintext(sampleConversation());
    expect(txt).toContain("Machine Learning: Notes / Draft");
    expect(txt).toContain("You"); // user label
    expect(txt).toContain("AI"); // assistant label
    // No markdown fences or heading hashes.
    expect(txt).not.toMatch(/^#/m);
    expect(txt).not.toMatch(/```/);
    expect(txt).not.toMatch(/\*\*/);
    // Code block delimiters use plain "--- code ---" markers.
    expect(txt).toContain("--- code (python) ---");
    expect(txt).toContain("w -= lr * grad");
  });

  it("converts markdown links to 'text (url)'", () => {
    const conv = sampleConversation();
    conv.messages[0].content = [
      { type: "text", text: "See [docs](https://example.com/x) for details." },
    ];
    const txt = conversationToPlaintext(conv);
    expect(txt).toContain("See docs (https://example.com/x) for details.");
    expect(txt).not.toContain("[docs]");
  });

  it("keeps bullet list markers as readable bullets", () => {
    const conv = sampleConversation();
    conv.messages[0].content = [{ type: "text", text: "- one\n- two\n- three" }];
    const txt = conversationToPlaintext(conv);
    expect(txt).toContain("• one");
    expect(txt).toContain("• two");
  });
});
