/**
 * Closed enumerations of the format and the API (architecture section 7.2, closed value sets; section 6.4
 * for the profile names). Each set is a frozen `as const` array plus the union type derived from it, so the
 * runtime list and the compile-time type cannot drift apart and no code can change a set at run time.
 */

export const DIAGRAM_TYPES = Object.freeze(["flow", "c4-context", "c4-container", "component", "architecture", "sequence"] as const);
export type DiagramType = (typeof DIAGRAM_TYPES)[number];

export const NODE_KINDS = Object.freeze([
  "start",
  "end",
  "process",
  "decision",
  "io",
  "subprocess",
  "person",
  "system",
  "external",
  "container",
  "service",
  "component",
  "webapp",
  "mobile",
  "gateway",
  "function",
  "db",
  "cache",
  "storage",
  "queue",
  "topic",
  "module",
  "actor",
  "participant",
] as const);
export type NodeKind = (typeof NODE_KINDS)[number];

export const GROUP_KINDS = Object.freeze(["boundary", "zone", "cluster", "layer", "group"] as const);
export type GroupKind = (typeof GROUP_KINDS)[number];

/** Layout direction: the header `dir` attribute. */
export const DIRECTIONS = Object.freeze(["TB", "LR", "BT", "RL"] as const);
export type Direction = (typeof DIRECTIONS)[number];

export const THEMES = Object.freeze(["light", "dark"] as const);
export type Theme = (typeof THEMES)[number];

export const DENSITIES = Object.freeze(["compact", "normal", "airy"] as const);
export type Density = (typeof DENSITIES)[number];

/** Edge `style` values; `sync` is the default. */
export const EDGE_STYLES = Object.freeze(["sync", "async", "reply", "dep"] as const);
export type EdgeStyle = (typeof EDGE_STYLES)[number];

/** Edge `dir` values (arrowheads); `fwd` is the default. Not to be confused with the header `dir`. */
export const EDGE_DIRS = Object.freeze(["fwd", "both", "none"] as const);
export type EdgeDir = (typeof EDGE_DIRS)[number];

/** Layout constraint types: `rank same a,b` is `same-rank`, `order a,b,c` is `order` (architecture section 7.1). */
export const CONSTRAINT_TYPES = Object.freeze(["same-rank", "order"] as const);
export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

/**
 * Names of the target profiles (FR-17, architecture section 6.4). Canvas sizes belong to `validate`.
 *
 * Open question: #56 (item 7): whether the `PROFILES` constant of architecture 7.1 holds names only.
 */
export const PROFILES = Object.freeze(["doc", "slide", "print"] as const);
export type ProfileName = (typeof PROFILES)[number];

export const SEVERITIES = Object.freeze(["error", "warning", "info"] as const);
export type Severity = (typeof SEVERITIES)[number];

/** `status` of every file-pipeline result (architecture section 7.1). */
export const RESULT_STATUSES = Object.freeze(["ok", "findings", "failed", "rejected"] as const);
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/**
 * Shapes a node or group can be drawn with (architecture section 6.5).
 *
 * Open question: #56 (item 4): the prototype also had `parallelogram` for `io`, which section 6.5 does not list.
 */
export const SHAPES = Object.freeze(["rect", "pill", "diamond", "cylinder", "pipe", "person", "hexagon"] as const);
export type Shape = (typeof SHAPES)[number];

/** Arrowhead drawn at one end of an edge. */
export const ARROWHEADS = Object.freeze(["none", "filled", "open"] as const);
export type Arrowhead = (typeof ARROWHEADS)[number];

function guard<T extends string>(values: readonly T[]): (value: unknown) => value is T {
  return (value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);
}

export const isDiagramType = guard(DIAGRAM_TYPES);
/** Kinds outside the closed set are legal in a model (`W_UNKNOWN_KIND`, never `E_BAD_VALUE`); this tells them apart. */
export const isNodeKind = guard(NODE_KINDS);
export const isGroupKind = guard(GROUP_KINDS);
export const isDirection = guard(DIRECTIONS);
export const isTheme = guard(THEMES);
export const isDensity = guard(DENSITIES);
export const isEdgeStyle = guard(EDGE_STYLES);
export const isEdgeDir = guard(EDGE_DIRS);
export const isConstraintType = guard(CONSTRAINT_TYPES);
export const isProfileName = guard(PROFILES);
export const isSeverity = guard(SEVERITIES);
export const isResultStatus = guard(RESULT_STATUSES);
