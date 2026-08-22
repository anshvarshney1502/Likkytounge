import type { AdapterMeta } from "../base/adapter";
import type { ChatMessage } from "../../shared/types";
import { parseInterleavedMessages } from "../base/interleave-parser";
import { GEMINI_SELECTORS as S } from "./selectors";

export function getGeminiMessages(doc: Document, url: string): ChatMessage[] {
  return parseInterleavedMessages(doc, url, {
    platformId: "gemini",
    userSelectors: S.user,
    assistantSelectors: S.assistant,
    contentSelectors: S.content,
    attachmentLinkSelectors: S.attachmentLinks,
  });
}

export function getGeminiMeta(doc: Document, _url: string): AdapterMeta {
  const title = doc.title?.replace(/\s*[-|]\s*Gemini.*$/i, "").trim() || "Gemini conversation";
  return { title, platformConversationId: null };
}
