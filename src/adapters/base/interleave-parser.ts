import type { ChatMessage, Role } from "../../shared/types";
import { elementToBlocks } from "../../utils/html-to-blocks";
import { hashString } from "../../utils/id";
import { firstMatching, textOf } from "./dom";
import { collectAttachmentLinks } from "./role-parser";

export interface InterleaveConfig {
  platformId: string;
  userSelectors: string[];
  assistantSelectors: string[];
  contentSelectors?: string[];
  attachmentLinkSelectors?: string[];
}

interface Tagged {
  el: HTMLElement;
  role: Role;
}

/**
 * For platforms that mark user and assistant turns with different selectors
 * (rather than a single role attribute). Collects both sets, drops ancestor
 * elements that merely wrap another turn, and orders everything by DOM
 * position so the conversation reads correctly.
 */
export function parseInterleavedMessages(
  doc: Document,
  baseUrl: string,
  cfg: InterleaveConfig,
): ChatMessage[] {
  const tagged: Tagged[] = [];
  for (const el of firstMatching<HTMLElement>(doc, cfg.userSelectors)) {
    tagged.push({ el, role: "user" });
  }
  for (const el of firstMatching<HTMLElement>(doc, cfg.assistantSelectors)) {
    tagged.push({ el, role: "assistant" });
  }

  // Drop any element that contains another selected element (keep leaf turns).
  const els = tagged.map((t) => t.el);
  const filtered = tagged.filter(
    (t) => !els.some((other) => other !== t.el && t.el.contains(other)),
  );

  // Order by DOM position.
  filtered.sort((a, b) => {
    if (a.el === b.el) return 0;
    const pos = a.el.compareDocumentPosition(b.el);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const messages: ChatMessage[] = [];
  filtered.forEach((t, index) => {
    const contentRoot = cfg.contentSelectors
      ? ((firstMatching(t.el, cfg.contentSelectors)[0] as Element) ?? t.el)
      : t.el;
    const content = elementToBlocks(contentRoot);
    const attachments = cfg.attachmentLinkSelectors
      ? collectAttachmentLinks(t.el, baseUrl, cfg.attachmentLinkSelectors)
      : [];
    if (content.length === 0 && attachments.length === 0) return;
    const id = `${cfg.platformId}-${index}-${hashString(textOf(t.el).slice(0, 200))}`;
    messages.push({ id, role: t.role, content, attachments });
  });
  return messages;
}
