import { describe, it, expect, vi } from "vitest";
import { insertLargeText, getInputLength } from "../src/content/insert";

/**
 * Simulates a rich-text editor (ProseMirror/Lexical/Slate style):
 *  - it handles `paste` events on a bulk path (fast), and
 *  - it handles execCommand('insertText') on a slow typing path.
 * jsdom has no execCommand, so we stub it and count calls — the number of
 * synchronous insertText calls is exactly what determines whether the real
 * browser's main thread gets blocked.
 */
function makeRichEditor(opts: { handlesPaste: boolean }): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "true");
  document.body.appendChild(el);
  if (opts.handlesPaste) {
    el.addEventListener("paste", (e) => {
      const text = (e as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
      el.textContent = (el.textContent ?? "") + text;
      e.preventDefault();
    });
  }
  return el;
}

function stubExecCommand(target: HTMLElement) {
  const calls: string[] = [];
  document.execCommand = (cmd: string, _ui?: boolean, value?: string) => {
    if (cmd === "insertText" && value !== undefined) {
      calls.push(value);
      target.textContent = (target.textContent ?? "") + value;
      return true;
    }
    return false;
  };
  return calls;
}

describe("insertLargeText — the freeze fix", () => {
  it("sends a large payload through the paste bulk path in ONE operation", async () => {
    const el = makeRichEditor({ handlesPaste: true });
    const calls = stubExecCommand(el);
    const big = "x".repeat(120_000);

    const result = await insertLargeText(el, big, { mode: "append" });

    expect(result.ok).toBe(true);
    expect(result.usedPaste).toBe(true);
    // The critical assertion: exactly one operation, and ZERO slow
    // synchronous insertText calls — that is what keeps the tab responsive.
    expect(result.operations).toBe(1);
    expect(calls.length).toBe(0);
    expect(getInputLength(el)).toBe(big.length);
    el.remove();
  });

  it("falls back to many SMALL yielded chunks when the editor ignores paste", async () => {
    const el = makeRichEditor({ handlesPaste: false });
    const calls = stubExecCommand(el);
    const big = "y".repeat(20_000);

    const result = await insertLargeText(el, big, { mode: "append" });

    expect(result.ok).toBe(true);
    expect(result.usedPaste).toBe(false);
    expect(calls.length).toBeGreaterThan(1);
    // Every individual synchronous call must stay small; a single huge
    // insertText is precisely what froze the page before this fix.
    for (const c of calls) expect(c.length).toBeLessThanOrEqual(4000);
    expect(calls.join("")).toBe(big);
    el.remove();
  });

  it("never loses characters on the fallback path", async () => {
    const el = makeRichEditor({ handlesPaste: false });
    const calls = stubExecCommand(el);
    const text = "para one\n\n" + "z".repeat(9_500) + "\n\npara two";

    await insertLargeText(el, text, { mode: "append" });

    expect(calls.join("")).toBe(text);
    el.remove();
  });

  it("uses a single fast assignment for a plain textarea", async () => {
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    const big = "q".repeat(80_000);

    const result = await insertLargeText(ta, big, { mode: "append" });

    expect(result.ok).toBe(true);
    expect(result.operations).toBe(1);
    expect(ta.value.length).toBe(big.length);
    ta.remove();
  });

  it("aborts with an honest reason instead of hanging when the editor is pathologically slow", async () => {
    const el = makeRichEditor({ handlesPaste: false });
    stubExecCommand(el);
    // Budget of 0ms forces the wall-clock guard to trip immediately.
    const result = await insertLargeText(el, "w".repeat(50_000), { budgetMs: 0 });

    expect(result.abortedReason).toBeTruthy();
    expect(result.abortedReason).toMatch(/too slowly|Stopped/i);
    el.remove();
  });

  it("reports chunk progress so the UI never looks stalled", async () => {
    const el = makeRichEditor({ handlesPaste: false });
    stubExecCommand(el);
    const onProgress = vi.fn();

    await insertLargeText(el, "p".repeat(12_000), { onProgress });

    expect(onProgress).toHaveBeenCalled();
    const [done, total] = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(done).toBe(total);
    el.remove();
  });
});
