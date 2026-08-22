import { storage } from "../storage/indexeddb";
import type { ConversationSummary } from "../storage/provider";
import type { ExportFormat, Settings } from "../shared/messages";
import { exportConversation, buildBackupZip } from "../export/archive";
import { resolveAttachmentFiles } from "../export/attachments";
import { conversationToHtml } from "../export/html";
import { downloadBlob } from "../shared/download";
import { applyTheme } from "../shared/theme";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const listEl = $<HTMLDivElement>("list");
const emptyEl = $<HTMLDivElement>("empty");
const searchEl = $<HTMLInputElement>("search");
const platformEl = $<HTMLSelectElement>("platform");
const sortEl = $<HTMLSelectElement>("sort");

let all: ConversationSummary[] = [];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function render(): void {
  const q = searchEl.value.trim().toLowerCase();
  const platform = platformEl.value;
  const sort = sortEl.value;
  let items = all.filter(
    (c) =>
      (!platform || c.platformId === platform) &&
      (!q || c.title.toLowerCase().includes(q) || c.platform.toLowerCase().includes(q)),
  );
  items = items.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "oldest") return a.savedAt < b.savedAt ? -1 : 1;
    return a.savedAt < b.savedAt ? 1 : -1;
  });

  emptyEl.hidden = items.length > 0;
  listEl.innerHTML = items
    .map(
      (c) => `
    <div class="item" data-id="${esc(c.id)}">
      <div class="meta">
        <div class="title">${esc(c.title)}</div>
        <div class="sub">
          <span class="pill">${esc(c.platform)}${c.generic ? " · generic" : ""}</span>
          ${new Date(c.savedAt).toLocaleString()} · ${c.messageCount} messages${
            c.attachmentCount ? ` · ${c.attachmentCount} file(s)` : ""
          }
        </div>
      </div>
      <div class="actions">
        <button class="btn" data-act="open">Open</button>
        <select class="fmt" aria-label="Export format">
          <option value="zip">ZIP</option>
          <option value="markdown">Markdown</option>
          <option value="html">HTML</option>
          <option value="json">JSON</option>
        </select>
        <button class="btn" data-act="export">Export</button>
        <button class="btn btn-danger" data-act="delete">Delete</button>
      </div>
    </div>`,
    )
    .join("");
}

async function refresh(): Promise<void> {
  all = await storage.listConversations();
  const platforms = [...new Set(all.map((c) => c.platformId))];
  platformEl.innerHTML =
    `<option value="">All platforms</option>` +
    platforms
      .map((p) => {
        const label = all.find((c) => c.platformId === p)?.platform ?? p;
        return `<option value="${esc(p)}">${esc(label)}</option>`;
      })
      .join("");
  render();
}

async function openConversation(id: string): Promise<void> {
  const rec = await storage.getConversation(id);
  if (!rec) return;
  const html = conversationToHtml(rec.conversation);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function exportOne(id: string, format: ExportFormat): Promise<void> {
  const rec = await storage.getConversation(id);
  if (!rec) return;
  const blobs = await storage.getAttachmentBlobs(rec.conversationId);
  const files = await resolveAttachmentFiles(rec.conversation, blobs);
  const { blob, filename } = await exportConversation(rec.conversation, format, files);
  downloadBlob(blob, filename);
}

listEl.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  const item = btn.closest<HTMLElement>(".item");
  const id = item?.dataset.id;
  if (!id) return;
  const act = btn.dataset.act;
  if (act === "open") await openConversation(id);
  else if (act === "delete") {
    if (confirm("Delete this conversation permanently from local storage?")) {
      await storage.deleteConversation(id);
      await refresh();
    }
  } else if (act === "export") {
    const fmt = (item!.querySelector(".fmt") as HTMLSelectElement).value as ExportFormat;
    await exportOne(id, fmt);
  }
});

$<HTMLButtonElement>("export-all").addEventListener("click", async () => {
  if (all.length === 0) return alert("Nothing to export.");
  const items = [];
  for (const summary of all) {
    const rec = await storage.getConversation(summary.id);
    if (!rec) continue;
    const blobs = await storage.getAttachmentBlobs(rec.conversationId);
    const files = await resolveAttachmentFiles(rec.conversation, blobs);
    items.push({ conv: rec.conversation, attachments: files });
  }
  const blob = await buildBackupZip(items);
  downloadBlob(blob, `localchatvault-backup-${new Date().toISOString().slice(0, 10)}.zip`);
});

$<HTMLButtonElement>("delete-all").addEventListener("click", async () => {
  if (confirm("Delete ALL saved conversations and attachments? This cannot be undone.")) {
    await storage.deleteAll();
    await refresh();
  }
});

[searchEl, platformEl, sortEl].forEach((el) => el.addEventListener("input", render));

async function init(): Promise<void> {
  const settings = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as Settings;
  applyTheme(settings.theme);
  sortEl.value = "newest";
  await refresh();
}

void init();
