import type { StoredConversation } from "../shared/types";

/** Lightweight summary for the library list (no full message payload). */
export interface ConversationSummary {
  id: string;
  conversationId: string;
  snapshotId: string;
  title: string;
  platform: string;
  platformId: string;
  url: string;
  savedAt: string;
  messageCount: number;
  attachmentCount: number;
  generic: boolean;
  schemaVersion: number;
}

export interface AttachmentBlob {
  attachmentId: string;
  filename: string;
  mimeType?: string;
  blob: Blob;
}

/**
 * Storage abstraction. The UI depends only on this interface, so the backing
 * store (IndexedDB today) can be swapped without touching the UI.
 */
export interface StorageProvider {
  saveConversation(record: StoredConversation, attachments: AttachmentBlob[]): Promise<void>;
  getConversation(id: string): Promise<StoredConversation | null>;
  listConversations(): Promise<ConversationSummary[]>;
  deleteConversation(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  getAttachmentBlobs(conversationId: string): Promise<AttachmentBlob[]>;
  /** True if a conversation with this id already exists. */
  has(id: string): Promise<boolean>;
  estimate(): Promise<{ usage: number; quota: number }>;
}

export function toSummary(r: StoredConversation): ConversationSummary {
  return {
    id: r.id,
    conversationId: r.conversationId,
    snapshotId: r.snapshotId,
    title: r.title,
    platform: r.platform,
    platformId: r.platformId,
    url: r.url,
    savedAt: r.savedAt,
    messageCount: r.messageCount,
    attachmentCount: r.attachmentCount,
    generic: r.generic,
    schemaVersion: r.schemaVersion,
  };
}
