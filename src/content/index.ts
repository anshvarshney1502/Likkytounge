import { boot, openMenuFromOutside } from "./overlay";

declare global {
  interface Window { __likkyContentLoaded?: boolean }
}

if (!window.__likkyContentLoaded) {
  window.__likkyContentLoaded = true;

  // Boot after DOM is ready-ish. Sites often SPA-navigate, so also boot on
  // subsequent history changes if the launcher gets removed.
  const bootIfNeeded = () => {
    if (!document.getElementById("likky-tounge-host")) void boot();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootIfNeeded, { once: true });
  } else {
    void boot();
  }
  // Re-attach the launcher after SPA navigations that wipe the DOM.
  new MutationObserver(() => bootIfNeeded()).observe(document.documentElement, {
    childList: true, subtree: false,
  });

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg?.type === "OPEN_PICKER") {
      openMenuFromOutside();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });
}
