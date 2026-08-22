// Base64 <-> bytes helpers that work in browser, service worker, and jsdom.

export function base64ToBytes(b64: string): Uint8Array {
  // Strip a data: URL prefix if present.
  const comma = b64.indexOf(",");
  const raw = b64.startsWith("data:") && comma >= 0 ? b64.slice(comma + 1) : b64;
  if (typeof atob === "function") {
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback (tests).
  return new Uint8Array(Buffer.from(raw, "base64"));
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  return Buffer.from(bytes).toString("base64");
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Construct a Blob from byte/string parts. Wraps the cast needed because
 * TS 5.7+ types Uint8Array over ArrayBufferLike while Blob wants ArrayBuffer.
 */
export function makeBlob(parts: Array<Uint8Array | string | ArrayBuffer>, type?: string): Blob {
  return new Blob(parts as unknown as BlobPart[], type ? { type } : undefined);
}
