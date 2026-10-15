import { mergeLimits } from "../../src/core/limits/index.js";
import type { Limits } from "../../src/core/limits/index.js";
import type { Diagnostic, Diagram, Edge, Group, Node } from "../../src/core/model/index.js";

/** An empty diagram; the fields of the test are added with the builders below. */
export function diagram(parts: { groups?: Group[]; nodes?: Node[]; edges?: Edge[] } = {}): Diagram {
  return {
    version: 1,
    type: "flow",
    dir: "TB",
    theme: "light",
    density: "normal",
    groups: parts.groups ?? [],
    nodes: parts.nodes ?? [],
    edges: parts.edges ?? [],
    constraints: [],
    comments: { header: [], statements: new Map(), trailing: [] },
  };
}

export function group(id: string, extra: Partial<Group> = {}): Group {
  return { id, kind: "group", label: "g", ...extra };
}

export function node(id: string, extra: Partial<Node> = {}): Node {
  return { id, kind: "process", label: "n", ...extra };
}

export function edge(from: string, to: string, extra: Partial<Edge> = {}): Edge {
  return { id: `${from}>${to}`, from, to, explicitId: false, ...extra };
}

/** Limits with some values changed; fails the test when an override is invalid. */
export function limitsWith(overrides: Partial<Limits>): Limits {
  const merged = mergeLimits(overrides);
  if (merged.diagnostics.length > 0) {
    throw new Error(`invalid test limits: ${merged.diagnostics.map((d) => d.message).join("; ")}`);
  }
  return merged.limits;
}

/** The single diagnostic of a result, failing the test when there is not exactly one. */
export function only(diagnostics: readonly Diagnostic[]): Diagnostic {
  const [first, ...rest] = diagnostics;
  if (first === undefined || rest.length > 0) {
    throw new Error(`expected exactly one diagnostic, got ${String(diagnostics.length)}`);
  }
  return first;
}

/** A chain of `count` nested groups: g1 at the top, g2 in g1, and so on. */
export function groupChain(count: number): Group[] {
  const groups: Group[] = [];
  for (let i = 1; i <= count; i++) {
    groups.push(i === 1 ? group("g1") : group(`g${String(i)}`, { in: `g${String(i - 1)}` }));
  }
  return groups;
}
