import type { SavedContext } from "../context/store";
import type { ExportFormat } from "../export/archive";
import { splitConversationMarkdown } from "../export/markdown-render";
import { markdownToPlaintext } from "../export/to-plaintext";
import { exportContext } from "../export/archive";
import { downloadBlob } from "../shared/download";
import { esc, timeAgo, fmtBytes } from "./util";
import { showToast } from "./toast";

const ROLE_LABEL: Record<string, string> = { user: "User", assistant: "Assistant", system: "System" };

export interface ViewerHandlers {
  onBack(): void;
  onRenamed(id: string, title: string): void;
  onDeleted(id: string): void;
}

export async function shareContext(ctx: SavedContext): Promise<void> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
  };
  try {
    if (nav.share && nav.canShare) {
      const file = new File([ctx.markdown], `${ctx.title}.md`, { type: "text/markdown" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ title: ctx.title, files: [file] });
        showToast("Shared.");
        return;
      }
    }
    if (nav.share) {
      const preview = markdownToPlaintext(ctx.markdown).slice(0, 1800);
      await nav.share({ title: ctx.title, text: preview });
      showToast("Shared.");
      return;
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return; // user cancelled
    /* fall through to clipboard fallback */
  }
  await navigator.clipboard.writeText(markdownToPlaintext(ctx.markdown));
  showToast("Sharing isn't available here — copied the context instead.");
}

export async function copyContext(ctx: SavedContext): Promise<void> {
  try {
    await navigator.clipboard.writeText(markdownToPlaintext(ctx.markdown));
    showToast("Context copied successfully.");
  } catch {
    showToast("Couldn't copy — clipboard access was denied.", true);
  }
}

async function doExport(ctx: SavedContext, format: ExportFormat): Promise<void> {
  const { blob, filename } = await exportContext(ctx, format);
  downloadBlob(blob, filename);
  showToast(`Exported ${filename}`);
}

export function renderViewer(main: HTMLElement, ctx: SavedContext, h: ViewerHandlers): void {
  const sections = splitConversationMarkdown(ctx.markdown).filter((s) => s.role !== "meta");

  main.innerHTML = `
    <div class="viewer-toolbar">
      <span class="back-link" id="v-back">← Contexts</span>
      <div class="viewer-heading">
        <div class="title" id="v-title" tabindex="0" title="Click to rename">${esc(ctx.title)}</div>
        <div class="sub">${esc(ctx.platformLabel)} · Generated ${timeAgo(ctx.capturedAt)} · ${ctx.messageCount} messages · ${fmtBytes(ctx.approxSizeBytes)}</div>
      </div>
      <div class="viewer-actions">
        <button class="btn" id="v-copy">📋 <span class="lbl">Copy</span></button>
        <button class="btn" id="v-share">📤 <span class="lbl">Share</span></button>
        <button class="btn" id="v-export">⬇️ <span class="lbl">Export</span></button>
        <div class="dropdown" id="v-export-menu">
          <button data-fmt="markdown">Markdown (.md)</button>
          <button data-fmt="plaintext">Plain Text (.txt)</button>
          <button data-fmt="html">HTML (.html)</button>
          <button data-fmt="zip">ZIP (all formats)</button>
        </div>
        <button class="btn btn-icon" id="v-more" aria-label="More">⋯</button>
        <div class="dropdown" id="v-more-menu">
          <button id="v-more-delete">🗑 Delete context</button>
        </div>
      </div>
    </div>
    <div class="viewer-scroll">
      <div class="viewer-doc">
        ${ctx.truncated ? `<div class="doc-warn">⚠ This context may be incomplete: ${esc(ctx.truncatedReason ?? "the source conversation could not be fully confirmed as loaded.")}</div>` : ""}
        ${sections
          .map(
            (s) =>
              `<article class="msg ${s.role}"><div class="role">${ROLE_LABEL[s.role] ?? "Message"}</div><div class="content">${s.html}</div></article>`,
          )
          .join("\n")}
      </div>
    </div>
  `;

  main.querySelector("#v-back")!.addEventListener("click", h.onBack);

  const titleEl = main.querySelector<HTMLElement>("#v-title")!;
  const commitRename = async () => {
    titleEl.contentEditable = "false";
    const newTitle = titleEl.textContent?.trim() || ctx.title;
    titleEl.textContent = newTitle;
    if (newTitle !== ctx.title) h.onRenamed(ctx.id, newTitle);
  };
  titleEl.addEventListener("click", () => {
    titleEl.contentEditable = "true";
    titleEl.focus();
    document.execCommand("selectAll", false);
  });
  titleEl.addEventListener("blur", commitRename);
  titleEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      titleEl.blur();
    }
    if (e.key === "Escape") {
      titleEl.textContent = ctx.title;
      titleEl.blur();
    }
  });

  main.querySelector("#v-copy")!.addEventListener("click", () => void copyContext(ctx));
  main.querySelector("#v-share")!.addEventListener("click", () => void shareContext(ctx));

  const exportBtn = main.querySelector("#v-export")!;
  const exportMenu = main.querySelector<HTMLElement>("#v-export-menu")!;
  const moreBtn = main.querySelector("#v-more")!;
  const moreMenu = main.querySelector<HTMLElement>("#v-more-menu")!;
  const closeMenus = () => {
    exportMenu.classList.remove("open");
    moreMenu.classList.remove("open");
  };
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !exportMenu.classList.contains("open");
    closeMenus();
    if (willOpen) exportMenu.classList.add("open");
  });
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !moreMenu.classList.contains("open");
    closeMenus();
    if (willOpen) moreMenu.classList.add("open");
  });
  exportMenu.querySelectorAll<HTMLButtonElement>("button[data-fmt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeMenus();
      void doExport(ctx, btn.dataset.fmt as ExportFormat);
    });
  });
  main.querySelector("#v-more-delete")!.addEventListener("click", () => {
    closeMenus();
    if (confirm(`Delete "${ctx.title}"? This cannot be undone.`)) h.onDeleted(ctx.id);
  });
  document.addEventListener("click", closeMenus, { once: true });
}

export function renderEmptyState(main: HTMLElement, hasAnyContexts: boolean): void {
  if (!hasAnyContexts) {
    main.innerHTML = `
      <div class="main-empty">
        <div class="glyph">🗂️</div>
        <h2>Your context library is empty.</h2>
        <p>Generate your first conversation context and it will appear here. Open ChatGPT, Claude, Gemini, or DeepSeek, click Pikachu, and your entire conversation is captured — ready to carry anywhere.</p>
      </div>`;
    return;
  }
  main.innerHTML = `
    <div class="main-empty">
      <div class="glyph">📖</div>
      <h2>Select a context to read it.</h2>
      <p>Choose any saved conversation from the sidebar — rendered as a clean, readable document, not raw Markdown.</p>
    </div>`;
}
