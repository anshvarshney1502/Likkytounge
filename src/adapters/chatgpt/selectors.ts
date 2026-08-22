// ChatGPT selectors, ordered from most-semantic to most-fragile. The parser
// tries each in turn so a single DOM tweak upstream does not break extraction.

export const CHATGPT_SELECTORS = {
  hosts: ["chatgpt.com", "chat.openai.com"],
  roleAttr: "data-message-author-role",
  idAttr: "data-message-id",
  messages: [
    "[data-message-author-role]",
    "[data-testid^='conversation-turn'] [data-message-author-role]",
  ],
  // Content container inside a message element.
  content: [".markdown", ".whitespace-pre-wrap", "[data-message-content]"],
  streaming: [".result-streaming", "button[data-testid='stop-button']", "button[aria-label*='Stop']"],
  title: ["h1", "title"],
  // Explicit file attachments (not inline images).
  attachmentLinks: ["a[download]", "a[href*='/backend-api/'][href*='download']"],
};
