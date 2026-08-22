import type { Attachment, Conversation, ExtractionResult } from "../shared/types";
import { SCHEMA_VERSION } from "../shared/types";
import type { DetectResponse } from "../shared/messages";
import { matchPlatform, selectAdapter } from "../adapters/registry";
import type { ChatAdapter } from "../adapters/base/adapter";
import { deriveConversationId, hashString } from "../utils/id";
import { bytesToBase64 } from "../utils/bytes";
import { filenameFromUrl } from "../adapters/base/dom";
import { debug } from "../utils/log";

export function detect(doc: Document, url: string): DetectResponse {
  const platformModule = matchPlatform(url);
  if (platformModule) {
    return {
      platform: platformModule.label,
      platformId: platformModule.id,
      generic: false,
      supported: true,
    };
  }
  // Unknown site: is generic extraction viable?
  const adapter = selectAdapter(doc, url);
  const count = adapter.getMessages().length;
  return {
    platform: count > 0 ? "Generic" : "Unknown",
    platformId: count > 0 ? "generic" : null,
    generic: true,
    supported: count > 0,
  };
}

/** Wait until a streaming response stabilizes (or a timeout elapses). */
async function stabilize(adapter: ChatAdapter, maxMs = 15000): Promise<boolean> {
  const start = Date.now();
  let lastSignature = "";
  let stableSince = 0;
  while (Date.now() - start < maxMs) {
    const streaming = adapter.isStreaming();
    const msgs = adapter.getMessages();
    const sig = `${msgs.length}:${JSON.stringify(msgs[msgs.length - 1]?.content ?? "").length}`;
    if (!streaming && sig === lastSignature) {
      if (stableSince && Date.now() - stableSince > 600) return true;
      if (!stableSince) stableSince = Date.now();
    } else {
      stableSince = 0;
    }
    lastSignature = sig;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false; // timed out; caller notes possible incompleteness
}

function extFromMime(mime: string | undefined): string {
  if (!mime) return "";
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/json": "json",
  };
  return map[mime] ? "." + map[mime] : "";
}

async function tryFetchBytes(
  url: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; mime?: string } | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? undefined;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;
    return { bytes: new Uint8Array(buf), mime: mime?.split(";")[0] };
  } catch {
    return null;
  }
}

/** Collect candidate attachments: adapter-declared files + per-message attachments + inline images. */
function gatherAttachments(conv: Conversation): Attachment[] {
  const out: Attachment[] = [...conv.attachments];
  const seen = new Set(out.map((a) => a.sourceUrl ?? a.id));
  const push = (a: Attachment) => {
    const key = a.sourceUrl ?? a.id;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };
  for (const msg of conv.messages) {
    for (const a of msg.attachments ?? []) push(a);
    for (const block of msg.content) {
      if (block.type === "image" && block.url) {
        push({
          id: hashString(block.url),
          filename: filenameFromUrl(block.url, "image"),
          sourceUrl: block.url,
          availableLocally: false,
          reason: "Not yet captured",
        });
      }
    }
  }
  return out;
}

async function captureAttachments(
  conv: Conversation,
  maxBytes: number,
): Promise<Attachment[]> {
  const candidates = gatherAttachments(conv);
  const used = new Set<string>();
  const results: Attachment[] = [];
  for (const a of candidates) {
    if (!a.sourceUrl) {
      results.push({ ...a, availableLocally: false, reason: "No source URL exposed by site" });
      continue;
    }
    const fetched = await tryFetchBytes(a.sourceUrl, maxBytes);
    if (!fetched) {
      results.push({
        ...a,
        availableLocally: false,
        reason: "Browser/site did not expose file contents",
      });
      continue;
    }
    const mime = a.mimeType ?? fetched.mime;
    const hasExt = /\.[a-z0-9]{1,8}$/i.test(a.filename);
    let base = hasExt ? a.filename : `${a.filename}${extFromMime(mime)}`;
    // Keep letters, digits, dot, dash, underscore, space. Trim length.
    base = base.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) ||
      `${a.id}${extFromMime(mime)}`;
    let localPath = `attachments/${base}`;
    let n = 1;
    while (used.has(localPath)) {
      const dot = base.lastIndexOf(".");
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : "";
      localPath = `attachments/${stem} (${n++})${ext}`;
    }
    used.add(localPath);
    results.push({
      ...a,
      mimeType: mime,
      size: fetched.bytes.length,
      availableLocally: true,
      localPath,
      reason: undefined,
      bytesBase64: bytesToBase64(fetched.bytes),
    });
  }
  return results;
}

/** Rewrite inline image blocks to point at their captured local path. */
function relinkImages(conv: Conversation, attachments: Attachment[]): void {
  const byUrl = new Map(attachments.filter((a) => a.localPath).map((a) => [a.sourceUrl, a.localPath]));
  for (const msg of conv.messages) {
    for (const block of msg.content) {
      if (block.type === "image" && block.url && byUrl.has(block.url)) {
        block.localPath = byUrl.get(block.url);
      }
    }
  }
}

export interface ExtractOptions {
  saveAttachments: boolean;
  maxAttachmentBytes: number;
}

export async function extract(
  doc: Document,
  url: string,
  opts: ExtractOptions,
): Promise<ExtractionResult> {
  const adapter = selectAdapter(doc, url);
  const warnings: string[] = [];

  if (adapter.isStreaming()) {
    const settled = await stabilize(adapter);
    if (!settled) warnings.push("Response was still generating; saved content may be incomplete.");
  }

  const messages = adapter.getMessages();
  if (messages.length === 0) {
    return {
      success: false,
      platform: adapter.label,
      reason: "Conversation messages could not be identified",
    };
  }
  if (adapter.generic) warnings.push("Generic extraction — some content may not be available.");

  const meta = adapter.getConversationMetadata();
  const conversationId = deriveConversationId(
    adapter.id,
    meta.platformConversationId,
    url,
    meta.title,
  );

  const conversation: Conversation = {
    metadata: {
      schemaVersion: SCHEMA_VERSION,
      platform: adapter.label,
      platformId: adapter.id,
      conversationTitle: meta.title,
      conversationUrl: url,
      conversationId,
      savedAt: new Date().toISOString(),
      messageCount: messages.length,
      generic: adapter.generic,
      warnings,
    },
    messages,
    attachments: adapter.getAttachments(),
  };

  if (opts.saveAttachments) {
    try {
      const captured = await captureAttachments(conversation, opts.maxAttachmentBytes);
      conversation.attachments = captured;
      relinkImages(conversation, captured);
      const failed = captured.filter((a) => !a.availableLocally).length;
      if (failed > 0) warnings.push(`${failed} attachment(s) could not be accessed.`);
    } catch (e) {
      debug("attachment capture failed", e);
      warnings.push("Attachment capture failed.");
    }
  }

  conversation.metadata.warnings = warnings;
  return { success: true, conversation };
}
