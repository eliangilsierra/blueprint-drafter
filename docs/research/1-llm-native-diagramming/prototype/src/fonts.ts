// Medición tipográfica real: la misma fuente se usa para medir, para renderizar a PNG
// y (opcionalmente) se incrusta en el SVG. Así "lo medido" == "lo dibujado".
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const plexDir = path.join(root, 'node_modules', '@ibm', 'plex-sans', 'fonts', 'complete');
const cacheDir = path.join(root, 'fonts');

export type Weight = 400 | 600;
const FILES: Record<Weight, string> = { 400: 'IBMPlexSans-Regular', 600: 'IBMPlexSans-SemiBold' };
export const FONT_FAMILY = 'IBM Plex Sans';

/** Convierte WOFF 1.0 a TTF (sfnt) sin dependencias: descomprime cada tabla con zlib. */
export function woffToTtf(woff: Buffer): Buffer {
  if (woff.toString('ascii', 0, 4) !== 'wOFF') throw new Error('not a WOFF file');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables: { tag: string; data: Buffer; checksum: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = woff.toString('ascii', o, o + 4);
    const offset = woff.readUInt32BE(o + 4);
    const compLength = woff.readUInt32BE(o + 8);
    const origLength = woff.readUInt32BE(o + 12);
    const checksum = woff.readUInt32BE(o + 16);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? zlib.inflateSync(raw) : Buffer.from(raw);
    tables.push({ tag, data, checksum });
  }
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  let entrySelector = 0;
  while (1 << (entrySelector + 1) <= numTables) entrySelector++;
  const searchRange = (1 << entrySelector) * 16;
  const headerLen = 12 + numTables * 16;
  let size = headerLen;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = Buffer.alloc(size);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(numTables * 16 - searchRange, 10);
  let off = headerLen;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    out.write(t.tag, r, 4, 'ascii');
    out.writeUInt32BE(t.checksum, r + 4);
    out.writeUInt32BE(off, r + 8);
    out.writeUInt32BE(t.data.length, r + 12);
    t.data.copy(out, off);
    off += (t.data.length + 3) & ~3;
  });
  return out;
}

/** Devuelve rutas TTF (generadas una vez y cacheadas en ./fonts). */
export function ttfPaths(): string[] {
  fs.mkdirSync(cacheDir, { recursive: true });
  return (Object.keys(FILES) as unknown as Weight[]).map((w) => {
    const name = FILES[w];
    const ttf = path.join(cacheDir, name + '.ttf');
    if (!fs.existsSync(ttf)) {
      fs.writeFileSync(ttf, woffToTtf(fs.readFileSync(path.join(plexDir, 'woff', name + '.woff'))));
    }
    return ttf;
  });
}

export function woff2Base64(w: Weight): string {
  return fs.readFileSync(path.join(plexDir, 'woff2', FILES[w] + '.woff2')).toString('base64');
}

const fonts = new Map<Weight, any>();
function font(w: Weight) {
  let f = fonts.get(w);
  if (!f) {
    f = fontkit.openSync(path.join(plexDir, 'woff', FILES[w] + '.woff'));
    fonts.set(w, f);
  }
  return f;
}

const widthCache = new Map<string, number>();
/** Ancho real (px) de un texto con kerning, usando las métricas de la fuente. */
export function textWidth(text: string, size: number, weight: Weight = 400): number {
  const key = weight + '|' + text;
  let units = widthCache.get(key);
  if (units === undefined) {
    const f = font(weight);
    units = f.layout(text).advanceWidth / f.unitsPerEm;
    widthCache.set(key, units);
  }
  return units * size;
}

export type TextStyle = { size: number; weight: Weight; lineHeight: number };

/** Ajuste de línea codicioso con medición real; parte palabras más largas que maxWidth. */
export function wrap(text: string, style: TextStyle, maxWidth: number, maxLines = 6): { lines: string[]; width: number; truncated: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  const fits = (s: string) => textWidth(s, style.size, style.weight) <= maxWidth;
  for (let word of words) {
    const candidate = cur ? cur + ' ' + word : word;
    if (fits(candidate)) { cur = candidate; continue; }
    if (cur) lines.push(cur);
    cur = '';
    // palabra más larga que la línea: partir por caracteres con guion
    while (!fits(word)) {
      let i = word.length - 1;
      while (i > 1 && !fits(word.slice(0, i) + '-')) i--;
      lines.push(word.slice(0, i) + '-');
      word = word.slice(i);
    }
    cur = word;
  }
  if (cur) lines.push(cur);
  let truncated = false;
  if (lines.length > maxLines) {
    truncated = true;
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last.length > 1 && !fits(last + '…')) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  const width = Math.max(0, ...lines.map((l) => textWidth(l, style.size, style.weight)));
  return { lines, width, truncated };
}
