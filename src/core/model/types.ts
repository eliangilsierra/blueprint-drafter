/**
 * Data types of the v1 model (architecture section 7.1, "Core types"; field names are part of v1).
 *
 * Types only, plus nothing that runs: this module imports nothing from the rest of the core. Where the
 * architecture names a type or an option but does not list its fields, the fields below are the smallest set
 * the other sections need, and they are recorded as a question on #56.
 */

import type { DiagnosticCode, SeverityOfCode } from "./diagnostics.js";
import type {
  Arrowhead,
  ConstraintType,
  Density,
  Direction,
  DiagramType,
  EdgeDir,
  EdgeStyle,
  ResultStatus,
  Shape,
  Theme,
} from "./enums.js";

// ---------------------------------------------------------------------------------------------------------
// Diagram

/**
 * Opaque user metadata (`meta.*` attributes), by key without the `meta.` prefix: preserved and serialised sorted
 * by key, never used for layout.
 *
 * A `ReadonlyMap`, not an object: the keys come from the file (`meta.` followed by an ID) and `__proto__`,
 * `constructor`, `toString` and `hasOwnProperty` are valid IDs, which a plain object would drop or confuse with
 * its prototype. For the same reason a `Diagram` is not JSON-serialisable as it is (`JSON.stringify` writes a
 * `Map` as `{}`): the serialiser and the JSON outputs convert explicitly. To change metadata, build a new map.
 *
 * Open question: #56 (item 8): the architecture says only `meta?`, so the representation is an implementation
 * choice that the parser (#12) and the serialiser (#13) follow.
 */
export type Meta = ReadonlyMap<string, string>;

export interface Group {
  id: string;
  /**
   * Usually one of `GROUP_KINDS`. A kind outside the closed set is kept as written (`W_UNKNOWN_KIND`, drawn
   * with the generic shape), so the type is `string`; `isGroupKind` tells the two apart.
   *
   * Open question: #56 (item 2).
   */
  kind: string;
  label: string;
  /** Id of the containing group. */
  in?: string;
  desc?: string;
  tags?: string[];
  meta?: Meta;
}

export interface Node {
  id: string;
  /** Usually one of `NODE_KINDS`; see {@link Group.kind}. Open question: #56 (item 2). */
  kind: string;
  label: string;
  /** Id of the containing group. */
  in?: string;
  tech?: string;
  desc?: string;
  tags?: string[];
  meta?: Meta;
}

export interface Edge {
  /** Explicit (`id=x`) or derived (`from>to`, `from>to#n`, n >= 2); stable once assigned. */
  id: string;
  /** Id of a node or a group. */
  from: string;
  /** Id of a node or a group. */
  to: string;
  label?: string;
  tech?: string;
  /** Absent means `sync`. */
  style?: EdgeStyle;
  /** Absent means `fwd`. */
  dir?: EdgeDir;
  /** `true` when the id was written as `id=` (kept across reconnections); `false` for a derived id. */
  explicitId: boolean;
  meta?: Meta;
}

export interface Constraint {
  type: ConstraintType;
  ids: string[];
}

/**
 * Leading comments of the statements (architecture section 7.2, comments): one string per comment line, in file
 * order. Comments above a statement move with it, so they are keyed by the statement: `group <id>`, `node <id>`,
 * `edge <id>`, `rank same <ids>` or `order <ids>` (ids joined by a comma, no spaces). A `Map` is used because
 * ids such as `__proto__` are valid ids and must not reach an object's prototype.
 *
 * Open question: #56 (item 1): architecture 7.1 gives no shape for `comments`.
 */
export interface DiagramComments {
  /** Comments above the header. */
  header: string[];
  /** Comments directly above a statement, by statement key. */
  statements: Map<string, string[]>;
  /** Comments after the last statement. */
  trailing: string[];
}

export interface Diagram {
  version: 1;
  type: DiagramType;
  title?: string;
  dir: Direction;
  theme: Theme;
  density: Density;
  groups: Group[];
  nodes: Node[];
  edges: Edge[];
  constraints: Constraint[];
  comments: DiagramComments;
}

// ---------------------------------------------------------------------------------------------------------
// Diagnostics

interface DiagnosticOf<C extends DiagnosticCode> {
  /** Derived from the prefix of the code (`E_`, `W_`, `I_`); `createDiagnostic` builds one. */
  severity: SeverityOfCode<C>;
  code: C;
  ids: string[];
  message: string;
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
 * A finding. The fields are those of architecture 7.1; the type is a union over the catalogue codes so that the
 * severity cannot contradict the code: `{ severity: 'info', code: 'E_SYNTAX', ... }` does not compile.
 */
export type Diagnostic = { [C in DiagnosticCode]: DiagnosticOf<C> }[DiagnosticCode];

export interface Summary {
  errors: number;
  warnings: number;
  infos: number;
}

export interface Metrics {
  nodes: number;
  groups: number;
  edges: number;
  crossings: number;
  width: number;
  height: number;
  /** Smallest effective text size under the profile. */
  minTextPx: number;
  detours: number;
  endpointGaps: number;
  aspect: number;
  errors: number;
  warnings: number;
  infos: number;
}

// ---------------------------------------------------------------------------------------------------------
// Layout

/**
 * Width and height in CSS pixels (a fit canvas, `--fit WxH`).
 *
 * Open question: #56 (item 3).
 */
export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Lines of text drawn at one size, with their measured widths.
 *
 * Open question: #56 (item 4).
 */
export interface TextBlock {
  lines: string[];
  /** Measured width of each line, same length as `lines`. */
  widths: number[];
  fontSize: number;
  weight: "regular" | "semibold";
  /** Top of the block, relative to the top of the node box. */
  y: number;
}

/**
 * A node as sized from measured text, before it is placed.
 *
 * Open question: #56 (items 3 and 4).
 */
export interface SizedNode {
  id: string;
  w: number;
  h: number;
  shape: Shape;
  blocks: TextBlock[];
  /** Box available to text, relative to the node box. */
  content: Box;
  /** `true` when text was elided (`W_TEXT_TRUNCATED`). */
  truncated: boolean;
}

/** Open question: #56 (item 4). */
export interface LayoutNode extends SizedNode {
  x: number;
  y: number;
}

/** Open question: #56 (item 4). */
export interface LayoutGroup extends LayoutNode {
  /** Box of the group title, relative to the group box. */
  title: Box;
}

/** Open question: #56 (item 4). */
export interface LabelBox extends Box {
  lines: string[];
  fontSize: number;
}

/** Open question: #56 (item 4). */
export interface LayoutEdge {
  id: string;
  points: Point[];
  label?: LabelBox;
  arrowheads: { start: Arrowhead; end: Arrowhead };
}

/**
 * Vertical line under a participant of a sequence diagram.
 *
 * Open question: #56 (item 4).
 */
export interface Lifeline {
  id: string;
  x: number;
  y1: number;
  y2: number;
}

/** Open question: #56 (items 4 and 5). */
export interface Layout {
  width: number;
  height: number;
  /** Name of the engine that produced it: `elk` or `sequence`. */
  engine: string;
  nodes: LayoutNode[];
  groups: LayoutGroup[];
  edges: LayoutEdge[];
  /** Present for sequence diagrams; the endpoint rule measures to the lifeline there (architecture section 6.4). */
  lifelines?: Lifeline[];
}

/**
 * Limits that `layout` reads (architecture sections 6.3 and 9). Declared here, with the names of section 9,
 * because `model` imports nothing; `Partial<Limits>` of the `limits` module is assignable to it.
 *
 * Open question: #56 CR-18 (uneven pipeline options such as `limits`).
 */
export interface LayoutLimits {
  layoutTimeoutMs?: number;
  layoutWorkerHeapMb?: number;
}

/** Open question: #56 CR-18 and item 3: architecture 7.1 gives no fields for the layout options. */
export interface LayoutOptions {
  /** Open question: #56 CR-18. */
  limits?: LayoutLimits;
}

/** Open question: #56 (item 3). */
export interface ValidateOptions {
  /** A profile name; an unknown name fails with `E_UNKNOWN_PROFILE`, so it is a string, not `ProfileName`. */
  profile?: string;
  /** Explicit fit canvas; overrides the canvas of the profile. */
  fit?: Size;
}

export interface TargetProfile {
  name: string;
  fitWidth: number;
  /** `null`: height unbounded. */
  fitHeight: number | null;
  minTextPx: number;
}

/** The internal seam of architecture section 7.1 (not exported by v1; it keeps a stable mode possible, ADR-0002). */
export interface LayoutEngine {
  /** `elk` or `sequence`. */
  name: string;
  supports(type: DiagramType): boolean;
  layout(diagram: Diagram, sized: Map<string, SizedNode>, opts: LayoutOptions): Promise<Layout>;
}

export interface LayoutResult {
  layout?: Layout;
  diagnostics: Diagnostic[];
}

export interface CheckResult {
  layout?: Layout;
  diagnostics: Diagnostic[];
  metrics: Metrics;
  summary: Summary;
}

// ---------------------------------------------------------------------------------------------------------
// Operations and queries

/** One operation of a batch that failed (batch rule 2). `index` is the position in the batch. */
export interface OpFailure {
  index: number;
  op: string;
  diagnostic: Diagnostic;
}

export interface ApplyResult {
  ok: boolean;
  diagram: Diagram;
  changes: string[];
  failures: OpFailure[];
  introduced: Diagnostic[];
}

export type DiffKind = "header" | "group" | "node" | "edge" | "constraint";

/** Open question: #56 (item 3). */
export interface DiffEntry {
  change: "+" | "-" | "~";
  kind: DiffKind;
  id: string;
  line: number;
  was?: string;
}

// ---------------------------------------------------------------------------------------------------------
// Files

/** A directory that confines file access; `null` instead of a workspace means no confinement. */
export interface Workspace {
  /** Real path of an existing directory. */
  root: string;
  caseInsensitive: boolean;
}

export interface ReadResult {
  text?: string;
  hash?: string;
  diagnostics: Diagnostic[];
}

export interface WriteResult {
  written: boolean;
  path: string;
  diagnostics: Diagnostic[];
}

/** Open question: #56 (item 3). */
export interface ShowSelection {
  around?: string;
  depth?: number;
  idsOnly?: boolean;
  stats?: boolean;
}

/**
 * What every file-pipeline result carries. The CLI maps `status` to the exit codes 0, 1, 2 and 3; the MCP server
 * maps `failed` and `rejected` to `isError` (architecture section 7.1).
 *
 * Open question: #56 CR-18 ("every *Result has status" while the other results have none).
 */
export interface PipelineResult {
  status: ResultStatus;
  diagnostics: Diagnostic[];
}

/**
 * Result of `newFile` and `renderFile`.
 *
 * Open question: #56 (item 3).
 */
export interface FileResult extends PipelineResult {
  /** Path of the file that was created or written. */
  path?: string;
  /** Size of a rendered image. */
  size?: Size;
}

/**
 * Result of `applyFile`.
 *
 * Open question: #56 CR-19 (user-visible output when layout fails after an accepted batch is written): the
 * assumed default is `written: true` with `status: 'failed'` and `E_LAYOUT_TIMEOUT` or `E_INTERNAL` in
 * `diagnostics`. The name `check` of the last field is open too (item 3).
 */
export interface ApplyFileResult extends PipelineResult {
  changes: string[];
  failures: OpFailure[];
  introduced: Diagnostic[];
  written: boolean;
  /** The check of the written diagram. */
  check?: CheckResult;
}

/**
 * The check of one discovered file.
 *
 * Open question: #56 (item 3).
 */
export interface FileCheck {
  file: string;
  profile: string;
  check: CheckResult;
}

/** Open question: #56 (item 3). */
export interface CheckFilesResult extends PipelineResult {
  /** One entry per discovered file, in the order of discovery. */
  files: FileCheck[];
}

/**
 * Result of `showFile`.
 *
 * Open question: #56 (item 3).
 */
export interface TextResult extends PipelineResult {
  text?: string;
}

/** Open question: #56 (item 3). */
export interface DiffFileResult extends PipelineResult {
  entries: DiffEntry[];
}

/**
 * Result of `exportFile`: with no output path the text is returned.
 *
 * Open question: #56 (item 3).
 */
export interface ExportFileResult extends PipelineResult {
  text?: string;
  path?: string;
}

/** Open question: #56 (item 3). */
export interface FormatResult extends PipelineResult {
  /** Files that were rewritten, or with `check`, files that are not canonical. */
  files: string[];
}

/** Open question: #56 (item 3). */
export interface DiscoveryResult extends PipelineResult {
  /** Diagram files found, sorted by code point. */
  files: string[];
}
