# ADR-0006: Name the CLI binary, the diagram file extension and the format header keyword

## Status

Accepted

Accepted by the repository owner (@eliangilsierra) in the "Human decisions" comment on Issue #1:
<https://github.com/eliangilsierra/blueprint-drafter/issues/1#issuecomment-6156238827>.

| Field | Value |
| --- | --- |
| Date proposed | 2026-10-13 |
| Date decided | 2026-10-13 |
| Decided by | @eliangilsierra (repository owner) |
| Related Issue | #3 (architecture), #1 (requirements, Q-6) |
| Supersedes | None |
| Related ADRs | ADR-0003, ADR-0004, ADR-0007 |

## Context

The owner fixed the product name **Blueprint Drafter** and the npm package name `blueprint-drafter`
(answer to Q-6 on Issue #1) and left the CLI command name open. Three more names become public
contracts once the first release ships and are expensive to change afterwards: the binary that agents
and CI scripts call, the file extension that the MCP server and the CI check look for, and the keyword
of the first line of every diagram file. The research prototype used "plano" for all of them, which is
only the research working name.

Facts that constrain the choice:

- `npx <name>` resolves `<name>` as an **npm package name**. If documentation tells agents to run a
  short binary name through `npx` and that name belongs to another npm package, the agent downloads
  and runs someone else's code (supply-chain risk).
- MCP clients namespace tools by server name, so tool names can be brand-neutral.
- Whether a short name or extension is already used elsewhere was **not verified** (ASSUMPTION; check
  the npm registry and common file-extension registries before deciding).

## Decision

We will use these names (chosen by the owner, the recommended options):

| Name | Decision |
| --- | --- |
| CLI binary | **`blueprint-drafter`**, equal to the npm package name, so `npx blueprint-drafter ...` always runs the right package. No short alias for now: on 2026-10-13 the npm names `drafter` and `bpd` already belonged to unrelated packages (owner's check) |
| Diagram file extension | **`.bpd`** |
| Format header keyword | **`diagram`**: every file starts with `diagram 1 type=...` |
| MCP server name | `blueprint-drafter` |
| MCP tool prefix | `diagram_` (`diagram_new`, `diagram_apply`, ...) |
| Workspace environment variable | `BLUEPRINT_DRAFTER_WORKSPACE` |
| Agent Skill name | `blueprint-drafter` |

Options that were considered for the CLI binary:

| Option | Pros | Cons |
| --- | --- | --- |
| **A. `blueprint-drafter` (chosen)** | Equals the package name, so `npx blueprint-drafter ...` is always the right package; no collision | Long to type (agents and CI do not mind) |
| B. `blueprint-drafter` plus a short alias such as `bpd` | Short command after a global or project install | Two names to document; `npx bpd` resolves a different npm package, so docs must always use the long form with `npx` |
| C. `bpd` only | Shortest | `npx bpd` runs whatever package owns `bpd` (an unrelated package on 2026-10-13) |
| D. `blueprint` | Readable | Generic; likely to collide with other tools |

Options considered for the extension: `.bpd` (chosen; short and specific) or `.blueprint`. For the
header keyword: `diagram` (chosen; brand-neutral and self-explanatory to models) or the binary name.

## Alternatives

| Alternative | Summary | Why not chosen |
| --- | --- | --- |
| Keep the research names (`plano`, `.plano`) | No change from the prototype | "plano" is only the research working name (Q-6); it does not match the product or package name |
| Decide later, after the first release | Ship with provisional names | Renaming a binary, extension or header after release breaks scripts, CI and existing files |

## Consequences

**Positive**

- Option A makes the documented `npx` command safe by construction.
- A brand-neutral header and tool prefix survive a future product rename.

**Negative**

- Option A is long; a short alias can be added later without breaking anything (additive).

**Follow-up actions**

- The first implementation task (scaffold) uses these names.

## Security considerations

Documentation and the Skill must always invoke the CLI through the package name with `npx`, never
through a short alias, to avoid running an unrelated npm package.

## Operational considerations

The names appear in the package manifest, the Skill, the CI check, the MCP configuration examples and
the format specification; all are written once the decision is taken.
