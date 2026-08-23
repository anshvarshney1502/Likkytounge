// Runs inside the content script. Retrieves the latest generated context
// from the background (shared, cross-site storage) and attaches it to the
// current LLM's composer as a .md file.
//
// Deliberately does NOT type the context into the message box. Writing a
// large context through a rich-text editor's typing path blocks the main
// thread (that is what made pages unresponsive for tens of seconds), and a
// wall of raw markdown in the input is not what the user wants anyway —
// they want a file on the prompt. Attaching hands the payload to the site's
// own uploader in one instantaneous operation, so our code never blocks the
// page no matter how large the context is.

import type { LatestContext, UploadResult, UploadProgress } from "./types";
import { detectPlatform } from "./extract/platforms";
import { attachContextAsFile } from "../content/attach";

/**
 * Retained for callers that want to pre-split a payload; the upload path no
 * longer chunks anything, since the whole context is handed over as a file.
 */
export function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const lastBreak = text.lastIndexOf("\n\n", end);
      if (lastBreak > start + maxChars * 0.5) end = lastBreak;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

/** How long to keep waiting for the destination site to accept the file. */
const ATTACH_TIMEOUT_MS = 60_000;

export async function uploadContext(
  onProgress: (p: UploadProgress) => void,
  _insertMode: "replace" | "append" | "prepend" = "append",
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
  const composer = platform.findInput(document);

  onProgress({ stage: "transfer", label: "Attaching context file…", elapsedMs: 0 });
  const result = await attachContextAsFile(
    context.markdown,
    context.conversationTitle,
    composer,
    {
      timeoutMs: ATTACH_TIMEOUT_MS,
      onTick: (elapsedMs) => {
        onProgress({ stage: "transfer", label: "Attaching context file…", elapsedMs });
      },
    },
  );

  if (!result.ok) {
    return {
      success: false,
      reason:
        `${result.reason ?? "The attachment could not be completed."} ` +
        `Use Copy Context and paste it manually, or open the Library to export the file.`,
    };
  }

  onProgress({ stage: "done", label: "Context attached" });
  return {
    success: true,
    platformLabel: platform.label,
    chunks: 1,
    attachedAsFile: true,
    elapsedMs: result.elapsedMs,
  };
}
