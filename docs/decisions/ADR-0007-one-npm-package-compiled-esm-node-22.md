# ADR-0007: Distribute one npm package with one binary, compiled to ESM for Node.js 22 or later

## Status

Proposed

| Field | Value |
| --- | --- |
| Date proposed | 2026-10-13 |
| Date decided | — |
| Decided by | — |
| Related Issue | #3 (architecture), #1 (requirements) |
| Supersedes | None |
| Related ADRs | ADR-0001, ADR-0004, ADR-0005, ADR-0006 |

## Context

ADR-0001 puts all logic in one TypeScript library with thin adapters; ADR-0004 adds a CLI, an MCP
server, a Skill and a CI check. The package must install and pass its tests on Windows, macOS and
Linux without a browser (NFR-12), and its API is a versioned v1 contract (NFR-13). The package name
`blueprint-drafter` is fixed by the owner (Q-6).

Facts:

- The study's plan proposed a pnpm monorepo with separate `core`, `cli` and `mcp` packages (study
  doc 7 §3).
- The prototype ran TypeScript directly with Node's type stripping. Node does not strip types from
  files inside `node_modules`, so a published package must ship JavaScript.
- The runtime dependencies are few: elkjs, fontkit, @resvg/resvg-js (prebuilt native binaries per
  platform), the MCP SDK and zod (study doc 7 §5).

## Decision

We will publish **one npm package, `blueprint-drafter`**, compiled from TypeScript to **ES modules**
with type declarations by `tsc`, for **Node.js 22 or later** (CI covers the supported LTS lines).

- `exports["."]` is the core API v1; nothing else is a public import path.
- One binary (name per ADR-0006) provides every CLI command, and the MCP server starts with the
  `mcp` subcommand, so MCP clients configure `npx -y blueprint-drafter mcp`.
- The bundled font files and their licence ship inside the package; the package never writes into its
  own installation directory.
- The Agent Skill and the CI check (a composite GitHub Action) live in this repository and call the
  published package.

## Alternatives

| Alternative | Summary | Why not chosen |
| --- | --- | --- |
| Monorepo with `core`, `cli` and `mcp` packages | Separate packages and versions (study doc 7 §3) | More release machinery for one maintainer; library users rarely mind the small MCP SDK dependency; can be split later while keeping `blueprint-drafter` as the core name |
| Ship TypeScript sources | Rely on Node's type stripping | Node does not strip types under `node_modules` |
| Single-file bundle (esbuild) | One bundled JavaScript file | Adds a bundler; worse stack traces; no requirement needs it |
| Separate MCP binary | Second `bin` entry | Two names to document; one binary with a subcommand is simpler |

## Consequences

**Positive**

- One version number, one install, one release process.
- `npx -y blueprint-drafter mcp` and `npx blueprint-drafter check` work without configuration.

**Negative**

- Library users install the MCP SDK and zod even if they never start the server.
- A later split into several packages is a deliberate breaking change for import paths other than
  `blueprint-drafter`.

**Follow-up actions**

- Repository scaffold work package (package manifest, `tsc` build, test runner, lint rules).

## Security considerations

Fewer packages means fewer publish credentials and a smaller supply chain. Releases use npm provenance
and attach an SBOM (ADR-0005). The package has no install scripts of its own.

## Operational considerations

Releases follow semantic versioning, from `main` through the human-run release Pull Request
(two-branch project). @resvg/resvg-js prebuilt binaries must exist for each supported platform; the CI
matrix on Windows, macOS and Linux verifies it (AC-47).
