// Minimal ZIP archive writer with ZERO dependencies.
//
// Compression uses the native `CompressionStream('deflate-raw')` (available in
// Chrome). Where that API is unavailable (e.g. some test runtimes), entries are
// stored uncompressed so the archive is still valid.

import { makeBlob } from "../utils/bytes";

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("deflate-raw");
    const stream = makeBlob([data]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;
  push(u: Uint8Array): void {
    this.chunks.push(u);
    this.length += u.length;
  }
  u16(n: number): void {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]));
  }
  u32(n: number): void {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]));
  }
  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

/** Build a ZIP archive (returns a Blob). */
export async function createZip(entries: ZipEntry[]): Promise<Blob> {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const local = new ByteWriter();
  const central = new ByteWriter();
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.path);
    const crc = crc32(entry.data);
    const uncompressedSize = entry.data.length;
    let method = 0;
    let payload = entry.data;
    const deflated = await deflateRaw(entry.data);
    if (deflated && deflated.length < uncompressedSize) {
      method = 8;
      payload = deflated;
    }
    const compressedSize = payload.length;

    // Local file header.
    const localOffset = offset;
    local.u32(0x04034b50);
    local.u16(20); // version needed
    local.u16(0x0800); // UTF-8 filename flag
    local.u16(method);
    local.u16(time);
    local.u16(date);
    local.u32(crc);
    local.u32(compressedSize);
    local.u32(uncompressedSize);
    local.u16(nameBytes.length);
    local.u16(0); // extra len
    local.push(nameBytes);
    local.push(payload);
    offset = local.length;

    // Central directory record.
    central.u32(0x02014b50);
    central.u16(20); // version made by
    central.u16(20); // version needed
    central.u16(0x0800);
    central.u16(method);
    central.u16(time);
    central.u16(date);
    central.u32(crc);
    central.u32(compressedSize);
    central.u32(uncompressedSize);
    central.u16(nameBytes.length);
    central.u16(0); // extra len
    central.u16(0); // comment len
    central.u16(0); // disk number
    central.u16(0); // internal attrs
    central.u32(0); // external attrs
    central.u32(localOffset);
    central.push(nameBytes);
  }

  const centralBytes = central.concat();
  const localBytes = local.concat();
  const end = new ByteWriter();
  end.u32(0x06054b50);
  end.u16(0); // disk
  end.u16(0); // disk with central dir
  end.u16(entries.length);
  end.u16(entries.length);
  end.u32(centralBytes.length);
  end.u32(localBytes.length);
  end.u16(0); // comment len

  return makeBlob([localBytes, centralBytes, end.concat()], "application/zip");
}
