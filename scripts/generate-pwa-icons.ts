import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Pure Node RGBA PNG encoder with anti-aliased UniLink Indigo + Emerald emblem
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))]);
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function renderUniLinkIcon(size: number, maskable: boolean): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const scale = maskable ? 0.72 : 1.0;
  const cx = 0.5;
  const cy = 0.5;

  const blend = (base: [number, number, number], fg: [number, number, number], alpha: number): [number, number, number] => [
    Math.round(base[0] * (1 - alpha) + fg[0] * alpha),
    Math.round(base[1] * (1 - alpha) + fg[1] * alpha),
    Math.round(base[2] * (1 - alpha) + fg[2] * alpha),
  ];

  const indigo: [number, number, number] = [79, 70, 229]; // #4F46E5
  const indigoDeep: [number, number, number] = [67, 56, 202]; // #4338CA
  const white: [number, number, number] = [255, 255, 255];
  const emerald: [number, number, number] = [16, 185, 129]; // #10B981

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;

      // Subtle top-left to bottom-right indigo gradient
      const g = (nx + ny) * 0.5;
      let rgb: [number, number, number] = [
        Math.round(indigo[0] * (1 - g * 0.3) + indigoDeep[0] * (g * 0.3)),
        Math.round(indigo[1] * (1 - g * 0.3) + indigoDeep[1] * (g * 0.3)),
        Math.round(indigo[2] * (1 - g * 0.3) + indigoDeep[2] * (g * 0.3)),
      ];

      // Map into normalized symbol space
      const sx = (nx - cx) / scale + 0.5;
      const sy = (ny - cy) / scale + 0.5;

      // U-shape geometry: left vertical (0.33, 0.31 -> 0.53), bottom arc center (0.5, 0.53, r=0.17), right vertical (0.67, 0.53 -> 0.31)
      const strokeHalf = 0.045;
      const aa = 1.5 / size;
      const dLeft = distToSegment(sx, sy, 0.33, 0.30, 0.33, 0.54);
      const dRight = distToSegment(sx, sy, 0.67, 0.54, 0.67, 0.30);
      let dArc = 1.0;
      if (sy >= 0.54) {
        dArc = Math.abs(Math.hypot(sx - 0.5, sy - 0.54) - 0.17);
      } else {
        dArc = Math.min(Math.hypot(sx - 0.33, sy - 0.54), Math.hypot(sx - 0.67, sy - 0.54));
      }
      const dU = Math.min(dLeft, dRight, dArc);
      if (dU < strokeHalf + aa) {
        const a = Math.max(0, Math.min(1, (strokeHalf + aa - dU) / aa));
        rgb = blend(rgb, white, a);
      }

      // Emerald link dot at top-right of U
      const dotR = 0.055;
      const dDot = Math.hypot(sx - 0.67, sy - 0.30);
      if (dDot < dotR + aa) {
        const a = Math.max(0, Math.min(1, (dotR + aa - dDot) / aa));
        rgb = blend(rgb, emerald, a);
      }

      const idx = (y * size + x) * 4;
      rgba[idx] = rgb[0];
      rgba[idx + 1] = rgb[1];
      rgba[idx + 2] = rgb[2];
      rgba[idx + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), renderUniLinkIcon(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), renderUniLinkIcon(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), renderUniLinkIcon(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderUniLinkIcon(180, false));
console.log('Generated UniLink PWA icons in public/');
