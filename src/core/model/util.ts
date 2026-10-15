/**
 * Small deterministic helpers shared by every module (architecture section 6.6, NFR-1): no clock, no random
 * numbers, no locale. Pure functions without state.
 */

/**
 * Compares two strings by Unicode code point, independent of locale (architecture section 6.6).
 *
 * `<` on strings compares UTF-16 code units, which orders an astral character (a surrogate pair) before
 * U+E000 to U+FFFF; this comparator does not. Returns -1, 0 or 1.
 */
export function compareCodePoints(a: string, b: string): -1 | 0 | 1 {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    // The loop condition keeps both indexes in range, so codePointAt never returns undefined here.
    const pa = a.codePointAt(i) ?? 0;
    const pb = b.codePointAt(j) ?? 0;
    if (pa !== pb) {
      return pa < pb ? -1 : 1;
    }
    const width = pa > 0xffff ? 2 : 1;
    i += width;
    j += width;
  }
  if (i < a.length) {
    return 1;
  }
  return j < b.length ? -1 : 0;
}

/**
 * Formats a number with exactly two decimals and never prints `-0` (architecture section 6.6).
 *
 * `Number.prototype.toFixed` is specified exactly (no engine or locale variation); the only adjustment is that
 * a negative value that rounds to zero would print `-0.00`.
 *
 * @throws RangeError for NaN, an infinity or a magnitude of 1e21 or more, which are bugs in the caller.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) {
    throw new RangeError(`cannot format ${String(value)} as a fixed two-decimal number`);
  }
  const text = value.toFixed(2);
  return text === "-0.00" ? "0.00" : text;
}

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

/**
 * Stable hash of a string as 16 lowercase hex digits: 64-bit FNV-1a over the UTF-8 bytes of the text.
 *
 * Used to derive identifiers that exports need (Excalidraw `seed`, draw.io cell ids) from a model id, never
 * from a random source (architecture section 6.6). It is not a cryptographic hash.
 */
export function stableHash(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(text)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * FNV_PRIME);
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Derived edge id of the form `from>to` or `from>to#n` (n >= 2): the first one not in `taken`
 * (architecture section 7.2, edge ids; FR-9). `#1` is never used.
 *
 * The function keeps no state: the caller assigns the id once, when the edge is added, and stores it.
 */
export function derivedEdgeId(from: string, to: string, taken: ReadonlySet<string>): string {
  const base = `${from}>${to}`;
  if (!taken.has(base)) {
    return base;
  }
  for (let n = 2; ; n++) {
    const candidate = `${base}#${String(n)}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

// An explicit edge id is an ID, which cannot contain ">" or "#", so any id of the form from>to[#n] is derived.
// The endpoints are checked structurally only (no whitespace, ">" or "#"); the id pattern is a semantic rule.
// n is written without leading zeros and is at least 2.
const DERIVED_REF = /^[^>#\s]+>[^>#\s]+(?:#(?:[2-9]|[1-9][0-9]+))?$/;

/**
 * Whether `id` has the derived form `from>to` or `from>to#n` (n >= 2) rather than being an explicit id.
 *
 * Open question: #56 (item 6): `letter` in the `ID` grammar is not defined, so the endpoints are not checked
 * against the id pattern here.
 */
export function isDerivedRef(id: string): boolean {
  return DERIVED_REF.test(id);
}
