// DOM element -> markdown-ish text. Simpler than a full ContentBlock model:
// this feature only needs a readable, order-preserving text representation
// (code fences, links, lists), not a structured object.

function detectLanguage(pre: Element): string {
  const code = pre.querySelector("code") ?? pre;
  const cls = (code.getAttribute("class") ?? "") + " " + (pre.getAttribute("class") ?? "");
  const m = cls.match(/(?:language|lang|hljs|highlight)[-_ ]([a-z0-9+#]+)/i);
  if (m && m[1] && !/^(hljs|highlight)$/i.test(m[1])) return m[1].toLowerCase();
  return "";
}

function isBlock(tag: string): boolean {
  return /^(p|div|section|article|h[1-6]|ul|ol|li|blockquote|table|thead|tbody|tr)$/.test(tag);
}

interface Ctx {
  listStack: Array<{ ordered: boolean; index: number }>;
}

function serializeNode(node: Node, ctx: Ctx): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (/^(button|svg|style|script|noscript)$/.test(tag)) return "";
  if (el.getAttribute("aria-hidden") === "true") return "";

  if (tag === "pre") {
    const codeEl = el.querySelector("code") ?? el;
    const code = (codeEl.textContent ?? "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
    return `\n\n\`\`\`${detectLanguage(el)}\n${code}\n\`\`\`\n\n`;
  }
  switch (tag) {
    case "br":
      return "\n";
    case "hr":
      return "\n\n---\n\n";
    case "img": {
      const alt = el.getAttribute("alt") || "image";
      return `[image: ${alt}]`;
    }
    case "a": {
      const href = el.getAttribute("href") || "";
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
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
      return `\n\n${"#".repeat(Math.min(level + 2, 6))} ${(el.textContent ?? "").replace(/\s+/g, " ").trim()}\n\n`;
    }
    case "blockquote": {
      const inner = children(el, ctx).trim();
      return `\n\n${inner
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n")}\n\n`;
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
      return `\n${indent}${marker}${children(el, ctx).trim()}`;
    }
    default: {
      const inner = children(el, ctx);
      return isBlock(tag) ? `\n\n${inner}\n\n` : inner;
    }
  }
}

function children(el: Element, ctx: Ctx): string {
  let out = "";
  el.childNodes.forEach((c) => (out += serializeNode(c, ctx)));
  return out;
}

export function elementToText(el: Element): string {
  const ctx: Ctx = { listStack: [] };
  return children(el, ctx)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
