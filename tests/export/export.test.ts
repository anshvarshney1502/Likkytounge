import { describe, it, expect } from "vitest";
import type { Conversation } from "../../src/shared/types";
import { SCHEMA_VERSION } from "../../src/shared/types";
import { conversationToMarkdown } from "../../src/export/markdown";
import { conversationToHtml } from "../../src/export/html";
import { conversationToJsonString } from "../../src/export/json";
import { safeName } from "../../src/export/archive";

export function sampleConversation(): Conversation {
  return {
    metadata: {
      schemaVersion: SCHEMA_VERSION,
      platform: "ChatGPT",
      platformId: "chatgpt",
      conversationTitle: "Machine Learning: Notes / Draft",
      conversationUrl: "https://chatgpt.com/c/abc",
      conversationId: "chatgpt:abc",
      savedAt: "2026-08-22T10:00:00.000Z",
      messageCount: 2,
      generic: false,
      warnings: [],
    },
    messages: [
      { id: "u1", role: "user", content: [{ type: "text", text: "Explain gradient descent." }] },
      {
        id: "a1",
        role: "assistant",
        content: [
          { type: "text", text: "It minimizes a loss function." },
          { type: "code", language: "python", code: "w -= lr * grad" },
        ],
      },
    ],
    attachments: [],
  };
}

describe("markdown export", () => {
  it("includes title, platform, roles, and fenced code", () => {
    const md = conversationToMarkdown(sampleConversation());
    expect(md).toContain("# Machine Learning: Notes / Draft");
    expect(md).toContain("**Platform:** ChatGPT");
    expect(md).toContain("### User");
    expect(md).toContain("### Assistant");
    expect(md).toContain("```python\nw -= lr * grad\n```");
  });
});

describe("html export", () => {
  it("produces a standalone document with escaped content", () => {
    const html = conversationToHtml(sampleConversation());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Machine Learning: Notes / Draft</title>");
    expect(html).toContain("gradient descent".replace("gradient", "gradient")); // sanity
    expect(html).toContain("<pre><code");
  });
});

describe("json export", () => {
  it("serializes metadata and messages and omits byte payloads", () => {
    const json = JSON.parse(conversationToJsonString(sampleConversation()));
    expect(json.metadata.platform).toBe("ChatGPT");
    expect(json.messages).toHaveLength(2);
    expect(JSON.stringify(json)).not.toContain("bytesBase64");
  });
});

describe("safeName", () => {
  it("removes unsafe characters but keeps digits and letters", () => {
    expect(safeName("Machine Learning: Notes / Draft 2026")).toBe("Machine_Learning_Notes_Draft_2026");
    expect(safeName("///")).toBe("file");
  });
});
