// Insert text into whatever the site is currently using as its chat input.
// Supports plain <textarea>/<input> and contenteditable rich editors
// (ChatGPT/Claude/Gemini/DeepSeek).
//
// PERFORMANCE — why this is not just `execCommand('insertText', …)`:
// every one of these sites backs its input with a rich-text editor
// (ProseMirror / Lexical / Slate). `insertText` goes through the editor's
// *typing* path, which for a large string does per-character-ish work and
// synchronously blocks the main thread — dumping tens of thousands of
// characters through it freezes the tab for seconds and can trigger
// Chrome's "page unresponsive" dialog.
//
// A synthetic `paste` event instead goes through the editor's *bulk* path,
// which is written to ingest a whole clipboard payload at once. It is
// dramatically faster for exactly our use case, so we try it first and only
// fall back to chunked `insertText` if the editor ignores the paste.

const INPUT_SELECTORS = [
  "textarea",
  "div[contenteditable='true']",
  "div[role='textbox']",
  "p[contenteditable='true']",
];

/** Best-effort locate the active chat input on this page. */
export function findChatInput(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null;
  if (active && isEditable(active)) return active;

  const candidates: HTMLElement[] = [];
  for (const sel of INPUT_SELECTORS) {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (isVisible(el) && isEditable(el)) candidates.push(el);
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => rankInput(b) - rankInput(a));
  return candidates[0];
}

function isEditable(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return !el.disabled && !el.readOnly;
  const ce = el.getAttribute("contenteditable");
  return ce === "true" || ce === "";
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 20) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  const op = style.opacity;
  return op === "" || Number(op) > 0;
}

/** Rank likely chat inputs higher (larger, closer to the viewport bottom). */
function rankInput(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const bottomProximity = Math.max(0, 400 - (window.innerHeight - rect.bottom));
  return rect.width + bottomProximity * 2;
}

export function getInputLength(el: HTMLElement): number {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value.length;
  return (el.textContent ?? "").length;
}

/** Place the caret / selection according to the requested insert mode. */
function positionCaret(el: HTMLElement, mode: "replace" | "append" | "prepend"): void {
  const range = document.createRange();
  if (mode === "replace") {
    range.selectNodeContents(el);
  } else if (mode === "prepend") {
    range.setStart(el, 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/**
 * Fast path for rich editors: hand the whole payload over as a synthetic
 * paste. Returns true only if the editor actually consumed it (verified by
 * a real length change), so callers can fall back rather than assume.
 */
function tryPaste(el: HTMLElement, text: string): boolean {
  let dt: DataTransfer;
  try {
    dt = new DataTransfer();
    dt.setData("text/plain", text);
  } catch {
    return false; // DataTransfer construction blocked
  }
  const before = getInputLength(el);
  const evt = new ClipboardEvent("paste", {
    clipboardData: dt,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(evt);
  // If the editor handled it, its content grew. A tolerance is used because
  // editors normalize whitespace/newlines, so the delta rarely matches the
  // input length exactly.
  return getInputLength(el) > before + Math.min(16, Math.floor(text.length / 2));
}

/**
 * Set the value of a React-controlled input via the native setter so React
 * observes the change. Falls back to a plain assignment on other frameworks.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/**
 * Synchronous insert. Kept for small payloads and for callers that cannot
 * await. For anything large prefer `insertLargeText`, which yields to the
 * browser so the page stays responsive.
 */
export function insertIntoInput(
  el: HTMLElement,
  text: string,
  mode: "replace" | "append" | "prepend" = "append",
): boolean {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const current = el.value;
    let next: string;
    if (mode === "replace") next = text;
    else if (mode === "prepend") next = text + (current ? "\n\n" + current : "");
    else next = (current ? current + "\n\n" : "") + text;
    setNativeValue(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const end = next.length;
    try { el.setSelectionRange(end, end); } catch { /* input types without selection */ }
    return true;
  }

  positionCaret(el, mode);
  if (tryPaste(el, text)) return true;

  const ok = document.execCommand("insertText", false, text);
  if (!ok) {
    const evt = new InputEvent("beforeinput", { data: text, inputType: "insertText", bubbles: true });
    el.dispatchEvent(evt);
    el.textContent = (el.textContent ?? "") + text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return true;
}

/** Yield to the browser so it can paint and process pending work. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Small enough that a single `insertText` call stays well under a frame
 *  budget even in a heavy rich-text editor. Only used on the slow fallback
 *  path — the paste path sends everything in one go. */
const FALLBACK_CHUNK_CHARS = 4000;

export interface LargeInsertResult {
  ok: boolean;
  /** True when the fast single-shot paste path handled it. */
  usedPaste: boolean;
  /** Number of separate insert operations performed. */
  operations: number;
  /** Set when insertion was abandoned early to avoid hanging the page. */
  abortedReason?: string;
}

export interface LargeInsertOptions {
  mode?: "replace" | "append" | "prepend";
  onProgress?: (done: number, total: number) => void;
  /** Give up (and report honestly) rather than block the page indefinitely. */
  budgetMs?: number;
}

/**
 * Insert a potentially very large payload without freezing the page.
 *
 * 1. `<textarea>`/`<input>`: one native-setter assignment — already O(n) and
 *    fast, no chunking needed.
 * 2. contenteditable: one synthetic paste (the editor's bulk path).
 * 3. Only if the editor ignored the paste: chunked `insertText` with a yield
 *    between every chunk, plus a wall-clock budget so a pathologically slow
 *    editor degrades into an honest partial result instead of a frozen tab.
 */
export async function insertLargeText(
  el: HTMLElement,
  text: string,
  opts: LargeInsertOptions = {},
): Promise<LargeInsertResult> {
  const mode = opts.mode ?? "append";
  const budgetMs = opts.budgetMs ?? 15_000;
  const started = Date.now();

  el.focus();

  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    insertIntoInput(el, text, mode);
    opts.onProgress?.(1, 1);
    return { ok: true, usedPaste: false, operations: 1 };
  }

  positionCaret(el, mode);
  if (tryPaste(el, text)) {
    opts.onProgress?.(1, 1);
    return { ok: true, usedPaste: true, operations: 1 };
  }

  // Slow fallback: many small inserts, yielding between each one.
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += FALLBACK_CHUNK_CHARS) {
    chunks.push(text.slice(i, i + FALLBACK_CHUNK_CHARS));
  }

  let operations = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (Date.now() - started > budgetMs) {
      return {
        ok: operations > 0,
        usedPaste: false,
        operations,
        abortedReason: `Stopped after ${Math.round((Date.now() - started) / 1000)}s — this editor accepts pasted text too slowly to transfer the whole context.`,
      };
    }
    if (i > 0) await yieldToBrowser();
    positionCaret(el, "append");
    document.execCommand("insertText", false, chunks[i]);
    operations++;
    opts.onProgress?.(i + 1, chunks.length);
  }
  return { ok: true, usedPaste: false, operations };
}
