# ADR-0005: License the project under Apache-2.0 and admit runtime dependencies by licence policy

## Status

Accepted

Accepted by the repository owner (@eliangilsierra) in the "Human decisions" comment on Issue #1:
<https://github.com/eliangilsierra/blueprint-drafter/issues/1#issuecomment-6153734681>.
That comment accepts the Apache-2.0 licence; the dependency constraint (elkjs EPL-2.0, resvg-js
MPL-2.0, IBM Plex Sans OFL-1.1) is the owner's own constraint in the original request quoted in
Issue #1 and listed in Issue #3.

| Field | Value |
| --- | --- |
| Date proposed | 2026-10-13 |
| Date decided | 2026-10-13 |
| Decided by | @eliangilsierra (repository owner) |
| Related Issue | #3 (architecture), #1 (requirements) |
| Supersedes | None |
| Related ADRs | ADR-0001, ADR-0002 |

## Context

The project must be open-source friendly and usable inside companies and agent ecosystems. Issue #1
sets the constraint "Licence: Apache-2.0 for the project; dependencies must be compatible (elkjs
EPL-2.0, resvg-js MPL-2.0, IBM Plex Sans OFL-1.1)", and NFR-11 requires every runtime dependency to be
compatible with distribution under Apache-2.0 and listed with its licence and notices. The repository
already contains the Apache-2.0 `LICENSE` file.

Licences verified by the study on 2026-10-13 (study doc 7 §6, F-10, F-11, F-12): elkjs is
EPL-2.0 OR GPL-3.0-or-later; fontkit is MIT; @resvg/resvg-js is MPL-2.0; IBM Plex Sans is OFL-1.1 with
the reserved font name "Plex"; the MCP SDK and zod are MIT; libavoid is LGPL-2.1-or-later; tldraw's
licence forbids production use without a commercial key. The repository owner accepted the Apache-2.0
licence in the "Human decisions" comment on Issue #1.

## Decision

We will license all project code and documentation (core, CLI, MCP server, Skill, CI check) under
**Apache-2.0**, and admit a **runtime** dependency only under this policy:

| Licence class | Rule |
| --- | --- |
| Permissive (MIT, BSD, ISC, Apache-2.0) | Allowed; keep the notices |
| Weak copyleft (EPL-2.0, MPL-2.0) | Allowed only when used **unmodified**; keep the notice and a pointer to the source. elkjs is used under EPL-2.0; @resvg/resvg-js under MPL-2.0 |
| Fonts under OFL-1.1 | Allowed when embedded **unmodified** (no subsetting or renaming in the MVP); ship the OFL text. IBM Plex Sans is the bundled font |
| LGPL, GPL, AGPL, source-available or non-commercial licences | Not allowed at runtime without a new ADR (libavoid for a future stable mode would need one and a legal review) |

Development-only dependencies (benchmark, tests, tokenizers, round-trip libraries) are not
distributed and may use any OSI-approved licence. Every runtime dependency and bundled asset is listed
in a third-party notices file that a test compares with the package's dependency list (AC-46).

## Alternatives

| Alternative | Summary | Why not chosen |
| --- | --- | --- |
| MIT | Shorter permissive licence | No explicit patent grant, which matters to companies |
| AGPL or BSL | Protect a commercial offering | Fragments adoption in companies and agent ecosystems (study doc 7 §6) |
| No licence policy, decide per dependency | Ad-hoc review | NFR-11 needs a checkable rule; ad-hoc review misses transitive changes |

## Consequences

**Positive**

- Explicit patent grant; compatible with using EPL-2.0 and MPL-2.0 libraries unmodified.
- A checkable rule for every new runtime dependency.

**Negative**

- Patching elkjs or resvg-js in place would trigger source-publication duties for the changed files;
  fixes go upstream instead.
- The font cannot be subset to shrink SVG output without reviewing the OFL reserved-name clause.

**Follow-up actions**

- Create `NOTICE` and the third-party notices file with the first runtime dependency; the notices
  cover the whole production tree, including optional platform packages, and record the licence
  elected for elkjs (EPL-2.0).
- Vendor the unmodified IBM Plex Sans files with the OFL text instead of depending on the npm package
  `@ibm/plex-sans`, whose `postinstall` runs a telemetry tool (architecture sections 6.1 and 9).

## Security considerations

A small, reviewed set of runtime dependencies limits supply-chain exposure; the notices test also
detects unexpected new runtime dependencies.

## Operational considerations

Each release regenerates and checks the notices; an SBOM is attached to releases.
