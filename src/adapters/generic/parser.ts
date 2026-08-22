import type { AdapterMeta } from "../base/adapter";
import type { ChatMessage, Role } from "../../shared/types";
import { elementToBlocks } from "../../utils/html-to-blocks";
import { hashString } from "../../utils/id";
import { firstMatching, textOf } from "../base/dom";
import { normalizeRole } from "../base/role-parser";
import { GENERIC_SELECTORS as S } from "./selectors";

function hintRole(hay: string): Role | null {
  const s = hay.toLowerCase();
  const isUser = S.userHints.some((h) => s.includes(h));
  const isAssistant = S.assistantHints.some((h) => s.includes(h));
  if (isAssistant && !isUser) return "assistant";
  if (isUser && !isAssistant) return "user";
  return null;
}

function inferRole(el: Element): Role {
  // 1. explicit role attributes on the element or a close ancestor.
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    for (const a of S.roleAttrs) {
      const v = node.getAttribute(a);
      if (v) return normalizeRole(v);
    }
    const aria = node.getAttribute("aria-label") || node.getAttribute("data-testid");
    if (aria) {
      const r = hintRole(aria);
      if (r) return r;
    }
    const cls = node.getAttribute("class");
    if (cls) {
      const r = hintRole(cls);
      if (r) return r;
    }
  }
  return "unknown";
}

export function getGenericMessages(doc: Document): ChatMessage[] {
  const candidates = firstMatching<HTMLElement>(doc, S.messageCandidates);
  // Drop wrappers that contain other candidates (keep leaf turns).
  const leaves = candidates.filter(
    (el) => !candidates.some((other) => other !== el && el.contains(other)),
  );

  const messages: ChatMessage[] = [];
  leaves.forEach((el, index) => {
    const content = elementToBlocks(el);
    if (content.length === 0) return;
    const role = inferRole(el);
    const id = `generic-${index}-${hashString(textOf(el).slice(0, 200))}`;
    messages.push({ id, role, content, attachments: [] });
  });

  // If roles are all unknown, assume a standard alternating user/assistant flow.
  if (messages.length > 1 && messages.every((m) => m.role === "unknown")) {
    messages.forEach((m, i) => {
      m.role = i % 2 === 0 ? "user" : "assistant";
    });
  }
  return messages;
}

export function getGenericMeta(doc: Document): AdapterMeta {
  const h1 = textOf(doc.querySelector("h1"));
  const title = h1 || (doc.title ?? "").trim() || "Conversation";
  return { title, platformConversationId: null };
}
