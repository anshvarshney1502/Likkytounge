// Attach the generated context to a chat composer as a real .md file.
//
// This is the intended path for Upload Context. Typing a large context into
// the message box is both slow (it goes through the editor's per-character
// path and blocks the main thread) and undesirable — the user wants a file
// on the prompt, not a wall of raw markdown in the input.
//
// Three delivery strategies are attempted, cheapest and most reliable
// first. All three are instantaneous from our side: we hand the browser a
// File and the site's own uploader takes over, so the main thread is never
// blocked by us regardless of how large the context is.

export type AttachStrategy = "file-input" | "paste" | "drop";

export interface AttachResult {
  ok: boolean;
  strategy?: AttachStrategy;
  elapsedMs: number;
  reason?: string;
}

export interface AttachOptions {
  /** Called roughly every 250ms with elapsed time so the UI can show a timer. */
  onTick?: (elapsedMs: number) => void;
  /** How long to wait for the site to acknowledge the attachment. */
  timeoutMs?: number;
}

/** Build the .md File that will be attached to the composer. */
export function buildContextFile(markdown: string, title: string): File {
  const safe = (title || "conversation-context")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "conversation-context";
  return new File([markdown], `${safe}.md`, { type: "text/markdown" });
}

function dataTransferWith(file: File): DataTransfer | null {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  } catch {
    return null;
  }
}

/** Visible, enabled file inputs are the most reliable attachment channel. */
function fileInputs(doc: Document): HTMLInputElement[] {
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(
    (i) => !i.disabled,
  );
}

/** True once any file input on the page is holding a file. */
function filesPresent(doc: Document): boolean {
  return fileInputs(doc).some((i) => i.files && i.files.length > 0);
}

/**
 * Watches for an attachment chip appearing near the composer.
 *
 * Matching on the file's *content* (or its name, which is derived from the
 * conversation title) is not usable here: the page already displays that
 * same conversation title in its header and sidebar, so a text search would
 * report success before anything was ever attached. Watching for newly
 * inserted elements within the composer's own form is content-agnostic and
 * scoped tightly enough to ignore unrelated page churn such as the message
 * stream, which lives outside the form.
 *
 * Additions *inside* the editable itself are deliberately not counted — text
 * landing in the message box is precisely the outcome we are avoiding.
 */
function watchForAttachment(composer: HTMLElement | null): { saw: () => boolean; reset: () => void; stop: () => void } {
  const host = document.getElementById("likky-tounge-host");
  const container =
    composer?.closest("form") ?? composer?.parentElement ?? document.body;

  let seen = false;
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        const el = n as Element;
        if (host && host.contains(el)) return;
        if (composer && composer.contains(el)) return;
        seen = true;
      });
    }
  });
  obs.observe(container, { childList: true, subtree: true });

  return {
    saw: () => seen,
    reset: () => {
      seen = false;
    },
    stop: () => obs.disconnect(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Attach `markdown` to the page's composer as a .md file.
 *
 * Returns as soon as the attachment is confirmed. While waiting it reports
 * elapsed time via `onTick` so the caller can show a live timer instead of
 * an indeterminate spinner.
 */
export async function attachContextAsFile(
  markdown: string,
  title: string,
  composer: HTMLElement | null,
  opts: AttachOptions = {},
): Promise<AttachResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const started = Date.now();
  const file = buildContextFile(markdown, title);

  const attempts: Array<{ strategy: AttachStrategy; run: () => boolean }> = [];

  // 1. Hand the file straight to the site's own file input.
  for (const input of fileInputs(document)) {
    attempts.push({
      strategy: "file-input",
      run: () => {
        const dt = dataTransferWith(file);
        if (!dt) return false;
        try {
          input.files = dt.files;
        } catch {
          return false;
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      },
    });
  }

  // 2. Paste the file onto the composer.
  if (composer) {
    attempts.push({
      strategy: "paste",
      run: () => {
        const dt = dataTransferWith(file);
        if (!dt) return false;
        composer.focus();
        composer.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
        );
        return true;
      },
    });

    // 3. Simulate a drag-and-drop of the file onto the composer.
    attempts.push({
      strategy: "drop",
      run: () => {
        const dt = dataTransferWith(file);
        if (!dt) return false;
        const init = { dataTransfer: dt, bubbles: true, cancelable: true } as DragEventInit;
        composer.dispatchEvent(new DragEvent("dragenter", init));
        composer.dispatchEvent(new DragEvent("dragover", init));
        composer.dispatchEvent(new DragEvent("drop", init));
        return true;
      },
    });
  }

  if (attempts.length === 0) {
    return { ok: false, elapsedMs: 0, reason: "No file input or chat composer was found on this page." };
  }

  const watcher = watchForAttachment(composer);
  const confirmed = () => filesPresent(document) || watcher.saw();

  // Give each strategy a slice of the budget, then keep waiting on the last
  // one — an upload the site is still processing should not be abandoned
  // just because our first probe came back empty.
  const perAttempt = Math.max(2_000, Math.floor(timeoutMs / (attempts.length + 2)));

  try {
    for (let i = 0; i < attempts.length; i++) {
      const { strategy, run } = attempts[i];
      watcher.reset();
      if (!run()) continue;

      const deadline = Math.min(Date.now() + perAttempt, started + timeoutMs);
      while (Date.now() < deadline) {
        await sleep(250);
        opts.onTick?.(Date.now() - started);
        if (confirmed()) {
          return { ok: true, strategy, elapsedMs: Date.now() - started };
        }
      }
      if (Date.now() - started >= timeoutMs) break;
    }

    // Final grace period: the last strategy may still be uploading.
    while (Date.now() - started < timeoutMs) {
      await sleep(250);
      opts.onTick?.(Date.now() - started);
      if (confirmed()) {
        return {
          ok: true,
          strategy: attempts[attempts.length - 1].strategy,
          elapsedMs: Date.now() - started,
        };
      }
    }

    return {
      ok: false,
      elapsedMs: Date.now() - started,
      reason: `The page did not confirm the attachment within ${Math.round(timeoutMs / 1000)}s.`,
    };
  } finally {
    watcher.stop();
  }
}
