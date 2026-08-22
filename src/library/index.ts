import type { Capsule, Folder, Settings } from "../shared/types";
import { applyTheme } from "../shared/theme";
import { randomId } from "../utils/id";
import { cook, ALL_RECIPES } from "../cook/recipes";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface State {
  capsules: Capsule[];
  folders: Folder[];
  selectedId: string | null;
  activeFolder: string | "" | "all";
  query: string;
  sort: "updated" | "used" | "title";
}

const state: State = {
  capsules: [],
  folders: [],
  selectedId: null,
  activeFolder: "all",
  query: "",
  sort: "updated",
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function refresh(preserveSelection = true): Promise<void> {
  const [capsules, folders] = await Promise.all([
    chrome.runtime.sendMessage({ type: "LIST_CAPSULES" }),
    chrome.runtime.sendMessage({ type: "LIST_FOLDERS" }),
  ]);
  state.capsules = capsules as Capsule[];
  state.folders = folders as Folder[];
  renderFolders();
  renderList();
  if (preserveSelection && state.selectedId) {
    const c = state.capsules.find((x) => x.id === state.selectedId);
    if (c) renderEditor(c); else clearEditor();
  }
}

function renderFolders(): void {
  const ul = $<HTMLUListElement>("folders");
  const items = [
    { id: "all", name: "All capsules", count: state.capsules.length },
    { id: "", name: "Uncategorized", count: state.capsules.filter((c) => !c.folderId).length },
    ...state.folders.map((f) => ({
      id: f.id,
      name: f.name,
      count: state.capsules.filter((c) => c.folderId === f.id).length,
    })),
  ];
  ul.innerHTML = items
    .map(
      (it) => `
      <li>
        <a data-fid="${esc(it.id)}" class="folder-item ${state.activeFolder === it.id ? "active" : ""}">
          <span>${esc(it.name)}</span>
          <span class="muted small">${it.count}</span>
        </a>
      </li>`,
    )
    .join("");
  ul.querySelectorAll<HTMLAnchorElement>("[data-fid]").forEach((a) =>
    a.addEventListener("click", async () => {
      const fid = a.getAttribute("data-fid") ?? "";
      state.activeFolder = fid === "all" ? "all" : fid;
      renderFolders();
      renderList();
    }),
  );
  // Right-click a folder to rename/delete (only real folders, not All/Uncategorized).
  ul.querySelectorAll<HTMLAnchorElement>("[data-fid]").forEach((a) => {
    const fid = a.getAttribute("data-fid") ?? "";
    if (!fid || fid === "all") return;
    a.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      folderMenu(fid);
    });
  });
}

async function folderMenu(fid: string): Promise<void> {
  const f = state.folders.find((x) => x.id === fid);
  if (!f) return;
  const choice = prompt(`Rename "${f.name}" to (empty to delete):`, f.name);
  if (choice === null) return;
  if (choice.trim() === "") {
    if (confirm(`Delete folder "${f.name}"? Its capsules move to Uncategorized.`)) {
      await chrome.runtime.sendMessage({ type: "DELETE_FOLDER", id: fid });
      if (state.activeFolder === fid) state.activeFolder = "all";
      await refresh();
    }
    return;
  }
  f.name = choice.trim();
  await chrome.runtime.sendMessage({ type: "UPSERT_FOLDER", folder: f });
  await refresh();
}

function filtered(): Capsule[] {
  let items = state.capsules.slice();
  if (state.activeFolder !== "all") {
    items = items.filter((c) => (c.folderId ?? "") === state.activeFolder);
  }
  const q = state.query.trim().toLowerCase();
  if (q) {
    items = items.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.body.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (state.sort === "title") items.sort((a, b) => a.title.localeCompare(b.title));
  else if (state.sort === "used") items.sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0));
  else items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return items;
}

function renderList(): void {
  const el = $("capsule-list");
  const items = filtered();
  $("capsule-empty").hidden = items.length > 0;
  el.innerHTML = items
    .map(
      (c) => `
      <div class="capsule-card ${c.id === state.selectedId ? "selected" : ""}" data-id="${esc(c.id)}" tabindex="0" role="button">
        <div class="row spread">
          <strong>${esc(c.title)}</strong>
          <span class="muted small">${new Date(c.updatedAt).toLocaleDateString()}</span>
        </div>
        <div class="muted small">${esc(preview(c.summary || c.body))}</div>
        <div class="row" style="gap:4px; margin-top:4px; flex-wrap:wrap;">
          ${c.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join("")}
          ${c.useCount ? `<span class="pill" title="Times inserted">↩ ${c.useCount}</span>` : ""}
        </div>
      </div>`,
    )
    .join("");
  el.querySelectorAll<HTMLDivElement>(".capsule-card").forEach((div) => {
    div.addEventListener("click", () => selectCapsule(div.dataset.id!));
    div.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === "Enter" || k === " ") { e.preventDefault(); selectCapsule(div.dataset.id!); }
    });
  });
}

function preview(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 140) + (text.length > 140 ? "…" : "");
}

function selectCapsule(id: string): void {
  const c = state.capsules.find((x) => x.id === id);
  if (!c) return;
  state.selectedId = id;
  renderList();
  renderEditor(c);
}

function renderEditor(c: Capsule): void {
  $("editor").hidden = false;
  $("editor-empty").hidden = true;
  ($("ed-title") as HTMLInputElement).value = c.title;
  ($("ed-body") as HTMLTextAreaElement).value = c.body;
  ($("ed-tags") as HTMLInputElement).value = c.tags.join(", ");
  const sel = $("ed-folder") as HTMLSelectElement;
  sel.innerHTML =
    `<option value="">Uncategorized</option>` +
    state.folders
      .map((f) => `<option value="${esc(f.id)}" ${f.id === c.folderId ? "selected" : ""}>${esc(f.name)}</option>`)
      .join("");
  $("ed-meta").textContent =
    `Created ${new Date(c.createdAt).toLocaleString()} · updated ${new Date(c.updatedAt).toLocaleString()}` +
    (c.sourceUrl ? ` · from ${new URL(c.sourceUrl).host}` : "");
}
function clearEditor(): void {
  $("editor").hidden = true;
  $("editor-empty").hidden = false;
}

async function saveEditor(): Promise<void> {
  if (!state.selectedId) return;
  const c = state.capsules.find((x) => x.id === state.selectedId);
  if (!c) return;
  c.title = ($("ed-title") as HTMLInputElement).value.trim() || "Untitled capsule";
  c.body = ($("ed-body") as HTMLTextAreaElement).value;
  c.summary = c.body.slice(0, 140).replace(/\s+/g, " ").trim();
  c.tags = ($("ed-tags") as HTMLInputElement).value.split(",").map((t) => t.trim()).filter(Boolean);
  c.folderId = ($("ed-folder") as HTMLSelectElement).value || null;
  await chrome.runtime.sendMessage({ type: "UPSERT_CAPSULE", capsule: c });
  await refresh();
}

async function deleteCurrent(): Promise<void> {
  if (!state.selectedId) return;
  const c = state.capsules.find((x) => x.id === state.selectedId);
  if (!c) return;
  if (!confirm(`Delete capsule "${c.title}"?`)) return;
  await chrome.runtime.sendMessage({ type: "DELETE_CAPSULE", id: c.id });
  state.selectedId = null;
  clearEditor();
  await refresh();
}

async function copyBody(): Promise<void> {
  if (!state.selectedId) return;
  const c = state.capsules.find((x) => x.id === state.selectedId);
  if (!c) return;
  try {
    await navigator.clipboard.writeText(c.body);
    ($("ed-copy") as HTMLButtonElement).textContent = "Copied ✓";
    setTimeout(() => (($("ed-copy") as HTMLButtonElement).textContent = "Copy body"), 1200);
  } catch { /* clipboard denied */ }
}

async function cookCurrent(): Promise<void> {
  const body = ($("ed-body") as HTMLTextAreaElement).value.trim();
  if (!body) return;
  const list = ALL_RECIPES.map((r, i) => `${i + 1}. ${r.label}`).join("\n");
  const pick = prompt(`Which recipes should Cook apply? Enter comma-separated numbers (e.g. 1,3):\n\n${list}`, "1");
  if (!pick) return;
  const ids = pick
    .split(",")
    .map((n) => Number(n.trim()) - 1)
    .filter((n) => n >= 0 && n < ALL_RECIPES.length)
    .map((i) => ALL_RECIPES[i].id);
  ($("ed-body") as HTMLTextAreaElement).value = cook(body, ids);
}

async function newCapsule(): Promise<void> {
  const now = new Date().toISOString();
  const c: Capsule = {
    id: randomId("cap"),
    title: "New capsule",
    body: "",
    summary: "",
    folderId: state.activeFolder && state.activeFolder !== "all" ? state.activeFolder || null : null,
    tags: [],
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await chrome.runtime.sendMessage({ type: "UPSERT_CAPSULE", capsule: c });
  state.selectedId = c.id;
  await refresh();
  ($("ed-title") as HTMLInputElement).focus();
}

async function newFolder(): Promise<void> {
  const name = prompt("Folder name:");
  if (!name) return;
  const f: Folder = {
    id: randomId("fld"),
    name: name.trim(),
    order: state.folders.length,
    createdAt: new Date().toISOString(),
  };
  await chrome.runtime.sendMessage({ type: "UPSERT_FOLDER", folder: f });
  state.activeFolder = f.id;
  await refresh();
}

async function init(): Promise<void> {
  const settings = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as Settings;
  applyTheme(settings.theme);
  $("new-capsule").addEventListener("click", newCapsule);
  $("new-folder").addEventListener("click", newFolder);
  $("ed-save").addEventListener("click", saveEditor);
  $("ed-delete").addEventListener("click", deleteCurrent);
  $("ed-copy").addEventListener("click", copyBody);
  $("ed-cook").addEventListener("click", cookCurrent);
  ($("search") as HTMLInputElement).addEventListener("input", (e) => {
    state.query = (e.target as HTMLInputElement).value;
    renderList();
  });
  ($("sort") as HTMLSelectElement).addEventListener("change", (e) => {
    state.sort = (e.target as HTMLSelectElement).value as State["sort"];
    renderList();
  });
  await refresh(false);
  // Deep-link support: library.html#capsule=<id>
  const m = location.hash.match(/capsule=([^&]+)/);
  if (m) selectCapsule(m[1]);
}

void init();
