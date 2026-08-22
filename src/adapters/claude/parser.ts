import type { AdapterMeta } from "../base/adapter";
import type { ChatMessage } from "../../shared/types";
import { parseInterleavedMessages } from "../base/interleave-parser";
import { CLAUDE_SELECTORS as S } from "./selectors";

export function getClaudeMessages(doc: Document, url: string): ChatMessage[] {
  return parseInterleavedMessages(doc, url, {
    platformId: "claude",
    userSelectors: S.user,
    assistantSelectors: S.assistant,
    contentSelectors: S.content,
    attachmentLinkSelectors: S.attachmentLinks,
  });
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
