import {
  SAVE_PORT,
  type ActiveDetection,
  type SaveEvent,
  type Settings,
} from "../shared/messages";
import { applyTheme } from "../shared/theme";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const saveBtn = $<HTMLButtonElement>("save");
const siteLabel = $<HTMLSpanElement>("site-label");
const lastSaved = $<HTMLSpanElement>("last-saved");
const stepsEl = $<HTMLUListElement>("steps");
const resultEl = $<HTMLDivElement>("result");

let activeTabId: number | null = null;

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
}

async function init(): Promise<void> {
  const settings = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as Settings;
  applyTheme(settings.theme);

  const info = (await chrome.runtime.sendMessage({
    type: "GET_ACTIVE_DETECTION",
  })) as ActiveDetection;
  activeTabId = info.tabId;

  if (!info.detection || !info.detection.supported) {
    siteLabel.textContent = info.detection?.platform ?? "Unsupported";
    siteLabel.title = "No AI conversation detected on this page.";
    saveBtn.disabled = true;
  } else {
    siteLabel.textContent = info.detection.platform + (info.detection.generic ? " (generic)" : "");
    saveBtn.disabled = false;
  }
  lastSaved.textContent = timeAgo(info.lastSavedAt);
}

const STAGES: Array<{ key: string; label: string }> = [
  { key: "detect", label: "Detecting platform" },
  { key: "extract", label: "Extracting messages" },
  { key: "attachments", label: "Extracting attachments" },
  { key: "archive", label: "Creating local archive" },
  { key: "store", label: "Saving locally" },
];

function renderSteps(activeKey: string): void {
  stepsEl.hidden = false;
  const activeIndex = STAGES.findIndex((s) => s.key === activeKey);
  stepsEl.innerHTML = STAGES.map((s, i) => {
    const state = i < activeIndex ? "ok" : i === activeIndex ? "active" : "";
    const mark = i < activeIndex ? "✓" : i === activeIndex ? "…" : "○";
    return `<li class="${state}"><span class="mark">${mark}</span>${s.label}</li>`;
  }).join("");
}

function showResult(ev: Extract<SaveEvent, { type: "result" }>): void {
  resultEl.hidden = false;
  if (ev.success) {
    resultEl.className = "result ok";
    const warns =
      ev.warnings && ev.warnings.length
        ? `<ul class="warns">${ev.warnings.map((w) => `<li>${w}</li>`).join("")}</ul>`
        : "";
    resultEl.innerHTML =
      `<strong>✓ ${ev.updated ? "Updated" : "Chat saved"}.</strong> ` +
      `${ev.messageCount} messages` +
      (ev.attachmentCount ? `, ${ev.attachmentCount} attachment(s)` : "") +
      warns;
    // mark all steps done
    stepsEl.innerHTML = STAGES.map(
      (s) => `<li class="ok"><span class="mark">✓</span>${s.label}</li>`,
    ).join("");
    lastSaved.textContent = "just now";
  } else {
    resultEl.className = "result err";
    resultEl.innerHTML = `<strong>✕ Not saved.</strong> ${ev.reason ?? "Unknown error."}`;
  }
  saveBtn.disabled = false;
  saveBtn.textContent = "Save Current Chat";
}

function startSave(): void {
  if (activeTabId == null) return;
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  resultEl.hidden = true;
  renderSteps("detect");

  const port = chrome.runtime.connect({ name: SAVE_PORT });
  port.onMessage.addListener((ev: SaveEvent) => {
    if (ev.type === "progress") renderSteps(ev.stage === "done" ? "store" : ev.stage);
    else showResult(ev);
  });
  port.onDisconnect.addListener(() => {
    if (saveBtn.disabled && resultEl.hidden) {
      resultEl.hidden = false;
      resultEl.className = "result err";
      resultEl.textContent = "Save interrupted.";
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Current Chat";
    }
  });
  port.postMessage({ type: "START_SAVE", tabId: activeTabId, mode: "new" });
}

saveBtn.addEventListener("click", startSave);
void init();
