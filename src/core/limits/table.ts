/**
 * The table of input limits (architecture section 9, NFR-9): the only place that holds a limit value, its name,
 * its unit and the hard bounds an override must respect. Changing a default is a one-line change here.
 *
 * ASSUMPTION (Q-4): every default below is provisional until the owner decides after the sizing spike (#22). The
 * floors and ceilings are not in the architecture either: they are the bounds this module enforces on
 * configuration, chosen so that no accepted value can turn a limit off (a ceiling of at most a few hundred times
 * the default) or make the engine unusable (a floor of one). They are assumptions of #10, reviewable with the
 * defaults.
 */

/** One row of the table. */
export interface LimitSpec {
  /** Name used in the API (`Limits` key), in `opts.limits` and in the `E_LIMIT_EXCEEDED` message. */
  readonly name: string;
  /** What the value counts. */
  readonly unit: string;
  /** Provisional default (ASSUMPTION, Q-4). */
  readonly default: number;
  /** Smallest value an override may have (inclusive). */
  readonly floor: number;
  /** Largest value an override may have (inclusive): a hard ceiling that configuration cannot raise. */
  readonly ceiling: number;
}

const MIB = 1024 * 1024;

/**
 * Every limit, in the order of architecture section 9. ASSUMPTION (Q-4): defaults are provisional.
 *
 * Units of text length: `characters` are UTF-16 code units (`String.prototype.length`), the unit of the rest of
 * the core (see `quoteFragment`); a character outside the Basic Multilingual Plane counts 2. This is the stricter
 * reading and costs no scan.
 */
export const LIMIT_TABLE = Object.freeze([
  { name: "maxFileBytes", unit: "bytes", default: MIB, floor: 1, ceiling: 64 * MIB },
  { name: "maxLineChars", unit: "characters", default: 4096, floor: 1, ceiling: 65_536 },
  { name: "maxElements", unit: "elements", default: 1000, floor: 1, ceiling: 100_000 },
  { name: "maxLabelChars", unit: "characters", default: 500, floor: 1, ceiling: 10_000 },
  { name: "maxIdChars", unit: "characters", default: 64, floor: 1, ceiling: 1024 },
  { name: "maxGroupDepth", unit: "levels", default: 16, floor: 1, ceiling: 256 },
  { name: "maxOpsPerBatch", unit: "operations", default: 1000, floor: 1, ceiling: 100_000 },
  { name: "maxOpsBytes", unit: "bytes", default: MIB, floor: 1, ceiling: 64 * MIB },
  { name: "maxFiles", unit: "files", default: 10_000, floor: 1, ceiling: 1_000_000 },
  { name: "maxPngPixels", unit: "pixels", default: 40_000_000, floor: 1, ceiling: 268_435_456 },
  { name: "layoutTimeoutMs", unit: "milliseconds", default: 10_000, floor: 1, ceiling: 600_000 },
  { name: "layoutWorkerHeapMb", unit: "MiB", default: 512, floor: 1, ceiling: 16_384 },
] as const satisfies readonly LimitSpec[]);

export type LimitName = (typeof LIMIT_TABLE)[number]["name"];

/**
 * The configurable limits (architecture sections 7.1 and 9). `layoutTimeoutMs` and `layoutWorkerHeapMb` are plain
 * numbers consumed by the layout worker (#21); the others are checked by this module.
 */
export type Limits = { readonly [N in LimitName]: number };

/** The largest `--scale` of a PNG export (architecture section 9). A fixed rule, not a configurable limit. */
export const MAX_PNG_SCALE = 4;

/**
 * Most diagnostics one check returns, so that a pathological input cannot make the report as large as the input.
 * Findings are collected in a fixed traversal order and then sorted, so the cut is deterministic.
 */
export const MAX_REPORTED_DIAGNOSTICS = 100;

function defaultsFromTable(): Limits {
  const values: Record<string, number> = {};
  for (const spec of LIMIT_TABLE) {
    values[spec.name] = spec.default;
  }
  // The cast is sound: the loop sets exactly the names of LIMIT_TABLE, which is what Limits is derived from.
  return Object.freeze(values) as Limits;
}

/** The provisional defaults of architecture section 9, frozen. ASSUMPTION (Q-4): to be confirmed by the owner. */
export const DEFAULT_LIMITS: Limits = defaultsFromTable();
