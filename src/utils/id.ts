// Small, dependency-free id + hashing helpers.

/** Deterministic 32-bit FNV-1a hash, returned as base36 for compact ids. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Random opaque id (not cryptographically strong; used for snapshot ids). */
export function randomId(prefix = ""): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${rnd}` : rnd;
}

/**
 * Derive a stable conversation id. Prefers a platform-provided id (e.g. from
 * the URL). Falls back to hashing url + title so re-saving the same chat maps
 * to the same record instead of creating duplicates.
 */
export function deriveConversationId(
  platformId: string,
  platformConversationId: string | null,
  url: string,
  title: string,
): string {
  if (platformConversationId) return `${platformId}:${platformConversationId}`;
  return `${platformId}:${hashString(url + "\n" + title)}`;
}
