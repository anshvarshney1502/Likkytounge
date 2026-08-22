export const CLAUDE_SELECTORS = {
  hosts: ["claude.ai"],
  user: ["[data-testid='user-message']", "div[data-testid='user-message']"],
  assistant: [".font-claude-message", "[data-testid='assistant-message']"],
  content: [".prose"],
  streaming: ["button[aria-label*='Stop']", "[data-testid='stop-button']", "[data-is-streaming='true']"],
  attachmentLinks: ["a[download]", "a[href*='/api/'][download]"],
};
