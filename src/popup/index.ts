import type { Settings } from "../shared/types";
import { applyTheme, applyDensity } from "../shared/theme";
import { getContext } from "../context/store";
import { copyContext, shareContext } from "../app/share";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "moments ago";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function openApp(hash = ""): void {
  chrome.tabs.create({ url: chrome.runtime.getURL(`app.html${hash}`) });
}

async function init(): Promise<void> {
  const settings = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as Settings;
  applyTheme(settings.theme);
  applyDensity(settings.density);

  $("open-library").addEventListener("click", () => openApp());
  $("open-settings").addEventListener("click", (e) => {
    e.preventDefault();
    openApp("#/settings");
  });
  $("open-about").addEventListener("click", (e) => {
    e.preventDefault();
    openApp("#/about");
  });

  if (!settings.showLastContextPreview) return;

  const [latestId, list] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_LATEST_CONTEXT_ID" }),
    chrome.runtime.sendMessage({ type: "LIST_CONTEXTS" }),
  ]);

  const latest = Array.isArray(list) ? list.find((c: { id: string }) => c.id === latestId) : null;
  if (!latest) {
    $("popup-empty").hidden = false;
    return;
  }
  $("last-context").hidden = false;
  $("lc-title").textContent = latest.title;
  $("lc-meta").textContent = `${latest.platformLabel} · Generated ${timeAgo(latest.capturedAt)}`;
  $("last-context").addEventListener("click", () => openApp(`#/context/${latest.id}`));
  $("last-context").style.cursor = "pointer";

  $("lc-copy").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ctx = await getContext(latest.id);
    if (ctx) await copyContext(ctx);
  });
  $("lc-share").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ctx = await getContext(latest.id);
    if (ctx) await shareContext(ctx);
  });
}

void init();
