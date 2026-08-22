import type { Attachment, ChatMessage, Role } from "../../shared/types";
import { elementToBlocks } from "../../utils/html-to-blocks";
import { hashString } from "../../utils/id";
import { absoluteUrl, attr, filenameFromUrl, firstMatching, parseTimestamp, qsa, textOf } from "./dom";

export function normalizeRole(raw: string | null | undefined): Role {
  const r = (raw ?? "").toLowerCase();
  if (r.includes("assistant") || r.includes("bot") || r.includes("model") || r.includes("ai")) {
    return "assistant";
  }
  if (r.includes("user") || r.includes("human") || r.includes("you")) return "user";
  if (r.includes("system") || r.includes("tool")) return "system";
  return "unknown";
}

export function collectAttachmentLinks(
  root: ParentNode,
  baseUrl: string,
  selectors: string[],
): Attachment[] {
  const out: Attachment[] = [];
  const seen = new Set<string>();
  for (const a of firstMatching<HTMLAnchorElement>(root, selectors)) {
    const href = absoluteUrl(a.getAttribute("href"), baseUrl);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const name = attr(a, "download") || textOf(a) || filenameFromUrl(href, "attachment");
    out.push({
      id: hashString(href),
      filename: name,
      sourceUrl: href,
      availableLocally: false,
      reason: "Not yet captured",
    });
  }
  return out;
}

export interface RoleParserConfig {
  platformId: string;
  messageSelectors: string[];
  roleAttr: string;
  idAttr?: string;
  contentSelectors: string[];
  attachmentLinkSelectors?: string[];
  timestampAttr?: string[];
}

/** Generic extractor for platforms that tag each message with a role attribute. */
export function parseRoleMessages(
  doc: Document,
  baseUrl: string,
  cfg: RoleParserConfig,
): ChatMessage[] {
  const els = firstMatching<HTMLElement>(doc, cfg.messageSelectors);
  const messages: ChatMessage[] = [];
  els.forEach((el, index) => {
    const role = normalizeRole(el.getAttribute(cfg.roleAttr));
    const contentRoot = (firstMatching(el, cfg.contentSelectors)[0] as Element) ?? el;
    const content = elementToBlocks(contentRoot);
    const attachments = cfg.attachmentLinkSelectors
      ? collectAttachmentLinks(el, baseUrl, cfg.attachmentLinkSelectors)
      : [];
    if (content.length === 0 && attachments.length === 0) return; // never emit empty
    const rawId = cfg.idAttr ? el.getAttribute(cfg.idAttr) : null;
    const id = rawId || `${cfg.platformId}-${index}-${hashString(textOf(el).slice(0, 200))}`;
    const timestamp = cfg.timestampAttr
      ? parseTimestamp(attr(el, ...cfg.timestampAttr) ?? attr(el.querySelector("time"), "datetime"))
      : parseTimestamp(attr(el.querySelector("time"), "datetime"));
    messages.push({ id, role, content, timestamp, attachments });
  });
  return messages;
}

/** True if any of the given selectors currently match (used for streaming). */
export function anyPresent(doc: Document, selectors: string[]): boolean {
  return selectors.some((s) => qsa(doc, s).length > 0);
}
