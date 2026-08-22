import type { AdapterModule, ChatAdapter } from "./base/adapter";
import { chatgptModule } from "./chatgpt/adapter";
import { claudeModule } from "./claude/adapter";
import { geminiModule } from "./gemini/adapter";
import { genericModule } from "./generic/adapter";

// Specific adapters first; the generic fallback is intentionally last.
export const PLATFORM_MODULES: AdapterModule[] = [chatgptModule, claudeModule, geminiModule];

export const ALL_MODULES: AdapterModule[] = [...PLATFORM_MODULES, genericModule];

/** Return the platform module matching a URL, or null (generic not included). */
export function matchPlatform(url: string): AdapterModule | null {
  return PLATFORM_MODULES.find((m) => m.matches(url)) ?? null;
}

/** Select the best adapter for a document; falls back to generic. */
export function selectAdapter(doc: Document, url: string): ChatAdapter {
  const module = matchPlatform(url) ?? genericModule;
  return module.create(doc, url);
}

/** Human-readable list of supported platforms for UI/docs. */
export function supportedPlatforms(): Array<{ id: string; label: string }> {
  return PLATFORM_MODULES.map((m) => ({ id: m.id, label: m.label }));
}
