// Platform-independent DOM -> ContentBlock[] normalizer.
//
// Strategy: serialize the element subtree to a markdown-ish string while
// pulling out block-level `pre` (code) and `img` (image) nodes as first-class
// ContentBlocks, using placeholder tokens to preserve their exact position in
// the reading order. This keeps prose, code, and images correctly interleaved
// without relying on fragile per-platform selectors.

import type { ContentBlock } from "../shared/types";

// Private-use sentinel extremely unlikely to appear in real chat text.
const TOKEN = "";
const tokenRe = /(\d+)/g;

interface WalkContext {
  specials: ContentBlock[];
  listStack: Array<{ ordered: boolean; index: number }>;
}

function collectInlineText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function detectLanguage(pre: Element): string | undefined {
  const code = pre.querySelector("code") ?? pre;
  const cls = (code.getAttribute("class") ?? "") + " " + (pre.getAttribute("class") ?? "");
  const m = cls.match(/(?:language|lang|hljs|highlight)[-_ ]([a-z0-9+#]+)/i);
  if (m && m[1] && !/^(hljs|highlight)$/i.test(m[1])) return m[1].toLowerCase();
  // Some UIs put the language in a header element before the <pre>.
  const prev = pre.previousElementSibling;
  if (prev) {
    const t = (prev.textContent ?? "").trim();
    if (t && t.length <= 20 && /^[a-z0-9+#.\- ]+$/i.test(t)) return t.toLowerCase();
  }
  const data = code.getAttribute("data-language") || pre.getAttribute("data-language");
  return data ? data.toLowerCase() : undefined;
}

function preToCode(pre: Element): ContentBlock {
  const codeEl = pre.querySelector("code") ?? pre;
  let code = codeEl.textContent ?? "";
  code = code.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
  return { type: "code", language: detectLanguage(pre), code: code.replace(/\n+$/, "") };
}

function isBlock(tag: string): boolean {
  return /^(p|div|section|article|h[1-6]|ul|ol|li|blockquote|table|thead|tbody|tr|figure|figcaption)$/.test(
    tag,
  );
}

function serialize(node: Node, ctx: WalkContext): string {
  if (node.nodeType === 3 /* text */) {
    return (node.textContent ?? "").replace(/\s+/g, " ");
  }
  if (node.nodeType !== 1 /* element */) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  // Skip obvious UI chrome that leaks into message containers.
  if (/^(button|svg|style|script|noscript)$/.test(tag)) return "";
  if (el.getAttribute("aria-hidden") === "true") return "";

  if (tag === "pre") {
    ctx.specials.push(preToCode(el));
    return `\n\n${TOKEN}${ctx.specials.length - 1}${TOKEN}\n\n`;
  }
  if (tag === "img") {
    const url = el.getAttribute("src") || undefined;
    const alt = el.getAttribute("alt") || undefined;
    ctx.specials.push({ type: "image", url, alt });
    return `${TOKEN}${ctx.specials.length - 1}${TOKEN}`;
  }

  switch (tag) {
    case "br":
      return "\n";
    case "hr":
      return "\n\n---\n\n";
    case "a": {
      const href = el.getAttribute("href") || "";
      const text = collectInlineText(el);
      if (!text) return "";
      return href && !href.startsWith("javascript:") ? `[${text}](${href})` : text;
    }
    case "strong":
    case "b": {
      const t = children(el, ctx).trim();
      return t ? `**${t}**` : "";
    }
    case "em":
    case "i": {
      const t = children(el, ctx).trim();
      return t ? `*${t}*` : "";
    }
    case "code": {
      const t = (el.textContent ?? "").trim();
      return t ? "`" + t + "`" : "";
    }
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(tag[1]);
      return `\n\n${"#".repeat(level)} ${collectInlineText(el)}\n\n`;
    }
    case "blockquote": {
      const inner = children(el, ctx).trim();
      const quoted = inner
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n");
      return `\n\n${quoted}\n\n`;
    }
    case "ul":
    case "ol": {
      ctx.listStack.push({ ordered: tag === "ol", index: 0 });
      const inner = children(el, ctx);
      ctx.listStack.pop();
      return `\n${inner}\n`;
    }
    case "li": {
      const list = ctx.listStack[ctx.listStack.length - 1];
      const depth = Math.max(0, ctx.listStack.length - 1);
      const indent = "  ".repeat(depth);
      let marker = "- ";
      if (list?.ordered) {
        list.index += 1;
        marker = `${list.index}. `;
      }
      const inner = children(el, ctx).trim();
      return `\n${indent}${marker}${inner}`;
    }
    default: {
      const inner = children(el, ctx);
      if (isBlock(tag)) return `\n\n${inner}\n\n`;
      return inner;
    }
  }
}

function children(el: Element, ctx: WalkContext): string {
  let out = "";
  el.childNodes.forEach((c) => {
    out += serialize(c, ctx);
  });
  return out;
}

function cleanup(md: string): string {
  return md
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Convert an element subtree to ordered ContentBlocks. */
export function elementToBlocks(root: Element): ContentBlock[] {
  const ctx: WalkContext = { specials: [], listStack: [] };
  const md = cleanup(children(root, ctx));
  if (!md) return ctx.specials.length ? ctx.specials.slice() : [];

  const blocks: ContentBlock[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  tokenRe.lastIndex = 0;
  while ((m = tokenRe.exec(md)) !== null) {
    const before = cleanup(md.slice(lastIndex, m.index));
    if (before) blocks.push({ type: "text", text: before });
    const special = ctx.specials[Number(m[1])];
    if (special) blocks.push(special);
    lastIndex = tokenRe.lastIndex;
  }
  const tail = cleanup(md.slice(lastIndex));
  if (tail) blocks.push({ type: "text", text: tail });
  return blocks;
}

/** Convenience: flatten blocks to a single markdown string. */
export function blocksToMarkdown(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "text":
          return b.text;
        case "code":
          return "```" + (b.language ?? "") + "\n" + b.code + "\n```";
        case "image":
          return `![${b.alt ?? "image"}](${b.localPath ?? b.url ?? ""})`;
        case "link":
          return b.text ? `[${b.text}](${b.url})` : b.url;
      }
    })
    .join("\n\n")
    .trim();
}

/** Convenience: plain text preview (no markdown), used for search indexing. */
export function blocksToPlainText(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "text":
          return b.text.replace(/[*_`#>[\]()]/g, "");
        case "code":
          return b.code;
        case "image":
          return b.alt ?? "";
        case "link":
          return b.text ?? b.url;
      }
    })
    .join(" ")
    .trim();
}
