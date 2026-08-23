// Pikachu launcher: the on-page UI for the two core actions —
// Generate Context (capture the full conversation) and Upload Context
// (auto-transfer the latest generated context into this LLM). This replaces
// the old capsule-picker overlay entirely. Capsules (unrelated feature) are
// still managed from the popup/library — this overlay is Context-only.

import type { Settings } from "../shared/types";
import type { GenerateProgress, UploadProgress } from "../context/types";
import { generateContext } from "../context/generate";
import { uploadContext } from "../context/upload";
import { pikachuImgTag } from "./pikachu-icon";
import { BOLT_SVG } from "./thunderbolt-icon";
import overlayCss from "./overlay.css";

const HOST_ID = "context-bolt-host";

let root: ShadowRoot | null = null;
let rootEl: HTMLElement | null = null;
let menuEl: HTMLElement | null = null;
let panelEl: HTMLElement | null = null;
let panelTitleEl: HTMLElement | null = null;
let stepsEl: HTMLElement | null = null;
let resultEl: HTMLElement | null = null;
let pikachuEl: HTMLElement | null = null;
let stageEl: HTMLElement | null = null;
let settingsCache: Settings | null = null;

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
    <div class="lk-menu" id="lk-menu" role="menu" aria-label="Likky Tounge actions">
      <button type="button" data-action="generate" role="menuitem">
        <span class="lk-emoji">⚡</span>
        <span><strong>Generate Context</strong><span class="lk-menu-sub">Capture this entire conversation</span></span>
      </button>
      <button type="button" data-action="upload" role="menuitem">
        <span class="lk-emoji">⬆️</span>
        <span><strong>Upload Context</strong><span class="lk-menu-sub">Attach the latest context as a .md file</span></span>
      </button>
      <div class="lk-sep"></div>
      <button type="button" data-action="copy" role="menuitem">
        <span class="lk-emoji">📋</span>
        <span><strong>Copy Context</strong><span class="lk-menu-sub">Copy the latest context to clipboard</span></span>
      </button>
      <button type="button" data-action="share" role="menuitem">
        <span class="lk-emoji">📤</span>
        <span><strong>Share Context</strong><span class="lk-menu-sub">Share the latest context</span></span>
      </button>
      <button type="button" data-action="library" role="menuitem">
        <span class="lk-emoji">🗂️</span>
        <span><strong>Open Library</strong><span class="lk-menu-sub">Browse every saved context</span></span>
      </button>
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
      <button class="lk-pikachu" id="lk-pikachu" aria-label="Open Likky Tounge menu" title="Generate or Upload context">
        ${pikachuImgTag()}
      </button>
      <button class="lk-plus" id="lk-plus" aria-label="Open Likky Tounge menu" title="Generate or Upload context">+</button>
    </div>
  `;
  root.appendChild(rootEl);

  menuEl = root.getElementById("lk-menu");
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
  menuEl!.addEventListener("click", (e) => {
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

  document.addEventListener("click", onOutsideClick, true);
  document.addEventListener("keydown", onGlobalKey, true);
}

function unmount(): void {
  document.getElementById(HOST_ID)?.remove();
  document.removeEventListener("click", onOutsideClick, true);
  document.removeEventListener("keydown", onGlobalKey, true);
  root = rootEl = menuEl = panelEl = panelTitleEl = stepsEl = resultEl = pikachuEl = stageEl = null;
}

function onOutsideClick(): void {
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

async function runUpload(): Promise<void> {
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
  }, settings.insertMode);

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
