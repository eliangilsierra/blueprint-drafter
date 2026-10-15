// A minimal, independent reader of the TrueType tables that matter for plain advance widths (head, hhea, hmtx, cmap
// formats 4 and 12). It shares no code with fontkit, so a test that compares the two checks the measured widths
// against "the font tables" (T-AC-3) and not against the implementation under test.

import { readFileSync } from "node:fs";

export interface TableFont {
  readonly unitsPerEm: number;
  /** hhea ascender (font units, positive). */
  readonly ascender: number;
  /** hhea descender (font units, negative). */
  readonly descender: number;
  /** Glyph index of a code point, 0 when the font has no glyph for it. */
  glyphOf(codePoint: number): number;
  /** Advance of a glyph from hmtx, in font units. */
  advanceOfGlyph(glyph: number): number;
}

export function readTableFont(file: string): TableFont {
  const data = readFileSync(file);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tables = new Map<string, number>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    tables.set(data.toString("latin1", record, record + 4), view.getUint32(record + 8));
  }
  const table = (tag: string): number => {
    const offset = tables.get(tag);
    if (offset === undefined) {
      throw new Error(`table ${tag} not found`);
    }
    return offset;
  };

  const head = table("head");
  const hhea = table("hhea");
  const hmtx = table("hmtx");
  const unitsPerEm = view.getUint16(head + 18);
  const metricCount = view.getUint16(hhea + 34);

  const cmap = table("cmap");
  const subtables: { platform: number; encoding: number; offset: number }[] = [];
  for (let i = 0; i < view.getUint16(cmap + 2); i++) {
    const record = cmap + 4 + i * 8;
    subtables.push({
      platform: view.getUint16(record),
      encoding: view.getUint16(record + 2),
      offset: cmap + view.getUint32(record + 4),
    });
  }
  const unicodeFull = subtables.find((s) => s.platform === 3 && s.encoding === 10);
  const unicodeBmp = subtables.find((s) => s.platform === 3 && s.encoding === 1);

  const lookup12 = (offset: number, codePoint: number): number => {
    const groups = view.getUint32(offset + 12);
    for (let i = 0; i < groups; i++) {
      const group = offset + 16 + i * 12;
      const start = view.getUint32(group);
      const end = view.getUint32(group + 4);
      if (codePoint >= start && codePoint <= end) {
        return view.getUint32(group + 8) + (codePoint - start);
      }
    }
    return 0;
  };

  const lookup4 = (offset: number, codePoint: number): number => {
    if (codePoint > 0xffff) {
      return 0;
    }
    const segments = view.getUint16(offset + 6) / 2;
    const ends = offset + 14;
    const starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2;
    const rangeOffsets = deltas + segments * 2;
    for (let i = 0; i < segments; i++) {
      if (codePoint > view.getUint16(ends + i * 2)) {
        continue;
      }
      const start = view.getUint16(starts + i * 2);
      if (codePoint < start) {
        return 0;
      }
      const delta = view.getInt16(deltas + i * 2);
      const rangeOffset = view.getUint16(rangeOffsets + i * 2);
      if (rangeOffset === 0) {
        return (codePoint + delta) & 0xffff;
      }
      const address = rangeOffsets + i * 2 + rangeOffset + (codePoint - start) * 2;
      const glyph = view.getUint16(address);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };

  return {
    unitsPerEm,
    ascender: view.getInt16(hhea + 4),
    descender: view.getInt16(hhea + 6),
    glyphOf(codePoint) {
      if (unicodeFull !== undefined && view.getUint16(unicodeFull.offset) === 12) {
        const glyph = lookup12(unicodeFull.offset, codePoint);
        if (glyph !== 0) {
          return glyph;
        }
      }
      if (unicodeBmp !== undefined && view.getUint16(unicodeBmp.offset) === 4) {
        return lookup4(unicodeBmp.offset, codePoint);
      }
      return 0;
    },
    advanceOfGlyph(glyph) {
      const index = Math.min(glyph, metricCount - 1);
      return view.getUint16(hmtx + index * 4);
    },
  };
}

/** Sum of the hmtx advances of the code points of `text`, in font units: no kerning, no ligatures. */
export function plainAdvance(font: TableFont, text: string): number {
  let total = 0;
  for (const character of text) {
    total += font.advanceOfGlyph(font.glyphOf(character.codePointAt(0) ?? 0));
  }
  return total;
}
