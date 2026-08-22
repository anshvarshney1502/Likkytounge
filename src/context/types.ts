// Data model for the "Generate Context / Upload Context" feature.

export type ContextRole = "user" | "assistant" | "system" | "unknown";

export interface ContextMessage {
  role: ContextRole;
  /** Full plain-text content, never truncated by extraction. */
  text: string;
}

export interface LatestContext {
  /** Present once persisted by the store; absent on the freshly-built object generate.ts returns. */
  id?: string;
  /** Markdown per the spec: "# Conversation Context" + ## User / ## Assistant blocks. */
  markdown: string;
  platformId: string;
  platformLabel: string;
  conversationUrl: string;
  conversationTitle: string;
  messageCount: number;
  capturedAt: string; // ISO
  /** True if the extractor hit a safety cap and could not confirm full history. */
  truncated: boolean;
  /** Human-readable reason when truncated is true. */
  truncatedReason?: string;
}

export interface GenerateProgress {
  stage: "detect" | "scroll" | "extract" | "format" | "store" | "done";
  label: string;
  /** For the scroll stage: how many messages have been loaded so far. */
  loadedCount?: number;
}

export type GenerateResult =
  | { success: true; context: LatestContext }
  | { success: false; reason: string };

export interface UploadProgress {
  stage: "detect" | "locate-input" | "transfer" | "done";
  label: string;
}

export type UploadResult =
  | { success: true; platformLabel: string; chunks: number; partial?: boolean; partialReason?: string }
  | { success: false; reason: string };
