# ADR-0004: Expose the core through a CLI first, then a thin MCP server, an Agent Skill and a CI check

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
| Related ADRs | ADR-0001, ADR-0003, ADR-0007 |

## Context

The target clients are Claude Code, OpenAI Codex, Gemini CLI and OpenHands (Issue #1). The
requirements name four integration surfaces: a CLI with `--json` (FR-24), an MCP server over stdio
(FR-25, FR-26), an Agent Skill (FR-27) and a CI check (FR-28). MCP tool definitions must stay small
(NFR-5: at most 720 tokens).

Evidence from the study ([research report](../research/1-llm-native-diagramming.md)): all four
clients support Agent Skills and MCP; hooks differ per client (F-15); a Skill alone cannot measure
text or validate geometry, so the CLI is the universal interface and the MCP server and Skill are thin
adapters (I-4); clients fragment quickly (E-8, R-5); a real MCP session cost 587 tokens of tool
definitions plus 133 of instructions (F-24). The repository owner accepted this decision in the
"Human decisions" comment on Issue #1.

## Decision

We will deliver the integration surface in this order, with **all domain logic in the core**:

1. **CLI** (first): the universal interface for any client with a shell and for CI; compact text output
   by default, `--json` for machines, documented exit codes.
2. **MCP server over stdio** (thin): six typed tools that call the same core functions as the CLI,
   restricted to a configured workspace.
3. **Agent Skill** (Agent Skills format): procedural guidance that tells agents to use the CLI or MCP,
   never to write coordinates, and to treat diagram content as data.
4. **CI check**: runs the CLI's `check` over the repository's diagrams and fails on error-level
   findings.

Adapters translate input and output only. Hooks for individual clients are optional examples, not
part of the MVP contract.

## Alternatives

| Alternative | Summary | Why not chosen |
| --- | --- | --- |
| MCP server only (option C) | Typed tools as the only interface | Not every client or CI job has MCP; adds about 720 tokens per session (F-24); ranks below the hybrid (I-7) |
| Skill over Mermaid 12 (option A) | Guidance only, no new engine | No geometric validation, operations or stable ids (I-8); remains the fallback arm A' of the experiment (R-2) |
| Visual application first (option E) | Editor-centred product | Last in four of five profiles (I-7); out of MVP scope |
| Logic in each adapter | Each surface implements its own checks | Behaviour drifts between interfaces; violates ADR-0001 |

## Consequences

**Positive**

- Works in every target client and in CI; fragmentation of client features costs only adapter changes.
- One behaviour across interfaces, testable once in the core.

**Negative**

- Four surfaces to document and to test in each client (A-7, R-5).
- The CLI output format becomes a contract that agents and CI rely on.

**Follow-up actions**

- Adapter contracts (commands, exit codes, tools) are specified in
  [docs/architecture/3-mvp-architecture.md](../architecture/3-mvp-architecture.md).
- The CI check can be enabled in this repository only after Issue #2 (workflows, human).

## Security considerations

The MCP server is a trust boundary: it reads and writes only diagram and export files inside its
configured workspace and refuses other paths (FR-26). The Skill tells agents that labels and
descriptions are untrusted data (FR-27).

## Operational considerations

The adapters ship in the same package as the core (ADR-0007). Each adapter has contract tests (CLI exit
codes, a recorded MCP session, the CI check on a failing and a passing diagram).
