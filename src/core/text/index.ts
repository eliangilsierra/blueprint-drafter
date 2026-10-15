/**
 * The `text` module: real font metrics (fontkit over the vendored IBM Plex Sans), wrapping and elision (FR-7).
 * The public re-export from `src/core/index.ts` is a separate task.
 *
 * `measure`, `wrap` and `elide` use the bundled fonts, loaded on the first call (never on import) and verified
 * against `fonts/SHA256SUMS`. Code that needs another font source, such as a test, builds an engine with
 * {@link createTextEngine} and its own {@link FontProvider}.
 */

import { createTextEngine } from "./engine.js";
import type { ElideResult, TextEngine, TextMetrics, WrapResult } from "./engine.js";
import { loadBundledFonts } from "./fonts.js";
import type { FontWeight } from "./fonts.js";

export { MAX_CACHE_ENTRIES, createTextEngine } from "./engine.js";
export type { ElideResult, TextEngine, TextMetrics, WrapResult } from "./engine.js";
export { CHECKSUM_FILE, FONT_FILES, FONT_WEIGHTS, FontLoadError, loadBundledFonts } from "./fonts.js";
export type { FontFace, FontProvider, FontWeight, LoadFontsOptions } from "./fonts.js";
export { ELLIPSIS, MAX_DESCRIPTION_LINES, MAX_NAME_LINES, MAX_TEXT_LENGTH } from "./policy.js";

// The bundled fonts are read once per process, on first use. A failed load is not remembered: the next call tries
// again and fails the same way, so a repaired installation recovers without a restart.
let bundled: TextEngine | undefined;

function bundledEngine(): TextEngine {
  bundled ??= createTextEngine(loadBundledFonts());
  return bundled;
}

/** Width, ascent and descent of `text` at `size` px in the bundled font. See {@link TextEngine.measure}. */
export function measure(text: string, size: number, weight: FontWeight): TextMetrics {
  return bundledEngine().measure(text, size, weight);
}

/** Wraps `text` into at most `maxLines` lines of at most `maxWidth` px. See {@link TextEngine.wrap}. */
export function wrap(text: string, maxWidth: number, size: number, weight: FontWeight, maxLines: number): WrapResult {
  return bundledEngine().wrap(text, maxWidth, size, weight, maxLines);
}

/** Shortens `text` to `maxWidth` px with an ellipsis. See {@link TextEngine.elide}. */
export function elide(text: string, maxWidth: number, size: number, weight: FontWeight): ElideResult {
  return bundledEngine().elide(text, maxWidth, size, weight);
}
