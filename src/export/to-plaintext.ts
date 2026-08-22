// Convert our generated Markdown into clean, readable plain text: no hashes,
// no fences, no bracket-link syntax, no bold/italic markers.
export function markdownToPlaintext(markdown: string): string {
  return markdown
    .replace(/```[a-z0-9+#.-]*\n?/gi, "--- code ---\n")
    .replace(/```/g, "--- end code ---")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\W)\*(.+?)\*(?=\W|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
    .replace(/^\s{0,3}>+\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "  • ")
    .replace(/^\s*(\d+)\.\s+/gm, "  $1. ")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}
