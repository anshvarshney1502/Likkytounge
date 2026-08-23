// Generates the extension's icon set (16/32/48/128) from the Context-Bolt
// lightning-bolt source art. Dependency-free: PNG decode/encode via
// node:zlib only, matching make-pikachu.mjs.
//
// The source JPEG has a flat white background (no alpha), so it is first
// converted to PNG with `sips` (macOS built-in) and checked into
// public/source-art/. This script keys the white out via a border
// flood-fill, crops to the bolt's bounding box, and box-filter downscales
// to each icon size in premultiplied alpha.
import { inflateSync, deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = join(root, "public", "source-art", "bolt-logo-source.png");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("not a PNG");
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  let palette = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG not supported");
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r, g, b, a = 255;
    if (colorType === 6) { r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3]; }
    else if (colorType === 2) { r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; }
    else if (colorType === 0) { r = g = b = out[i]; }
    else if (colorType === 4) { r = g = b = out[i * 2]; a = out[i * 2 + 1]; }
    else { const idx = out[i]; r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2]; if (trns && idx < trns.length) a = trns[idx]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width, height, rgba };
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return ~c >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0;
    rgba.copy(raw, p, y * width * 4, (y + 1) * width * 4);
    p += width * 4;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Near-white => flat JPEG background, not part of the bolt art. */
function isBackdrop(r, g, b) {
  return r > 235 && g > 235 && b > 235;
}

function keyOutBorderBackdrop(width, height, rgba) {
  const seen = new Uint8Array(width * height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i]) return;
    seen[i] = 1;
    if (!isBackdrop(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])) return;
    rgba[i * 4 + 3] = 0;
    stack.push(i);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width, y = (i / width) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
}

function alphaBBox(width, height, rgba, pad = 6) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("image is fully transparent after keying");
  return {
    x: Math.max(0, minX - pad), y: Math.max(0, minY - pad),
    w: Math.min(width, maxX + pad + 1) - Math.max(0, minX - pad),
    h: Math.min(height, maxY + pad + 1) - Math.max(0, minY - pad),
  };
}

function crop(width, height, rgba, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = ((box.y + y) * width + box.x) * 4;
    rgba.copy(out, y * box.w * 4, src, src + box.w * 4);
  }
  return out;
}

/** Box-filter downscale in premultiplied alpha (avoids dark fringing). */
function resizeSquare(sw, sh, rgba, size) {
  // Pad to a square canvas (centred) first so all icon sizes share the
  // same composition instead of stretching the bolt's aspect ratio.
  const side = Math.max(sw, sh);
  const padded = Buffer.alloc(side * side * 4);
  const ox = Math.floor((side - sw) / 2), oy = Math.floor((side - sh) / 2);
  for (let y = 0; y < sh; y++) {
    rgba.copy(padded, ((oy + y) * side + ox) * 4, y * sw * 4, (y + 1) * sw * 4);
  }
  const out = Buffer.alloc(size * size * 4);
  const ratio = side / size;
  for (let dy = 0; dy < size; dy++) {
    const y0 = Math.floor(dy * ratio), y1 = Math.max(y0 + 1, Math.floor((dy + 1) * ratio));
    for (let dx = 0; dx < size; dx++) {
      const x0 = Math.floor(dx * ratio), x1 = Math.max(x0 + 1, Math.floor((dx + 1) * ratio));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1 && y < side; y++) {
        for (let x = x0; x < x1 && x < side; x++) {
          const i = (y * side + x) * 4, al = padded[i + 3] / 255;
          r += padded[i] * al; g += padded[i + 1] * al; b += padded[i + 2] * al; a += padded[i + 3];
          n++;
        }
      }
      const o = (dy * size + dx) * 4, av = n ? a / n : 0;
      const un = av > 0 ? 255 / av : 0;
      out[o] = Math.min(255, Math.round((r / n) * un));
      out[o + 1] = Math.min(255, Math.round((g / n) * un));
      out[o + 2] = Math.min(255, Math.round((b / n) * un));
      out[o + 3] = Math.round(av);
    }
  }
  return out;
}

const src = decodePng(readFileSync(srcPath));
console.log(`[icons] source ${src.width}x${src.height}`);
keyOutBorderBackdrop(src.width, src.height, src.rgba);
const box = alphaBBox(src.width, src.height, src.rgba);
console.log(`[icons] content bbox ${box.w}x${box.h} at ${box.x},${box.y}`);
const cropped = crop(src.width, src.height, src.rgba, box);

for (const size of [16, 32, 48, 128]) {
  const rgba = resizeSquare(box.w, box.h, cropped, size);
  const png = encodePng(size, size, rgba);
  writeFileSync(join(outDir, `icon${size}.png`), png);
  console.log(`[icons] wrote icon${size}.png (${png.length} bytes)`);
}
