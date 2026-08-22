import type { Attachment, ChatMessage } from "../../shared/types";

export interface AdapterMeta {
  title: string;
  /** Platform-native conversation id (usually parsed from the URL). */
  platformConversationId: string | null;
}

/** The contract every platform adapter implements. */
export interface ChatAdapter {
  readonly id: string;
  readonly label: string;
  readonly generic: boolean;
  getConversationMetadata(): AdapterMeta;
  getMessages(): ChatMessage[];
  /**
   * Attachment metadata (+ sourceUrl when exposed). Byte capture happens in the
   * orchestrator, not here, so adapters stay synchronous and testable.
   */
  getAttachments(): Attachment[];
  /** True while the assistant is actively streaming a response. */
  isStreaming(): boolean;
}

/** Registry entry: how to detect and construct an adapter. */
export interface AdapterModule {
  id: string;
  label: string;
  generic: boolean;
  matches(url: string): boolean;
  create(doc: Document, url: string): ChatAdapter;
}

/** Shared base implementation with sensible defaults. */
export abstract class BaseAdapter implements ChatAdapter {
  abstract readonly id: string;
  abstract readonly label: string;
  readonly generic: boolean = false;

  constructor(
    protected readonly doc: Document,
    protected readonly url: string,
  ) {}

  abstract getConversationMetadata(): AdapterMeta;
  abstract getMessages(): ChatMessage[];

  getAttachments(): Attachment[] {
    // Aggregate any per-message attachments by default.
    const seen = new Set<string>();
    const out: Attachment[] = [];
    for (const msg of this.getMessages()) {
      for (const a of msg.attachments ?? []) {
        const key = a.sourceUrl ?? a.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(a);
      }
    }
    return out;
  }

  isStreaming(): boolean {
    return false;
  }

  /** Fallback title from <title> or the document heading. */
  protected fallbackTitle(): string {
    const t = (this.doc.title ?? "").trim();
    return t || "Untitled conversation";
  }
}
