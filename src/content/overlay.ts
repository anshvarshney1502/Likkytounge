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
import { BOLT_SVG } from "./thunderbolt-icon";
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
let contextListCache: SavedContextMeta[] | null = null;

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function getSettings(): Promise<Settings> {
  if (settingsCache) return settingsCache;
  settingsCache = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as Settings;
  return settingsCache;
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
      <div class="lk-results" id="lk-results" hidden></div>
      <div class="lk-actions" id="lk-actions">
        <button type="button" data-action="generate" role="menuitem" class="lk-menu-item">
          <svg class="lk-menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span class="lk-menu-label">Generate Context</span>
        </button>
        <button type="button" data-action="upload" role="menuitem" class="lk-menu-item">
          <svg class="lk-menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span class="lk-menu-label">Upload Context</span>
        </button>
        <div class="lk-menu-divider"></div>
        <button type="button" data-action="copy" role="menuitem" class="lk-menu-item">
          <svg class="lk-menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          <span class="lk-menu-label">Copy Context</span>
        </button>
        <button type="button" data-action="share" role="menuitem" class="lk-menu-item">
          <svg class="lk-menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span class="lk-menu-label">Share Context</span>
        </button>
        <button type="button" data-action="library" role="menuitem" class="lk-menu-item">
          <svg class="lk-menu-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
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
        <div class="lk-bolt">${BOLT_SVG}</div>
        <div class="lk-bolt">${BOLT_SVG}</div>
        <div class="lk-bolt">${BOLT_SVG}</div>
        <div class="lk-bolt">${BOLT_SVG}</div>
        <div class="lk-bolt">${BOLT_SVG}</div>
        <div class="lk-bolt">${BOLT_SVG}</div>
        <div class="lk-bolt">${BOLT_SVG}</div>
      </div>
      <button class="lk-pikachu" id="lk-pikachu" aria-label="Open Context-Bolt menu" title="Generate or Upload context">
        ${pikachuImgTag()}
      </button>
      <button class="lk-plus" id="lk-plus" aria-label="Open Context-Bolt menu" title="Generate or Upload context">+</button>
    </div>
  `;
  root.appendChild(rootEl);

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
    toggleMenu();
  });
  root.getElementById("lk-plus")!.addEventListener("click", (e) => {
    e.stopPropagation();
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
    else if (action === "library") void chrome.runtime.sendMessage({ type: "OPEN_LIBRARY" });
  });
  searchInputEl!.addEventListener("input", () => void onSearchInput());
  searchInputEl!.addEventListener("click", (e) => e.stopPropagation());
  searchInputEl!.addEventListener("keydown", (e) => e.stopPropagation());
  searchInputEl!.addEventListener("keyup", (e) => e.stopPropagation());
  menuEl!.addEventListener("click", (e) => e.stopPropagation());
  resultsEl!.addEventListener("click", (e) => {
    e.stopPropagation();
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-upload-id]");
    if (!row) return;
    closeMenu();
    void runUpload(row.dataset.uploadId);
  });

  document.addEventListener("click", onOutsideClick, true);
  document.addEventListener("keydown", onGlobalKey, true);
}

function unmount(): void {
  document.getElementById(HOST_ID)?.remove();
  document.removeEventListener("click", onOutsideClick, true);
  document.removeEventListener("keydown", onGlobalKey, true);
  root = rootEl = menuEl = actionsEl = searchInputEl = resultsEl = panelEl = panelTitleEl = stepsEl = resultEl = pikachuEl = stageEl = null;
  contextListCache = null;
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
  const query = searchInputEl!.value;
  const hasQuery = query.trim().length > 0;

  if (!hasQuery) {
    resultsEl!.innerHTML = '';
    resultsEl!.hidden = true;
    actionsEl!.hidden = false;
    return;
  }

  actionsEl!.hidden = true;
  resultsEl!.hidden = false;

  if (!contextListCache) {
    resultsEl!.innerHTML = `<div class="lk-results-empty">Loading…</div>`;
    try {
      const res = await chrome.runtime.sendMessage({ type: "LIST_CONTEXTS" });
      contextListCache = Array.isArray(res) ? (res as SavedContextMeta[]) : [];
    } catch {
      contextListCache = [];
    }
    // The query may have changed (or the menu closed) while that awaited.
    if (searchInputEl!.value !== query || resultsEl!.hidden) return;
  }

  const matches = filterContexts(contextListCache, query);
  if (matches.length === 0) {
    resultsEl!.innerHTML = '<div class=”lk-results-empty”>No saved contexts match “' + esc(query) + '”.</div>';
    return;
  }

  const parts: string[] = [];
  for (const c of matches) {
    const id = esc(c.id);
    const title = esc(c.title);
    const platform = esc(c.platformLabel);
    const when = esc(fmtWhen(c.capturedAt));
    const svg = '<div class=”lk-result-upload” aria-hidden=”true”><svg width=”14” height=”14” viewBox=”0 0 24 24” fill=”none” stroke=”currentColor” stroke-width=”2.5” stroke-linecap=”round” stroke-linejoin=”round”><path d=”M12 19V5M5 12l7-7 7 7”/></svg></div>';
    const html = '<button type=”button” class=”lk-result-row” data-upload-id=”' + id + '” title=”Upload: ' + title + '”>' +
      '<div class=”lk-result-main”><div class=”lk-result-title”>' + title + '</div>' +
      '<div class=”lk-result-sub”>' + platform + ' · ' + when + '</div></div>' + svg + '</button>';
    parts.push(html);
  }
  resultsEl!.innerHTML = parts.join('');
}

function onOutsideClick(e: Event): void {
  // Check if click is inside the shadow root using composedPath
  const path = e.composedPath?.() || [];
  if (path.includes(rootEl!)) return; // Click is inside shadow DOM
  closeMenu();
}
function onGlobalKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    closeMenu();
    closePanel();
    return;
  }
  const spec = settingsCache?.launcherHotkey || "Alt+K";
  if (matchesHotkey(e, spec)) {
    e.preventDefault();
    toggleMenu();
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

function toggleMenu(): void {
  menuEl!.classList.contains("open") ? closeMenu() : openMenu();
}
function openMenu(): void {
  closePanel();
  menuEl!.classList.add("open");
}
function closeMenu(): void {
  menuEl?.classList.remove("open");
  if (searchInputEl) searchInputEl.value = "";
  if (resultsEl) resultsEl.hidden = true;
  if (actionsEl) actionsEl.hidden = false;
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
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_LATEST_CONTEXT" });
    if (res && typeof res === "object" && "error" in res) {
      showResult("err", `<strong>✕ Could not read the latest context.</strong><br>${esc(String(res.error))}`);
      return null;
    }
    ctx = res as MaybeCtx;
  } catch (e) {
    showResult("err", `<strong>✕ Could not read the latest context.</strong><br>${esc(e instanceof Error ? e.message : "Unknown error")}`);
    return null;
  }
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
    showResult("ok", `<strong>✓ Context copied.</strong><br>“${esc(ctx.conversationTitle)}” is on your clipboard.`);
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
