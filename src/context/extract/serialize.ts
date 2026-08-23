// DOM element → Markdown text.
// Goals:
//   • Exact structural fidelity: headings at their original levels (no offset),
//     tables as GFM pipe-tables, code fences with correct indentation,
//     bold/italic/strikethrough/inline-code preserved.
//   • HTML whitespace normalization for inline text (collapse runs to one space).
//   • NO post-processing that collapses spaces inside code fences.

function detectLanguage(pre: Element): string {
  const code = pre.querySelector("code") ?? pre;
  const cls = (code.getAttribute("class") ?? "") + " " + (pre.getAttribute("class") ?? "");
  const m = cls.match(/(?:language|lang|hljs|highlight)[-_ ]([a-z0-9+#]+)/i);
  if (m && m[1] && !/^(hljs|highlight)$/i.test(m[1])) return m[1].toLowerCase();
  return "";
}

// Only structural containers that should be surrounded by blank lines.
// Tables, tr, td, th are handled by serializeTable and must NOT appear here.
function isBlock(tag: string): boolean {
  return /^(p|div|section|article|blockquote)$/.test(tag);
}

interface Ctx {
  listStack: Array<{ ordered: boolean; index: number }>;
}

/**
 * Convert a <table> element to a GFM pipe-table string.
 * Only direct row children of the table / its thead/tbody/tfoot are collected,
 * so nested tables don't pollute the outer one.
 * Cell content is flattened to a single line (block elements inside a cell are
 * joined with a space) and pipe characters are backslash-escaped.
 */
function serializeTable(table: Element): string {
  const rowEls = Array.from(
    table.querySelectorAll(
      ":scope > tr," +
      ":scope > thead > tr," +
      ":scope > tbody > tr," +
      ":scope > tfoot > tr",
    ),
  );
  if (rowEls.length === 0) return "";

  const rows: string[][] = rowEls.map((tr) =>
    Array.from(tr.querySelectorAll(":scope > th, :scope > td")).map((cell) => {
      const cellCtx: Ctx = { listStack: [] };
      // Flatten to one line: replace newlines with a space, collapse runs.
      return children(cell as Element, cellCtx)
        .replace(/\n+/g, " ")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\|/g, "\\|")
        .trim();
    }),
  );

  const cols = Math.max(...rows.map((r) => r.length));
  if (cols === 0) return "";

  const out: string[] = [];
  rows.forEach((row, i) => {
    while (row.length < cols) row.push("");
    out.push("| " + row.join(" | ") + " |");
    if (i === 0) {
      // Treat the first row as the header and emit the required separator.
      out.push("| " + Array(cols).fill("---").join(" | ") + " |");
    }
  });
  return out.join("\n");
}

function serializeNode(node: Node, ctx: Ctx): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (/^(button|svg|style|script|noscript)$/.test(tag)) return "";
  if (el.getAttribute("aria-hidden") === "true") return "";

  // --- Code blocks ---
  if (tag === "pre") {
    const codeEl = el.querySelector("code") ?? el;
    // textContent captures the raw text across all child spans (e.g. highlight.js
    // wraps tokens in <span> elements — we want the plain code, not the markup).
    const code = (codeEl.textContent ?? "").replace(/\r\n/g, "\n").replace(/\n+$/, "");
    return `\n\n\`\`\`${detectLanguage(el)}\n${code}\n\`\`\`\n\n`;
  }

  switch (tag) {
    case "br":
      // A bare \n is handled correctly by both the library viewer (which joins
      // consecutive paragraph lines with <br>) and AI models reading the raw
      // markdown (which see it as a soft line-wrap within the same paragraph).
      return "\n";

    case "hr":
      return "\n\n---\n\n";

    case "img": {
      const alt = el.getAttribute("alt") || "image";
      return `[image: ${alt}]`;
    }

    case "a": {
      const href = el.getAttribute("href") || "";
      const text = children(el, ctx).trim();
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

    case "del":
    case "s": {
      // GFM strikethrough.
      const t = children(el, ctx).trim();
      return t ? `~~${t}~~` : "";
    }

    case "code": {
      // <pre> returns early, so any <code> we see here is an inline span.
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
      // Preserve the original heading level without any offset.
      // The document-level title in the markdown wrapper uses # once; content
      // headings at their natural levels are faithful to the chat UI rendering.
      const text = children(el, ctx).trim(); // children() preserves inline code/bold
      return `\n\n${"#".repeat(level)} ${text}\n\n`;
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

    case "table":
      // Handled entirely by serializeTable — do NOT call children() here or
      // the thead/tbody/tr/td elements would be double-processed.
      return "\n\n" + serializeTable(el) + "\n\n";

    // These are consumed by serializeTable via querySelectorAll. If they appear
    // outside a <table> (malformed HTML), fall through to render their text.
    case "thead":
    case "tbody":
    case "tfoot":
    case "tr":
    case "td":
    case "th":
      return children(el, ctx);

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
  return (
    children(el, ctx)
      // Strip trailing whitespace before newlines (serialization artefacts from
      // block wrapping), but do NOT collapse spaces globally — that would destroy
      // indentation inside code fences that were already emitted as raw strings.
      .replace(/[ \t]+\n/g, "\n")
      // Collapse 3+ consecutive blank lines to 2 (standard markdown hygiene).
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
