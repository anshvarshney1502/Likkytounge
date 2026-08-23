import type { ContextMessage, ContextRole } from "./types";

export interface MarkdownMeta {
  title: string;
  platformLabel: string;
  capturedAt?: string;
}

function speakerLabel(role: ContextRole, platformLabel: string): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return platformLabel || "Assistant";
    case "system":
      return "System";
    default:
      return "Message";
  }
}

/**
 * Render messages as a readable chat transcript rather than a heavy,
 * documentation-style block of headings — the conversation title is the
 * document's own heading, each turn is a bold speaker label (using the
 * platform's own name for the assistant, e.g. "ChatGPT", not the generic
 * word "Assistant") followed by its text, with a rule between turns. This
 * mirrors how the conversation actually reads on the source site, just in
 * portable Markdown. Order and content are never altered or truncated.
 */
export function messagesToMarkdown(messages: ContextMessage[], meta: MarkdownMeta | string): string {
  // Back-compat: earlier versions of this function took a bare title string.
  const info: MarkdownMeta = typeof meta === "string" ? { title: meta, platformLabel: "Assistant" } : meta;

  const lines: string[] = [];
  if (info.title) lines.push(`# ${info.title}`, "");
  const metaBits = [info.platformLabel, info.capturedAt ? new Date(info.capturedAt).toLocaleString() : ""].filter(
    Boolean,
  );
  if (metaBits.length) lines.push(metaBits.join(" · "), "");
  lines.push("---", "");

  for (const m of messages) {
    // The HTML comment is an unambiguous, invisible-when-rendered marker
    // that the app's own parser (see export/markdown-render.ts) uses to
    // find turn boundaries reliably — a bare "**Label**" line alone isn't
    // safe to key off of, since a message could legitimately contain a
    // standalone bolded line of its own (e.g. "**Note:**") that would
    // otherwise be misread as a new speaker turn. The bold label right
    // after it is still there purely for a human reading the raw file.
    lines.push(
      `<!-- lk-turn:${m.role} -->`,
      `**${speakerLabel(m.role, info.platformLabel)}**`,
      "",
      m.text.trim(),
      "",
      "---",
      "",
    );
  }
  // Drop the trailing rule after the last message.
  if (lines[lines.length - 2] === "---") lines.splice(lines.length - 2, 2);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
