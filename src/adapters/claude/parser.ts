import type { AdapterMeta } from "../base/adapter";
import type { Attachment, ChatMessage } from "../../shared/types";
import { absoluteUrl, filenameFromUrl } from "../base/dom";
import { parseInterleavedMessages } from "../base/interleave-parser";
import { hashString } from "../../utils/id";
import { CLAUDE_SELECTORS as S } from "./selectors";

function enrichWithUploads(doc: Document, url: string, messages: ChatMessage[]): ChatMessage[] {
  // Rebuild the same ordered element list interleave-parser used so we can
  // pair each message index with its source element.
  const tagged: HTMLElement[] = [];
  for (const sel of [...S.user, ...S.assistant]) {
    doc.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (!tagged.some((o) => o !== el && o.contains(el)) && !tagged.includes(el)) tagged.push(el);
    });
  }
  tagged.sort((a, b) =>
    a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  tagged.forEach((el, i) => {
    const msg = messages[i];
    if (!msg) return;
    const existing = new Set((msg.attachments ?? []).map((a) => a.sourceUrl ?? a.id));
    const found: Attachment[] = [];
    for (const img of Array.from(el.querySelectorAll<HTMLImageElement>("img"))) {
      const src = absoluteUrl(img.getAttribute("src") || img.currentSrc, url);
      if (!src || /^data:/.test(src) || /avatar|icon/i.test(src)) continue;
      if (existing.has(src)) continue;
      existing.add(src);
      found.push({
        id: hashString(src),
        filename: filenameFromUrl(src, img.getAttribute("alt") || "image"),
        sourceUrl: src,
        availableLocally: false,
        reason: "Not yet captured",
      });
    }
    if (found.length) msg.attachments = [...(msg.attachments ?? []), ...found];
  });
  return messages;
}

export function getClaudeMessages(doc: Document, url: string): ChatMessage[] {
  const messages = parseInterleavedMessages(doc, url, {
    platformId: "claude",
    userSelectors: S.user,
    assistantSelectors: S.assistant,
    contentSelectors: S.content,
    attachmentLinkSelectors: S.attachmentLinks,
  });
  return enrichWithUploads(doc, url, messages);
}

export function getClaudeMeta(doc: Document, url: string): AdapterMeta {
  let platformConversationId: string | null = null;
  try {
    const m = new URL(url).pathname.match(/\/chat\/([\w-]{8,})/i);
    if (m) platformConversationId = m[1];
  } catch {
    /* ignore */
  }
  const title = doc.title?.replace(/\s*[-|]\s*Claude.*$/i, "").trim() || "Claude conversation";
  return { title, platformConversationId };
}
