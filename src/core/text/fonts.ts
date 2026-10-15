/**
 * Font loader: the only file of the text module (and, with `src/core/io`, one of the two places of the core) that
 * may read files (grant of #59 to this path, task #17). It reads the vendored IBM Plex Sans files under `fonts/`,
 * checks each against `fonts/SHA256SUMS` and hands them to fontkit. Nothing is written, nothing is downloaded and
 * there is no fallback font: a missing or modified file is an `E_INTERNAL` failure (architecture section 10),
 * because another font would change every measured width and break determinism (NFR-1).
 *
 * Importing this module has no side effect; the files are read when {@link loadBundledFonts} is called.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { create } from "fontkit";

/** The two weights of the bundled family; the names are those of `TextBlock.weight` in the model. */
export type FontWeight = "regular" | "semibold";

/** Font data the measurer needs. All values are in font units; `unitsPerEm` converts them to a size. */
export interface FontFace {
  readonly unitsPerEm: number;
  /** Distance from the baseline to the top of the line, positive. */
  readonly ascent: number;
  /** Distance from the baseline to the bottom of the line, positive. */
  readonly descent: number;
  /**
   * Advance width of `text` laid out as one run, with the kerning and ligatures of the font (the same layout that
   * the SVG and PNG renderers draw, architecture section 6.5). `""` is 0. A code point without a glyph gets the
   * advance of the font's missing-glyph box.
   */
  advance(text: string): number;
  /** `true` when the font has a glyph for the code point. */
  hasGlyph(codePoint: number): boolean;
}

/** Source of fonts; injectable so the rest of the module is pure and testable without files. */
export interface FontProvider {
  face(weight: FontWeight): FontFace;
}

/** The font could not be loaded or failed its integrity check. Maps to the diagnostic `E_INTERNAL`. */
export class FontLoadError extends Error {
  readonly code = "E_INTERNAL" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FontLoadError";
  }
}

/** Every weight of the bundled family, in a fixed order. */
export const FONT_WEIGHTS: readonly FontWeight[] = Object.freeze(["regular", "semibold"] as const);

/** File of each weight under `fonts/` (ADR-0005, architecture section 6.1). */
export const FONT_FILES: Readonly<Record<FontWeight, string>> = Object.freeze({
  regular: "IBMPlexSans-Regular.ttf",
  semibold: "IBMPlexSans-SemiBold.ttf",
});

/** Name of the checksum list that sits next to the fonts. */
export const CHECKSUM_FILE = "SHA256SUMS";

/** The vendored files are about 200 KB; a larger file is not one of them and is not read. */
const MAX_FONT_BYTES = 4 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 64 * 1024;

/** Levels above this file that are searched for the package `fonts/` directory. */
const MAX_LEVELS_UP = 6;

const HEX_SHA256 = /^[0-9a-f]{64}$/;

function fail(message: string, cause?: unknown): never {
  throw new FontLoadError(message, cause === undefined ? undefined : { cause });
}

/**
 * Directory `fonts/` of the package: the nearest ancestor of this file that holds `fonts/SHA256SUMS`. It is
 * `<package>/fonts` for the installed package (`dist/core/text/` is three levels down) and for a checkout compiled
 * to `dist-test/` (four levels down).
 */
export function findBundledFontsDirectory(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let level = 0; level <= MAX_LEVELS_UP; level++) {
    const candidate = join(directory, "fonts");
    if (existsSync(join(candidate, CHECKSUM_FILE))) {
      return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  return fail(`the bundled font directory with ${CHECKSUM_FILE} was not found; reinstall the package`);
}

function readBounded(file: string, name: string, limit: number): Buffer {
  try {
    if (statSync(file).size > limit) {
      return fail(`${name} is larger than ${String(limit)} bytes; reinstall the package`);
    }
    return readFileSync(file);
  } catch (error) {
    if (error instanceof FontLoadError) {
      throw error;
    }
    return fail(`${name} cannot be read; reinstall the package`, error);
  }
}

/**
 * Parses `SHA256SUMS` (the `sha256sum` format: 64 hex digits, a space, a space or `*`, the file name). A line in
 * another form, or a name listed twice, is an error: the list is part of the integrity check.
 */
export function parseChecksums(text: string): ReadonlyMap<string, string> {
  const sums = new Map<string, string>();
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line === "") {
      continue;
    }
    const digest = line.slice(0, 64);
    const separator = line.slice(64, 66);
    const name = line.slice(66);
    if (!HEX_SHA256.test(digest) || (separator !== "  " && separator !== " *") || name === "") {
      return fail(`${CHECKSUM_FILE} has a line that is not in sha256sum format`);
    }
    if (sums.has(name)) {
      return fail(`${CHECKSUM_FILE} lists ${name} twice`);
    }
    sums.set(name, digest);
  }
  return sums;
}

function toFace(bytes: Buffer, name: string): FontFace {
  try {
    const font = create(bytes);
    const { unitsPerEm } = font;
    if (!Number.isFinite(unitsPerEm) || unitsPerEm <= 0) {
      return fail(`${name} has no usable units per em`);
    }
    return {
      unitsPerEm,
      ascent: Math.abs(font.ascent),
      descent: Math.abs(font.descent),
      advance: (text) => (text === "" ? 0 : font.layout(text).advanceWidth),
      hasGlyph: (codePoint) => font.hasGlyphForCodePoint(codePoint),
    };
  } catch (error) {
    if (error instanceof FontLoadError) {
      throw error;
    }
    return fail(`${name} cannot be parsed as a font; reinstall the package`, error);
  }
}

/** Options of {@link loadBundledFonts}. */
export interface LoadFontsOptions {
  /** Directory that holds the font files and `SHA256SUMS`; the package `fonts/` directory when omitted. */
  directory?: string;
}

/**
 * Reads both weights, verifies the SHA-256 of each file against `SHA256SUMS` before parsing it, and returns a
 * provider over them. The bytes that were hashed are the bytes that are parsed.
 *
 * @throws FontLoadError (code `E_INTERNAL`) when a file or the list is missing, unreadable, listed wrongly,
 *   different from its checksum or not a font. Never falls back to another font.
 */
export function loadBundledFonts(options: LoadFontsOptions = {}): FontProvider {
  const directory = options.directory ?? findBundledFontsDirectory();
  const sums = parseChecksums(readBounded(join(directory, CHECKSUM_FILE), CHECKSUM_FILE, MAX_CHECKSUM_BYTES).toString("utf8"));
  const faces = new Map<FontWeight, FontFace>();
  for (const weight of FONT_WEIGHTS) {
    const name = FONT_FILES[weight];
    const expected = sums.get(name);
    if (expected === undefined) {
      return fail(`${CHECKSUM_FILE} does not list ${name}`);
    }
    const bytes = readBounded(join(directory, name), name, MAX_FONT_BYTES);
    if (createHash("sha256").update(bytes).digest("hex") !== expected) {
      return fail(`${name} does not match its SHA-256 in ${CHECKSUM_FILE}; reinstall the package`);
    }
    faces.set(weight, toFace(bytes, name));
  }
  return {
    face(weight) {
      const face = faces.get(weight);
      if (face === undefined) {
        throw new RangeError("unknown font weight");
      }
      return face;
    },
  };
}
