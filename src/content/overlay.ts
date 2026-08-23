// Pikachu launcher: the on-page UI for the two core actions —
// Generate Context (capture the full conversation) and Upload Context
// (auto-transfer the latest generated context into this LLM). This replaces
// the old capsule-picker overlay entirely. Capsules (unrelated feature) are
// still managed from the popup/library — this overlay is Context-only.

import type { Settings } from "../shared/types";
import type { GenerateProgress, UploadProgress } from "../context/types";
import type { SavedContextMeta } from "../context/store";
import { generateContext } from "../context/generate";
import { uploadContext } from "../context/upload";
import { pikachuImgTag } from "./pikachu-icon";
import overlayCss from "./overlay.css";

const HOST_ID = "context-bolt-host";

let root: ShadowRoot | null = null;
let rootEl: HTMLElement | null = null;
let menuEl: HTMLElement | null = null;
let actionsEl: HTMLElement | null = null;
let searchInputEl: HTMLInputElement | null = null;
let resultsEl: HTMLElement | null = null;
let panelEl: HTMLElement | null = null;
let panelTitleEl: HTMLElement | null = null;
let stepsEl: HTMLElement | null = null;
let resultEl: HTMLElement | null = null;
let pikachuEl: HTMLElement | null = null;
let stageEl: HTMLElement | null = null;
let settingsCache: Settings | null = null;
// No context list cache — always fetch fresh so search always reflects the
// current state. A monotonic sequence number discards responses from earlier
// async calls that complete after a later call has already started.
let searchSeq = 0;

// ----------------------------------------------------------------- drag --
const POS_KEY = "lk-pikachu-pos";
let dragMoved = false;
let pikachuWrapEl: HTMLElement | null = null;

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    return raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
  } catch { return null; }
}

function savePos(x: number, y: number): void {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ x, y })); } catch {}
}

function getPikaSize(): { w: number; h: number } {
  if (pikachuWrapEl) return { w: pikachuWrapEl.offsetWidth, h: pikachuWrapEl.offsetHeight };
  return { w: 132, h: 82 };
}

function applyPos(x: number, y: number): void {
  if (!rootEl) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const { w, h } = getPikaSize();
  const cx = Math.max(0, Math.min(x, W - w));
  const cy = Math.max(0, Math.min(y, H - h));
  rootEl.style.left   = cx + "px";
  rootEl.style.top    = cy + "px";
  rootEl.style.right  = "auto";
  rootEl.style.bottom = "auto";
  updatePanelAlignment(cx, cy);
}

function updatePanelAlignment(cx: number, cy: number): void {
  if (!rootEl) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const openBelow = cy < H / 2;
  const alignLeft = cx > W / 2;
  rootEl.classList.toggle("lk-root--below", openBelow);
  rootEl.classList.toggle("lk-root--left", alignLeft);
}

function clampToViewport(): void {
  if (!rootEl) return;
  const r = rootEl.getBoundingClientRect();
  applyPos(r.left, r.top);
  savePos(r.left, r.top);
}

function onWindowResize(): void { clampToViewport(); }

function applyScale(scale: number): void {
  if (!pikachuWrapEl) return;
  pikachuWrapEl.style.transform = scale === 1 ? "" : `scale(${scale})`;
  pikachuWrapEl.style.transformOrigin = "bottom right";
}

function initDrag(): void {
  if (!pikachuWrapEl) return;

  let active = false;
  let startMX = 0, startMY = 0, startLeft = 0, startTop = 0;

  function onMove(e: MouseEvent): void {
    if (!active) return;
    const dx = e.clientX - startMX;
    const dy = e.clientY - startMY;
    if (!dragMoved && Math.hypot(dx, dy) < 5) return;
    dragMoved = true;
    document.documentElement.style.cursor = "grabbing";
    applyPos(startLeft + dx, startTop + dy);
  }

  function onUp(): void {
    if (!active) return;
    active = false;
    document.documentElement.style.cursor = "";
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup",   onUp,   true);
    if (dragMoved && rootEl) {
      const r = rootEl.getBoundingClientRect();
      savePos(r.left, r.top);
    }
  }

  pikachuWrapEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    active    = true;
    dragMoved = false;
    startMX   = e.clientX;
    startMY   = e.clientY;
    const r   = rootEl!.getBoundingClientRect();
    startLeft = r.left;
    startTop  = r.top;
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup",   onUp,   true);
  });
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isExtensionAlive(): boolean {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

async function sendMsg<T>(msg: object): Promise<T | null> {
  if (!isExtensionAlive()) return null;
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Extension context invalidated") || msg.includes("context invalidated")) {
      unmount();
    }
    return null;
  }
}

async function getSettings(): Promise<Settings> {
  if (settingsCache) return settingsCache;
  const s = await sendMsg<Settings>({ type: "GET_SETTINGS" });
  if (s) settingsCache = s;
  return settingsCache ?? ({} as Settings);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// ---------------------------------------------------------------- mount --
function mount(): void {
  if (document.getElementById(HOST_ID)) return;
  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = overlayCss;
  root.appendChild(style);

  rootEl = document.createElement("div");
  rootEl.className = "lk-root";
  rootEl.innerHTML = `
    <div class="lk-menu" id="lk-menu" role="menu" aria-label="Context-Bolt">
      <div class="lk-menu-header">
        <input type="search" id="lk-search" class="lk-search" placeholder="Search saved contexts…" autocomplete="off">
      </div>
      <div class="lk-results" id="lk-results"></div>
      <div class="lk-actions" id="lk-actions">
        <button type="button" data-action="generate" role="menuitem" class="lk-menu-item">
          <svg class='lk-menu-item-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'><polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2'/></svg>
          <span class="lk-menu-label">Generate Context</span>
        </button>
        <button type="button" data-action="upload" role="menuitem" class="lk-menu-item">
          <svg class='lk-menu-item-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' y1='3' x2='12' y2='15'/></svg>
          <span class="lk-menu-label">Upload Context</span>
        </button>
        <div class="lk-menu-divider"></div>
        <button type="button" data-action="copy" role="menuitem" class="lk-menu-item">
          <svg class='lk-menu-item-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'><rect x='9' y='9' width='13' height='13' rx='2'/><path d='M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1'/></svg>
          <span class="lk-menu-label">Copy Context</span>
        </button>
        <button type="button" data-action="share" role="menuitem" class="lk-menu-item">
          <svg class='lk-menu-item-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'><circle cx='18' cy='5' r='3'/><circle cx='6' cy='12' r='3'/><circle cx='18' cy='19' r='3'/><line x1='8.59' y1='13.51' x2='15.42' y2='17.49'/><line x1='15.41' y1='6.51' x2='8.59' y2='10.49'/></svg>
          <span class="lk-menu-label">Share Context</span>
        </button>
        <button type="button" data-action="library" role="menuitem" class="lk-menu-item">
          <svg class='lk-menu-item-icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'><path d='M4 19.5A2.5 2.5 0 016.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z'/></svg>
          <span class="lk-menu-label">Open Library</span>
        </button>
      </div>
    </div>
    <div class="lk-panel" id="lk-panel" role="status" aria-live="polite">
      <button class="lk-panel-close" id="lk-panel-close" aria-label="Close">✕</button>
      <div class="lk-panel-title" id="lk-panel-title"></div>
      <ul class="lk-steps" id="lk-steps"></ul>
      <div class="lk-result" id="lk-result" hidden></div>
    </div>
    <div class="lk-pikachu-wrap">
      <div class="lk-stage" id="lk-stage">
        <div class="lk-flash"></div>
        <div class="lk-ring"></div>
        <div class="lk-ring delay"></div>
        <div class="lk-bolt" data-bolt></div>
        <div class="lk-bolt" data-bolt></div>
        <div class="lk-bolt" data-bolt></div>
        <div class="lk-bolt" data-bolt></div>
        <div class="lk-bolt" data-bolt></div>
        <div class="lk-bolt" data-bolt></div>
        <div class="lk-bolt" data-bolt></div>
      </div>
      <button class="lk-pikachu" id="lk-pikachu" aria-label="Open Context-Bolt menu" title="Generate or Upload context">
        ${pikachuImgTag()}
      </button>
      <button class="lk-plus" id="lk-plus" aria-label="Open Context-Bolt menu" title="Generate or Upload context">+</button>
    </div>
  `;
  root.appendChild(rootEl);

  // Build bolt SVGs via DOM API to avoid HTML-parser viewBox encoding issues.
  root.querySelectorAll<HTMLElement>("[data-bolt]").forEach((wrap) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "width:100%;height:100%;display:block";
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M13 2 L4 14 H11 L9.5 22 L20 9 H12.5 L13 2 Z");
    path.setAttribute("fill", "#ffe14d");
    path.setAttribute("stroke", "#c9960a");
    path.setAttribute("stroke-width", "0.6");
    svg.appendChild(path);
    wrap.appendChild(svg);
  });

  menuEl = root.getElementById("lk-menu");
  actionsEl = root.getElementById("lk-actions");
  searchInputEl = root.getElementById("lk-search") as HTMLInputElement;
  resultsEl = root.getElementById("lk-results");
  panelEl = root.getElementById("lk-panel");
  panelTitleEl = root.getElementById("lk-panel-title");
  stepsEl = root.getElementById("lk-steps");
  resultEl = root.getElementById("lk-result");
  pikachuEl = root.getElementById("lk-pikachu");
  stageEl = root.getElementById("lk-stage");

  // Clicking Pikachu or the + both just open the menu — neither one
  // auto-generates. Generate Context and Upload Context are only ever
  // triggered explicitly from the menu below.
  pikachuEl!.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dragMoved) { dragMoved = false; return; } // drag just ended — not a click
    toggleMenu();
  });
  root.getElementById("lk-plus")!.addEventListener("click", (e) => {
    e.stopPropagation();
    if (dragMoved) { dragMoved = false; return; }
    toggleMenu();
  });
  root.getElementById("lk-panel-close")!.addEventListener("click", closePanel);
  actionsEl!.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!btn) return;
    closeMenu();
    const action = btn.dataset.action;
    if (action === "generate") void runGenerate();
    else if (action === "upload") void runUpload();
    else if (action === "copy") void runCopy();
    else if (action === "share") void runShare();
    else if (action === "library") void sendMsg({ type: "OPEN_LIBRARY" });
  });
  searchInputEl!.addEventListener("input", () => void onSearchInput());
  searchInputEl!.addEventListener("focus", () => {
    // Guard: only trigger search when the menu is actually open. This prevents
    // a spurious fetch if the browser auto-focuses the input on some pages.
    if (!menuEl?.classList.contains("open")) return;
    void onSearchInput();
  });
  // Removed blur listener: heavily dynamic host pages (like ChatGPT) often steal focus
  // and force it back to their own chat inputs. Relying on blur to close the search panel
  // causes aggressive flickering and closing. The panel will stay open until explicitly
  // closed by clicking outside or pressing Escape.
  searchInputEl!.addEventListener("click", (e) => e.stopPropagation());
  searchInputEl!.addEventListener("mousedown", (e) => e.stopPropagation());
  searchInputEl!.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
    }
    e.stopPropagation();
  });
  searchInputEl!.addEventListener("keyup", (e) => e.stopPropagation());
  // stopPropagation on both click AND mousedown: some SPA frameworks (ChatGPT)
  // use document-level mousedown capture to detect outside interactions and
  // programmatically refocus their own inputs, which can indirectly trigger a
  // synthetic click that closes our menu.
  menuEl!.addEventListener("click",     (e) => e.stopPropagation());
  menuEl!.addEventListener("mousedown", (e) => e.stopPropagation());
  resultsEl!.addEventListener("click", (e) => {
    e.stopPropagation();
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-upload-id]");
    if (!row) return;
    const ctxId = row.dataset.uploadId; // capture before closeMenu clears DOM
    closeMenu();
    void runUpload(ctxId);
  });

  document.addEventListener("click", onOutsideClick, true);
  document.addEventListener("keydown", onGlobalKey, true);
  window.addEventListener("resize", onWindowResize);

  pikachuWrapEl = root.querySelector<HTMLElement>(".lk-pikachu-wrap");

  // Apply saved size.
  if (settingsCache?.pikachuSize && settingsCache.pikachuSize !== 1) {
    applyScale(settingsCache.pikachuSize);
  }

  // Restore saved position. Use requestAnimationFrame so the element has been
  // laid out and offsetWidth/Height are correct. If no saved position, place
  // at bottom-right (the CSS default handles this via the initial fixed
  // bottom/right, but we set explicit coords so drag always has a baseline).
  requestAnimationFrame(() => {
    const savedPos = loadPos();
    if (savedPos) {
      applyPos(savedPos.x, savedPos.y);
    } else {
      const { w, h } = getPikaSize();
      applyPos(window.innerWidth - w - 20, window.innerHeight - h - 20);
    }
  });

  initDrag();
}

function unmount(): void {
  document.getElementById(HOST_ID)?.remove();
  document.removeEventListener("click", onOutsideClick, true);
  document.removeEventListener("keydown", onGlobalKey, true);
  window.removeEventListener("resize", onWindowResize);
  root = rootEl = menuEl = actionsEl = searchInputEl = resultsEl = panelEl = panelTitleEl = stepsEl = resultEl = pikachuEl = stageEl = pikachuWrapEl = null;
  searchSeq = 0;
}

/** Filters the cached context list against a query, newest first, capped for a dropdown. */
function filterContexts(list: SavedContextMeta[], query: string): SavedContextMeta[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? list.filter((c) => c.title.toLowerCase().includes(q) || c.platformLabel.toLowerCase().includes(q))
    : list;
  return [...matches]
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
    .slice(0, 8);
}

async function onSearchInput(): Promise<void> {
  // Claim a sequence slot. If a newer call starts while we're awaiting,
  // our slot becomes stale and we discard our result.
  const seq = ++searchSeq;
  const query = searchInputEl!.value.trim();

  // Always fetch fresh — no cache. The background round-trip is < 5 ms for
  // metadata-only queries and guarantees we see deletions, new generates, etc.
  const res = await sendMsg<SavedContextMeta[]>({ type: "LIST_CONTEXTS" });

  // Discard if a newer search started while we were awaiting, or menu closed.
  if (seq !== searchSeq) return;
  if (!menuEl?.classList.contains("open")) return;

  const list: SavedContextMeta[] = Array.isArray(res) ? res : [];

  // Empty input: show recent contexts only if any exist. If none exist, keep
  // showing the action buttons so the menu doesn't look broken/empty.
  if (!query) {
    if (list.length === 0) {
      // No contexts at all — don't switch to results panel; leave actions visible.
      actionsEl!.classList.remove("lk-hide");
      resultsEl!.classList.remove("lk-show");
      resultsEl!.innerHTML = "";
      return;
    }
    // Show up to 8 most recent contexts.
    const recent = [...list]
      .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
      .slice(0, 8);
    actionsEl!.classList.add("lk-hide");
    resultsEl!.classList.add("lk-show");
    resultsEl!.innerHTML = buildResultRows(recent, false);
    return;
  }

  // Non-empty query: filter and show results (always switch to results panel).
  actionsEl!.classList.add("lk-hide");
  resultsEl!.classList.add("lk-show");
  const matches = filterContexts(list, query);
  if (matches.length === 0) {
    resultsEl!.innerHTML = '<div class="lk-results-empty">No contexts match "' + esc(query) + '".</div>';
    return;
  }
  resultsEl!.innerHTML = buildResultRows(matches, true);
}

function buildResultRows(items: SavedContextMeta[], showQuery: boolean): string {
  const parts: string[] = [];
  if (!showQuery) {
    parts.push(
      '<div class="lk-results-label">Recent</div>'
    );
  }
  for (const c of items) {
    const id = esc(c.id);
    const title = esc(c.title);
    const platform = esc(c.platformLabel);
    const when = esc(fmtWhen(c.capturedAt));
    parts.push(
      '<button type="button" class="lk-result-row" data-upload-id="' + id + '">' +
      '<div class="lk-result-main">' +
      '<div class="lk-result-title">' + title + '</div>' +
      '<div class="lk-result-sub">' + platform + ' · ' + when + '</div>' +
      '</div>' +
      '<div class="lk-result-upload" aria-hidden="true">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 19V5M5 12l7-7 7 7"/>' +
      '</svg></div>' +
      '</button>'
    );
  }
  return parts.join("");
}

function onOutsideClick(e: Event): void {
  // Ignore synthetic/programmatic clicks (isTrusted: false).
  // SPA frameworks like ChatGPT/Gemini dispatch synthetic document clicks when
  // they detect focus leaving their own inputs — without this guard those fake
  // clicks close our menu immediately after the user focuses the search bar.
  if (!(e as MouseEvent).isTrusted) return;

  // composedPath() includes shadow-DOM internals even for document-level
  // capture listeners. We check the shadow *host* element — it's always in the
  // path for any click that originates inside our shadow root.
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  const path = e.composedPath?.() ?? [];
  if (path.includes(host)) return;
  closeMenu();
}
function onGlobalKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    closeMenu();
    closePanel();
    return;
  }
}

function toggleMenu(): void {
  menuEl!.classList.contains("open") ? closeMenu() : openMenu();
}
function openMenu(): void {
  closePanel();
  // Reset search UI to its default state (actions visible, results hidden).
  searchSeq = 0;
  if (searchInputEl) searchInputEl.value = "";
  if (resultsEl) { resultsEl.classList.remove("lk-show"); resultsEl.innerHTML = ""; }
  if (actionsEl) actionsEl.classList.remove("lk-hide");
  menuEl!.classList.add("open");
}
function closeMenu(): void {
  // Bump sequence so any in-flight onSearchInput fetch is discarded.
  searchSeq++;
  menuEl?.classList.remove("open");
  if (searchInputEl) searchInputEl.value = "";
  if (resultsEl) { resultsEl.classList.remove("lk-show"); resultsEl.innerHTML = ""; }
  if (actionsEl) actionsEl.classList.remove("lk-hide");
}
function openPanel(): void {
  closeMenu();
  panelEl!.classList.add("open");
}
function closePanel(): void {
  panelEl?.classList.remove("open");
}

/**
 * The 3D Thunderbolt discharge. Generate Context only — Upload Context must
 * never call this. Classes are removed first and re-added on the next frame
 * so repeated generates restart the animation instead of no-op'ing (a class
 * that is already present does not retrigger a CSS animation).
 */
function playThunderbolt(): void {
  if (!stageEl || !pikachuEl) return;
  stageEl.classList.remove("active");
  pikachuEl.classList.remove("burst");
  void stageEl.offsetWidth; // force reflow so the removal is committed
  requestAnimationFrame(() => {
    stageEl?.classList.add("active");
    pikachuEl?.classList.add("burst");
  });
  setTimeout(() => {
    stageEl?.classList.remove("active");
    pikachuEl?.classList.remove("burst");
  }, 1100);
}

// ------------------------------------------------------------- progress --
const GENERATE_STAGES: Array<{ key: GenerateProgress["stage"]; label: string }> = [
  { key: "detect", label: "Detect platform" },
  { key: "scroll", label: "Load full history" },
  { key: "extract", label: "Extract messages" },
  { key: "format", label: "Format as Markdown" },
  { key: "store", label: "Save latest context" },
];
const UPLOAD_STAGES: Array<{ key: UploadProgress["stage"]; label: string }> = [
  { key: "detect", label: "Detect platform" },
  { key: "locate-input", label: "Locate chat input" },
  { key: "transfer", label: "Attach context file" },
];

function renderSteps(stages: Array<{ key: string; label: string }>, activeKey: string, liveLabel?: string): void {
  const activeIndex = stages.findIndex((s) => s.key === activeKey);
  stepsEl!.innerHTML = stages
    .map((s, i) => {
      const state = i < activeIndex ? "ok" : i === activeIndex ? "active" : "";
      const mark = i < activeIndex ? "✓" : i === activeIndex ? "…" : "○";
      const label = i === activeIndex && liveLabel ? esc(liveLabel) : esc(s.label);
      return `<li class="${state}">${mark} ${label}</li>`;
    })
    .join("");
}
function markAllDone(stages: Array<{ key: string; label: string }>): void {
  stepsEl!.innerHTML = stages.map((s) => `<li class="ok">✓ ${esc(s.label)}</li>`).join("");
}

function showResult(kind: "ok" | "err" | "warn", html: string): void {
  resultEl!.hidden = false;
  resultEl!.className = `lk-result ${kind}`;
  resultEl!.innerHTML = html;
}

// -------------------------------------------------------------- actions --
async function runGenerate(): Promise<void> {
  openPanel();
  panelTitleEl!.textContent = "⚡ Generating context…";
  resultEl!.hidden = true;
  renderSteps(GENERATE_STAGES, "detect");
  pikachuEl!.classList.remove("burst", "shake");
  pikachuEl!.classList.add("charging");

  const result = await generateContext((p) => {
    renderSteps(GENERATE_STAGES, p.stage, p.label);
  });

  pikachuEl!.classList.remove("charging");

  if (result.success) {
    markAllDone(GENERATE_STAGES);
    playThunderbolt();

    const c = result.context;
    if (c.truncated) {
      showResult(
        "warn",
        `<strong>⚠ Context saved, but possibly incomplete.</strong><br>Captured ${c.messageCount} message(s) from ${esc(c.platformLabel)}.<br>${esc(c.truncatedReason ?? "")}`,
      );
    } else {
      showResult(
        "ok",
        `<strong>✓ Context generated.</strong><br>Captured ${c.messageCount} message(s) from ${esc(c.platformLabel)}. Ready to upload elsewhere.`,
      );
      setTimeout(closePanel, 4500);
    }
  } else {
    pikachuEl!.classList.add("shake");
    setTimeout(() => pikachuEl?.classList.remove("shake"), 500);
    showResult("err", `<strong>✕ Could not generate context.</strong><br>${esc(result.reason)}`);
  }
}

async function runUpload(contextId?: string): Promise<void> {
  openPanel();
  panelTitleEl!.textContent = "⬆️ Uploading context…";
  resultEl!.hidden = true;
  renderSteps(UPLOAD_STAGES, "detect");
  // Thunderbolt must NEVER play for Upload — no pikachu classes are touched here.

  const settings = await getSettings();
  const result = await uploadContext((p) => {
    // Show a live elapsed-seconds counter on the transfer step so a slow
    // upload reads as "still working", not as a stalled UI.
    const label =
      p.elapsedMs && p.elapsedMs >= 1000
        ? `${p.label} ${Math.round(p.elapsedMs / 1000)}s`
        : p.label;
    renderSteps(UPLOAD_STAGES, p.stage, label);
  }, settings.insertMode, contextId);

  if (result.success) {
    markAllDone(UPLOAD_STAGES);
    if (result.partial) {
      showResult(
        "warn",
        `<strong>⚠ Partially transferred.</strong><br>${esc(result.partialReason ?? "")}`,
      );
    } else {
      const secs = result.elapsedMs ? ` in ${Math.max(1, Math.round(result.elapsedMs / 1000))}s` : "";
      showResult(
        "ok",
        `<strong>✓ Context attached to ${esc(result.platformLabel)}${esc(secs)}.</strong><br>` +
          `It's on the prompt as a Markdown file — just add your question and send.`,
      );
      setTimeout(closePanel, 5000);
    }
  } else {
    showResult("err", `<strong>✕ Upload failed.</strong><br>${esc(result.reason)}`);
  }
}

/** Fetch the latest saved context, or show why there isn't one. */
async function requireLatestContext(): Promise<{ markdown: string; conversationTitle: string } | null> {
  type MaybeCtx = { markdown?: string; conversationTitle?: string } | null;
  let ctx: MaybeCtx = null;
  const res = await sendMsg<MaybeCtx>({ type: "GET_LATEST_CONTEXT" });
  if (!isExtensionAlive()) {
    showResult("err", "<strong>✕ Extension was reloaded.</strong><br>Please refresh this page.");
    return null;
  }
  if (res && typeof res === "object" && "error" in res) {
    showResult("err", `<strong>✕ Could not read the latest context.</strong><br>${esc(String((res as { error: unknown }).error))}`);
    return null;
  }
  ctx = res;
  if (!ctx || !ctx.markdown) {
    showResult("err", "<strong>✕ No context yet.</strong><br>No generated context is available yet. Generate a context first.");
    return null;
  }
  return { markdown: ctx.markdown, conversationTitle: ctx.conversationTitle ?? "Conversation context" };
}

async function runCopy(): Promise<void> {
  openPanel();
  panelTitleEl!.textContent = "📋 Copying context…";
  resultEl!.hidden = true;
  stepsEl!.innerHTML = "";
  const ctx = await requireLatestContext();
  if (!ctx) return;
  try {
    await navigator.clipboard.writeText(ctx.markdown);
    showResult("ok", `<strong>✓ Context copied.</strong><br>"${esc(ctx.conversationTitle)}" is on your clipboard.`);
    setTimeout(closePanel, 3000);
  } catch {
    showResult("err", "<strong>✕ Copy failed.</strong><br>This page blocked clipboard access. Open the Library and copy from there instead.");
  }
}

async function runShare(): Promise<void> {
  openPanel();
  panelTitleEl!.textContent = "📤 Sharing context…";
  resultEl!.hidden = true;
  stepsEl!.innerHTML = "";
  const ctx = await requireLatestContext();
  if (!ctx) return;

  const nav = navigator as Navigator & {
    share?: (d: { title?: string; text?: string; files?: File[] }) => Promise<void>;
    canShare?: (d: { files?: File[] }) => boolean;
  };
  try {
    if (nav.share) {
      // Prefer sharing the context as a real .md file when the platform
      // supports file sharing; otherwise share the text itself.
      const file = new File([ctx.markdown], `${ctx.conversationTitle}.md`, { type: "text/markdown" });
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ title: ctx.conversationTitle, files: [file] });
      } else {
        await nav.share({ title: ctx.conversationTitle, text: ctx.markdown });
      }
      showResult("ok", "<strong>✓ Shared.</strong>");
      setTimeout(closePanel, 2500);
      return;
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      closePanel();
      return; // user dismissed the share sheet
    }
    // fall through to the clipboard fallback below
  }
  // No Web Share API on this page/OS — say so plainly and still leave the
  // user with the content rather than a dead end.
  try {
    await navigator.clipboard.writeText(ctx.markdown);
    showResult("warn", "<strong>Sharing isn't available in this browser.</strong><br>The context was copied to your clipboard instead.");
  } catch {
    showResult("err", "<strong>✕ Share unavailable.</strong><br>This browser has no share support and blocked clipboard access. Use the Library's Share/Export instead.");
  }
}

// -------------------------------------------------------------- exports --
export async function boot(): Promise<void> {
  const settings = await getSettings();
  if (!settings.showLauncher) {
    document.addEventListener("keydown", onGlobalKey, true);
    return;
  }
  mount();
}

export function openMenuFromOutside(): void {
  if (!root) mount();
  openMenu();
}

export function tearDown(): void {
  unmount();
}
