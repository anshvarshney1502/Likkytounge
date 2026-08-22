// Ordered, most-semantic-first candidate selectors for unknown chat UIs.
export const GENERIC_SELECTORS = {
  roleAttrs: ["data-message-author-role", "data-role", "data-author-role"],
  messageCandidates: [
    "[data-message-author-role]",
    "[data-role]",
    "[data-testid*='message']",
    "[class*='message-row']",
    "[class*='chat-message']",
    "[class*='message']",
    "main [class*='turn']",
    "article",
  ],
  userHints: ["user", "human", "you", "prompt", "question"],
  assistantHints: ["assistant", "bot", "ai", "model", "answer", "response", "gpt", "reply"],
  streaming: ["button[aria-label*='Stop']", "[data-is-streaming='true']", ".result-streaming"],
};
