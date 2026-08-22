// Runs inside the content script (has DOM access). Detects the platform,
// scrolls to load the full conversation history, extracts every message,
// formats it as Markdown, and stores it as the "latest context" via the
// background service worker (shared storage, not per-site).

import type { GenerateProgress, GenerateResult, LatestContext } from "./types";
import { detectPlatform } from "./extract/platforms";
import { scrollToLoadAll } from "./extract/scroll-loader";
import { messagesToMarkdown } from "./markdown";

const STREAM_WAIT_SELECTORS = [
  "button[aria-label*='Stop']",
  "[data-testid='stop-button']",
  ".result-streaming",
  "[data-is-streaming='true']",
];

async function waitForStreamToSettle(doc: Document, maxMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const streaming = STREAM_WAIT_SELECTORS.some((s) => doc.querySelector(s));
    if (!streaming) return;
    await new Promise((r) => setTimeout(r, 300));
  }
}

export async function generateContext(
  onProgress: (p: GenerateProgress) => void,
): Promise<GenerateResult> {
  const platform = detectPlatform(location.href);
  if (!platform) {
    return { success: false, reason: "This page is not a supported LLM (ChatGPT, Claude, Gemini, or DeepSeek)." };
  }
  onProgress({ stage: "detect", label: `Detected ${platform.label}` });

  await waitForStreamToSettle(document);

  onProgress({ stage: "scroll", label: "Loading full conversation history…", loadedCount: platform.countMessages(document) });
  const container = platform.findScrollContainer(document) ?? document.scrollingElement ?? document.documentElement;
  const loadResult = await scrollToLoadAll(container, {
    countMessages: () => platform.countMessages(document),
  });
  onProgress({ stage: "scroll", label: `Loaded ${loadResult.finalCount} message(s)`, loadedCount: loadResult.finalCount });

  onProgress({ stage: "extract", label: "Extracting messages…" });
  const messages = platform.extractMessages(document);
  if (messages.length === 0) {
    return { success: false, reason: "Conversation messages could not be identified on this page." };
  }

  onProgress({ stage: "format", label: "Formatting as Markdown…" });
  const title = platform.getTitle(document);
  const markdown = messagesToMarkdown(messages, title);

  const context: LatestContext = {
    markdown,
    platformId: platform.id,
    platformLabel: platform.label,
    conversationUrl: location.href,
    conversationTitle: title,
    messageCount: messages.length,
    capturedAt: new Date().toISOString(),
    truncated: loadResult.truncated,
    truncatedReason: loadResult.reason,
  };

  onProgress({ stage: "store", label: "Saving latest context…" });
  try {
    const res = await chrome.runtime.sendMessage({ type: "SET_LATEST_CONTEXT", context });
    if (!res || res.error) {
      return { success: false, reason: res?.error ?? "Failed to save the generated context." };
    }
  } catch (e) {
    return { success: false, reason: e instanceof Error ? e.message : "Failed to save the generated context." };
  }

  onProgress({ stage: "done", label: "Context generated" });
  return { success: true, context };
}
