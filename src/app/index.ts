import type { Settings } from "../shared/types";
import {
  listContexts,
  getContext,
  renameContext as renameContextInStore,
  deleteContext as deleteContextInStore,
  getLatestContextId,
  searchContextBodies,
  BODY_SEARCH_MAX_CONTEXTS,
  type SavedContextMeta,
} from "../context/store";
import { exportContext } from "../export/archive";
import { downloadBlob } from "../shared/download";
import { getSettings } from "../shared/settings-store";
import { applyTheme, applyDensity, applyReduceMotion } from "../shared/theme";
import { renderSidebarList, closeAllItemMenus, PAGE_SIZE, type SidebarState } from "./sidebar";
import { renderViewer, renderEmptyState, copyContext, shareContext } from "./viewer";
import { renderSettingsView } from "./settings-view";
import { renderAboutView } from "./about-view";
import { showToast } from "./toast";
import { debounce } from "./util";

const sidebarEl = document.getElementById("ctx-list")!;
const mainEl = document.getElementById("main")!;
const searchEl = document.getElementById("search") as HTMLInputElement;

let settings: Settings;
let allMeta: SavedContextMeta[] = [];
let latestId: string | null = null;
let bodyMatchIds: Set<string> | null = null;
let visibleCount = PAGE_SIZE;

type Route = { view: "library" | "settings" | "about"; contextId?: string };

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, "");
  if (h === "settings") return { view: "settings" };
  if (h === "about") return { view: "about" };
  const m = h.match(/^context\/(.+)$/);
  if (m) return { view: "library", contextId: decodeURIComponent(m[1]) };
  return { view: "library" };
}

async function refreshMeta(): Promise<void> {
  [allMeta, latestId] = await Promise.all([listContexts(), getLatestContextId()]);
}

function renderSidebar(route: Route): void {
  const state: SidebarState = {
    allMeta,
    latestId,
    activeId: route.view === "library" ? (route.contextId ?? null) : null,
    query: searchEl.value,
    bodyMatchIds,
    visibleCount,
  };
  renderSidebarList(sidebarEl, state, {
    onOpen: (id) => (location.hash = `#/context/${id}`),
    onRename: (id) => void handleRename(id),
    onDelete: (id) => void handleDelete(id),
    onCopy: (id) => void handleCopy(id),
    onShare: (id) => void handleShare(id),
    onExport: (id) => void handleExport(id),
    onShowMore: () => {
      visibleCount += PAGE_SIZE;
      renderSidebar(parseHash());
    },
  });
}

async function handleRename(id: string): Promise<void> {
  const current = allMeta.find((c) => c.id === id);
  const next = prompt("Rename this context:", current?.title ?? "");
  if (!next || !next.trim()) return;
  await renameContextInStore(id, next.trim());
  await refreshMeta();
  render();
}

async function handleDelete(id: string): Promise<void> {
  const current = allMeta.find((c) => c.id === id);
  if (!confirm(`Delete "${current?.title ?? "this context"}"? This cannot be undone.`)) return;
  const wasActive = parseHash().contextId === id;
  await deleteContextInStore(id);
  await refreshMeta();
  showToast("Context deleted.");
  if (wasActive) location.hash = "#/";
  else render();
}

async function handleCopy(id: string): Promise<void> {
  const ctx = await getContext(id);
  if (ctx) await copyContext(ctx);
}
async function handleShare(id: string): Promise<void> {
  const ctx = await getContext(id);
  if (ctx) await shareContext(ctx);
}
async function handleExport(id: string): Promise<void> {
  const ctx = await getContext(id);
  if (!ctx) return;
  const { blob, filename } = await exportContext(ctx, settings.defaultExportFormat);
  downloadBlob(blob, filename);
  showToast(`Exported ${filename}`);
}

async function renderMain(route: Route): Promise<void> {
  if (route.view === "settings") {
    await renderSettingsView(mainEl, () => (location.hash = "#/"));
    return;
  }
  if (route.view === "about") {
    renderAboutView(mainEl, () => (location.hash = "#/"));
    return;
  }
  if (!route.contextId) {
    renderEmptyState(mainEl, allMeta.length > 0);
    return;
  }
  const ctx = await getContext(route.contextId);
  if (!ctx) {
    renderEmptyState(mainEl, allMeta.length > 0);
    return;
  }
  renderViewer(mainEl, ctx, {
    onBack: () => (location.hash = "#/"),
    onRenamed: async (id, title) => {
      await renameContextInStore(id, title);
      await refreshMeta();
      renderSidebar(parseHash());
    },
    onDeleted: async (id) => {
      await deleteContextInStore(id);
      await refreshMeta();
      showToast("Context deleted.");
      location.hash = "#/";
    },
  });
}

function render(): void {
  const route = parseHash();
  renderSidebar(route);
  void renderMain(route);
}

const runSearch = debounce(async (query: string) => {
  closeAllItemMenus(sidebarEl);
  visibleCount = PAGE_SIZE;
  const q = query.trim().toLowerCase();
  if (!q) {
    bodyMatchIds = null;
    renderSidebar(parseHash());
    return;
  }
  const metaMatchExists = allMeta.some(
    (c) => c.title.toLowerCase().includes(q) || c.platformLabel.toLowerCase().includes(q),
  );
  if (!metaMatchExists && allMeta.length <= BODY_SEARCH_MAX_CONTEXTS) {
    bodyMatchIds = await searchContextBodies(
      query,
      allMeta.map((c) => c.id),
    );
  } else {
    bodyMatchIds = null;
  }
  renderSidebar(parseHash());
}, 150);

searchEl.addEventListener("input", () => runSearch(searchEl.value));

document.getElementById("nav-settings")!.addEventListener("click", () => (location.hash = "#/settings"));
document.getElementById("nav-about")!.addEventListener("click", () => (location.hash = "#/about"));

// Off-canvas sidebar toggle (narrow viewports only — see styles.css @640px).
const sidebarAside = document.getElementById("sidebar")!;
const backdrop = document.getElementById("sidebar-backdrop")!;
const menuToggle = document.getElementById("menu-toggle")!;
function closeMobileSidebar(): void {
  sidebarAside.classList.remove("open");
  backdrop.classList.remove("open");
}
menuToggle.addEventListener("click", () => {
  sidebarAside.classList.toggle("open");
  backdrop.classList.toggle("open");
});
backdrop.addEventListener("click", closeMobileSidebar);
sidebarEl.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest(".ctx-item")) closeMobileSidebar();
});

window.addEventListener("hashchange", render);

async function boot(): Promise<void> {
  settings = await getSettings();
  applyTheme(settings.theme);
  applyDensity(settings.density);
  applyReduceMotion(settings.reduceMotion);

  await refreshMeta();

  // First load with no explicit route: land straight on the latest context,
  // the most useful default for "Check your previous context".
  if (!location.hash && latestId) {
    location.hash = `#/context/${latestId}`;
    return; // hashchange will trigger render()
  }
  render();
}

void boot();
