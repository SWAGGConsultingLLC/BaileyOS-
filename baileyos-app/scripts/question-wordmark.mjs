import { crc32, deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const W = 1200;
const H = 627;
const GLYPH = {
  '3': ['01110', '00001', '00001', '01110', '00001', '00001', '01110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'G': ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

const scale = 16;
const gap = 10;
const text = '360 BREWING';
const textWidth = [...text].reduce((sum, ch) => sum + (ch === ' ' ? 3 : 5) * scale + gap, -gap);
const originX = Math.round((W - textWidth) / 2);
const originY = Math.round((H - 7 * scale) / 2) - 8;
const pixels = new Uint8Array(W * H * 3);
pixels.fill(11);
for (let i = 0; i < pixels.length; i += 3) {
  pixels[i + 1] = 13;
  pixels[i + 2] = 16;
}

function plot(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
}

function fillRect(x, y, w, h, color) {
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) plot(x + xx, y + yy, color[0], color[1], color[2]);
  }
}

const gold = [250, 204, 21];
let cursor = originX;
for (const ch of text) {
  const rows = GLYPH[ch];
  const cols = ch === ' ' ? 3 : 5;
  if (rows) {
    rows.forEach((row, y) => {
      [...row].forEach((bit, x) => {
        if (bit === '1') fillRect(cursor + x * scale, originY + y * scale, scale - 2, scale - 2, gold);
      });
    });
  }
  cursor += cols * scale + gap;
}

const ringX = originX + (3 * 5 + 2) * scale + gap * 2;
const ringY = originY - 6;
for (let y = 0; y < 28; y += 1) {
  for (let x = 0; x < 28; x += 1) {
    const dx = x - 13.5;
    const dy = y - 13.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 8 && d < 13) plot(ringX + x, ringY + y, gold[0], gold[1], gold[2]);
  }
}

fillRect(originX, originY + 7 * scale + 28, textWidth, 4, gold);

const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y += 1) {
  const start = y * (W * 3 + 1);
  raw[start] = 0;
  raw.set(pixels.subarray(y * W * 3, (y + 1) * W * 3), start + 1);
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../public/brew/question-001.png', import.meta.url), png);
console.log('wrote', png.length);