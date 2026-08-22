import type { Conversation } from "../shared/types";
import type { ExportFormat } from "../shared/messages";
import { conversationToJsonString } from "./json";
import { conversationToMarkdown } from "./markdown";
import { conversationToHtml } from "./html";
import { conversationToPlaintext, type PlaintextOptions } from "./plaintext";
import { createZip, type ZipEntry } from "./zip";
import { utf8 } from "../utils/bytes";

/** Sanitize a string into a safe file/folder name. */
export function safeName(name: string, fallback = "file"): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "_")
    .slice(0, 120)
    .replace(/^[._]+|[._]+$/g, "");
  return cleaned || fallback;
}

/** A resolved attachment file with its bytes, ready to place in the archive. */
export interface AttachmentFile {
  /** Path relative to the conversation folder, e.g. "attachments/foo.png". */
  relPath: string;
  bytes: Uint8Array;
}

/** Build the Zip entries for a single conversation, under `folder/`. */
export function conversationEntries(
  conv: Conversation,
  attachments: AttachmentFile[],
  folder = safeName(conv.metadata.conversationTitle, "conversation"),
  plaintextOpts: PlaintextOptions = {},
): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const add = (rel: string, data: Uint8Array) => entries.push({ path: `${folder}/${rel}`, data });

  add("metadata.json", utf8(JSON.stringify(conv.metadata, null, 2)));
  add("messages.json", utf8(conversationToJsonString(conv)));
  add("conversation.md", utf8(conversationToMarkdown(conv)));
  add("conversation.txt", utf8(conversationToPlaintext(conv, plaintextOpts)));
  add("conversation.html", utf8(conversationToHtml(conv)));
  add(
    "README.txt",
    utf8(
      `LocalChatVault export\n` +
        `Title: ${conv.metadata.conversationTitle}\n` +
        `Platform: ${conv.metadata.platform}\n` +
        `Saved: ${conv.metadata.savedAt}\n` +
        `Messages: ${conv.metadata.messageCount}\n` +
        `\nThis archive was created entirely locally. No data left your machine.\n`,
    ),
  );
  for (const a of attachments) add(a.relPath, a.bytes);
  return entries;
}

/** Portable ZIP for one conversation. */
export async function buildConversationZip(
  conv: Conversation,
  attachments: AttachmentFile[],
  plaintextOpts: PlaintextOptions = {},
): Promise<Blob> {
  return createZip(conversationEntries(conv, attachments, undefined, plaintextOpts));
}

/** Backup ZIP containing many conversations (each in its own folder). */
export async function buildBackupZip(
  items: Array<{ conv: Conversation; attachments: AttachmentFile[] }>,
  plaintextOpts: PlaintextOptions = {},
): Promise<Blob> {
  const entries: ZipEntry[] = [];
  const used = new Set<string>();
  const manifest: unknown[] = [];
  items.forEach(({ conv, attachments }, i) => {
    let folder = safeName(conv.metadata.conversationTitle, `conversation_${i}`);
    while (used.has(folder)) folder = `${folder}_${i}`;
    used.add(folder);
    entries.push(...conversationEntries(conv, attachments, folder, plaintextOpts));
    manifest.push({
      folder,
      conversationId: conv.metadata.conversationId,
      platform: conv.metadata.platform,
      title: conv.metadata.conversationTitle,
      savedAt: conv.metadata.savedAt,
    });
  });
  entries.push({
    path: "backup.json",
    data: utf8(
      JSON.stringify(
        { app: "LocalChatVault", schemaVersion: 1, exportedAt: new Date().toISOString(), conversations: manifest },
        null,
        2,
      ),
    ),
  });
  return createZip(entries);
}

/** Produce a single exported file for a given format. */
export async function exportConversation(
  conv: Conversation,
  format: ExportFormat,
  attachments: AttachmentFile[] = [],
  plaintextOpts: PlaintextOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const base = safeName(conv.metadata.conversationTitle, "conversation");
  switch (format) {
    case "json":
      return {
        blob: new Blob([conversationToJsonString(conv)], { type: "application/json" }),
        filename: `${base}.json`,
      };
    case "markdown":
      return {
        blob: new Blob([conversationToMarkdown(conv)], { type: "text/markdown" }),
        filename: `${base}.md`,
      };
    case "plaintext":
      return {
        blob: new Blob([conversationToPlaintext(conv, plaintextOpts)], { type: "text/plain" }),
        filename: `${base}.txt`,
      };
    case "html":
      return {
        blob: new Blob([conversationToHtml(conv)], { type: "text/html" }),
        filename: `${base}.html`,
      };
    case "zip":
      return { blob: await buildConversationZip(conv, attachments, plaintextOpts), filename: `${base}.zip` };
  }
}
