// Copy/Share helpers, kept in their own small module (separate from
// viewer.ts) so surfaces that only need these two actions — like the popup's
// "latest context" card — don't have to bundle the full export/zip/archive
// dependency chain that the Context Viewer's Export menu needs.
import type { SavedContext } from "../context/store";
import { markdownToPlaintext } from "../export/to-plaintext";
import { showToast } from "./toast";

export async function shareContext(ctx: SavedContext): Promise<void> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
  };
  try {
    if (nav.share && nav.canShare) {
      const file = new File([ctx.markdown], `${ctx.title}.md`, { type: "text/markdown" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ title: ctx.title, files: [file] });
        showToast("Shared.");
        return;
      }
    }
    if (nav.share) {
      const preview = markdownToPlaintext(ctx.markdown).slice(0, 1800);
      await nav.share({ title: ctx.title, text: preview });
      showToast("Shared.");
      return;
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return; // user cancelled
    /* fall through to clipboard fallback */
  }
  await navigator.clipboard.writeText(markdownToPlaintext(ctx.markdown));
  showToast("Sharing isn't available here — copied the context instead.");
}

export async function copyContext(ctx: SavedContext): Promise<void> {
  try {
    await navigator.clipboard.writeText(markdownToPlaintext(ctx.markdown));
    showToast("Context copied successfully.");
  } catch {
    showToast("Couldn't copy — clipboard access was denied.", true);
  }
}
