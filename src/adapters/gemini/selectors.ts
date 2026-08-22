export const GEMINI_SELECTORS = {
  hosts: ["gemini.google.com"],
  user: ["user-query", ".query-content", ".user-query-container"],
  assistant: ["model-response", "message-content.model-response-text", ".response-container"],
  content: [".markdown", ".query-text", "message-content", ".model-response-text"],
  streaming: ["button[aria-label*='Stop']", ".stop-icon", "[data-is-streaming='true']"],
  attachmentLinks: ["a[download]"],
};
