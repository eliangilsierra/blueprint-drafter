/**
 * The checks of the input limits (architecture sections 6.2 and 9, NFR-9, AC-45). Pure functions on strings, numbers
 * and a `Diagram`: no file access, no clock. Each check returns diagnostics (an empty array means the input is
 * within the limits). The order of every check is fixed, cheap tests first, so the first diagnostic is always the
 * same for the same input, and the result is sorted with the comparator of the model.
 *
 *   before tokenizing: {@link checkRawText}  (bytes, then the longest line)
 *   after parsing:     {@link checkDiagram}  (elements, then id, label, desc, tech lengths and group depth)
 *   a batch:           {@link checkBatch}    (operation count, then operation bytes)
 *   discovery:         {@link checkFileCount}
 *   before PNG export: {@link checkPngSize}  (scale, then pixels)
 */

import { Buffer } from "node:buffer";

import { createDiagnostic, quoteFragment, sortDiagnostics } from "../model/index.js";
import type { Diagnostic, DiagnosticExtras, Diagram } from "../model/index.js";

import { LIMIT_TABLE, MAX_PNG_SCALE, MAX_REPORTED_DIAGNOSTICS } from "./table.js";
import type { LimitName, Limits } from "./table.js";

const FIX = "Split the diagram into views";

const UNITS: ReadonlyMap<string, string> = new Map(LIMIT_TABLE.map((spec) => [spec.name, spec.unit]));

/**
 * Builds the `E_LIMIT_EXCEEDED` diagnostic: it names the limit, the value found and the maximum (architecture
 * 7.4). `subject` is fixed text that may already contain a quoted fragment; ids go in `ids`.
 */
function exceeded(
  limit: string,
  value: number,
  maximum: number,
  unit: string,
  ids: readonly string[],
  subject: string,
  extras: DiagnosticExtras = {},
): Diagnostic {
  const message = `${limit} exceeded: ${subject}${String(value)} ${unit}, maximum ${String(maximum)}`;
  return createDiagnostic("E_LIMIT_EXCEEDED", ids, message, { fix: FIX, ...extras });
}

function exceededByLimit(
  limit: LimitName,
  value: number,
  limits: Limits,
  ids: readonly string[] = [],
  subject = "",
  extras: DiagnosticExtras = {},
): Diagnostic {
  return exceeded(limit, value, limits[limit], UNITS.get(limit) ?? "", ids, subject, extras);
}

// ---------------------------------------------------------------------------------------------------------
// Raw text

const BYTE_ORDER_MARK = 0xfeff;

/**
 * Checks raw file text before any tokenizing (architecture section 9, B1): first the size in UTF-8 bytes
 * (`maxFileBytes`), then the longest line (`maxLineChars`). At most one diagnostic comes back, so the cost of the
 * report does not grow with the input; the line check does not run on a text that is too large.
 *
 * Lines end at LF; the CR of a CRLF and a leading byte-order mark are not part of a line (architecture 7.2). The
 * diagnostic of a long line carries the 1-based `line` of the first one. The scan allocates nothing.
 *
 * Bytes are counted on the decoded text; reading a file with a bounded read of `maxFileBytes + 1` bytes is the job
 * of the `io` module (#34).
 */
export function checkRawText(text: string, limits: Limits): Diagnostic[] {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > limits.maxFileBytes) {
    return [exceededByLimit("maxFileBytes", bytes, limits)];
  }
  let lineNumber = 1;
  let start = text.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0;
  while (start <= text.length) {
    const lineFeed = text.indexOf("\n", start);
    let end = lineFeed === -1 ? text.length : lineFeed;
    if (end > start && text.charCodeAt(end - 1) === 0x0d && lineFeed !== -1) {
      end -= 1;
    }
    if (end - start > limits.maxLineChars) {
      return [exceededByLimit("maxLineChars", end - start, limits, [], `line ${String(lineNumber)} has `, { line: lineNumber })];
    }
    if (lineFeed === -1) {
      break;
    }
    start = lineFeed + 1;
    lineNumber += 1;
  }
  return [];
}

// ---------------------------------------------------------------------------------------------------------
// Diagram

/**
 * Open question: #56 (open decisions of PR #64, row 14): an id longer than `maxIdChars` is `E_LIMIT_EXCEEDED`
 * naming `maxIdChars`, never `E_BAD_ID`. This is the assumed default; if the decision changes, this is the only
 * function of the module to change (the parser #12 and the operations #14 call it for every id they read).
 *
 * @returns the diagnostic, or `undefined` when the id is within the limit.
 */
export function checkIdLength(id: string, limits: Limits, extras: DiagnosticExtras = {}): Diagnostic | undefined {
  if (id.length <= limits.maxIdChars) {
    return undefined;
  }
  return exceededByLimit("maxIdChars", id.length, limits, [id], `id ${quoteFragment(id)} has `, extras);
}

/** Depth of every group: 1 for a top-level group, 2 for a group in it, and so on. A cycle has no depth. */
function groupDepths(groups: Diagram["groups"]): Map<string, number> {
  const byId = new Map<string, string | undefined>();
  for (const group of groups) {
    // The first group with an id wins; a duplicate id is E_DUPLICATE_ID, reported by the parser.
    if (!byId.has(group.id)) {
      byId.set(group.id, group.in);
    }
  }
  const depths = new Map<string, number>();
  for (const startId of byId.keys()) {
    if (depths.has(startId)) {
      continue;
    }
    // Walk up until a known depth, a top-level group, a parent that is not a group or a cycle.
    const chain: string[] = [];
    const onChain = new Set<string>();
    let current: string | undefined = startId;
    let base = 0;
    let cyclic = false;
    while (current !== undefined && byId.has(current)) {
      const known = depths.get(current);
      if (known !== undefined) {
        base = known;
        break;
      }
      if (onChain.has(current)) {
        cyclic = true;
        break;
      }
      onChain.add(current);
      chain.push(current);
      current = byId.get(current);
    }
    if (cyclic) {
      // E_CONTAINMENT_CYCLE is the semantic rule that reports it; a cycle has no depth to limit.
      continue;
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      base += 1;
      depths.set(chain[i] ?? "", base);
    }
  }
  return depths;
}

/**
 * Checks a parsed diagram before layout (architecture sections 6.2 and 9). Order: the number of elements (groups +
 * nodes + edges); when it is exceeded nothing else is examined. Then, for each group, node and edge in array order,
 * the id length (`maxIdChars`; an edge only when its id was written, because a derived id is made of two ids that
 * are checked as elements), then `label`, `desc` and `tech` (`maxLabelChars`, each on its own); then the depth of
 * every group (`maxGroupDepth`; a node does not add a level). A group whose containment is a cycle has no depth.
 *
 * At most {@link MAX_REPORTED_DIAGNOSTICS} diagnostics are returned, sorted with `sortDiagnostics`. Messages never
 * echo a label, a description or a tech value; ids are quoted with `quoteFragment`.
 */
export function checkDiagram(diagram: Diagram, limits: Limits): Diagnostic[] {
  const elements = diagram.groups.length + diagram.nodes.length + diagram.edges.length;
  if (elements > limits.maxElements) {
    return [exceededByLimit("maxElements", elements, limits)];
  }
  const found: Diagnostic[] = [];
  const add = (diagnostic: Diagnostic | undefined): void => {
    if (diagnostic !== undefined && found.length < MAX_REPORTED_DIAGNOSTICS) {
      found.push(diagnostic);
    }
  };
  const checkText = (id: string, field: string, value: string | undefined): void => {
    if (value !== undefined && value.length > limits.maxLabelChars) {
      add(exceededByLimit("maxLabelChars", value.length, limits, [id], `${field} of ${quoteFragment(id)} has `));
    }
  };
  for (const group of diagram.groups) {
    add(checkIdLength(group.id, limits));
    checkText(group.id, "label", group.label);
    checkText(group.id, "desc", group.desc);
  }
  for (const node of diagram.nodes) {
    add(checkIdLength(node.id, limits));
    checkText(node.id, "label", node.label);
    checkText(node.id, "tech", node.tech);
    checkText(node.id, "desc", node.desc);
  }
  for (const edge of diagram.edges) {
    if (edge.explicitId) {
      add(checkIdLength(edge.id, limits));
    }
    checkText(edge.id, "label", edge.label);
    checkText(edge.id, "tech", edge.tech);
  }
  const depths = groupDepths(diagram.groups);
  for (const group of diagram.groups) {
    const depth = depths.get(group.id);
    if (depth !== undefined && depth > limits.maxGroupDepth) {
      add(exceededByLimit("maxGroupDepth", depth, limits, [group.id], `group ${quoteFragment(group.id)} is nested `));
    }
  }
  return sortDiagnostics(found);
}

// ---------------------------------------------------------------------------------------------------------
// Batch, files, PNG

/**
 * Checks an operation batch before any operation runs (architecture 7.3 rule 7): first the number of operations
 * (`maxOpsPerBatch`), then their total size in UTF-8 bytes (`maxOpsBytes`). The sum counts the operations only, not
 * a separator, and is not computed when the count is already too large.
 */
export function checkBatch(ops: readonly string[], limits: Limits): Diagnostic[] {
  if (ops.length > limits.maxOpsPerBatch) {
    return [exceededByLimit("maxOpsPerBatch", ops.length, limits)];
  }
  let bytes = 0;
  for (const op of ops) {
    bytes += Buffer.byteLength(op, "utf8");
  }
  return bytes > limits.maxOpsBytes ? [exceededByLimit("maxOpsBytes", bytes, limits)] : [];
}

/**
 * Checks the number of files found by directory discovery (`check`, `fmt`): `count` files may be found, one more
 * stops the walk with `E_LIMIT_EXCEEDED` (architecture 7.5), so discovery calls it with the running count.
 *
 * @throws RangeError when `count` is not a non-negative safe integer (a bug in the caller).
 */
export function checkFileCount(count: number, limits: Limits): Diagnostic[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(`file count must be a non-negative integer, got ${String(count)}`);
  }
  return count > limits.maxFiles ? [exceededByLimit("maxFiles", count, limits)] : [];
}

/** Size of a PNG export: the SVG size in CSS pixels and the `--scale` factor. */
export interface PngSize {
  width: number;
  height: number;
  scale: number;
}

/**
 * Checks a PNG export before the image is allocated (architecture section 9): first the scale (at most
 * {@link MAX_PNG_SCALE}, a fixed rule reported as `maxPngScale`), then the pixel count `width x height x scale
 * squared` (`maxPngPixels`; a fractional count is reported rounded up). Both diagnostics come back when both
 * apply.
 *
 * @throws RangeError when width, height or scale is not a positive number, or width or height is not finite (a bug
 * in the caller: the size comes from a layout and the scale from an option the adapter parsed).
 */
export function checkPngSize(size: PngSize, limits: Limits): Diagnostic[] {
  const { width, height, scale } = size;
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height) || !(scale > 0)) {
    throw new RangeError(
      `PNG size needs finite positive width and height and a positive scale, got ${String(width)}x${String(height)} at scale ${String(scale)}`,
    );
  }
  const found: Diagnostic[] = [];
  if (scale > MAX_PNG_SCALE) {
    found.push(exceeded("maxPngScale", scale, MAX_PNG_SCALE, "times", [], "scale is "));
  }
  if (Number.isFinite(scale)) {
    const pixels = width * height * scale * scale;
    if (pixels > limits.maxPngPixels) {
      found.push(exceededByLimit("maxPngPixels", Math.ceil(pixels), limits, [], `${String(width)}x${String(height)} at scale ${String(scale)} is `));
    }
  }
  return sortDiagnostics(found);
}
