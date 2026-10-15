import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  ARROWHEADS,
  CONSTRAINT_TYPES,
  DENSITIES,
  DIAGRAM_TYPES,
  DIRECTIONS,
  EDGE_DIRS,
  EDGE_STYLES,
  GROUP_KINDS,
  NODE_KINDS,
  PROFILES,
  RESULT_STATUSES,
  SEVERITIES,
  SHAPES,
  THEMES,
  isConstraintType,
  isDensity,
  isDiagramType,
  isDirection,
  isEdgeDir,
  isEdgeStyle,
  isGroupKind,
  isNodeKind,
  isProfileName,
  isResultStatus,
  isSeverity,
  isTheme,
} from "../../src/core/model/enums.js";
import type {
  Density,
  DiagramType,
  Direction,
  EdgeDir,
  EdgeStyle,
  GroupKind,
  NodeKind,
  ProfileName,
  ResultStatus,
  Severity,
  Theme,
} from "../../src/core/model/enums.js";
import type {
  ApplyFileResult,
  ApplyResult,
  CheckFilesResult,
  CheckResult,
  Constraint,
  Diagnostic,
  Diagram,
  DiffEntry,
  DiffFileResult,
  DiscoveryResult,
  Edge,
  ExportFileResult,
  FileResult,
  FormatResult,
  Group,
  Layout,
  LayoutEngine,
  LayoutNode,
  LayoutResult,
  Metrics,
  Node,
  OpFailure,
  ReadResult,
  ShowSelection,
  SizedNode,
  Summary,
  TargetProfile,
  TextResult,
  Workspace,
  WriteResult,
} from "../../src/core/model/types.js";
import { compareCodePoints } from "../../src/core/model/util.js";
import { readText, repositoryRoot } from "../scaffold/helpers.js";

/** Compile-time check: the call only compiles when `T` is `true`. */
function assertType<T extends true>(value?: T): T | undefined {
  return value;
}
/** Mutual assignability: enough for unions of literals, `keyof` and object types, which is all these tests compare. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe("closed enumerations (T-AC-3)", () => {
  it("contain exactly the values of architecture section 7.2", () => {
    assert.deepEqual(DIAGRAM_TYPES, ["flow", "c4-context", "c4-container", "component", "architecture", "sequence"]);
    assert.deepEqual(NODE_KINDS, [
      "start", "end", "process", "decision", "io", "subprocess",
      "person", "system", "external", "container", "service", "component", "webapp", "mobile", "gateway",
      "function", "db", "cache", "storage", "queue", "topic", "module",
      "actor", "participant",
    ]);
    assert.deepEqual(GROUP_KINDS, ["boundary", "zone", "cluster", "layer", "group"]);
    assert.deepEqual(DIRECTIONS, ["TB", "LR", "BT", "RL"]);
    assert.deepEqual(THEMES, ["light", "dark"]);
    assert.deepEqual(DENSITIES, ["compact", "normal", "airy"]);
    assert.deepEqual(EDGE_STYLES, ["sync", "async", "reply", "dep"]);
    assert.deepEqual(EDGE_DIRS, ["fwd", "both", "none"]);
    assert.deepEqual(PROFILES, ["doc", "slide", "print"]);
    assert.deepEqual(SEVERITIES, ["error", "warning", "info"]);
    assert.deepEqual(CONSTRAINT_TYPES, ["same-rank", "order"]);
    assert.deepEqual(RESULT_STATUSES, ["ok", "findings", "failed", "rejected"]);
  });

  it("have no duplicate and no empty value", () => {
    for (const set of [
      DIAGRAM_TYPES, NODE_KINDS, GROUP_KINDS, DIRECTIONS, THEMES, DENSITIES, EDGE_STYLES, EDGE_DIRS, PROFILES,
      SEVERITIES, CONSTRAINT_TYPES, RESULT_STATUSES, SHAPES, ARROWHEADS,
    ] as ReadonlyArray<readonly string[]>) {
      assert.equal(new Set(set).size, set.length);
      assert.ok(set.every((value) => value.length > 0));
    }
  });

  it("are frozen, so no code can change a set at run time", () => {
    for (const set of [
      DIAGRAM_TYPES, NODE_KINDS, GROUP_KINDS, DIRECTIONS, THEMES, DENSITIES, EDGE_STYLES, EDGE_DIRS, PROFILES,
      SEVERITIES, CONSTRAINT_TYPES, RESULT_STATUSES, SHAPES, ARROWHEADS,
    ] as ReadonlyArray<readonly string[]>) {
      assert.ok(Object.isFrozen(set));
    }
    assert.throws(() => {
      (SEVERITIES as unknown as string[]).reverse();
    }, TypeError);
    assert.deepEqual(SEVERITIES, ["error", "warning", "info"]);
  });

  describe("equal the closed value sets in the architecture document", () => {
    const architecture = readText("docs", "architecture", "3-mvp-architecture.md");

    /** The values in backticks of the second cell of a row of the "Closed value sets" table, split by " / ". */
    function closedSet(label: string): string[][] {
      const prefix = `| ${label} | `;
      const row = architecture.split("\n").find((line) => line.startsWith(prefix));
      assert.ok(row, `row ${label} not found in the architecture document`);
      const cell = row.slice(prefix.length, row.lastIndexOf(" |"));
      return cell.split(" / ").map((part) => [...part.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? ""));
    }

    it("diagram types, node kinds, group kinds and header directions", () => {
      assert.deepEqual(closedSet("`type`"), [[...DIAGRAM_TYPES]]);
      assert.deepEqual(closedSet("`NODE-KIND`"), [[...NODE_KINDS]]);
      assert.deepEqual(closedSet("`GROUP-KIND`"), [[...GROUP_KINDS]]);
      assert.deepEqual(closedSet("`dir` (header)"), [[...DIRECTIONS]]);
    });

    it("themes, densities, edge styles and edge directions", () => {
      assert.deepEqual(closedSet("`theme` / `density`"), [[...THEMES], [...DENSITIES]]);
      assert.deepEqual(closedSet("`style` / `dir` (edge)"), [[...EDGE_STYLES], [...EDGE_DIRS]]);
    });

    it("profiles", () => {
      const names = architecture
        .split("\n")
        .map((line) => /^\| `(doc|slide|print)` \| /.exec(line)?.[1])
        .filter((name): name is string => name !== undefined);
      assert.deepEqual(names, [...PROFILES]);
    });
  });

  it("derive their union types from the arrays", () => {
    assertType<Equal<DiagramType, "flow" | "c4-context" | "c4-container" | "component" | "architecture" | "sequence">>();
    assertType<Equal<GroupKind, "boundary" | "zone" | "cluster" | "layer" | "group">>();
    assertType<Equal<Direction, "TB" | "LR" | "BT" | "RL">>();
    assertType<Equal<Theme, "light" | "dark">>();
    assertType<Equal<Density, "compact" | "normal" | "airy">>();
    assertType<Equal<EdgeStyle, "sync" | "async" | "reply" | "dep">>();
    assertType<Equal<EdgeDir, "fwd" | "both" | "none">>();
    assertType<Equal<ProfileName, "doc" | "slide" | "print">>();
    assertType<Equal<Severity, "error" | "warning" | "info">>();
    assertType<Equal<ResultStatus, "ok" | "findings" | "failed" | "rejected">>();
    assertType<Equal<NodeKind, (typeof NODE_KINDS)[number]>>();
    assertType<Equal<NodeKind extends string ? true : false, true>>();
  });

  it("reject a value outside the set at compile time", () => {
    const typeChecks = (): unknown[] => [
      // @ts-expect-error "generic" was a prototype type and is not in v1
      ((): DiagramType => "generic")(),
      // @ts-expect-error a node kind outside the closed set
      ((): NodeKind => "database")(),
      // @ts-expect-error a node kind is not a group kind
      ((): GroupKind => "service")(),
      // @ts-expect-error directions are upper case
      ((): Direction => "lr")(),
      // @ts-expect-error there is no third theme
      ((): Theme => "sepia")(),
      // @ts-expect-error there is no fourth density
      ((): Density => "dense")(),
      // @ts-expect-error an edge style outside the closed set
      ((): EdgeStyle => "sequence")(),
      // @ts-expect-error an edge direction outside the closed set
      ((): EdgeDir => "backward")(),
      // @ts-expect-error a profile outside the closed set
      ((): ProfileName => "web")(),
      // @ts-expect-error a status outside the closed set
      ((): ResultStatus => "done")(),
      // @ts-expect-error first and last were prototype constraints and are not in v1
      ((): Constraint => ({ type: "first", ids: ["a"] }))(),
      // @ts-expect-error the format version is 1
      ((): Diagram["version"] => 2)(),
    ];
    assert.equal(typeof typeChecks, "function");
  });

  it("are told apart from other values by the guards", () => {
    assert.equal(isDiagramType("flow"), true);
    assert.equal(isDiagramType("generic"), false);
    assert.equal(isNodeKind("db"), true);
    assert.equal(isNodeKind("database"), false);
    assert.equal(isNodeKind("boundary"), false);
    assert.equal(isGroupKind("boundary"), true);
    assert.equal(isGroupKind("db"), false);
    assert.equal(isDirection("TB"), true);
    assert.equal(isDirection("tb"), false);
    assert.equal(isTheme("dark"), true);
    assert.equal(isTheme("Dark"), false);
    assert.equal(isDensity("airy"), true);
    assert.equal(isDensity("roomy"), false);
    assert.equal(isEdgeStyle("dep"), true);
    assert.equal(isEdgeStyle("fwd"), false);
    assert.equal(isEdgeDir("both"), true);
    assert.equal(isEdgeDir("sync"), false);
    assert.equal(isConstraintType("same-rank"), true);
    assert.equal(isConstraintType("rank"), false);
    assert.equal(isProfileName("slide"), true);
    assert.equal(isProfileName("Slide"), false);
    assert.equal(isSeverity("info"), true);
    assert.equal(isSeverity("fatal"), false);
    assert.equal(isResultStatus("rejected"), true);
    assert.equal(isResultStatus("error"), false);
    for (const value of [undefined, null, 1, true, {}, [], ["flow"]]) {
      assert.equal(isDiagramType(value), false);
      assert.equal(isNodeKind(value), false);
    }
    // Inherited property names are not members.
    assert.equal(isNodeKind("toString"), false);
    assert.equal(isNodeKind("__proto__"), false);
  });

  it("let a model hold a kind outside the closed set, which is a warning and not a rejection", () => {
    const node: Node = { id: "x", kind: "database", label: "X" };
    const group: Group = { id: "g", kind: "swimlane", label: "G" };
    assert.equal(isNodeKind(node.kind), false);
    assert.equal(isGroupKind(group.kind), false);
  });
});

describe("type shapes match architecture section 7.1", () => {
  it("Diagram, Group, Node, Edge, Constraint and Diagnostic have the field names of the table", () => {
    assertType<Equal<keyof Diagram, "version" | "type" | "title" | "dir" | "theme" | "density" | "groups" | "nodes" | "edges" | "constraints" | "comments">>();
    assertType<Equal<keyof Group, "id" | "kind" | "label" | "in" | "desc" | "tags" | "meta">>();
    assertType<Equal<keyof Node, "id" | "kind" | "label" | "in" | "tech" | "desc" | "tags" | "meta">>();
    assertType<Equal<keyof Edge, "id" | "from" | "to" | "label" | "tech" | "style" | "dir" | "explicitId" | "meta">>();
    assertType<Equal<keyof Constraint, "type" | "ids">>();
    assertType<Equal<keyof Diagnostic, "severity" | "code" | "ids" | "message" | "fix" | "auto" | "line" | "op">>();
  });

  it("Metrics, Summary, TargetProfile and Workspace have the field names of the table", () => {
    assertType<Equal<keyof Metrics, "nodes" | "groups" | "edges" | "crossings" | "width" | "height" | "minTextPx" | "detours" | "endpointGaps" | "aspect" | "errors" | "warnings" | "infos">>();
    assertType<Equal<keyof Summary, "errors" | "warnings" | "infos">>();
    assertType<Equal<keyof TargetProfile, "name" | "fitWidth" | "fitHeight" | "minTextPx">>();
    assertType<Equal<keyof Workspace, "root" | "caseInsensitive">>();
    assertType<Equal<TargetProfile["fitHeight"], number | null>>();
  });

  it("Layout, results and the API object types have the fields of section 7.1", () => {
    assertType<Equal<keyof Layout, "width" | "height" | "engine" | "nodes" | "groups" | "edges" | "lifelines">>();
    assertType<Equal<keyof LayoutResult, "layout" | "diagnostics">>();
    assertType<Equal<keyof CheckResult, "layout" | "diagnostics" | "metrics" | "summary">>();
    assertType<Equal<keyof ApplyResult, "ok" | "diagram" | "changes" | "failures" | "introduced">>();
    assertType<Equal<keyof OpFailure, "index" | "op" | "diagnostic">>();
    assertType<Equal<keyof DiffEntry, "change" | "kind" | "id" | "line" | "was">>();
    assertType<Equal<DiffEntry["change"], "+" | "-" | "~">>();
    assertType<Equal<keyof ReadResult, "text" | "hash" | "diagnostics">>();
    assertType<Equal<keyof WriteResult, "written" | "path" | "diagnostics">>();
    assertType<Equal<keyof ShowSelection, "around" | "depth" | "idsOnly" | "stats">>();
    assertType<Equal<Edge["style"], EdgeStyle | undefined>>();
    assertType<Equal<Edge["dir"], EdgeDir | undefined>>();
    assertType<Equal<Constraint["type"], "same-rank" | "order">>();
    assertType<Equal<Diagram["version"], 1>>();
  });

  it("every file-pipeline result has a status and diagnostics", () => {
    assertType<Equal<FileResult["status"], ResultStatus>>();
    assertType<Equal<ApplyFileResult["status"], ResultStatus>>();
    assertType<Equal<CheckFilesResult["status"], ResultStatus>>();
    assertType<Equal<TextResult["status"], ResultStatus>>();
    assertType<Equal<DiffFileResult["status"], ResultStatus>>();
    assertType<Equal<ExportFileResult["status"], ResultStatus>>();
    assertType<Equal<FormatResult["status"], ResultStatus>>();
    assertType<Equal<DiscoveryResult["status"], ResultStatus>>();
    assertType<Equal<FileResult["diagnostics"], Diagnostic[]>>();
    assertType<Equal<ApplyFileResult["diagnostics"], Diagnostic[]>>();
    assertType<Equal<CheckFilesResult["diagnostics"], Diagnostic[]>>();
    assertType<Equal<TextResult["diagnostics"], Diagnostic[]>>();
    assertType<Equal<DiffFileResult["diagnostics"], Diagnostic[]>>();
    assertType<Equal<ExportFileResult["diagnostics"], Diagnostic[]>>();
    assertType<Equal<FormatResult["diagnostics"], Diagnostic[]>>();
    assertType<Equal<DiscoveryResult["diagnostics"], Diagnostic[]>>();
    assertType<Equal<ApplyFileResult["written"], boolean>>();
    assertType<Equal<keyof ApplyFileResult, "status" | "diagnostics" | "changes" | "failures" | "introduced" | "written" | "check">>();
  });

  it("rejects incomplete values at compile time", () => {
    const typeChecks = (): unknown[] => [
      // @ts-expect-error status is required
      ((): FileResult => ({ diagnostics: [] }))(),
      // @ts-expect-error diagnostics are required
      ((): TextResult => ({ status: "ok" }))(),
      // @ts-expect-error a status outside the closed set
      ((): FormatResult => ({ status: "done", diagnostics: [], files: [] }))(),
      // @ts-expect-error written is required
      ((): ApplyFileResult => ({ status: "ok", diagnostics: [], changes: [], failures: [], introduced: [] }))(),
      // @ts-expect-error explicitId is required on an edge
      ((): Edge => ({ id: "a>b", from: "a", to: "b" }))(),
      // @ts-expect-error an edge style is one of the closed set
      ((): Edge => ({ id: "a>b", from: "a", to: "b", explicitId: false, style: "sequence" }))(),
      // @ts-expect-error a node needs a label
      ((): Node => ({ id: "n", kind: "db" }))(),
      // @ts-expect-error a summary needs the three counts
      ((): Summary => ({ errors: 0, warnings: 0 }))(),
    ];
    assert.equal(typeof typeChecks, "function");
  });

  it("describes a diagram, a layout and an engine that compile and run", async () => {
    const diagram: Diagram = {
      version: 1,
      type: "c4-container",
      title: "Banking",
      dir: "TB",
      theme: "light",
      density: "normal",
      groups: [{ id: "c1", kind: "boundary", label: "Internet Banking", desc: "d", tags: ["t"], meta: new Map([["owner", "x"]]) }],
      nodes: [
        { id: "spa", kind: "webapp", label: "Single-Page App", in: "c1", tech: "Angular" },
        { id: "api", kind: "container", label: "API", in: "c1" },
      ],
      edges: [
        { id: "spa>api", from: "spa", to: "api", label: "Uses", style: "async", dir: "fwd", explicitId: false },
        { id: "spa>api#2", from: "spa", to: "api", explicitId: false },
        { id: "calls", from: "api", to: "c1", explicitId: true, meta: new Map([["k", "v"]]) },
      ],
      constraints: [{ type: "same-rank", ids: ["spa", "api"] }],
      comments: { header: ["# top"], statements: new Map([["node spa", ["# the spa"]]]), trailing: [] },
    };
    const sized: SizedNode = {
      id: "spa",
      w: 100,
      h: 40,
      shape: "rect",
      blocks: [{ lines: ["Single-Page App"], widths: [90], fontSize: 14, weight: "semibold", y: 8 }],
      content: { x: 4, y: 4, w: 92, h: 32 },
      truncated: false,
    };
    const placed: LayoutNode = { ...sized, x: 10, y: 20 };
    const layout: Layout = {
      width: 400,
      height: 300,
      engine: "stub",
      nodes: [placed],
      groups: [{ ...placed, id: "c1", title: { x: 0, y: 0, w: 100, h: 20 } }],
      edges: [{ id: "spa>api", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], arrowheads: { start: "none", end: "filled" } }],
    };
    const engine: LayoutEngine = {
      name: "stub",
      supports: (type) => type === "flow",
      layout: (_diagram, map) => {
        assert.equal(map.get("spa")?.w, 100);
        return Promise.resolve(layout);
      },
    };
    assert.equal(engine.supports("flow"), true);
    assert.equal(engine.supports("sequence"), false);
    assert.equal((await engine.layout(diagram, new Map([["spa", sized]]), {})).engine, "stub");
    assert.equal(diagram.comments.statements.get("node spa")?.[0], "# the spa");
  });

  it("keeps an id such as __proto__ out of the prototype chain of the comments", () => {
    const comments: Diagram["comments"] = { header: [], statements: new Map(), trailing: [] };
    comments.statements.set("node __proto__", ["# odd id"]);
    assert.deepEqual(comments.statements.get("node __proto__"), ["# odd id"]);
    assert.equal(Object.getPrototypeOf(comments.statements), Map.prototype);
  });
});

describe("meta keys (#56 item 8)", () => {
  // Valid IDs that a plain object would drop (__proto__) or confuse with its prototype (the others).
  const dangerous = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype"];

  it("is a read-only map, not an object", () => {
    assertType<Equal<NonNullable<Group["meta"]>, ReadonlyMap<string, string>>>();
    assertType<Equal<NonNullable<Node["meta"]>, ReadonlyMap<string, string>>>();
    assertType<Equal<NonNullable<Edge["meta"]>, ReadonlyMap<string, string>>>();
    const typeChecks = (): unknown[] => [
      // @ts-expect-error a plain object is not accepted: its keys would collide with the prototype
      ((): Node => ({ id: "n", kind: "db", label: "N", meta: { owner: "x" } }))(),
    ];
    assertType<Equal<"set" extends keyof NonNullable<Node["meta"]> ? true : false, false>>();
    assert.equal(typeof typeChecks, "function");
  });

  it("keeps every key, including __proto__, constructor, toString and hasOwnProperty", () => {
    const meta: NonNullable<Node["meta"]> = new Map(dangerous.map((key, index) => [key, `v${String(index)}`]));
    const holders: Array<Node | Group | Edge> = [
      { id: "n", kind: "db", label: "N", meta },
      { id: "g", kind: "boundary", label: "G", meta: new Map(meta) },
      { id: "a>b", from: "a", to: "b", explicitId: false, meta: structuredClone(meta) },
    ];
    for (const holder of holders) {
      const stored = holder.meta ?? new Map<string, string>();
      assert.equal(stored.size, dangerous.length);
      dangerous.forEach((key, index) => {
        assert.equal(stored.has(key), true, key);
        assert.equal(stored.get(key), `v${String(index)}`, key);
      });
      assert.equal(stored.get("missing"), undefined);
    }
  });

  it("sorts by code point whatever the key", () => {
    const meta: NonNullable<Node["meta"]> = new Map([["toString", "1"], ["__proto__", "2"], ["Z", "3"], ["a", "4"]]);
    assert.deepEqual([...meta.keys()].sort(compareCodePoints), ["Z", "__proto__", "a", "toString"]);
  });
});

describe("assumed shapes are marked with Open question: #56", () => {
  const source = readText("src", "core", "model", "types.ts");

  /** The doc comment that ends right before `export interface|type <name>`. */
  function docCommentOf(name: string): string {
    const declaration = new RegExp(`\\nexport (?:interface|type) ${name}\\b`).exec(source);
    assert.ok(declaration, `${name} is not declared in types.ts`);
    const before = source.slice(0, declaration.index);
    const start = before.lastIndexOf("/**");
    const end = before.lastIndexOf("*/");
    assert.ok(start !== -1 && end > start, `${name} has no doc comment`);
    assert.ok(!before.slice(end + 2).trim(), `${name} has no doc comment directly above it`);
    return before.slice(start, end);
  }

  const assumed = [
    "Meta", "DiagramComments", "Size", "TextBlock", "SizedNode", "LayoutNode", "LayoutGroup", "LabelBox",
    "LayoutEdge", "Lifeline", "Layout", "LayoutLimits", "LayoutOptions", "ValidateOptions", "DiffEntry",
    "ShowSelection", "PipelineResult", "FileResult", "ApplyFileResult", "FileCheck", "CheckFilesResult",
    "TextResult", "DiffFileResult", "ExportFileResult", "FormatResult", "DiscoveryResult",
  ];
  for (const name of assumed) {
    it(`${name} says which #56 question it depends on`, () => {
      assert.match(docCommentOf(name), /Open question: #56/);
    });
  }
});

describe("model depends on nothing (architecture section 6.1)", () => {
  const directory = join(repositoryRoot, "src", "core", "model");
  const files = readdirSync(directory).filter((name) => name.endsWith(".ts"));

  it("contains the five files of the task", () => {
    assert.deepEqual([...files].sort(), ["diagnostics.ts", "enums.ts", "index.ts", "types.ts", "util.ts"]);
  });

  for (const file of files) {
    it(`${file} imports only from inside the model module`, () => {
      const source = readText("src", "core", "model", file);
      const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1] ?? "");
      for (const specifier of specifiers) {
        assert.match(specifier, /^\.\/[a-z]+\.js$/, `${file} imports ${specifier}`);
      }
    });
  }
});
