# ADR-0001: Build a local-first, deterministic TypeScript core library with thin adapters

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
| Related ADRs | ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0007 |

## Context

Blueprint Drafter turns a semantic description of a diagram (elements, relations, groups) into a laid
out, validated and rendered diagram for AI coding agents (Issue #1). The requirements that shape the
structure are:

- NFR-1: the same input produces byte-identical output on every run.
- NFR-2 and NFR-10: the basic workflow (create, validate, edit, render, export) runs with no network,
  no API key, no browser and no telemetry.
- NFR-8: parsing evaluates no input and the core starts no child process.
- NFR-12: the package installs and passes its tests on Windows, macOS and Linux without a browser.
- NFR-13: the public core API is a documented, versioned v1 contract.
- The users include "authors of tools and agents" who need an embeddable library, and agents that
  reach the functions through a CLI or an MCP server (FR-24, FR-25).

Evidence from the 2026-10-13 study ([research report](../research/1-llm-native-diagramming.md)):
the prototype, written as TypeScript modules run by Node 24, was byte-identical over 3 runs in 8 of 8
cases and took 10-334 ms per case (F-19); the layout engine (elkjs), the font library (fontkit), the
PNG renderer (resvg-js) and the MCP SDK are all available to Node without a browser (study doc 7 §5).
The weighted matrix ranks "core + CLI" first under the cost/risk profile and the hybrid with adapters
first in four of five profiles (I-7). The repository owner accepted this decision in the
"Human decisions" comment on Issue #1.

## Decision

We will implement all domain logic (format, operations, queries, text measurement, layout,
validation, rendering, export and file-access policy) in **one TypeScript library that runs on
Node.js**, organised as modules with pure interfaces, and we will keep every integration (CLI, MCP
server, Agent Skill, CI check) as a **thin adapter** with no domain logic.

- **Local-first:** the library and its adapters make no network request, need no account, key,
  service or database, and send no telemetry. Files in the user's repository are the only storage.
- **Deterministic:** no clock, randomness, locale-dependent sorting or environment-dependent value
  reaches an output; dependency versions that affect output are pinned exactly.
- **Not in scope of this decision:** how the package is split and distributed (ADR-0007) and which
  adapters exist (ADR-0004).

## Alternatives

| Alternative | Summary | Why not chosen |
| --- | --- | --- |
| Separate services (layout, validation, render) | Processes or containers talking over HTTP | Adds deployment, latency and attack surface with nothing to scale; violates NFR-2's "no services" intent |
| One monolithic module | Parser, layout and validator in one file set without interfaces | Cannot swap the layout engine or validate third-party layouts; hard to test |
| Rust or Go core | Native binary, possibly faster | elkjs, fontkit and the MCP SDK live in the JavaScript ecosystem; the measured speed (F-19) already meets NFR-6; a second language raises maintenance cost (R-10) |
| Browser-based rendering (Mermaid, Chromium) | Reuse a DOM renderer | Needs a browser, which NFR-2 and NFR-12 exclude |

## Consequences

**Positive**

- One tested implementation serves the library, the CLI, the MCP server and CI, so behaviour cannot
  drift between interfaces.
- Determinism and offline operation are properties of the code, testable in CI (AC-37, AC-38).
- Agents and tool authors can embed the library directly.

**Negative**

- Interface discipline between modules is needed; adapters must not grow logic.
- Node.js is a runtime dependency for every user (accepted: target agents and CI runners have it).

**Follow-up actions**

- The module boundaries and the v1 API are specified in
  [docs/architecture/3-mvp-architecture.md](../architecture/3-mvp-architecture.md).
- A lint rule forbids network, child-process and dynamic-evaluation APIs in the core (NFR-2, NFR-8).

## Security considerations

Keeping everything in-process and offline removes network attack surface and data exfiltration
paths. Untrusted diagram files still cross a trust boundary into the parser; input limits, output
escaping and the workspace restriction are part of the core (NFR-7, NFR-8, NFR-9, FR-26).

## Operational considerations

No service to deploy, monitor or back up. Distribution is an npm package (ADR-0007). Maintenance is
estimated at 0.3-0.5 FTE after v1 (study estimate, R-10), mostly tracking dependency and client
changes.
