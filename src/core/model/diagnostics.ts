/**
 * Diagnostic catalogue, constructor, ordering and the quoting helper (architecture sections 6.6 and 7.4,
 * `docs/reference/diagnostics.md`).
 */

import { SEVERITIES } from "./enums.js";
import type { Severity } from "./enums.js";
import type { Diagnostic } from "./types.js";
import { compareCodePoints } from "./util.js";

// Open question: #56 CR-19 (user-visible output when layout fails after an accepted batch is written) may add or
// rename a code. The lists below are the catalogue exactly as merged on develop; a change to the catalogue
// changes only this file. They keep the order of the tables of architecture section 7.4. A test compares them
// with `docs/reference/diagnostics.md` and with the architecture, so the three cannot drift apart.

/** Syntax, operations, files and limits. */
export const SYNTAX_CODES = Object.freeze([
  "E_SYNTAX",
  "E_MISSING_HEADER",
  "E_VERSION_UNSUPPORTED",
  "E_UNKNOWN_STATEMENT",
  "E_UNKNOWN_ATTR",
  "E_BAD_VALUE",
  "E_INVALID_OP",
  "E_UNKNOWN_ID",
  "E_DUPLICATE_ID",
  "E_UNKNOWN_CONSTRAINT",
  "E_BATCH_INTRODUCES_ERRORS",
  "E_LIMIT_EXCEEDED",
  "E_LAYOUT_TIMEOUT",
  "E_UNKNOWN_PROFILE",
  "E_FILE_NOT_FOUND",
  "E_NOT_REGULAR_FILE",
  "E_EXISTS",
  "E_OUTSIDE_WORKSPACE",
  "E_BAD_EXTENSION",
  "E_STALE_FILE",
  "E_INTERNAL",
] as const);

/** Semantic rules on the model. */
export const SEMANTIC_CODES = Object.freeze([
  "E_BAD_ID",
  "E_UNKNOWN_PARENT",
  "E_PARENT_NOT_GROUP",
  "E_CONTAINMENT_CYCLE",
  "E_DANGLING_EDGE",
  "E_CONSTRAINT_UNKNOWN_ID",
  "E_CONSTRAINT_CONFLICT",
  "E_UNSUPPORTED_FOR_TYPE",
  "W_UNKNOWN_KIND",
  "W_NOT_FOR_TYPE",
  "W_UNLABELED_RELATION",
  "W_C4_PERSON_IN_BOUNDARY",
  "W_C4_LEVEL_MIX",
  "I_SELF_LOOP",
  "I_ISOLATED",
] as const);

/** Geometric, legibility and composition rules on a layout. */
export const GEOMETRIC_CODES = Object.freeze([
  "E_NODE_OVERLAP",
  "E_OUTSIDE_PARENT",
  "E_TEXT_OVERFLOW",
  "E_EDGE_THROUGH_NODE",
  "E_EDGE_ENDPOINT_GAP",
  "E_EDGE_UNROUTED",
  "E_LABEL_OVERLAPS_NODE",
  "E_LABEL_OVERLAPS_LABEL",
  "E_LABEL_OVERLAPS_EDGE",
  "W_NODES_TOO_CLOSE",
  "W_TEXT_TRUNCATED",
  "W_EDGE_THROUGH_GROUP",
  "W_ARROW_TOO_SHORT",
  "W_LABEL_DETACHED",
  "W_LABEL_AMBIGUOUS",
  "W_EDGE_OVERLAP",
  "W_MANY_CROSSINGS",
  "W_EDGE_DETOUR",
  "W_ILLEGIBLE_AT_FIT",
  "W_LOW_CONTRAST",
  "I_CROSSINGS",
  "I_EDGE_HUGS_NODE",
  "I_ASPECT",
  "I_DENSITY",
  "I_CONSTRAINT_UNMET",
] as const);

/** Every code of the v1 catalogue. */
export const DIAGNOSTIC_CODES = Object.freeze([...SYNTAX_CODES, ...SEMANTIC_CODES, ...GEOMETRIC_CODES] as const);
export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(DIAGNOSTIC_CODES);

export function isDiagnosticCode(value: unknown): value is DiagnosticCode {
  return typeof value === "string" && CODE_SET.has(value);
}

/** Severity of a code at the type level: a function of the prefix `E_`, `W_` or `I_`. */
export type SeverityOfCode<C extends string> = C extends `E_${string}`
  ? "error"
  : C extends `W_${string}`
    ? "warning"
    : C extends `I_${string}`
      ? "info"
      : never;

/** Longest quoted text of {@link quoteFragment}, in UTF-16 code units, ellipsis included, quotes excluded. */
export const MAX_FRAGMENT_LENGTH = 80;

const ELLIPSIS = "…";

// Removed from untrusted text: control characters (Cc: C0, DEL, C1), format characters (Cf: bidirectional controls
// U+202A to U+202E and U+2066 to U+2069, zero-width characters U+200B to U+200D and U+FEFF, tag characters), line
// and paragraph separators (Zl, Zp), noncharacters and lone surrogates (Cs). In quoteFragment a line feed is not
// removed: it is written as the \n escape of the format instead.
//
// Open question: #56 (item 9). Architecture 7.2 lists only control, bidirectional and zero-width characters,
// noncharacters and unpaired surrogates. The classes Cf (beyond those ranges), Zl and Zp are a superset kept here
// for message safety. Blank-looking characters outside these classes (U+3164, U+FFA0, U+115F, U+1160, U+034F,
// U+180B to U+180D) are NOT removed, because the architecture does not list them.
const REMOVED = /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\p{Noncharacter_Code_Point}]$/u;

/** Removes the characters of {@link REMOVED}, line feeds included, without quoting or escaping. */
function stripUntrusted(text: string): string {
  let result = "";
  for (const codePoint of text) {
    if (!REMOVED.test(codePoint)) {
      result += codePoint;
    }
  }
  return result;
}

function escapeCodePoint(codePoint: string): string {
  switch (codePoint) {
    case "\\":
      return "\\\\";
    case '"':
      return '\\"';
    case "\n":
      return "\\n";
    default:
      return codePoint;
  }
}

/**
 * Renders untrusted text (an id, a token, an operation) for use inside a diagnostic message (architecture
 * section 7.4): the text is stripped of control, bidirectional and zero-width characters, written with the string
 * escapes of section 7.2 (`\"`, `\\`, and a line feed as `\n`), truncated and wrapped in double quotes.
 *
 * The quoted text is at most {@link MAX_FRAGMENT_LENGTH} UTF-16 code units, counted after escaping; a longer text
 * is cut to whole characters and ends with an ellipsis (U+2026). An escape or a surrogate pair is never split, so
 * the result is at most 82 code units with the quotes. Every module that puts an id, token or operation into a
 * message must use it; labels and descriptions are never echoed in messages.
 *
 * Open question: #56 (item 7): the readings of this function (a line feed written as the n escape, the stripped
 * classes, the unit of the 80-character limit) are to be confirmed.
 */
export function quoteFragment(text: string): string {
  const pieces: string[] = [];
  let length = 0;
  for (const codePoint of text) {
    if (codePoint !== "\n" && REMOVED.test(codePoint)) {
      continue;
    }
    const piece = escapeCodePoint(codePoint);
    pieces.push(piece);
    length += piece.length;
    if (length > MAX_FRAGMENT_LENGTH) {
      // The text is longer than the bound and will be truncated: the rest cannot change the result, so the cost
      // stays constant whatever the length of the input.
      break;
    }
  }
  if (length <= MAX_FRAGMENT_LENGTH) {
    return `"${pieces.join("")}"`;
  }
  // Keep whole pieces while they fit next to the ellipsis.
  let kept = "";
  for (const piece of pieces) {
    if (kept.length + piece.length > MAX_FRAGMENT_LENGTH - ELLIPSIS.length) {
      break;
    }
    kept += piece;
  }
  return `"${kept}${ELLIPSIS}"`;
}

/**
 * Severity of a code, derived from its prefix so that the catalogue cannot contradict itself (architecture
 * section 7.4): `E_` is an error, `W_` a warning, `I_` an info.
 *
 * @throws RangeError when the code has none of the three prefixes (a programming error).
 */
export function severityOfCode(code: string): Severity {
  if (code.startsWith("E_")) {
    return "error";
  }
  if (code.startsWith("W_")) {
    return "warning";
  }
  if (code.startsWith("I_")) {
    return "info";
  }
  throw new RangeError(`diagnostic code ${quoteFragment(code)} must start with E_, W_ or I_`);
}

/** Optional parts of a diagnostic. */
export interface DiagnosticExtras {
  /** A concrete correction, written as an operation where possible. */
  fix?: string;
  /** `true` when the engine resolves the finding itself on re-layout. */
  auto?: boolean;
  /** Line of the file the finding refers to. */
  line?: number;
  /** Index of the operation the finding refers to. */
  op?: number;
}

/**
 * Builds a diagnostic. The code, the ids and the message are required; the severity comes from the code prefix.
 * Optional parts that are not given are absent from the result (not `undefined`), so a diagnostic serialises to
 * the same JSON whichever way it was built. `ids` is copied.
 *
 * `ids` and `fix` often carry untrusted tokens (an id that failed the id pattern, an operation), and the text form
 * of a finding puts them on one line (architecture 7.4), so they are stripped of control (line feeds included),
 * bidirectional, zero-width and the other removed characters, as in {@link quoteFragment} but without quotes or
 * escapes. A quote or a backslash in `fix` is kept: a fix is an operation. The `message` is left as given, because
 * it is built from fixed text and fragments that already went through {@link quoteFragment}; a message that quotes
 * untrusted text must pass each fragment through it.
 */
export function createDiagnostic(
  code: DiagnosticCode,
  ids: readonly string[],
  message: string,
  extras: DiagnosticExtras = {},
): Diagnostic {
  // The cast is sound: severityOfCode derives the severity from the same prefix that SeverityOfCode reads, and a
  // test checks every code of the catalogue. TypeScript cannot relate the two through the union of 61 codes.
  const diagnostic = { severity: severityOfCode(code), code, ids: ids.map(stripUntrusted), message } as Diagnostic;
  if (extras.fix !== undefined) {
    diagnostic.fix = stripUntrusted(extras.fix);
  }
  if (extras.auto !== undefined) {
    diagnostic.auto = extras.auto;
  }
  if (extras.line !== undefined) {
    diagnostic.line = extras.line;
  }
  if (extras.op !== undefined) {
    diagnostic.op = extras.op;
  }
  return diagnostic;
}

function compareIds(a: readonly string[], b: readonly string[]): number {
  const common = Math.min(a.length, b.length);
  for (let i = 0; i < common; i++) {
    const order = compareCodePoints(a[i] ?? "", b[i] ?? "");
    if (order !== 0) {
      return order;
    }
  }
  return a.length - b.length;
}

/**
 * Orders diagnostics by severity (error, warning, info), then code, then ids (architecture section 6.6).
 * Strings are compared by code point; ids are compared element by element and a shorter list comes first.
 * Diagnostics that are equal under this order keep their relative order in a stable sort.
 */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  const bySeverity = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
  if (bySeverity !== 0) {
    return bySeverity;
  }
  const byCode = compareCodePoints(a.code, b.code);
  if (byCode !== 0) {
    return byCode;
  }
  return compareIds(a.ids, b.ids);
}

/** Returns a new array sorted with {@link compareDiagnostics}; the input is not modified. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(compareDiagnostics);
}
