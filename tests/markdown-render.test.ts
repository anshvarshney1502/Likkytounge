import { describe, it, expect } from "vitest";
import { markdownToHtml, splitConversationMarkdown } from "../src/export/markdown-render";
import { markdownToPlaintext } from "../src/export/to-plaintext";

describe("markdownToHtml", () => {
  it("renders headings, paragraphs, bold, italic, inline code, and links", () => {
    const html = markdownToHtml("## Title\n\nHello **world**, this is *nice* and `code`.\n\nSee [docs](https://example.com).");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("<em>nice</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://example.com"');
  });

  it("renders fenced code blocks with a language class", () => {
    const html = markdownToHtml("```python\nprint('hi')\n```");
    expect(html).toContain('class="language-python"');
    expect(html).toContain("print('hi')"); // content preserved verbatim (single quotes need no escaping)
  });

  it("renders unordered and ordered lists", () => {
    const html = markdownToHtml("- one\n- two\n\n1. first\n2. second");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>first</li>");
  });

  it("renders blockquotes and horizontal rules", () => {
    const html = markdownToHtml("> quoted text\n\n---");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("quoted text");
    expect(html).toContain("<hr>");
  });

  it("renders a GFM pipe table", () => {
    const html = markdownToHtml("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("escapes HTML in plain text so user content can't inject markup", () => {
    const html = markdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("splitConversationMarkdown", () => {
  it("splits into meta + one block per role heading, preserving order", () => {
    const md = "# Conversation Context\n\n## User\nHello\n\n## Assistant\nHi there\n\n## User\nBye";
    const sections = splitConversationMarkdown(md);
    const roles = sections.map((s) => s.role);
    expect(roles).toEqual(["meta", "user", "assistant", "user"]);
    expect(sections[1].html).toContain("Hello");
    expect(sections[2].html).toContain("Hi there");
  });
});

describe("markdownToPlaintext", () => {
  it("strips markdown syntax but keeps content", () => {
    const txt = markdownToPlaintext("## Heading\n\n**bold** and *italic* and `code`\n\n[link](https://x.com)");
    expect(txt).not.toContain("##");
    expect(txt).not.toContain("**");
    expect(txt).not.toContain("`code`");
    expect(txt).toContain("bold");
    expect(txt).toContain("italic");
    expect(txt).toContain("link (https://x.com)");
  });

  it("never drops the underlying text content of a long conversation", () => {
    const long = "word ".repeat(20000);
    const txt = markdownToPlaintext(`## User\n${long}`);
    expect(txt.length).toBeGreaterThan(long.length * 0.9);
  });
});
