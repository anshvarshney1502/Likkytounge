// Runs inside the content script. Retrieves the latest generated context
// from the background (shared, cross-site storage) and transfers it into
// whichever supported LLM's chat input is present on the current page.
// Never shows a fake "success" — insertion is verified after the fact.

import type { LatestContext, UploadResult, UploadProgress } from "./types";
import { detectPlatform } from "./extract/platforms";
import { insertIntoInput } from "../content/insert";

const MAX_CHUNK_CHARS = 20_000;

export function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      // Prefer to break on a paragraph boundary so messages aren't split mid-sentence.
      const lastBreak = text.lastIndexOf("\n\n", end);
      if (lastBreak > start + maxChars * 0.5) end = lastBreak;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function getInputLength(el: HTMLElement): number {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value.length;
  return (el.textContent ?? "").length;
}

export async function uploadContext(
  onProgress: (p: UploadProgress) => void,
  insertMode: "replace" | "append" | "prepend" = "append",
): Promise<UploadResult> {
  const platform = detectPlatform(location.href);
  if (!platform) {
    return { success: false, reason: "This page is not a supported LLM (ChatGPT, Claude, Gemini, or DeepSeek)." };
  }
  onProgress({ stage: "detect", label: `Detected ${platform.label}` });

  let context: LatestContext | null;
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_LATEST_CONTEXT" });
    if (res && typeof res === "object" && "error" in res) {
      return { success: false, reason: String(res.error) || "Could not read the latest context." };
    }
    context = res as LatestContext | null;
  } catch (e) {
    return { success: false, reason: e instanceof Error ? e.message : "Could not read the latest context." };
  }
  if (context && (!context.markdown || typeof context.markdown !== "string")) {
    return { success: false, reason: "The stored context is invalid or corrupted. Generate a context again." };
  }
  if (!context) {
    return { success: false, reason: "No generated context is available yet. Generate a context first." };
  }

  onProgress({ stage: "locate-input", label: "Locating chat input…" });
  const input = platform.findInput(document);
  if (!input) {
    return { success: false, reason: `Could not find a compatible input on ${platform.label}. The page layout may have changed.` };
  }

  onProgress({ stage: "transfer", label: "Transferring context…" });
  const baseline = getInputLength(input);
  const chunks = splitIntoChunks(context.markdown, MAX_CHUNK_CHARS);

  let ok = true;
  chunks.forEach((chunk, i) => {
    const mode = i === 0 ? insertMode : "append";
    const success = insertIntoInput(input, chunk, mode);
    if (!success) ok = false;
  });

  if (!ok) {
    return { success: false, reason: "The destination editor rejected the automatic transfer." };
  }

  // Verify: did the input actually grow by roughly the expected amount?
  const after = getInputLength(input);
  const expectedDelta = context.markdown.length;
  const actualDelta = insertMode === "replace" ? after : after - baseline;
  const ratio = expectedDelta > 0 ? actualDelta / expectedDelta : 1;

  onProgress({ stage: "done", label: "Context transferred" });

  if (ratio < 0.85) {
    return {
      success: true,
      platformLabel: platform.label,
      chunks: chunks.length,
      partial: true,
      partialReason: `Only part of the context appears to have been inserted (~${Math.round(ratio * 100)}%). ${platform.label}'s input may have a size limit.`,
    };
  }

  return { success: true, platformLabel: platform.label, chunks: chunks.length };
}
