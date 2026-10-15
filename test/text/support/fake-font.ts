// A fake font for the pure tests: fixed advances, so every width in a test can be computed by hand.

import type { FontFace, FontProvider, FontWeight } from "../../../src/core/text/fonts.js";

/** Units per em of the fake font: at size 10, one code point of the regular weight is 6 px wide. */
export const FAKE_UNITS_PER_EM = 1000;

/** Advance of one code point (font units) of each weight of the fake font. */
export const FAKE_ADVANCE: Readonly<Record<FontWeight, number>> = { regular: 600, semibold: 700 };

export interface FakeProvider extends FontProvider {
  /** Number of calls of `advance` so far: shows what the engine cached. */
  readonly calls: { count: number };
}

/** Every code point is `FAKE_ADVANCE[weight]` wide, except the ellipsis, which is 1.5 times a regular character. */
export function fakeProvider(): FakeProvider {
  const calls = { count: 0 };
  const faces = new Map<FontWeight, FontFace>();
  for (const weight of ["regular", "semibold"] as const) {
    faces.set(weight, {
      unitsPerEm: FAKE_UNITS_PER_EM,
      ascent: 800,
      descent: 200,
      advance(text) {
        calls.count += 1;
        let total = 0;
        for (const character of text) {
          total += character === "\u2026" ? FAKE_ADVANCE[weight] * 1.5 : FAKE_ADVANCE[weight];
        }
        return total;
      },
      hasGlyph: () => true,
    });
  }
  return {
    calls,
    face(weight) {
      const face = faces.get(weight);
      if (face === undefined) {
        throw new RangeError("unknown weight");
      }
      return face;
    },
  };
}
