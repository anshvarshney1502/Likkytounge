// Floating launcher + capsule picker overlay rendered inside a Shadow DOM so
// page CSS can never interfere. Text-only injection: click to insert, or
// drag a capsule directly onto the chat input.

import type { Capsule, Folder, Settings } from "../shared/types";
import { findChatInput, insertIntoInput } from "./insert";
// Inlined at build time so we only need one content-script bundle.
import overlayCss from "./overlay.css";

const HOST_ID = "likky-tounge-host";
const MOUNT_ATTR = "data-likky-tounge-mounted";

interface State {
  capsules: Capsule[];
  folders: Folder[];
  settings: Settings;
  query: string;
  folderId: string | "" | "recent";
}

const state: State = {
  capsules: [],
  folders: [],
  settings: null as unknown as Settings,
  query: "",
  folderId: "recent",
};

let root: ShadowRoot | null = null;
let panelEl: HTMLElement | null = null;
let backdropEl: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let searchEl: HTMLInputElement | null = null;
let toastEl: HTMLElement | null = null;

async function loadData(): Promise<void> {
  const [capsulesRes, foldersRes, settingsRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: "LIST_CAPSULES" }),
    chrome.runtime.sendMessage({ type: "LIST_FOLDERS" }),
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
  ]);
  state.capsules = (capsulesRes as Capsule[]) ?? [];
  state.folders = (foldersRes as Folder[]) ?? [];
  state.settings = settingsRes as Settings;
}

function filtered(): Capsule[] {
  const q = state.query.trim().toLowerCase();
  let items = state.capsules;
  if (state.folderId === "recent") {
    items = [...items].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 20);
  } else if (state.folderId) {
    items = items.filter((c) => c.folderId === state.folderId);
  }
  if (q) {
    items = items.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.body.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  return items;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function renderFolders(): string {
  const folderOpts = state.folders.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
  return `
    <select id="folder" class="mode-select" aria-label="Folder">
      <option value="recent">⏱ Recent</option>
      <option value="">📚 All capsules</option>
      ${folderOpts}
    </select>`;
}

function renderList(): void {
  if (!listEl) return;
  const items = filtered();
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">
      No capsules ${state.query ? "match your search" : "yet"}.<br>
      <a id="open-lib">Open library →</a>
    </div>`;
    return;
  }
  listEl.innerHTML = items
    .map((c) => {
      const folderName =
        state.folders.find((f) => f.id === c.folderId)?.name ?? "Uncategorized";
      const preview = (c.summary || c.body).replace(/\s+/g, " ").slice(0, 100);
      return `
      <div class="capsule" draggable="true" data-id="${esc(c.id)}" tabindex="0" role="button" aria-label="Insert ${esc(c.title)}">
        <div><span class="pill">${esc(folderName)}</span><span class="title">${esc(c.title)}</span></div>
        <div class="sub">${esc(preview)}${(c.summary || c.body).length > 100 ? "…" : ""}</div>
      </div>`;
    })
    .join("");
}

function toast(msg: string, err = false): void {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = "toast " + (err ? "err show" : "show");
  setTimeout(() => (toastEl!.className = "toast" + (err ? " err" : "")), 1600);
}

async function insertCapsule(c: Capsule): Promise<void> {
  const input = findChatInput();
  if (!input) return toast("No chat input detected on this page.", true);
  const ok = insertIntoInput(input, c.body, state.settings.insertMode);
  if (!ok) return toast("Could not insert into this input.", true);
  toast(`Inserted "${c.title}"`);
  await chrome.runtime.sendMessage({ type: "BUMP_USAGE", id: c.id });
  close();
}

function open(): void {
  if (!root) mount();
  panelEl!.classList.add("open");
  backdropEl!.classList.add("open");
  if (state.settings?.focusSearchOnOpen) setTimeout(() => searchEl?.focus(), 0);
  void refresh();
}
function close(): void {
  panelEl?.classList.remove("open");
  backdropEl?.classList.remove("open");
}

async function refresh(): Promise<void> {
  await loadData();
  // Re-sync folder dropdown options (they might have changed).
  const hdr = root!.querySelector(".header") as HTMLElement;
  const currentFolderVal = state.folderId;
  hdr.querySelector("#folder")?.remove();
  hdr.insertAdjacentHTML("beforeend", renderFolders());
  const sel = hdr.querySelector<HTMLSelectElement>("#folder")!;
  sel.value = String(currentFolderVal);
  sel.addEventListener("change", () => {
    state.folderId = sel.value as State["folderId"];
    renderList();
  });
  renderList();
}

function mount(): void {
  if (document.getElementById(HOST_ID)) return;
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = overlayCss;
  root.appendChild(style);

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.title = "Open Likky Tounge (Alt+K)";
  launcher.setAttribute("aria-label", "Open Likky Tounge");
  launcher.textContent = "🧪";
  launcher.addEventListener("click", () => {
    panelEl!.classList.contains("open") ? close() : open();
  });
  root.appendChild(launcher);

  backdropEl = document.createElement("div");
  backdropEl.className = "backdrop";
  backdropEl.addEventListener("click", close);
  root.appendChild(backdropEl);

  panelEl = document.createElement("div");
  panelEl.className = "panel";
  panelEl.setAttribute("role", "dialog");
  panelEl.setAttribute("aria-label", "Likky Tounge capsule picker");
  panelEl.innerHTML = `
    <div class="header">
      <span class="brand"><span class="brand-dot"></span>Likky Tounge</span>
      <button class="close" aria-label="Close" title="Close">✕</button>
      ${renderFolders()}
    </div>
    <div class="search"><input type="search" placeholder="Search capsules… (Alt+K to open)" aria-label="Search capsules"></div>
    <div class="list" role="listbox"></div>
    <div class="footer">
      <a id="open-lib">📚 Open library</a>
      <span>Click to insert · Drag onto input · Esc to close</span>
    </div>
  `;
  root.appendChild(panelEl);

  toastEl = document.createElement("div");
  toastEl.className = "toast";
  root.appendChild(toastEl);

  listEl = panelEl.querySelector(".list");
  searchEl = panelEl.querySelector("input");
  searchEl!.addEventListener("input", () => {
    state.query = searchEl!.value;
    renderList();
  });
  panelEl.querySelector(".close")!.addEventListener("click", close);
  const folderSel = panelEl.querySelector<HTMLSelectElement>("#folder")!;
  folderSel.addEventListener("change", () => {
    state.folderId = folderSel.value as State["folderId"];
    renderList();
  });

  // Delegated click on capsule -> insert. Delegated dragstart -> set text/plain.
  listEl!.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(".capsule");
    if (!target) {
      const openLib = (e.target as HTMLElement).closest<HTMLElement>("#open-lib");
      if (openLib) void chrome.runtime.sendMessage({ type: "OPEN_LIBRARY" }).catch(() => {
        window.open(chrome.runtime.getURL("library.html"), "_blank");
      });
      return;
    }
    const c = state.capsules.find((x) => x.id === target.dataset.id);
    if (c) void insertCapsule(c);
  });
  listEl!.addEventListener("keydown", (e) => {
    const key = (e as KeyboardEvent).key;
    if (key !== "Enter" && key !== " ") return;
    const target = (e.target as HTMLElement).closest<HTMLElement>(".capsule");
    if (!target) return;
    e.preventDefault();
    const c = state.capsules.find((x) => x.id === target.dataset.id);
    if (c) void insertCapsule(c);
  });
  listEl!.addEventListener("dragstart", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(".capsule");
    if (!target) return;
    const c = state.capsules.find((x) => x.id === target.dataset.id);
    if (!c) return;
    const dt = (e as DragEvent).dataTransfer;
    if (!dt) return;
    dt.effectAllowed = "copy";
    dt.setData("text/plain", c.body);
    dt.setData("text/likky-capsule-id", c.id);
  });

  document.addEventListener("keydown", onGlobalKey, true);

  // Watch the whole page for drops so we can bump usage when the capsule
  // gets dropped somewhere else (chat input handles the actual insertion).
  document.addEventListener("drop", (e) => {
    const id = e.dataTransfer?.getData("text/likky-capsule-id");
    if (id) void chrome.runtime.sendMessage({ type: "BUMP_USAGE", id });
  }, true);

  document.documentElement.setAttribute(MOUNT_ATTR, "1");
}

function unmount(): void {
  document.getElementById(HOST_ID)?.remove();
  document.removeEventListener("keydown", onGlobalKey, true);
  root = panelEl = backdropEl = listEl = toastEl = null;
  searchEl = null;
  document.documentElement.removeAttribute(MOUNT_ATTR);
}

function onGlobalKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && panelEl?.classList.contains("open")) {
    close();
    return;
  }
  if (matchesHotkey(e, state.settings?.launcherHotkey || "Alt+K")) {
    e.preventDefault();
    panelEl?.classList.contains("open") ? close() : open();
  }
}

function matchesHotkey(e: KeyboardEvent, spec: string): boolean {
  const parts = spec.split("+").map((p) => p.trim().toLowerCase());
  const key = parts.pop() ?? "";
  const needCtrl = parts.includes("ctrl") || parts.includes("control");
  const needAlt = parts.includes("alt") || parts.includes("option");
  const needShift = parts.includes("shift");
  const needMeta = parts.includes("cmd") || parts.includes("meta");
  return (
    e.key.toLowerCase() === key &&
    !!e.ctrlKey === needCtrl &&
    !!e.altKey === needAlt &&
    !!e.shiftKey === needShift &&
    !!e.metaKey === needMeta
  );
}

export async function boot(): Promise<void> {
  await loadData();
  if (!state.settings?.showLauncher) {
    // Still install the hotkey listener so power users can open the picker.
    document.addEventListener("keydown", onGlobalKey, true);
    return;
  }
  mount();
}

export function openPickerFromOutside(): void {
  if (!root) mount();
  open();
}

export function tearDown(): void {
  unmount();
}
