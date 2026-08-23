export const APP_NAME = "Likky Tounge";
export const APP_TAGLINE = "Pikachu remembers your conversation, and carries it to any other AI chat.";
export const APP_VERSION = "0.5.2";
export const APP_REPO = "https://github.com/anshvarshney1502/Likkytounge";
export const SUPPORTED_HOST_MATCHES = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  "https://chat.deepseek.com/*",
];
export const SUPPORTED_HOSTS: Array<{ id: string; label: string; hostMatch: RegExp }> = [
  { id: "chatgpt", label: "ChatGPT", hostMatch: /^(chatgpt|chat\.openai)\.com$/ },
  { id: "claude", label: "Claude", hostMatch: /^claude\.ai$/ },
  { id: "gemini", label: "Gemini", hostMatch: /^gemini\.google\.com$/ },
  { id: "deepseek", label: "DeepSeek", hostMatch: /^chat\.deepseek\.com$/ },
];
