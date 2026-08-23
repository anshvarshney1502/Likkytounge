export const APP_NAME = "Context-Bolt";
export const APP_TAGLINE = "Capture any AI conversation, carry it anywhere, in one click.";
export const APP_VERSION = "1.0.0";
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
