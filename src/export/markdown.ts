import type { Conversation, Role } from "../shared/types";
import { blocksToMarkdown } from "../utils/html-to-blocks";

const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  unknown: "Message",
};

export function conversationToMarkdown(conv: Conversation): string {
  const m = conv.metadata;
  const lines: string[] = [];
  lines.push(`# ${m.conversationTitle}`);
  lines.push("");
  lines.push(`**Platform:** ${m.platform}  `);
  lines.push(`**Saved:** ${new Date(m.savedAt).toISOString()}  `);
  if (m.conversationUrl) lines.push(`**Source:** ${m.conversationUrl}  `);
  lines.push(`**Messages:** ${m.messageCount}`);
  if (m.generic) lines.push(`\n> ⚠️ Generic extraction — some content may not be available.`);
  lines.push("\n---\n");

  for (const msg of conv.messages) {
    lines.push(`### ${ROLE_LABEL[msg.role]}${msg.timestamp ? ` — ${msg.timestamp}` : ""}`);
    lines.push("");
    lines.push(blocksToMarkdown(msg.content));
    if (msg.attachments && msg.attachments.length) {
      lines.push("");
      lines.push("**Attachments:**");
      for (const a of msg.attachments) {
        const where = a.availableLocally ? a.localPath ?? "(local)" : `not saved — ${a.reason ?? "unavailable"}`;
        lines.push(`- ${a.filename} (${a.mimeType ?? "unknown"}) — ${where}`);
      }
    }
    lines.push("\n---\n");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
