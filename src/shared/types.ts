// Core normalized data model. Every adapter produces these shapes so that
// exports and storage are fully platform-independent.

export const SCHEMA_VERSION = 1 as const;

export type Role = "user" | "assistant" | "system" | "unknown";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "code"; language?: string; code: string }
  | { type: "image"; url?: string; alt?: string; localPath?: string }
  | { type: "link"; url: string; text?: string };

export interface Attachment {
  /** Stable-ish id within the conversation. */
  id: string;
  filename: string;
  mimeType?: string;
  /** Size in bytes when known. */
  size?: number;
  /** Original source URL if the site exposed one. */
  sourceUrl?: string;
  /** True when the bytes were captured into the local archive. */
  availableLocally: boolean;
  /** Human-readable reason when not available locally. */
  reason?: string;
  /** Relative path inside the archive when stored locally. */
  localPath?: string;
  /** Populated only in-memory during capture; never persisted as-is here. */
  bytesBase64?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: ContentBlock[];
  /** ISO string when the platform exposes a timestamp. */
  timestamp?: string;
  attachments?: Attachment[];
}

export interface ConversationMetadata {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Human platform label, e.g. "ChatGPT". */
  platform: string;
  /** Machine platform id, e.g. "chatgpt". */
  platformId: string;
  conversationTitle: string;
  conversationUrl: string;
  /** Stable id derived from the conversation URL/DOM when possible. */
  conversationId: string;
  savedAt: string;
  messageCount: number;
  /** True when captured via the generic fallback adapter. */
  generic: boolean;
  /** Non-fatal warnings surfaced to the user (never message contents). */
  warnings: string[];
}

export interface Conversation {
  metadata: ConversationMetadata;
  messages: ChatMessage[];
  attachments: Attachment[];
}

/** Result of an extraction attempt inside the content script. */
export type ExtractionResult =
  | { success: true; conversation: Conversation }
  | { success: false; platform: string; reason: string };

/** A stored record wrapping a conversation plus snapshot bookkeeping. */
export interface StoredConversation {
  /** Primary key: `${conversationId}` (latest snapshot pointer lives here). */
  id: string;
  conversationId: string;
  snapshotId: string;
  platform: string;
  platformId: string;
  title: string;
  url: string;
  savedAt: string;
  messageCount: number;
  attachmentCount: number;
  generic: boolean;
  schemaVersion: number;
  conversation: Conversation;
}
