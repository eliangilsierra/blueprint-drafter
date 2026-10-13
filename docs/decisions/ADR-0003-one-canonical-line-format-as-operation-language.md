# ADR-0003: Use one line-based canonical text format that is also the operation language

## Status

Proposed

| Field | Value |
| --- | --- |
| Date proposed | 2026-10-13 |
| Date decided | — |
| Decided by | — |
| Related Issue | #3 (architecture), #1 (requirements) |
| Supersedes | None |
| Related ADRs | ADR-0001, ADR-0004, ADR-0006 |

## Context

Diagrams live in the user's repository and are reviewed in pull requests. Agents create them and then
change them incrementally. The requirements are:

- FR-8: one canonical line-based text format; the same model always serialises to the same text.
- FR-9 to FR-11: incremental operations `+` add, `~` update, `-` remove, referencing elements by
  stable ids; atomic batches; a suggestion for unknown ids.
- FR-12: a validator with actionable diagnostics (code, ids, suggested fix).
- NFR-3: an incremental edit of benchmark case 8 costs at most 100 tokens of operations.
- FR-6 and A-9: the input never carries coordinates, sizes or colours.

Evidence from the study ([research report](../research/1-llm-native-diagramming.md)): the
one-statement-per-line text is as compact as Mermaid (F-21), the case-8 edit costs 64 tokens of
operations against 423 to regenerate the file (F-22), an invalid batch was rejected atomically with a
"did you mean" suggestion (F-24), and statement order changes the layout, so canonical serialisation
is mandatory (F-28). The repository owner accepted this decision in the "Human decisions" comment on
Issue #1.

## Decision

We will store every diagram in **one line-based canonical text format** (one statement per line) and
use **the same statement grammar as the operation language**: an operation is a statement prefixed
with `+` (add), `~` (update, partial statement) or `-` (remove, by reference).

- **Stable ids:** nodes and groups carry author-chosen ids that the engine never changes; edges get a
  derived id `from>to` (`#n` for parallel edges) or an explicit `id=`.
- **Atomic batches:** a batch is applied to a copy; if any operation fails, or the result has
  semantic errors that did not exist before, nothing is written and every failing operation is
  reported.
- **Canonical serialisation:** the serialiser fixes statement order, attribute order, quoting and
  line endings, so `parse` then `serialize` is idempotent.
- **Validator:** every finding has a code, a severity, the affected ids, a message and, where one
  exists, a suggested correction expressed as an operation.
- **No geometry in the source:** the format has no coordinate, size or colour attributes.
- **Versioning:** the file header carries the format version; v1 only adds; removing or changing
  meaning requires v2 and a migrator.
- The concrete grammar, the operation semantics and the diagnostic catalogue are specified in
  [docs/architecture/3-mvp-architecture.md](../architecture/3-mvp-architecture.md); the header
  keyword and the file extension are decided in ADR-0006.

## Alternatives

| Alternative | Summary | Why not chosen |
| --- | --- | --- |
| JSON or YAML document plus JSON Patch | Structured file and patch operations | Indented JSON costs 1,399 tokens for case 4 against 424 (study doc 5 §1); noisy Git diffs; two grammars to learn |
| Separate file format and operation API | For example a DSL file plus typed operation objects | Two contracts to keep consistent; the same line cannot serve as diff, response and operation |
| Mermaid as the source format | Reuse an existing syntax | Syntax varies by diagram type; no stable ids for edges; no operation semantics |
| Typed JSON operations only | MCP passes structured objects | Kept as a possible additive adapter change if the agent experiment shows more syntax errors with the text operations (R-4) |

## Consequences

**Positive**

- One line per element gives readable Git diffs and lets one line be a diff entry, an operation and a
  response.
- Edits are cheap in tokens (F-22) and atomic.

**Negative**

- A new format to document and for models to learn; small models may make syntax errors (R-4), which
  the syntax diagnostics must make cheap to fix.
- Canonical serialisation rewrites the file's order and formatting; hand formatting is not preserved.

**Follow-up actions**

- Format specification and diagnostics catalogue documents in English (Issue #1 scope).

## Security considerations

Diagram files can come from untrusted pull requests. The parser is a linear hand-written tokenizer with
no evaluation, bounded by input limits checked before tokenizing and before layout (NFR-8, NFR-9).

## Operational considerations

The format version in the header lets older and newer tools detect incompatible files
(`E_VERSION_UNSUPPORTED`). Golden tests pin the canonical serialisation of the benchmark corpus.
