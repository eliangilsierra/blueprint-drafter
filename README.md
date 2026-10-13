# Blueprint Drafter

A semantic diagram engine for AI coding agents. Agents describe a diagram in a compact text format
and change it with incremental operations; the engine lays it out, checks it and reports problems as
short text diagnostics, so no one has to inspect a rendered image to find overlaps or clipped text.

## Status

Early development. The repository holds the toolchain scaffold only: a core library that exports its
version constants (`API_VERSION`, `FORMAT_VERSION`) and a CLI that answers `--version` and `--help`.
The format, the layout engine, the validator, the exports and the MCP server arrive in later tasks.

- Requirements: Issue [#1](https://github.com/eliangilsierra/blueprint-drafter/issues/1).
- Architecture and decisions: `docs/architecture/` and `docs/decisions/` (ADR-0001 to ADR-0007).
- License: Apache-2.0.

## Requirements

- Node.js 22 or later
- npm 10 or later

## Run the checks

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm test
```

All commands are cross-platform (Windows, macOS, Linux) and need no browser. `npm test` compiles
`src/` and `test/` with `tsc` into `dist-test/` and runs them with `node --test`.

Try the built CLI:

```bash
node dist/cli/index.js --version
node dist/cli/index.js --help
```

## Contributing

Read [AGENTS.md](AGENTS.md): it lists the project facts and the rules of the agent team that works on
this repository. Pull Requests target `develop`, use Conventional Commits and need a human code
owner's approval.
