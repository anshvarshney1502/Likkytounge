// Convert our generated Markdown into a clean, readable plain-text chat
// transcript: no hashes, no bold markers, no fences — but still clearly
// laid out as a conversation, with a divider between each turn and a plain
// "SPEAKER" label line, matching the same chat-transcript shape as the
// Markdown export (see context/markdown.ts) rather than a generic
// strip-all-formatting pass.

const DIVIDER = "─".repeat(48);

function stripInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, "$1$2")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)");
}

export function markdownToPlaintext(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const hasMarkers = lines.some((l) => /^<!--\s*lk-turn:/.test(l));
  const out: string[] = [];
  let inCode = false;
  let expectLabelLine = false;

  for (const line of lines) {
    if (/^```/.test(line)) {
      inCode = !inCode;
      out.push(inCode ? "  ── code ──" : "  ──────────");
      continue;
    }
    if (inCode) {
      out.push("  " + line);
      continue;
    }

    const marker = line.match(/^<!--\s*lk-turn:(user|assistant|system)\s*-->$/);
    if (marker) {
      out.push(DIVIDER);
      expectLabelLine = true;
      continue;
    }
    if (hasMarkers) {
      if (expectLabelLine) {
        expectLabelLine = false;
        const label = line.match(/^\*\*(.+?)\*\*$/);
        if (label) {
          out.push(label[1].toUpperCase(), "");
          continue;
        }
      }
      if (/^-{3,}$/.test(line.trim())) continue; // turn divider, already drew our own
      // fall through to the shared inline-formatting cleanup below
    } else {
      // Legacy / marker-less fallback.
      const speaker = line.match(/^\*\*(.+?)\*\*$/);
      if (speaker) {
        out.push(DIVIDER, speaker[1].toUpperCase(), "");
        continue;
      }
      if (/^-{3,}$/.test(line.trim())) continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      out.push(heading[2].trim());
      continue;
    }

    out.push(
      stripInline(line)
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*[-*+]\s+/, "  • ")
        .replace(/^\s*(\d+)\.\s+/, "  $1. "),
    );
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}
