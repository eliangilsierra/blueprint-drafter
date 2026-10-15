/**
 * Text measurement, wrapping and elision with the metrics of the bundled font (FR-7, architecture section 6.5).
 *
 * Everything here is pure: the font comes from an injected {@link FontProvider}, the only state is a cache of
 * advance widths that never changes a result, and the same input gives the same lines and widths (NFR-1).
 *
 * Measuring: the width of a string is the advance that the font gives for the string laid out as one run, so the
 * kerning and ligatures of IBM Plex Sans count (`AV` is narrower than `A` plus `V`, `fi` is one glyph). The SVG and
 * PNG renderers draw the same run, so what is measured is what is drawn. The width of a line is measured on the
 * whole line, never as the sum of its words. Only code points are inspected (no locale, no grapheme segmentation,
 * architecture section 6.6): a split can fall inside an emoji sequence or between a base character and a combining
 * mark, which is a known limitation of splitting on character boundaries.
 *
 * Untrusted text: no regular expression runs on it, the input is cut to `MAX_TEXT_LENGTH`, and a wrap stops as
 * soon as one line more than allowed exists, so the work per call is bounded.
 */

import type { FontFace, FontProvider, FontWeight } from "./fonts.js";
import { ELLIPSIS, MAX_TEXT_LENGTH, isBreakSpace } from "./policy.js";

/** Result of {@link TextEngine.measure}, in pixels at the requested size. */
export interface TextMetrics {
  /** Advance width of the string laid out as one run. */
  width: number;
  /** Distance from the baseline to the top of the line (font ascent), positive. */
  ascent: number;
  /** Distance from the baseline to the bottom of the line (font descent), positive. */
  descent: number;
}

/** Result of {@link TextEngine.wrap}. */
export interface WrapResult {
  /** Lines in reading order, at most `maxLines`; white space runs between words are one space. Empty for blank text. */
  lines: string[];
  /** Measured width of each line in pixels, same length as `lines`. */
  widths: number[];
  /** `true` when text did not fit in `maxLines` (or was longer than `MAX_TEXT_LENGTH`): the last line ends with the ellipsis. */
  truncated: boolean;
  /** `true` when a line is wider than `maxWidth`, which happens only when one code point (or the ellipsis) is wider than the line. */
  overflow: boolean;
}

/** Result of {@link TextEngine.elide}. */
export interface ElideResult {
  /** The text itself when it fits, otherwise the longest prefix that fits together with the ellipsis. */
  text: string;
  /** Measured width of `text` in pixels. */
  width: number;
  /** `true` when `text` is shorter than the input and ends with the ellipsis. */
  truncated: boolean;
}

export interface TextEngine {
  /** Width, ascent and descent of `text` at `size` px. @throws RangeError for a bad size or text longer than `MAX_TEXT_LENGTH`. */
  measure(text: string, size: number, weight: FontWeight): TextMetrics;
  /**
   * Splits `text` on white space into lines no wider than `maxWidth` px (greedy, left to right), splits a word that
   * is wider than the line between code points, and elides what does not fit in `maxLines` lines.
   * @throws RangeError for a bad size, width or line count.
   */
  wrap(text: string, maxWidth: number, size: number, weight: FontWeight, maxLines: number): WrapResult;
  /** Shortens `text` (one line) to fit `maxWidth` px, ending with the ellipsis when it had to cut. @throws RangeError for a bad size or width. */
  elide(text: string, maxWidth: number, size: number, weight: FontWeight): ElideResult;
  /** Empties the advance cache; results do not change, only the time of the next calls. */
  clearCache(): void;
}

/** Entries kept per weight; when the cache is full it is emptied (a cache never changes a result). */
export const MAX_CACHE_ENTRIES = 8192;

function checkPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function checkWidth(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("maxWidth must be a finite number of 0 or more");
  }
}

/** Cuts the text to `MAX_TEXT_LENGTH` code units without splitting a surrogate pair. */
function bound(text: string): { text: string; cut: boolean } {
  if (text.length <= MAX_TEXT_LENGTH) {
    return { text, cut: false };
  }
  const last = text.charCodeAt(MAX_TEXT_LENGTH - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? MAX_TEXT_LENGTH - 1 : MAX_TEXT_LENGTH;
  return { text: text.slice(0, end), cut: true };
}

/** Words of the text: runs of code points between break spaces, in order. */
function splitWords(text: string): string[] {
  const words: string[] = [];
  let word = "";
  for (const character of text) {
    // for...of yields whole code points (a lone surrogate comes alone), so codePointAt(0) is always defined.
    if (isBreakSpace(character.codePointAt(0) ?? 0)) {
      if (word !== "") {
        words.push(word);
        word = "";
      }
    } else {
      word += character;
    }
  }
  if (word !== "") {
    words.push(word);
  }
  return words;
}

function trimBreakSpaceEnd(text: string): string {
  let end = text.length;
  while (end > 0 && isBreakSpace(text.charCodeAt(end - 1))) {
    end--;
  }
  return text.slice(0, end);
}

/**
 * Largest `k` in `[0, n)` for which `fits(k)` holds, given that `fits(n)` does not; 0 when none does. Every
 * returned `k > 0` was checked, so the answer is right even if widths were not monotonic in `k`. It doubles the
 * probe first, so the strings measured stay close to the answer instead of as long as the input.
 */
function largestFitting(n: number, fits: (count: number) => boolean): number {
  let low = 0;
  let high = n;
  for (let probe = 1; probe < high; probe *= 2) {
    if (fits(probe)) {
      low = probe;
    } else {
      high = probe;
      break;
    }
  }
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (fits(middle)) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
}

export function createTextEngine(provider: FontProvider): TextEngine {
  const caches = new Map<FontWeight, Map<string, number>>();

  function advance(face: FontFace, weight: FontWeight, text: string): number {
    let cache = caches.get(weight);
    if (cache === undefined) {
      cache = new Map();
      caches.set(weight, cache);
    }
    const known = cache.get(text);
    if (known !== undefined) {
      return known;
    }
    const units = face.advance(text);
    if (cache.size >= MAX_CACHE_ENTRIES) {
      cache.clear();
    }
    cache.set(text, units);
    return units;
  }

  /** A measurer of one font, size and weight: width in px of a string. */
  function widthOf(face: FontFace, weight: FontWeight, size: number): (text: string) => number {
    return (text) => (advance(face, weight, text) * size) / face.unitsPerEm;
  }

  /** `line` followed by the ellipsis, shortened by code points until the whole fits; the ellipsis alone if need be. */
  function withEllipsis(line: string, maxWidth: number, width: (text: string) => number): string {
    const whole = trimBreakSpaceEnd(line) + ELLIPSIS;
    if (width(whole) <= maxWidth) {
      return whole;
    }
    const characters = Array.from(line);
    const keep = largestFitting(characters.length, (count) => {
      return width(trimBreakSpaceEnd(characters.slice(0, count).join("")) + ELLIPSIS) <= maxWidth;
    });
    return trimBreakSpaceEnd(characters.slice(0, keep).join("")) + ELLIPSIS;
  }

  return {
    measure(text, size, weight) {
      checkPositive("size", size);
      if (text.length > MAX_TEXT_LENGTH) {
        throw new RangeError(`text is longer than ${String(MAX_TEXT_LENGTH)} code units`);
      }
      const face = provider.face(weight);
      return {
        width: widthOf(face, weight, size)(text),
        ascent: (face.ascent * size) / face.unitsPerEm,
        descent: (face.descent * size) / face.unitsPerEm,
      };
    },

    wrap(text, maxWidth, size, weight, maxLines) {
      checkPositive("size", size);
      checkWidth(maxWidth);
      if (!Number.isInteger(maxLines) || maxLines < 1) {
        throw new RangeError("maxLines must be an integer of 1 or more");
      }
      const width = widthOf(provider.face(weight), weight, size);
      const fits = (candidate: string): boolean => width(candidate) <= maxWidth;
      const bounded = bound(text);

      // One line more than allowed is enough to know that text was dropped.
      const limit = maxLines + 1;
      const lines: string[] = [];
      let current = "";
      collect: for (const word of splitWords(bounded.text)) {
        const candidate = current === "" ? word : `${current} ${word}`;
        if (fits(candidate)) {
          current = candidate;
          continue;
        }
        if (current !== "") {
          lines.push(current);
          current = "";
          if (lines.length >= limit) {
            break;
          }
        }
        let rest = word;
        while (!fits(rest)) {
          const characters = Array.from(rest);
          if (characters.length <= 1) {
            break; // one code point wider than the line: it stays alone on its line and `overflow` reports it
          }
          const count = Math.max(1, largestFitting(characters.length, (n) => fits(characters.slice(0, n).join(""))));
          lines.push(characters.slice(0, count).join(""));
          if (lines.length >= limit) {
            break collect;
          }
          rest = characters.slice(count).join("");
        }
        current = rest;
      }
      if (current !== "" && lines.length < limit) {
        lines.push(current);
      }

      const kept = lines.slice(0, maxLines);
      const truncated = kept.length > 0 && (bounded.cut || lines.length > maxLines);
      if (truncated) {
        const last = kept.length - 1;
        kept[last] = withEllipsis(kept[last] ?? "", maxWidth, width);
      }
      const widths = kept.map(width);
      return { lines: kept, widths, truncated, overflow: widths.some((w) => w > maxWidth) };
    },

    elide(text, maxWidth, size, weight) {
      checkPositive("size", size);
      checkWidth(maxWidth);
      const width = widthOf(provider.face(weight), weight, size);
      const bounded = bound(text);
      if (!bounded.cut && width(bounded.text) <= maxWidth) {
        return { text: bounded.text, width: width(bounded.text), truncated: false };
      }
      const elided = withEllipsis(bounded.text, maxWidth, width);
      return { text: elided, width: width(elided), truncated: true };
    },

    clearCache() {
      caches.clear();
    },
  };
}
