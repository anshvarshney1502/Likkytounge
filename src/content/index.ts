import type { ContentRequest, ExtractResponse, DetectResponse } from "../shared/messages";
import { detect, extract } from "./extractor";
import { setDebug } from "../utils/log";

// Guard against double-registration when the script is both declared in the
// manifest and injected programmatically as a fallback.
declare global {
  interface Window {
    __lcvContentLoaded?: boolean;
  }
}

// The content script is intentionally passive: it never observes or transmits
// anything on its own. It only responds to explicit requests from the
// extension's own background/popup.
if (!window.__lcvContentLoaded) {
  window.__lcvContentLoaded = true;
  chrome.runtime.onMessage.addListener(
  (message: ContentRequest, _sender, sendResponse: (r: ExtractResponse | DetectResponse) => void) => {
    if (message?.type === "DETECT_PLATFORM") {
      sendResponse(detect(document, location.href));
      return false; // synchronous
    }
    if (message?.type === "EXTRACT_CONVERSATION") {
      setDebug(false);
      extract(document, location.href, {
        saveAttachments: message.saveAttachments,
        maxAttachmentBytes: message.maxAttachmentBytes,
      })
        .then((result) => sendResponse(result))
        .catch((err) =>
          sendResponse({
            success: false,
            platform: "unknown",
            reason: err instanceof Error ? err.message : "Extraction failed",
          }),
        );
      return true; // async response
    }
    return false;
    },
  );
}
