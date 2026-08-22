import type { Conversation, StoredConversation } from "../shared/types";
import type { Settings } from "../shared/messages";
import { storage } from "../storage/indexeddb";
import type { AttachmentBlob } from "../storage/provider";
import { resolveAttachmentFiles } from "../export/attachments";
import { buildBackupZip } from "../export/archive";
import { readZip } from "../export/unzip";
import { downloadBlob } from "../shared/download";
import { applyTheme } from "../shared/theme";
import { supportedPlatforms } from "../adapters/registry";
import { randomId } from "../utils/id";
import { makeBlob } from "../utils/bytes";
import { APP_VERSION } from "../shared/brand";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(1)} ${u[i]}`;
}

async function loadSettings(): Promise<Settings> {
  return (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as Settings;
}
async function save(patch: Partial<Settings>): Promise<Settings> {
  return (await chrome.runtime.sendMessage({ type: "SET_SETTINGS", settings: patch })) as Settings;
}

async function refreshStorage(): Promise<void> {
  const est = await storage.estimate();
  const list = await storage.listConversations();
  $("storage-usage").textContent = `${list.length} conversation(s) · ${fmtBytes(est.usage)} used${
    est.quota ? ` of ~${fmtBytes(est.quota)} available` : ""
  }`;
}

function bind(settings: Settings): void {
  ($("autoSave") as HTMLInputElement).checked = settings.autoSave;
  ($("saveAttachments") as HTMLInputElement).checked = settings.saveAttachments;
  const rng = $("maxAttachmentBytes") as HTMLInputElement;
  const mb = Math.max(1, Math.round(settings.maxAttachmentBytes / (1024 * 1024)));
  rng.value = String(mb);
  $("maxAttachmentBytesLabel").textContent = `${mb} MB`;
  ($("autoDownloadOnSave") as HTMLSelectElement).value = settings.autoDownloadOnSave;
  ($("copyOnSave") as HTMLInputElement).checked = settings.copyOnSave;
  ($("defaultExportFormat") as HTMLSelectElement).value = settings.defaultExportFormat;
  ($("includeTimestamps") as HTMLInputElement).checked = settings.includeTimestamps;
  ($("includeWarnings") as HTMLInputElement).checked = settings.includeWarnings;
  ($("theme") as HTMLSelectElement).value = settings.theme;
  ($("debugMode") as HTMLInputElement).checked = settings.debugMode;
  $("about-version").textContent = APP_VERSION;
}

function wireInputs(): void {
  $("autoSave").addEventListener("change", (e) =>
    save({ autoSave: (e.target as HTMLInputElement).checked }),
  );
  $("saveAttachments").addEventListener("change", (e) =>
    save({ saveAttachments: (e.target as HTMLInputElement).checked }),
  );
  const rng = $("maxAttachmentBytes") as HTMLInputElement;
  rng.addEventListener("input", () => {
    const mb = Number(rng.value);
    $("maxAttachmentBytesLabel").textContent = `${mb} MB`;
  });
  rng.addEventListener("change", () => {
    void save({ maxAttachmentBytes: Number(rng.value) * 1024 * 1024 });
  });
  $("autoDownloadOnSave").addEventListener("change", (e) =>
    save({ autoDownloadOnSave: (e.target as HTMLSelectElement).value as Settings["autoDownloadOnSave"] }),
  );
  $("copyOnSave").addEventListener("change", (e) =>
    save({ copyOnSave: (e.target as HTMLInputElement).checked }),
  );
  $("defaultExportFormat").addEventListener("change", (e) =>
    save({ defaultExportFormat: (e.target as HTMLSelectElement).value as Settings["defaultExportFormat"] }),
  );
  $("includeTimestamps").addEventListener("change", (e) =>
    save({ includeTimestamps: (e.target as HTMLInputElement).checked }),
  );
  $("includeWarnings").addEventListener("change", (e) =>
    save({ includeWarnings: (e.target as HTMLInputElement).checked }),
  );
  $("theme").addEventListener("change", async (e) => {
    const theme = (e.target as HTMLSelectElement).value as Settings["theme"];
    await save({ theme });
    applyTheme(theme);
  });
  $("debugMode").addEventListener("change", (e) =>
    save({ debugMode: (e.target as HTMLInputElement).checked }),
  );
}

async function exportAll(): Promise<void> {
  const list = await storage.listConversations();
  if (!list.length) return void ($("io-status").textContent = "Nothing to export.");
  const items = [];
  for (const s of list) {
    const rec = await storage.getConversation(s.id);
    if (!rec) continue;
    const blobs = await storage.getAttachmentBlobs(rec.conversationId);
    items.push({ conv: rec.conversation, attachments: await resolveAttachmentFiles(rec.conversation, blobs) });
  }
  const settings = await loadSettings();
  const blob = await buildBackupZip(items, {
    includeTimestamps: settings.includeTimestamps,
    includeWarnings: settings.includeWarnings,
  });
  downloadBlob(blob, `likky-tounge-backup-${new Date().toISOString().slice(0, 10)}.zip`);
  $("io-status").textContent = `Exported ${items.length} conversation(s).`;
}

function recordFromConversation(conv: Conversation): StoredConversation {
  return {
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
}

async function importBackup(file: File): Promise<void> {
  $("io-status").textContent = "Reading backup…";
  const entries = await readZip(await file.arrayBuffer());
  const folders = new Set<string>();
  for (const path of entries.keys()) {
    const slash = path.indexOf("/");
    if (slash > 0) folders.add(path.slice(0, slash));
  }
  let imported = 0;
  for (const folder of folders) {
    const messagesRaw = entries.get(`${folder}/messages.json`);
    if (!messagesRaw) continue;
    let parsed: Conversation;
    try {
      const json = JSON.parse(new TextDecoder().decode(messagesRaw));
      parsed = { metadata: json.metadata, messages: json.messages, attachments: json.attachments ?? [] };
    } catch {
      continue;
    }
    if (!parsed.metadata?.conversationId) continue;
    const blobs: AttachmentBlob[] = [];
    for (const a of parsed.attachments) {
      if (!a.localPath) continue;
      const bytes = entries.get(`${folder}/${a.localPath}`);
      if (bytes) {
        blobs.push({
          attachmentId: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          blob: makeBlob([bytes], a.mimeType || "application/octet-stream"),
        });
      }
    }
    await storage.saveConversation(recordFromConversation(parsed), blobs);
    imported++;
  }
  $("io-status").textContent = `Imported ${imported} conversation(s).`;
  await refreshStorage();
}

function renderSupported(): void {
  $("supported").innerHTML =
    supportedPlatforms()
      .map((p) => `<li>${p.label}</li>`)
      .join("") + `<li>Other AI chat sites — via generic extraction (best-effort)</li>`;
}

async function init(): Promise<void> {
  const settings = await loadSettings();
  applyTheme(settings.theme);
  bind(settings);
  wireInputs();
  renderSupported();
  await refreshStorage();

  $("export-all").addEventListener("click", exportAll);
  $("clear-all").addEventListener("click", async () => {
    if (confirm("Delete ALL saved conversations and attachments? This cannot be undone.")) {
      await storage.deleteAll();
      await refreshStorage();
      $("io-status").textContent = "All local conversation data cleared.";
    }
  });
  ($("import-file") as HTMLInputElement).addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      try {
        await importBackup(file);
      } catch (err) {
        $("io-status").textContent = `Import failed: ${err instanceof Error ? err.message : "unknown error"}`;
      }
    }
  });
}

void init();
