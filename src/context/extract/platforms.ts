import type { ContextMessage, ContextRole } from "../types";
import { elementToText } from "./serialize";

export interface PlatformAdapter {
  id: string;
  label: string;
  hostMatch: RegExp;
  /** Find the scrollable element that holds the message history. */
  findScrollContainer(doc: Document): Element | null;
  /** Count message elements currently in the DOM (for the scroll loader). */
  countMessages(doc: Document): number;
  /** Extract all currently-mounted messages, in document order. */
  extractMessages(doc: Document): ContextMessage[];
  /** Find the chat input to upload context into. */
  findInput(doc: Document): HTMLElement | null;
  /** Conversation title, best effort. */
  getTitle(doc: Document): string;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function normalizeRole(raw: string | null): ContextRole {
  const r = (raw ?? "").toLowerCase();
  if (r.includes("assistant") || r.includes("bot") || r.includes("model") || r.includes("ai")) return "assistant";
  if (r.includes("user") || r.includes("human") || r.includes("you")) return "user";
  if (r.includes("system") || r.includes("tool")) return "system";
  return "unknown";
}

/** Walk up from `el` to find the nearest scrollable ancestor. */
function nearestScrollable(el: Element | null): Element | null {
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const canScroll = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 8;
    if (canScroll) return node;
    node = node.parentElement;
  }
  return document.scrollingElement;
}

// ---------------------------------------------------------------- ChatGPT --
const chatgpt: PlatformAdapter = {
  id: "chatgpt",
  label: "ChatGPT",
  hostMatch: /^(chatgpt|chat\.openai)\.com$/,
  findScrollContainer(doc) {
    const first = doc.querySelector("[data-message-author-role]");
    return nearestScrollable(first);
  },
  countMessages(doc) {
    return doc.querySelectorAll("[data-message-author-role]").length;
  },
  extractMessages(doc) {
    const out: ContextMessage[] = [];
    doc.querySelectorAll("[data-message-author-role]").forEach((el) => {
      const role = normalizeRole(el.getAttribute("data-message-author-role"));
      const contentEl = el.querySelector(".markdown, .whitespace-pre-wrap") ?? el;
      const text = elementToText(contentEl);
      if (text) out.push({ role, text });
    });
    return out;
  },
  findInput(doc) {
    return (
      doc.querySelector<HTMLElement>("#prompt-textarea") ??
      doc.querySelector<HTMLElement>("div[contenteditable='true']")
    );
  },
  getTitle(doc) {
    return textOf(doc.querySelector("h1")) || doc.title.replace(/\s*[-|]\s*ChatGPT.*$/i, "").trim() || "ChatGPT conversation";
  },
};

// ----------------------------------------------------------------- Claude --
const claude: PlatformAdapter = {
  id: "claude",
  label: "Claude",
  hostMatch: /^claude\.ai$/,
  findScrollContainer(doc) {
    const first = doc.querySelector("[data-testid='user-message'], .font-claude-message");
    return nearestScrollable(first);
  },
  countMessages(doc) {
    return doc.querySelectorAll("[data-testid='user-message'], .font-claude-message").length;
  },
  extractMessages(doc) {
    const nodes = Array.from(
      doc.querySelectorAll<HTMLElement>("[data-testid='user-message'], .font-claude-message"),
    );
    // Drop wrappers that contain another matched node (keep leaves).
    const leaves = nodes.filter((el) => !nodes.some((o) => o !== el && el.contains(o)));
    leaves.sort((a, b) =>
      a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const out: ContextMessage[] = [];
    for (const el of leaves) {
      const role: ContextRole = el.matches("[data-testid='user-message']") ? "user" : "assistant";
      const contentEl = el.querySelector(".prose") ?? el;
      const text = elementToText(contentEl);
      if (text) out.push({ role, text });
    }
    return out;
  },
  findInput(doc) {
    return doc.querySelector<HTMLElement>("div[contenteditable='true']");
  },
  getTitle(doc) {
    return doc.title.replace(/\s*[-|]\s*Claude.*$/i, "").trim() || "Claude conversation";
  },
};

// ----------------------------------------------------------------- Gemini --
const gemini: PlatformAdapter = {
  id: "gemini",
  label: "Gemini",
  hostMatch: /^gemini\.google\.com$/,
  findScrollContainer(doc) {
    const first = doc.querySelector("user-query, model-response");
    return nearestScrollable(first);
  },
  countMessages(doc) {
    return doc.querySelectorAll("user-query, model-response").length;
  },
  extractMessages(doc) {
    const nodes = Array.from(doc.querySelectorAll<HTMLElement>("user-query, model-response"));
    nodes.sort((a, b) =>
      a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const out: ContextMessage[] = [];
    for (const el of nodes) {
      const role: ContextRole = el.tagName.toLowerCase() === "user-query" ? "user" : "assistant";
      const contentEl = el.querySelector(".query-text, .markdown, message-content") ?? el;
      const text = elementToText(contentEl);
      if (text) out.push({ role, text });
    }
    return out;
  },
  findInput(doc) {
    return (
      doc.querySelector<HTMLElement>("rich-textarea div[contenteditable='true']") ??
      doc.querySelector<HTMLElement>("div[contenteditable='true']")
    );
  },
  getTitle(doc) {
    return doc.title.replace(/\s*[-|]\s*Gemini.*$/i, "").trim() || "Gemini conversation";
  },
};

// --------------------------------------------------------------- DeepSeek --
// DeepSeek's DOM is not officially documented here; this uses best-effort
// heuristics (data-testid / class hints) similar to a generic fallback. If
// selectors find nothing, extraction reports a clear failure rather than a
// silent empty capture.
const deepseek: PlatformAdapter = {
  id: "deepseek",
  label: "DeepSeek",
  hostMatch: /^chat\.deepseek\.com$/,
  findScrollContainer(doc) {
    const first = doc.querySelector("[class*='message'], [class*='chat-message']");
    return nearestScrollable(first);
  },
  countMessages(doc) {
    return doc.querySelectorAll("[class*='message'], [class*='chat-message']").length;
  },
  extractMessages(doc) {
    const nodes = Array.from(
      doc.querySelectorAll<HTMLElement>("[class*='message'], [class*='chat-message']"),
    ).filter((el) => textOf(el).length > 0);
    const leaves = nodes.filter((el) => !nodes.some((o) => o !== el && el.contains(o)));
    const out: ContextMessage[] = [];
    leaves.forEach((el, i) => {
      const cls = (el.getAttribute("class") ?? "").toLowerCase();
      const role: ContextRole = /user|human/.test(cls) ? "user" : /assistant|bot|ai/.test(cls) ? "assistant" : i % 2 === 0 ? "user" : "assistant";
      const text = elementToText(el);
      if (text) out.push({ role, text });
    });
    return out;
  },
  findInput(doc) {
    return doc.querySelector<HTMLElement>("textarea") ?? doc.querySelector<HTMLElement>("div[contenteditable='true']");
  },
  getTitle(doc) {
    return doc.title.replace(/\s*[-|]\s*DeepSeek.*$/i, "").trim() || "DeepSeek conversation";
  },
};

export const PLATFORM_ADAPTERS: PlatformAdapter[] = [chatgpt, claude, gemini, deepseek];

export function detectPlatform(url: string): PlatformAdapter | null {
  try {
    const host = new URL(url).hostname;
    return PLATFORM_ADAPTERS.find((p) => p.hostMatch.test(host)) ?? null;
  } catch {
    return null;
  }
}
