// Pikachu launcher: the on-page UI for the two core actions —
// Generate Context (capture the full conversation) and Upload Context
// (auto-transfer the latest generated context into this LLM). This replaces
// the old capsule-picker overlay entirely. Capsules (unrelated feature) are
// still managed from the popup/library — this overlay is Context-only.

import type { Settings } from "../shared/types";
import type { GenerateProgress, UploadProgress } from "../context/types";
import { generateContext } from "../context/generate";
import { uploadContext } from "../context/upload";
import { PIKACHU_SVG } from "./pikachu-icon";
import { BOLT_SVG } from "./thunderbolt-icon";
import overlayCss from "./overlay.css";

const HOST_ID = "likky-tounge-host";

let root: ShadowRoot | null = null;
let rootEl: HTMLElement | null = null;
let menuEl: HTMLElement | null = null;
let panelEl: HTMLElement | null = null;
let panelTitleEl: HTMLElement | null = null;
let stepsEl: HTMLElement | null = null;
let resultEl: HTMLElement | null = null;
let pikachuEl: HTMLElement | null = null;
let boltsEl: HTMLElement | null = null;
let flashEl: HTMLElement | null = null;
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
        <span><strong>Upload Context</strong><span class="lk-menu-sub">Send the latest context here</span></span>
      </button>
    </div>
    <div class="lk-panel" id="lk-panel" role="status" aria-live="polite">
      <button class="lk-panel-close" id="lk-panel-close" aria-label="Close">✕</button>
      <div class="lk-panel-title" id="lk-panel-title"></div>
      <ul class="lk-steps" id="lk-steps"></ul>
      <div class="lk-result" id="lk-result" hidden></div>
    </div>
    <div class="lk-pikachu-wrap">
      <button class="lk-pikachu" id="lk-pikachu" aria-label="Open Likky Tounge menu" title="Generate or Upload context">
        <div class="lk-flash" id="lk-flash"></div>
        ${PIKACHU_SVG}
        <div class="lk-bolts" id="lk-bolts">
          <div class="lk-bolt">${BOLT_SVG}</div>
          <div class="lk-bolt">${BOLT_SVG}</div>
          <div class="lk-bolt">${BOLT_SVG}</div>
          <div class="lk-bolt">${BOLT_SVG}</div>
          <div class="lk-bolt">${BOLT_SVG}</div>
          <div class="lk-bolt">${BOLT_SVG}</div>
          <div class="lk-bolt">${BOLT_SVG}</div>
        </div>
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
  boltsEl = root.getElementById("lk-bolts");
  flashEl = root.getElementById("lk-flash");

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
    if (btn.dataset.action === "generate") void runGenerate();
    else if (btn.dataset.action === "upload") void runUpload();
  });

  document.addEventListener("click", onOutsideClick, true);
  document.addEventListener("keydown", onGlobalKey, true);
}

function unmount(): void {
  document.getElementById(HOST_ID)?.remove();
  document.removeEventListener("click", onOutsideClick, true);
  document.removeEventListener("keydown", onGlobalKey, true);
  root = rootEl = menuEl = panelEl = panelTitleEl = stepsEl = resultEl = pikachuEl = boltsEl = flashEl = null;
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
  { key: "transfer", label: "Transfer context" },
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
    boltsEl!.classList.add("active");
    flashEl!.classList.add("active");
    pikachuEl!.classList.add("burst");
    setTimeout(() => {
      pikachuEl?.classList.remove("burst");
      boltsEl?.classList.remove("active");
      flashEl?.classList.remove("active");
    }, 900);

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
    renderSteps(UPLOAD_STAGES, p.stage, p.label);
  }, settings.insertMode);

  if (result.success) {
    markAllDone(UPLOAD_STAGES);
    if (result.partial) {
      showResult(
        "warn",
        `<strong>⚠ Partially transferred.</strong><br>${esc(result.partialReason ?? "")}`,
      );
    } else {
      showResult(
        "ok",
        `<strong>✓ Context transferred to ${esc(result.platformLabel)}.</strong>${result.chunks > 1 ? ` (${result.chunks} parts)` : ""}`,
      );
      setTimeout(closePanel, 4000);
    }
  } else {
    showResult("err", `<strong>✕ Upload failed.</strong><br>${esc(result.reason)}`);
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
