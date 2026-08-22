// Shared DOM helpers for adapters. Deliberately generic: adapters should lean
// on semantics (roles, aria, data-* attributes) before brittle class selectors.

export function qsa<T extends Element = Element>(root: ParentNode, sel: string): T[] {
  return Array.from(root.querySelectorAll<T>(sel));
}

/** First selector that yields at least one node wins; returns those nodes. */
export function firstMatching<T extends Element = Element>(
  root: ParentNode,
  selectors: string[],
): T[] {
  for (const sel of selectors) {
    const found = qsa<T>(root, sel);
    if (found.length) return found;
  }
  return [];
}

export function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Try several attributes on an element, returning the first non-empty value. */
export function attr(el: Element | null, ...names: string[]): string | null {
  if (!el) return null;
  for (const n of names) {
    const v = el.getAttribute(n);
    if (v) return v;
  }
  return null;
}

/** Parse a variety of timestamp representations into an ISO string. */
export function parseTimestamp(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Epoch seconds or millis.
  if (/^\d{10,13}$/.test(trimmed)) {
    const n = Number(trimmed);
    const ms = trimmed.length <= 10 ? n * 1000 : n;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Absolute URL resolution against a base, tolerant of bad input. */
export function absoluteUrl(url: string | null | undefined, base: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, base).href;
  } catch {
    return undefined;
  }
}

/** Best-effort filename from a URL or content-disposition-like string. */
export function filenameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{1,8}$/i.test(last)) return decodeURIComponent(last);
    if (last) return decodeURIComponent(last);
  } catch {
    /* ignore */
  }
  return fallback;
}
