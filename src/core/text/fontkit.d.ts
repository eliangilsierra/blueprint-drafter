// Minimal type declaration for the part of fontkit 2.0.4 that the font loader uses: the package ships no types and
// `@types/fontkit` is not a dependency. Only the loader (fonts.ts) imports fontkit; no fontkit type leaks into the
// public surface of the text module.

declare module "fontkit" {
  /** Result of laying out a string as one run: kerning and ligatures are applied. */
  export interface GlyphRun {
    /** Sum of the glyph advances of the run, in font units. */
    readonly advanceWidth: number;
  }

  export interface Font {
    readonly unitsPerEm: number;
    /** Distance from the baseline to the top of the line, in font units (positive). */
    readonly ascent: number;
    /** Signed distance from the baseline to the bottom of the line, in font units (negative below the baseline). */
    readonly descent: number;
    layout(text: string): GlyphRun;
    hasGlyphForCodePoint(codePoint: number): boolean;
  }

  /** Parses font bytes; throws on malformed data. TrueType collections are not used by this project. */
  export function create(buffer: Uint8Array): Font;
}
