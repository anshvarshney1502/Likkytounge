import type { AdapterMeta } from "../base/adapter";
import type { ChatMessage } from "../../shared/types";
import { firstMatching, textOf } from "../base/dom";
import { parseRoleMessages } from "../base/role-parser";
import { CHATGPT_SELECTORS as S } from "./selectors";

export function getChatGptMessages(doc: Document, url: string): ChatMessage[] {
  return parseRoleMessages(doc, url, {
    platformId: "chatgpt",
    messageSelectors: S.messages,
    roleAttr: S.roleAttr,
    idAttr: S.idAttr,
    contentSelectors: S.content,
    attachmentLinkSelectors: S.attachmentLinks,
  });
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
