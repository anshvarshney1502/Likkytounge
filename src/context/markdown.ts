import type { ContextMessage, ContextRole } from "./types";

const HEADING: Record<ContextRole, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  unknown: "Message",
};

/**
 * Render messages into the exact structure requested:
 * # Conversation Context
 * ## User / ## Assistant blocks, in original order, never truncated.
 */
export function messagesToMarkdown(messages: ContextMessage[], title: string): string {
  const lines: string[] = [`# Conversation Context`, ""];
  if (title) {
    lines.push(`_Source: ${title}_`, "");
  }
  for (const m of messages) {
    lines.push(`## ${HEADING[m.role]}`, "", m.text.trim(), "");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
