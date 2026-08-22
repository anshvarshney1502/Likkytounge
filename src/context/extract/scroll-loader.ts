// Auto-scrolls a chat's message container to the top, waiting for lazily
// loaded / paginated / infinite-scroll history to mount, so extraction sees
// the FULL conversation instead of just what's currently in the DOM.
//
// Strategy: repeatedly scroll to the top of the container, then wait a beat
// for new content to arrive (network fetch + render). Stop when either:
//   (a) scrollTop stays at/near 0 AND the message count hasn't grown for a
//       few consecutive checks (we've reached the real top), or
//   (b) a safety cap on iterations/time is hit (we report truncated=true
//       rather than silently pretending we got everything).

export interface ScrollLoadResult {
  finalCount: number;
  truncated: boolean;
  reason?: string;
}

export interface ScrollLoadOptions {
  /** Returns how many message elements are currently in the DOM. */
  countMessages: () => number;
  /** Milliseconds to wait after each scroll before re-checking. */
  settleMs?: number;
  /** Consecutive stable checks (no growth, near top) before declaring done. */
  stableRoundsRequired?: number;
  /** Hard cap on scroll iterations, so a broken page can't loop forever. */
  maxIterations?: number;
  /** Hard cap on total wall-clock time. */
  maxTimeMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Scroll `container` to load its full history. If the container isn't
 * actually scrollable (e.g. the whole page scrolls instead), pass
 * `document.scrollingElement` as a fallback — this function handles both
 * Element and the document's scrolling element identically.
 */
export async function scrollToLoadAll(
  container: Element,
  opts: ScrollLoadOptions,
): Promise<ScrollLoadResult> {
  const {
    countMessages,
    settleMs = 350,
    stableRoundsRequired = 3,
    maxIterations = 500,
    maxTimeMs = 90_000,
  } = opts;

  const start = Date.now();
  let stableRounds = 0;
  let lastCount = countMessages();

  for (let i = 0; i < maxIterations; i++) {
    if (Date.now() - start > maxTimeMs) {
      return {
        finalCount: countMessages(),
        truncated: true,
        reason: `Stopped after ${Math.round(maxTimeMs / 1000)}s while still loading older messages — the conversation may be extremely long.`,
      };
    }

    const beforeScrollTop = container.scrollTop;
    container.scrollTop = 0; // scroll to top to trigger "load older" fetches
    // Some sites listen on the window/document scroll instead of the
    // container; nudge both to be safe.
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* not available in this environment (e.g. test runner) */
    }

    await sleep(settleMs);

    const afterScrollTop = container.scrollTop;
    const newCount = countMessages();
    const grew = newCount > lastCount;
    const nearTop = afterScrollTop <= 4;
    const scrollTopUnchanged = Math.abs(afterScrollTop - beforeScrollTop) < 2;

    if (grew) {
      lastCount = newCount;
      stableRounds = 0;
      continue;
    }

    if (nearTop && scrollTopUnchanged) {
      stableRounds++;
      if (stableRounds >= stableRoundsRequired) {
        return { finalCount: newCount, truncated: false };
      }
    } else {
      // Still moving but not growing count yet (e.g. a spinner is showing) —
      // keep trying without resetting the "near top" streak too aggressively.
      stableRounds = Math.max(0, stableRounds - 1);
    }
  }

  return {
    finalCount: countMessages(),
    truncated: true,
    reason: `Stopped after ${maxIterations} scroll attempts while still loading older messages.`,
  };
}
