// Generates simple branded PNG icons using only Node's built-in zlib.
// No external image dependency: we hand-encode RGBA PNGs.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// Simple "vault" glyph: indigo rounded square with a lighter locked circle.
function pixel(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.28;
  const inner = size * 0.12;
  const dist = Math.hypot(x - cx, y - cy);
  // Background rounded square
  const pad = size * 0.06;
  const inField =
    x >= pad && x <= size - pad && y >= pad && y <= size - pad;
  if (!inField) return [0, 0, 0, 0];
  if (dist <= inner) return [0x4f, 0x46, 0xe5, 255]; // hub (indigo)
  if (dist <= r) return [0xe0, 0xe7, 0xff, 255]; // dial (light)
  return [0x4f, 0x46, 0xe5, 255]; // field (indigo)
}

function makePng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  const png = makePng(size);
  writeFileSync(join(outDir, `icon${size}.png`), png);
  console.log(`[icons] wrote icon${size}.png (${png.length} bytes)`);
}
