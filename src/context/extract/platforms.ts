import type { ContextMessage, ContextRole } from "../types";
import { elementToText } from "./serialize";
import { extractByStructuralPairing, looksIncomplete, lowestCommonAncestor } from "./structural-fallback";

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

/**
 * Best-effort scan for AI-generated files/artifacts that live OUTSIDE the
 * normal message flow (e.g. a side "Artifact"/"Canvas" panel). We never
 * fetch binary contents — only filenames, types, and any visible text the
 * panel already renders — appended as a labeled block so the destination
 * model at least knows a file existed and what it contained/was called.
 */
const ARTIFACT_SELECTORS = [
  "[data-testid*='artifact' i]",
  "[class*='artifact' i]",
  "[class*='canvas' i][class*='panel' i]",
  "[data-testid*='canvas' i]",
];
function collectArtifactNotes(doc: Document, alreadyIncluded: Set<Element>): string[] {
  const notes: string[] = [];
  const seen = new Set<Element>();
  for (const sel of ARTIFACT_SELECTORS) {
    let found: NodeListOf<Element>;
    try {
      found = doc.querySelectorAll(sel);
    } catch {
      continue;
    }
    found.forEach((el) => {
      if (seen.has(el)) return;
      if ([...alreadyIncluded].some((inc) => inc.contains(el) || el.contains(inc))) return;
      // Only take top-level matches (skip if an ancestor already matched).
      if ([...seen].some((s) => s.contains(el))) return;
      seen.add(el);
      const titleEl = el.querySelector("h1, h2, h3, [class*='title' i], [data-testid*='title' i]");
      const title = textOf(titleEl) || "Generated file";
      const body = elementToText(el);
      if (body) notes.push(`**${title}**\n\n${body}`);
    });
  }
  return notes;
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
    const included = new Set<Element>();
    doc.querySelectorAll("[data-message-author-role]").forEach((el) => {
      const role = normalizeRole(el.getAttribute("data-message-author-role"));
      const contentEl =
        el.querySelector(".markdown, .whitespace-pre-wrap, [class*='markdown' i]") ?? el;
      const text = elementToText(contentEl);
      if (text) {
        out.push({ role, text });
        included.add(el);
      }
    });
    for (const note of collectArtifactNotes(doc, included)) {
      out.push({ role: "assistant", text: note });
    }
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
// User turns reliably carry data-testid='user-message'. Assistant turns have
// used several different class names across Claude's UI revisions, so we
// try a broad set of candidates AND fall back to structural sibling-pairing
// (using the reliable user anchor) whenever the candidates come up short —
// this is what actually fixes "assistant replies go missing" instead of
// just adding one more guess that can go stale again.
const CLAUDE_USER_SEL = "[data-testid='user-message']";
const CLAUDE_ASSISTANT_SELECTORS = [
  "[data-testid='assistant-message']",
  "[data-testid='chat-message-assistant']",
  "div[class*='font-claude-message' i]",
  "div[class*='claude-message' i]",
  "div[class*='assistant-message' i]",
  "[data-is-streaming]",
];
const claude: PlatformAdapter = {
  id: "claude",
  label: "Claude",
  hostMatch: /^claude\.ai$/,
  findScrollContainer(doc) {
    const first = doc.querySelector(CLAUDE_USER_SEL) ?? doc.querySelector(CLAUDE_ASSISTANT_SELECTORS.join(","));
    return nearestScrollable(first);
  },
  countMessages(doc) {
    const users = doc.querySelectorAll(CLAUDE_USER_SEL).length;
    const assistants = doc.querySelectorAll(CLAUDE_ASSISTANT_SELECTORS.join(",")).length;
    return Math.max(users + assistants, users * 2);
  },
  extractMessages(doc) {
    const userNodes = Array.from(doc.querySelectorAll<HTMLElement>(CLAUDE_USER_SEL));
    const assistantNodes = Array.from(
      doc.querySelectorAll<HTMLElement>(CLAUDE_ASSISTANT_SELECTORS.join(",")),
    ).filter((el) => !userNodes.some((u) => el.contains(u) || u.contains(el)));

    if (looksIncomplete(assistantNodes.length, userNodes.length)) {
      const scope = lowestCommonAncestor(userNodes);
      const structural = extractByStructuralPairing(scope, userNodes, { minAssistantChars: 2 });
      if (structural.filter((m) => m.role === "assistant").length > assistantNodes.length) {
        return structural;
      }
    }

    const nodes = [...userNodes, ...assistantNodes];
    const leaves = nodes.filter((el) => !nodes.some((o) => o !== el && el.contains(o)));
    leaves.sort((a, b) =>
      a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const out: ContextMessage[] = [];
    const included = new Set<Element>();
    for (const el of leaves) {
      const role: ContextRole = el.matches(CLAUDE_USER_SEL) ? "user" : "assistant";
      const contentEl = el.querySelector(".prose, [class*='prose' i]") ?? el;
      const text = elementToText(contentEl);
      if (text) {
        out.push({ role, text });
        included.add(el);
      }
    }
    for (const note of collectArtifactNotes(doc, included)) {
      out.push({ role: "assistant", text: note });
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
const GEMINI_USER_SEL = "user-query";
const GEMINI_ASSISTANT_SEL = "model-response";
const gemini: PlatformAdapter = {
  id: "gemini",
  label: "Gemini",
  hostMatch: /^gemini\.google\.com$/,
  findScrollContainer(doc) {
    const first = doc.querySelector(`${GEMINI_USER_SEL}, ${GEMINI_ASSISTANT_SEL}`);
    return nearestScrollable(first);
  },
  countMessages(doc) {
    return doc.querySelectorAll(`${GEMINI_USER_SEL}, ${GEMINI_ASSISTANT_SEL}`).length;
  },
  extractMessages(doc) {
    const userNodes = Array.from(doc.querySelectorAll<HTMLElement>(GEMINI_USER_SEL));
    const assistantNodes = Array.from(doc.querySelectorAll<HTMLElement>(GEMINI_ASSISTANT_SEL));

    if (looksIncomplete(assistantNodes.length, userNodes.length)) {
      const scope = lowestCommonAncestor(userNodes);
      const structural = extractByStructuralPairing(scope, userNodes, { minAssistantChars: 2 });
      if (structural.filter((m) => m.role === "assistant").length > assistantNodes.length) {
        return structural;
      }
    }

    const nodes = [...userNodes, ...assistantNodes];
    nodes.sort((a, b) =>
      a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    const out: ContextMessage[] = [];
    const included = new Set<Element>();
    for (const el of nodes) {
      const role: ContextRole = el.tagName.toLowerCase() === GEMINI_USER_SEL ? "user" : "assistant";
      const contentEl = el.querySelector(".query-text, .markdown, message-content, [class*='markdown' i]") ?? el;
      const text = elementToText(contentEl);
      if (text) {
        out.push({ role, text });
        included.add(el);
      }
    }
    for (const note of collectArtifactNotes(doc, included)) {
      out.push({ role: "assistant", text: note });
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
// heuristics (data-testid / class hints) plus the same structural fallback.
// If nothing can be identified at all, extraction reports a clear failure
// rather than a silent empty capture.
const deepseek: PlatformAdapter = {
  id: "deepseek",
  label: "DeepSeek",
  hostMatch: /^chat\.deepseek\.com$/,
  findScrollContainer(doc) {
    const first = doc.querySelector("[class*='message' i], [class*='chat-message' i]");
    return nearestScrollable(first);
  },
  countMessages(doc) {
    return doc.querySelectorAll("[class*='message' i], [class*='chat-message' i]").length;
  },
  extractMessages(doc) {
    const nodes = Array.from(
      doc.querySelectorAll<HTMLElement>("[class*='message' i], [class*='chat-message' i]"),
    ).filter((el) => textOf(el).length > 0);
    const leaves = nodes.filter((el) => !nodes.some((o) => o !== el && el.contains(o)));

    const userGuess = leaves.filter((el) => /user|human/i.test(el.getAttribute("class") ?? ""));
    if (userGuess.length > 0 && looksIncomplete(leaves.length - userGuess.length, userGuess.length)) {
      const scope = lowestCommonAncestor(userGuess);
      const structural = extractByStructuralPairing(scope, userGuess, { minAssistantChars: 2 });
      if (structural.length > leaves.length) return structural;
    }

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
