# ADR-0002: Reuse ELK Layered (elkjs) for graph layout and a dedicated sequence engine

## Status

Accepted

Accepted by the repository owner (@eliangilsierra) in the "Human decisions" comment on Issue #1:
<https://github.com/eliangilsierra/blueprint-drafter/issues/1#issuecomment-6153734681>.

| Field | Value |
| --- | --- |
| Date proposed | 2026-10-13 |
| Date decided | 2026-10-13 |
| Decided by | @eliangilsierra (repository owner) |
| Related Issue | #3 (architecture), #1 (requirements) |
| Supersedes | None |
| Related ADRs | ADR-0001, ADR-0005 |

## Context

Every diagram type in the MVP needs automatic layout (FR-1 to FR-6): flowcharts, C4 context and
container views, component dependencies and architecture views with nested groups are graphs;
sequence diagrams are an ordered grid of participants and messages. Text must be sized with real
font metrics (FR-7), and labels must not overlap nodes (FR-15).

Evidence from the study ([research report](../research/1-llm-native-diagramming.md)):

- ELK Layered (elkjs 0.12.0, EPL-2.0 OR GPL-3.0-or-later) supports ports, labels as obstacles,
  hierarchy and model order; dagre does not support edges to clusters (F-11).
- With label space reserved in the layout, the prototype had 0 error-level findings on all measured
  cases; ablations without the engine's decisions gave 5-43 errors per case (F-13, F-17).
- A generic graph engine is not adequate for sequence diagrams (F-13).
- Automatic layout is a commodity (Mermaid 12 ships ELK by default, F-5); building an engine from
  scratch never wins in the weighted matrix (option D, I-7).
- Layout stability after edits is unsolved in open-source tooling (F-27, I-6) and is out of the MVP
  scope (Issue #1, A-5).

The repository owner accepted this decision in the "Human decisions" comment on Issue #1.

## Decision

We will lay out all graph-shaped diagram types with **ELK Layered through elkjs**, and sequence
diagrams with a **dedicated sequence engine** written in the core. We will not write a general graph
layout engine.

- Both engines implement one internal `LayoutEngine` interface and produce the same `Layout` data
  structure, so validation, rendering and export do not depend on the engine.
- Own effort goes to what ELK does not provide: text measurement and wrapping, shape presets,
  clipping edge ends to the real shape outline, label placement rules, constraint checks and the
  validator.
- The elkjs version is pinned exactly; changing it is a reviewed change that updates the golden
  files (R-6).
- A stable layout mode (local repair, a better router such as libavoid) is not part of this decision.

## Alternatives

| Alternative | Summary | Why not chosen |
| --- | --- | --- |
| Own layout engine from scratch | Implement layered layout and routing | Highest cost and risk for a commodity capability (option D never wins, I-7) |
| dagre | MIT layered layout | No edges to clusters; more edges through nodes and crossings in the study (F-11, F-17, F-18) |
| Graphviz (WASM) | dot layout | EPL licence as well, weaker hierarchy and label control than ELK in this use; no measured advantage |
| ELK for sequence diagrams | One engine for everything | A generic graph engine does not express lifelines and message order (F-13) |
| TALA (D2) | MPL-2.0 Go engine | Less stable under change by its author's account (F-7); Go runtime |

## Consequences

**Positive**

- Measured 0 error-level findings on the benchmark cases with the prototype's use of ELK.
- Engine replacement stays possible behind `LayoutEngine` (for example a future stable mode).

**Negative**

- Runtime dependency on elkjs (EPL-2.0, weak copyleft; used unmodified, ADR-0005).
- ELK's behaviour can change between versions; goldens must be refreshed deliberately.
- ELK has no direct "same rank" constraint; the `rank same` and `order` constraints need options to be
  verified in a spike and a geometric post-check that reports `I_CONSTRAINT_UNMET` (FR-18).
- Layout time above 40 elements is not measured (A-6); a sizing spike sets the input limits (Q-4).

**Follow-up actions**

- Sizing spike and constraint spike are work packages in the architecture document.

## Security considerations

elkjs is third-party code that processes untrusted graph sizes; layout runs in a worker thread with a
time budget so that a pathological input cannot hang the process (NFR-9). No user text is evaluated.

## Operational considerations

Pin elkjs exactly; track its releases; refresh golden SVG files only in a reviewed Pull Request.
