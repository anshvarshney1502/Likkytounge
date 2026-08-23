// Prepare public/pikachu.png from a source render.
//
// The source art ships with a *painted* checkerboard "transparency" pattern
// (the alpha channel is fully opaque), so it has to be keyed out before the
// image can sit on top of an arbitrary web page. A naive global colour
// replace would also punch holes in Pikachu's white eye highlights, so this
// instead flood-fills inward from the image border: only checkerboard-
// coloured pixels that are actually *connected to the edge* become
// transparent, leaving interior highlights untouched.
//
// Dependency-free on purpose (matches the rest of the project): PNG decode
// and encode are done here with node:zlib only.
import { inflateSync, deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

// ------------------------------------------------------------- decoding --
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

  // Undo per-scanline filtering (PNG spec §9).
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

  // Normalise everything to RGBA.
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

// ------------------------------------------------------------- encoding --
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
    raw[p++] = 0; // filter: none
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

// ------------------------------------------------------- checkerboard -- //
/** Light and near-neutral => part of the painted checkerboard backdrop. */
function isBackdrop(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return min > 180 && max - min < 18;
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

/**
 * The source art rests Pikachu on a full-width dark "ledge" bar. Floating on
 * a real web page that reads as a stray black line, so clear it: scan rows
 * from the bottom up and drop any row that is mostly dark opaque pixels,
 * stopping as soon as a row is not bar-like (Pikachu's dark eyes never span
 * anywhere near a majority of the width, so they are safe).
 */
function trimBottomBar(width, height, rgba) {
  // The ledge is the one element that runs edge to edge; the character
  // itself never covers more than ~2/3 of the canvas width. Spanning
  // essentially the full width is therefore an unambiguous signal, and
  // unlike a brightness test it is unaffected by the bar's soft,
  // anti-aliased top and bottom edges.
  let trimmed = 0;
  for (let y = 0; y < height; y++) {
    let opaque = 0, neutral = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] > 8) {
        opaque++;
        const max = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]);
        const min = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
        if (max - min < 40) neutral++;
      }
    }
    if (opaque === 0) continue;
    const spansCanvas = opaque >= width * 0.9;
    // The bar's soft top/bottom edges are narrower than the bar itself but
    // still wide and, crucially, grey. Pikachu's widest rows are saturated
    // yellow, so "wide AND colourless" only ever matches ledge remnants.
    // Measured on this art: ledge remnant rows score 0.78–1.00 "neutral"
    // while Pikachu's widest rows score ~0.004, so these cutoffs sit in a
    // very wide gap rather than being finely tuned.
    const wideAndColourless = opaque >= width * 0.4 && neutral / opaque >= 0.75;
    if (!spansCanvas && !wideAndColourless) continue;
    for (let x = 0; x < width; x++) rgba[(y * width + x) * 4 + 3] = 0;
    trimmed++;
  }
  console.log(`[pikachu] trimmed ${trimmed} ledge row(s)`);
}

function alphaBBox(width, height, rgba, pad = 8) {
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
function resize(sw, sh, rgba, dw) {
  const dh = Math.max(1, Math.round((sh / sw) * dw));
  const out = Buffer.alloc(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor(dy * yr), y1 = Math.max(y0 + 1, Math.floor((dy + 1) * yr));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor(dx * xr), x1 = Math.max(x0 + 1, Math.floor((dx + 1) * xr));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1 && y < sh; y++) {
        for (let x = x0; x < x1 && x < sw; x++) {
          const i = (y * sw + x) * 4, al = rgba[i + 3] / 255;
          r += rgba[i] * al; g += rgba[i + 1] * al; b += rgba[i + 2] * al; a += rgba[i + 3];
          n++;
        }
      }
      const o = (dy * dw + dx) * 4, av = a / n;
      const un = av > 0 ? 255 / av : 0;
      out[o] = Math.min(255, Math.round((r / n) * un));
      out[o + 1] = Math.min(255, Math.round((g / n) * un));
      out[o + 2] = Math.min(255, Math.round((b / n) * un));
      out[o + 3] = Math.round(av);
    }
  }
  return { width: dw, height: dh, rgba: out };
}

// ----------------------------------------------------------------- main --
const [, , inPath, outPath, widthArg] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node scripts/make-pikachu.mjs <source.png> <out.png> [width]");
  process.exit(1);
}
const targetWidth = Number(widthArg || 440);

const src = decodePng(readFileSync(inPath));
console.log(`[pikachu] source ${src.width}x${src.height}`);
keyOutBorderBackdrop(src.width, src.height, src.rgba);
trimBottomBar(src.width, src.height, src.rgba);
const box = alphaBBox(src.width, src.height, src.rgba);
console.log(`[pikachu] content bbox ${box.w}x${box.h} at ${box.x},${box.y}`);
const cropped = crop(src.width, src.height, src.rgba, box);
const small = resize(box.w, box.h, cropped, targetWidth);
writeFileSync(outPath, encodePng(small.width, small.height, small.rgba));
console.log(`[pikachu] wrote ${outPath} ${small.width}x${small.height}`);
