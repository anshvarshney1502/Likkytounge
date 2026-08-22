// Small byte helpers used by import/export.
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function makeBlob(
  parts: Array<Uint8Array | string | ArrayBuffer>,
  type?: string,
): Blob {
  return new Blob(parts as unknown as BlobPart[], type ? { type } : undefined);
}
