import { describe, it, expect } from "vitest";
import { elementToBlocks, blocksToMarkdown } from "../../src/utils/html-to-blocks";
import { deriveConversationId } from "../../src/utils/id";

function el(html: string): Element {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  return doc.body.firstElementChild!;
}

describe("elementToBlocks", () => {
  it("interleaves text, code, and image blocks in reading order", () => {
    const blocks = elementToBlocks(
      el(`<p>Intro</p><pre><code class="language-js">const x=1</code></pre><p>After</p><img src="https://x/i.png" alt="pic">`),
    );
    expect(blocks.map((b) => b.type)).toEqual(["text", "code", "text", "image"]);
    expect(blocks[1].type === "code" && blocks[1].language).toBe("js");
    expect(blocks[3].type === "image" && blocks[3].url).toBe("https://x/i.png");
  });

  it("converts inline formatting and links to markdown", () => {
    const blocks = elementToBlocks(el(`<p>See <a href="https://a.com">site</a> and <strong>bold</strong>.</p>`));
    expect(blocksToMarkdown(blocks)).toContain("[site](https://a.com)");
    expect(blocksToMarkdown(blocks)).toContain("**bold**");
  });

  it("skips buttons and aria-hidden chrome", () => {
    const blocks = elementToBlocks(el(`<div><button>Copy</button><span aria-hidden="true">x</span><p>Real</p></div>`));
    expect(blocksToMarkdown(blocks)).toBe("Real");
  });
});

describe("deriveConversationId", () => {
  it("uses the platform conversation id when available", () => {
    expect(deriveConversationId("chatgpt", "uuid-1", "https://x", "T")).toBe("chatgpt:uuid-1");
  });

  it("is stable for the same url+title and differs otherwise", () => {
    const a = deriveConversationId("gemini", null, "https://g/app/1", "Chat");
    const b = deriveConversationId("gemini", null, "https://g/app/1", "Chat");
    const c = deriveConversationId("gemini", null, "https://g/app/2", "Chat");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
