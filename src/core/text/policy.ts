/**
 * Assumed defaults of the text module that the architecture does not fix (architecture section 6.5 gives only the
 * line limits and the ellipsis). They live in one file so that a decision of #56 changes this file and its tests.
 *
 * Open question: #56. Every value below is an assumed default of task #17, not a decision.
 */

/** The elision character: U+2026 HORIZONTAL ELLIPSIS, one glyph of IBM Plex Sans (a test checks it). */
export const ELLIPSIS = "\u2026";

/** Names wrap to at most 3 lines (FR-7, architecture section 6.5). */
export const MAX_NAME_LINES = 3;

/** Descriptions wrap to at most 4 lines (FR-7, architecture section 6.5). */
export const MAX_DESCRIPTION_LINES = 4;

/**
 * Longest text, in UTF-16 code units, that the module processes. `wrap` and `elide` cut longer input to this length
 * (at a code point boundary) and report truncation; `measure` rejects it. The input limits of the `limits` module
 * (`maxLabelChars`, 500 by default) apply before layout; this bound only keeps the work per call finite when a
 * caller forgets them, because every candidate line is measured with a full layout of the string.
 *
 * Open question: #56 (the value is a local bound until the `limits` module exists).
 */
export const MAX_TEXT_LENGTH = 1000;

/**
 * Break opportunities are runs of ASCII white space: space, tab, line feed, vertical tab, form feed and carriage
 * return. Other spaces (no-break space, ideographic space) are ordinary characters and stay in the text. A word
 * longer than the line is split between code points, without a hyphen, so no character is added to the text.
 *
 * Open question: #56 (hyphenation and the set of break characters).
 */
export function isBreakSpace(codePoint: number): boolean {
  return codePoint === 0x20 || (codePoint >= 0x09 && codePoint <= 0x0d);
}
