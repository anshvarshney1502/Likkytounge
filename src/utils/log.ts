// Debug logger. Never logs message contents by default. Contents are only
// logged when the caller explicitly opts in AND debug mode is enabled.
let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export function debug(...args: unknown[]): void {
  if (debugEnabled) console.debug("[LocalChatVault]", ...args);
}

export function warn(...args: unknown[]): void {
  console.warn("[LocalChatVault]", ...args);
}

export function isDebug(): boolean {
  return debugEnabled;
}
