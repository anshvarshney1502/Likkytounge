// Insert text into whatever the site is currently using as its chat input.
// Supports plain <textarea>/<input> and contenteditable rich editors
// (ChatGPT/Claude/Gemini). Uses `execCommand('insertText', …)` inside CE
// because dispatching an `input` event alone often fails to update the
// framework's state; execCommand goes through the browser's editing pipeline
// and reliably triggers React/Vue/lit updates that back these inputs.

const INPUT_SELECTORS = [
  "textarea",
  "div[contenteditable='true']",
  "div[role='textbox']",
  "p[contenteditable='true']",
];

/** Best-effort locate the active chat input on this page. */
export function findChatInput(): HTMLElement | null {
  // Prefer the focused element if it's already an editable.
  const active = document.activeElement as HTMLElement | null;
  if (active && isEditable(active)) return active;

  // Otherwise look for the largest visible editable near the bottom of the page.
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
  // Empty string means "not set" — treat as visible.
  const op = style.opacity;
  return op === "" || Number(op) > 0;
}

/** Rank likely chat inputs higher (larger, closer to the viewport bottom). */
function rankInput(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const bottomProximity = Math.max(0, 400 - (window.innerHeight - rect.bottom));
  return rect.width + bottomProximity * 2;
}

/**
 * Insert `text` into the input using the caller's chosen mode.
 * Returns true on success.
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
    // Move caret to end.
    const end = next.length;
    try { el.setSelectionRange(end, end); } catch { /* input types without selection */ }
    return true;
  }
  // Contenteditable path.
  if (mode === "replace") {
    // Select all first.
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } else if (mode === "prepend") {
    // Move caret to start.
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } else {
    // append: move caret to end.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  const ok = document.execCommand("insertText", false, text);
  if (!ok) {
    // Fallback for editors that block execCommand.
    const evt = new InputEvent("beforeinput", { data: text, inputType: "insertText", bubbles: true });
    el.dispatchEvent(evt);
    el.textContent = (el.textContent ?? "") + text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return true;
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
