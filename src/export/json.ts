import type { Conversation } from "../shared/types";

/**
 * Structured export. Strips in-memory byte payloads (bytesBase64) from
 * attachments; bytes live in the ZIP under attachments/ instead.
 */
export function conversationToJson(conv: Conversation): { metadata: unknown; messages: unknown } {
  const strip = (a: Conversation["attachments"][number]) => {
    const { bytesBase64: _omit, ...rest } = a;
    void _omit;
    return rest;
  };
  return {
    metadata: conv.metadata,
    messages: conv.messages.map((m) => ({
      ...m,
      attachments: (m.attachments ?? []).map(strip),
    })),
  };
}

export function conversationToJsonString(conv: Conversation): string {
  const { metadata, messages } = conversationToJson(conv);
  return JSON.stringify({ metadata, messages, attachments: conv.attachments.map((a) => {
    const { bytesBase64: _o, ...rest } = a;
    void _o;
    return rest;
  }) }, null, 2);
}
