// Plain-text export: no markdown, no hashes, no fences, no bracket links.
// Optimised for humans skimming a saved chat in Notepad / TextEdit / VS Code.

import type { ContentBlock, Conversation, Role } from "../shared/types";

const ROLE_LABEL: Record<Role, string> = {
  user: "You",
  assistant: "AI",
  system: "System",
  unknown: "Message",
};

/** Strip common markdown decorators while preserving readable text. */
function stripMarkdown(text: string): string {
  return text
    // Fenced code openers/closers hidden inside text (safety net)
    .replace(/```[a-z0-9+#-]*\n?/gi, "")
    .replace(/```/g, "")
    // Headings: "### Title" -> "Title"
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    // Bold/italic markers
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, "$1$2")
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, "$1$2")
    // Inline code backticks
    .replace(/`([^`]+)`/g, "$1")
    // Links [text](url) -> "text (url)"
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
    // Images ![alt](url) -> "[image: alt]"
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt) => `[image: ${alt || "attachment"}]`)
    // Blockquote markers
    .replace(/^\s{0,3}>+\s?/gm, "")
    // List bullets
    .replace(/^\s*[-*+]\s+/gm, "  • ")
    // Numbered list -> keep the number
    .replace(/^\s*(\d+)\.\s+/gm, "  $1. ")
    // HR
    .replace(/^\s*-{3,}\s*$/gm, "")
    // Collapse excess blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function blockToPlain(b: ContentBlock): string {
  switch (b.type) {
    case "text":
      return stripMarkdown(b.text);
    case "code": {
      const header = b.language ? `--- code (${b.language}) ---` : "--- code ---";
      return `${header}\n${b.code}\n--- end code ---`;
    }
    case "image":
      return `[image: ${b.alt || b.localPath || b.url || "attachment"}]`;
    case "link":
      return b.text ? `${b.text} (${b.url})` : b.url;
  }
}

const RULE = "-".repeat(60);

export interface PlaintextOptions {
  /** Include per-message timestamps when the platform provided them. */
  includeTimestamps?: boolean;
  /** Include extraction warnings under the header. */
  includeWarnings?: boolean;
}

export function conversationToPlaintext(
  conv: Conversation,
  opts: PlaintextOptions = {},
): string {
  const m = conv.metadata;
  const lines: string[] = [];
  lines.push(m.conversationTitle);
  lines.push("");
  lines.push(`Platform : ${m.platform}`);
  lines.push(`Saved    : ${new Date(m.savedAt).toLocaleString()}`);
  if (m.conversationUrl) lines.push(`Source   : ${m.conversationUrl}`);
  lines.push(`Messages : ${m.messageCount}`);
  if (opts.includeWarnings && m.warnings.length) {
    lines.push("");
    lines.push("Notes:");
    for (const w of m.warnings) lines.push(`  - ${w}`);
  }
  lines.push("");

  for (const msg of conv.messages) {
    lines.push(RULE);
    const stamp = opts.includeTimestamps && msg.timestamp ? `   ${msg.timestamp}` : "";
    lines.push(ROLE_LABEL[msg.role] + stamp);
    lines.push(RULE);
    lines.push("");
    lines.push(msg.content.map(blockToPlain).join("\n\n"));
    if (msg.attachments && msg.attachments.length) {
      lines.push("");
      lines.push("Attachments:");
      for (const a of msg.attachments) {
        const where = a.availableLocally
          ? `saved as ${a.localPath ?? "(local)"}`
          : `not saved — ${a.reason ?? "unavailable"}`;
        lines.push(`  • ${a.filename} (${a.mimeType ?? "unknown"}) — ${where}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}
