# Blueprint Drafter

Blueprint Drafter is a semantic diagram engine for AI coding agents. It offers a line-based text
format, incremental operations, automatic layout and machine-checkable diagnostics through one npm
package, `blueprint-drafter`: a core library (public API v1), a CLI, an MCP server (planned) and an
Agent Skill. Requirements: Issue #1; design: `docs/architecture/` and `docs/decisions/` (ADR-0001 to
ADR-0007).

## Project facts

- Stack: TypeScript 6 (strict), compiled by `tsc` to ES modules plus type declarations; Node.js 22 or
  later (`engines.node >=22`; ESLint 10 needs 22.13 or later to run `npm run lint`); npm with a
  committed `package-lock.json`; ESLint 10 with typescript-eslint; tests with the built-in `node:test` runner. One package, one binary
  (`blueprint-drafter`), no bundler, no monorepo tool (ADR-0007).
- Install: `npm ci`
- Lint: `npm run lint` (ESLint, type-aware; `src/core/**` also forbids the modules and globals listed in
  `eslint.config.core.js` (code evaluation, processes, network, computed module specifiers) and ignores inline
  `eslint-disable` comments: NFR-8; `docs/research/**` is not linted)
- Type check: `npm run typecheck` (`tsc --noEmit` over `src/`, `test/` and `bench/`)
- Test: `npm test` (first compiles `src/` and `test/` with `tsc` into `dist-test/`, then runs
  `node --test` on the compiled `*.test.js` files; works on every Node.js 22 minor without
  type-stripping flags). New tests go in `test/<area>/<name>.test.ts`, import sources with the `.js`
  extension and use `node:test` and `node:assert/strict`.
- Build: `npm run build` (cleans `dist/`, then `tsc -p tsconfig.build.json`; the bin is
  `dist/cli/index.js`)
- Layout: `src/core/<module>/` core modules (`src/core/index.ts` is the only public entry point),
  `src/cli/` CLI adapter (the bin), `src/mcp/` MCP adapter, `fonts/` unmodified IBM Plex Sans files,
  `test/` tests, `bench/` benchmark corpus, `integrations/` Agent Skill, `docs/` documentation,
  `action.yml` CI check. Only directories that hold a file exist; later tasks add the others
  (architecture section 6.1).
- Conventions: `package.json` scripts use no shell-specific construct (NFR-12); runtime and
  development dependencies are pinned to exact versions; the core makes no network call, starts no
  process and evaluates no code. `.github/workflows/` is maintained by humans only.
- Branches: `develop` is the integration branch and the default branch; `main` holds releases only

## Team contract

This project is worked on by the agent team defined in
`https://github.com/eliangilsierra/openhands-agent-team`. Its `AGENTS.md` applies in full; read it with
`gh api` (do not clone it into your workspace). The essentials, repeated here because they are the
rules most often broken:

- **One stage of one work item per subagent.** Do your role's stage, update your checkpoint and
  report with the result contract. Never take another role or continue with the next stage.
- **Never review your own work.** QA, Code Review and Security Review are separate subagents and
  none of them is skipped; after QA passes, the reviews run in parallel (UX review too when the
  interface changes).
- **Work in the conversation's current directory** (the workspace the OpenHands interface shows).
  Clone this repository there.
- **One task Issue = one branch = one Pull Request.** Branch `<feature|bugfix|refactor|chore|docs>/<issue-number>-<short-description>`
  created from `origin/develop`; the Pull Request targets `develop` and has exactly one
  `Closes #<issue-number>`.
- **Conventional Commits** for every commit and every Pull Request title:
  `<type>(<scope>): <description>` with type `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
  `test`, `build`, `ci`, `chore` or `revert`.
- **Never push to `develop` or `main`, merge into them locally, or merge or approve a Pull Request.**
  A human squash-merges task Pull Requests into `develop` on GitHub. Releases go from `develop` to
  `main` through a Pull Request that only a human opens and merges (with a merge commit).
- **QA reports and reviews are Pull Request comments and reviews**, never files in the repository. A
  `FAIL` or `CHANGES REQUESTED` verdict adds the `changes-requested` label, which blocks the merge.
- Do not change the configured git identity or bypass git hooks. Never commit secrets, and never
  publish secrets or private data in Issues, Pull Requests, comments or commit messages.

## Roles and skills

| Role | Skills |
| --- | --- |
| product-manager | product-management |
| researcher | research |
| architect | architecture, research |
| planner | planning, stack-routing |
| developer (generalist or the stack specialist the coordinator chose: developer-typescript, developer-react, developer-nextjs, developer-angular, developer-vue, developer-java-spring, developer-kotlin-android, developer-python, developer-go, developer-dotnet) | development, testing and the stack skill of the module (`stack-*`) |
| qa-engineer | testing |
| code-reviewer | code-review |
| security-reviewer | security-review |
| ux-designer | ux-design (web and Android/Kotlin) |
| technical-writer | technical-writing (README and docs/) |
| orchestrator | orchestration, stack-routing |

The coordinator gives your role and work item in the brief. Use only the skills of your row.
