import type { SavedContextMeta } from "../context/store";
import { esc, timeAgo, dateBucket, fmtBytes } from "./util";

export interface SidebarState {
  allMeta: SavedContextMeta[];
  latestId: string | null;
  activeId: string | null;
  query: string;
  bodyMatchIds: Set<string> | null;
  visibleCount: number;
}

export interface SidebarHandlers {
  onOpen(id: string): void;
  onRename(id: string): void;
  onDelete(id: string): void;
  onCopy(id: string): void;
  onShare(id: string): void;
  onExport(id: string): void;
  onShowMore(): void;
}

const GROUP_ORDER = ["Today", "Yesterday", "Earlier"] as const;
const PAGE_SIZE = 150;
export { PAGE_SIZE };

function filterList(s: SidebarState): SavedContextMeta[] {
  const q = s.query.trim().toLowerCase();
  if (!q) return s.allMeta;
  return s.allMeta.filter((c) => {
    const metaMatch =
      c.title.toLowerCase().includes(q) ||
      c.platformLabel.toLowerCase().includes(q) ||
      new Date(c.capturedAt).toLocaleDateString().toLowerCase().includes(q);
    if (metaMatch) return true;
    return s.bodyMatchIds?.has(c.id) ?? false;
  });
}

function itemHtml(c: SavedContextMeta, s: SidebarState): string {
  const isLatest = c.id === s.latestId;
  const isActive = c.id === s.activeId;
  return `
    <div class="ctx-item ${isActive ? "active" : ""}" data-id="${esc(c.id)}" tabindex="0" role="button" aria-current="${isActive}">
      <div class="body">
        <div class="ctx-item-header">
          <div class="title">${esc(c.title)}</div>
          ${isLatest ? `<span class="latest-badge">Latest</span>` : ""}
        </div>
        <div class="item-meta">
          <div class="meta-left">
            <span class="platform-label">${esc(c.platformLabel)}</span>
            <span class="dot-sep">·</span>
            <span>${c.messageCount} msgs</span>
          </div>
          <span class="time-ago">${timeAgo(c.capturedAt)}</span>
        </div>
      </div>
      <button class="more-btn" data-more="${esc(c.id)}" aria-label="More actions" title="More actions">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
      </button>
      <div class="item-menu" id="menu-${esc(c.id)}">
        <button data-act="open" data-id="${esc(c.id)}">Open context</button>
        <button data-act="rename" data-id="${esc(c.id)}">Rename</button>
        <button data-act="copy" data-id="${esc(c.id)}">Copy to clipboard</button>
        <button data-act="share" data-id="${esc(c.id)}">Share</button>
        <button data-act="export" data-id="${esc(c.id)}">Export as Markdown</button>
        <div class="menu-divider"></div>
        <button data-act="delete" data-id="${esc(c.id)}" class="danger">Delete</button>
      </div>
      <span class="sr-only">${fmtBytes(c.approxSizeBytes)}</span>
    </div>`;
}

export function renderSidebarList(container: HTMLElement, s: SidebarState, h: SidebarHandlers): void {
  const filtered = filterList(s);

  if (s.allMeta.length === 0) {
    container.innerHTML = `
      <div class="sidebar-empty">
        Your context library is empty.<br><br>
        Open ChatGPT, Claude, Gemini, or DeepSeek, click Pikachu, and your first
        conversation context will appear here.
      </div>`;
    return;
  }
  if (filtered.length === 0) {
    container.innerHTML = `<div class="sidebar-empty">No contexts match "${esc(s.query)}".</div>`;
    return;
  }

  const capped = filtered.slice(0, s.visibleCount);
  const groups = new Map<string, SavedContextMeta[]>();
  for (const c of capped) {
    const bucket = dateBucket(c.capturedAt);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket)!.push(c);
  }

  let html = "";
  for (const key of GROUP_ORDER) {
    const items = groups.get(key);
    if (!items || items.length === 0) continue;
    html += `<div class="group-label">${key}</div>`;
    html += items.map((c) => itemHtml(c, s)).join("");
  }
  if (filtered.length > s.visibleCount) {
    html += `<div style="padding:10px;"><button class="btn block" id="show-more-btn">Show ${Math.min(PAGE_SIZE, filtered.length - s.visibleCount)} more…</button></div>`;
  }
  container.innerHTML = html;

  container.querySelectorAll<HTMLElement>(".ctx-item").forEach((el) => {
    const id = el.dataset.id!;
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".more-btn, .item-menu")) return;
      h.onOpen(id);
    });
    el.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") h.onOpen(id);
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".more-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.more!;
      const menu = container.querySelector(`#menu-${CSS.escape(id)}`);
      const wasOpen = menu?.classList.contains("open");
      container.querySelectorAll(".item-menu.open").forEach((m) => m.classList.remove("open"));
      container.querySelectorAll(".more-btn.open").forEach((b) => b.classList.remove("open"));
      if (!wasOpen) {
        menu?.classList.add("open");
        btn.classList.add("open");
      }
    });
  });
  container.querySelectorAll<HTMLButtonElement>(".item-menu button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id!;
      const act = btn.dataset.act;
      container.querySelectorAll(".item-menu.open").forEach((m) => m.classList.remove("open"));
      if (act === "open") h.onOpen(id);
      else if (act === "rename") h.onRename(id);
      else if (act === "delete") h.onDelete(id);
      else if (act === "copy") h.onCopy(id);
      else if (act === "share") h.onShare(id);
      else if (act === "export") h.onExport(id);
    });
  });
  container.querySelector("#show-more-btn")?.addEventListener("click", h.onShowMore);
}

export function closeAllItemMenus(container: HTMLElement): void {
  container.querySelectorAll(".item-menu.open").forEach((m) => m.classList.remove("open"));
  container.querySelectorAll(".more-btn.open").forEach((b) => b.classList.remove("open"));
}
