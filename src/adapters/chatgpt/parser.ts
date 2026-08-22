import type { AdapterMeta } from "../base/adapter";
import type { Attachment, ChatMessage } from "../../shared/types";
import { firstMatching, textOf, absoluteUrl, filenameFromUrl } from "../base/dom";
import { parseRoleMessages } from "../base/role-parser";
import { hashString } from "../../utils/id";
import { CHATGPT_SELECTORS as S } from "./selectors";

/**
 * Enrich messages with attachments that ChatGPT renders inline (uploaded
 * images shown as <img>, and file tiles rendered above a user message).
 * Inline images are commonly the actual user uploads or generated images.
 */
function enrichWithUploads(doc: Document, url: string, messages: ChatMessage[]): ChatMessage[] {
  const messageEls = firstMatching<HTMLElement>(doc, S.messages);
  messageEls.forEach((el, i) => {
    const msg = messages[i];
    if (!msg) return;
    const existing = new Set((msg.attachments ?? []).map((a) => a.sourceUrl ?? a.id));
    const found: Attachment[] = [];

    // Uploaded/generated images shown inside the message body.
    for (const img of Array.from(el.querySelectorAll<HTMLImageElement>("img"))) {
      const src = absoluteUrl(img.getAttribute("src") || img.currentSrc, url);
      if (!src) continue;
      if (/^data:/.test(src)) continue; // skip base64 previews
      if (/icon|avatar|profile/i.test(src)) continue;
      if (existing.has(src)) continue;
      existing.add(src);
      const alt = img.getAttribute("alt") || undefined;
      found.push({
        id: hashString(src),
        filename: filenameFromUrl(src, alt || "image"),
        sourceUrl: src,
        availableLocally: false,
        reason: "Not yet captured",
      });
    }

    // File tiles (PDFs, docs, spreadsheets). Best effort: capture filename
    // text; source URL may be blob:/authenticated and might not fetch.
    for (const tile of Array.from(el.querySelectorAll(S.fileTiles.join(","))) as HTMLElement[]) {
      const name = textOf(tile);
      if (!name) continue;
      const linkEl = tile.querySelector<HTMLAnchorElement>("a[href]");
      const href = absoluteUrl(linkEl?.getAttribute("href"), url);
      const key = href || name;
      if (existing.has(key)) continue;
      existing.add(key);
      found.push({
        id: hashString(key),
        filename: name.slice(0, 200),
        sourceUrl: href,
        availableLocally: false,
        reason: href ? "Not yet captured" : "Site did not expose a source URL for this attachment",
      });
    }

    if (found.length) msg.attachments = [...(msg.attachments ?? []), ...found];
  });
  return messages;
}

export function getChatGptMessages(doc: Document, url: string): ChatMessage[] {
  const messages = parseRoleMessages(doc, url, {
    platformId: "chatgpt",
    messageSelectors: S.messages,
    roleAttr: S.roleAttr,
    idAttr: S.idAttr,
    contentSelectors: S.content,
    attachmentLinkSelectors: S.attachmentLinks,
  });
  return enrichWithUploads(doc, url, messages);
}

export function getChatGptMeta(doc: Document, url: string): AdapterMeta {
  let platformConversationId: string | null = null;
  try {
    const m = new URL(url).pathname.match(/\/c\/([\w-]{8,})/i);
    if (m) platformConversationId = m[1];
  } catch {
    /* ignore */
  }
  const heading = textOf(firstMatching(doc, ["h1"])[0]);
  const title = heading || doc.title?.replace(/\s*[-|]\s*ChatGPT.*$/i, "").trim() || "ChatGPT conversation";
  return { title, platformConversationId };
}
