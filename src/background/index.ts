import {
  SAVE_PORT,
  type ActiveDetection,
  type DetectResponse,
  type RuntimeRequest,
  type SaveEvent,
  type StartSaveMessage,
} from "../shared/messages";
import type { Attachment, Conversation, ExtractionResult, StoredConversation } from "../shared/types";
import { getSettings, setSettings } from "../shared/settings-store";
import { storage } from "../storage/indexeddb";
import type { AttachmentBlob } from "../storage/provider";
import { base64ToBytes, makeBlob } from "../utils/bytes";
import { randomId } from "../utils/id";

// --- content-script messaging with auto-injection fallback ---
async function sendToTab<T>(tabId: number, message: unknown): Promise<T> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch {
    // Content script may not be injected yet (e.g. page open before install).
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  }
}

async function detectInTab(tabId: number): Promise<DetectResponse | null> {
  try {
    return await sendToTab<DetectResponse>(tabId, { type: "DETECT_PLATFORM" });
  } catch {
    return null;
  }
}

async function findExistingByUrl(url: string): Promise<{ id: string; savedAt: string } | null> {
  const list = await storage.listConversations();
  const match = list.find((c) => c.url === url);
  return match ? { id: match.id, savedAt: match.savedAt } : null;
}

// --- popup queries ---
chrome.runtime.onMessage.addListener((msg: RuntimeRequest, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "GET_SETTINGS") {
      sendResponse(await getSettings());
      return;
    }
    if (msg.type === "SET_SETTINGS") {
      sendResponse(await setSettings(msg.settings));
      return;
    }
    if (msg.type === "GET_ACTIVE_DETECTION") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result: ActiveDetection = {
        detection: null,
        tabId: tab?.id ?? null,
        url: tab?.url ?? null,
        alreadySaved: false,
        lastSavedAt: null,
      };
      if (tab?.id != null && tab.url && /^https?:/.test(tab.url)) {
        result.detection = await detectInTab(tab.id);
        const existing = await findExistingByUrl(tab.url);
        result.alreadySaved = !!existing;
        result.lastSavedAt = existing?.savedAt ?? null;
      }
      sendResponse(result);
    }
  })();
  return true; // async
});

// --- save flow over a Port (streams progress) ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SAVE_PORT) return;
  port.onMessage.addListener((msg: StartSaveMessage) => {
    if (msg?.type === "START_SAVE") void runSave(port, msg);
  });
});

function post(port: chrome.runtime.Port, event: SaveEvent): void {
  try {
    port.postMessage(event);
  } catch {
    /* popup closed */
  }
}

function toBlob(a: Attachment): Blob | null {
  if (!a.bytesBase64) return null;
  const bytes = base64ToBytes(a.bytesBase64);
  return makeBlob([bytes], a.mimeType || "application/octet-stream");
}

async function runSave(port: chrome.runtime.Port, msg: StartSaveMessage): Promise<void> {
  const { tabId, mode } = msg;
  const settings = await getSettings();

  post(port, { type: "progress", stage: "detect", label: "Detecting platform", ok: true });
  const detection = await detectInTab(tabId);
  if (!detection || !detection.supported) {
    post(port, {
      type: "result",
      success: false,
      reason: detection ? "No supported conversation detected." : "Cannot access this page.",
    });
    return;
  }

  post(port, { type: "progress", stage: "extract", label: "Extracting messages", ok: true });
  let extraction: ExtractionResult;
  try {
    extraction = await sendToTab<ExtractionResult>(tabId, {
      type: "EXTRACT_CONVERSATION",
      saveAttachments: settings.saveAttachments,
      maxAttachmentBytes: settings.maxAttachmentBytes,
    });
  } catch (e) {
    post(port, {
      type: "result",
      success: false,
      reason: e instanceof Error ? e.message : "Extraction failed.",
    });
    return;
  }

  if (!extraction.success) {
    post(port, { type: "result", success: false, reason: extraction.reason });
    return;
  }

  const conv: Conversation = extraction.conversation;
  post(port, {
    type: "progress",
    stage: "attachments",
    label: `Extracting attachments (${conv.attachments.filter((a) => a.availableLocally).length})`,
    ok: true,
  });

  // Split attachment bytes out of the conversation record; store blobs separately.
  const blobs: AttachmentBlob[] = [];
  const strippedAttachments: Attachment[] = conv.attachments.map((a) => {
    const blob = toBlob(a);
    if (blob) {
      blobs.push({ attachmentId: a.id, filename: a.filename, mimeType: a.mimeType, blob });
    }
    const { bytesBase64: _omit, ...rest } = a;
    void _omit;
    return rest;
  });
  conv.attachments = strippedAttachments;
  for (const m of conv.messages) {
    if (m.attachments) m.attachments = m.attachments.map(({ bytesBase64: _b, ...r }) => (void _b, r));
  }

  post(port, { type: "progress", stage: "archive", label: "Creating local archive", ok: true });

  const existing = await storage.has(conv.metadata.conversationId);
  const record: StoredConversation = {
    id: conv.metadata.conversationId,
    conversationId: conv.metadata.conversationId,
    snapshotId: randomId("snap"),
    platform: conv.metadata.platform,
    platformId: conv.metadata.platformId,
    title: conv.metadata.conversationTitle,
    url: conv.metadata.conversationUrl,
    savedAt: conv.metadata.savedAt,
    messageCount: conv.metadata.messageCount,
    attachmentCount: conv.attachments.length,
    generic: conv.metadata.generic,
    schemaVersion: conv.metadata.schemaVersion,
    conversation: conv,
  };

  post(port, { type: "progress", stage: "store", label: "Saving locally", ok: true });
  try {
    await storage.saveConversation(record, blobs);
  } catch (e) {
    post(port, {
      type: "result",
      success: false,
      reason: e instanceof Error ? e.message : "Failed to write to local storage.",
    });
    return;
  }

  post(port, { type: "progress", stage: "done", label: "Saved locally", ok: true });
  post(port, {
    type: "result",
    success: true,
    title: record.title,
    messageCount: record.messageCount,
    attachmentCount: record.attachmentCount,
    generic: record.generic,
    updated: existing && mode !== "new" ? true : existing,
    warnings: conv.metadata.warnings,
  });
}
