# Diagnostic catalogue

This document lists every diagnostic code that Blueprint Drafter reports, with its severity, the
condition that triggers it and the fix it suggests, and describes the text and JSON forms of a finding.
The text format and the operation language that produce most of these codes are in
[Text format and operation language](format.md).

Source of truth: the [architecture document](../architecture/3-mvp-architecture.md), §7.4 (cited as
"architecture §n" below), with §6.3, §6.4, §7.1 and §7.5. If this document and the architecture
disagree, the architecture wins and the difference is a defect of this document.

## Contents

- [Reading a finding](#reading-a-finding)
- [Severity](#severity)
- [Message quoting rule](#message-quoting-rule)
- [Syntax, operations, files and limits](#syntax-operations-files-and-limits)
- [Semantic](#semantic)
- [Geometric, legibility and composition](#geometric-legibility-and-composition)
- [Exit codes](#exit-codes)
- [Compatibility](#compatibility)

## Reading a finding

Every input problem and every rule violation is a finding with a catalogue code (architecture §7.1,
§7.4). A finding has a severity, a code, the ids it concerns, a message and, when a concrete correction
exists, a fix. The catalogue is a closed list in v1: new codes may be added, none is removed or
renamed within v1 (see [Compatibility](#compatibility)).

### Text form

One line per finding:

```text
<S> <CODE> <ids> — <message> | fix: <fix>
```

`<S>` is `E`, `W` or `I`. The findings are preceded by a summary line:

```text
check: <n>E <n>W <n>I · nodes=<n> edges=<n> crossings=<n> size=<w>x<h> profile=<name>
```

The text form omits info findings unless `--max` leaves room. The CLI prints at most `--max` lines, by
default 20 (architecture §7.5). Operation failures are printed as `REJECTED <CODE> op#<n> ...` lines
(see the [rejection example](format.md#rejection-example)).

### JSON form

The JSON form is the `Diagnostic` type of the core API (architecture §7.1):

| Field | Type | Meaning |
| --- | --- | --- |
| `severity` | `'error' \| 'warning' \| 'info'` | See [Severity](#severity) |
| `code` | string | A code of this catalogue |
| `ids` | string array | The element ids the finding concerns |
| `message` | string | Human-readable text, subject to the [quoting rule](#message-quoting-rule) |
| `fix` | string, optional | A concrete correction, written as an operation where possible |
| `auto` | boolean, optional | `true` when the engine resolves the finding itself on re-layout |
| `line` | number, optional | The line of the file the finding refers to |
| `op` | number, optional | The index of the operation the finding refers to |

The `diagnostics` array of the JSON output lists every severity. The shape of `check --json` is one
object per file, wrapped in `{"schema":1,"files":[...]}` (architecture §7.5):

```json
{"file":"docs/arch.bpd","profile":"doc","summary":{"errors":1,"warnings":0,"infos":1},
 "diagnostics":[{"severity":"error","code":"E_EDGE_THROUGH_NODE","ids":["api>db","cache"],
 "message":"edge \"api>db\" passes through \"cache\"","auto":true},
 {"severity":"info","code":"I_ISOLATED","ids":["audit"],"message":"node \"audit\" has no edges"}],
 "metrics":{"nodes":8,"edges":10,"crossings":0,"width":1210,"height":640}}
```

## Severity

Architecture §6.4.

| Severity | Meaning | Effect |
| --- | --- | --- |
| `error` (`E_`) | The diagram is wrong or unreadable | Fails `check` and CI |
| `warning` (`W_`) | A likely problem the agent should consider | Reported |
| `info` (`I_`) | A fact, such as crossings or aspect ratio | Reported; omitted from the text form unless `--max` leaves room |

Crossings between connectors are information, not errors. Three layers produce findings, and none uses
an LLM: syntax and operations, semantic rules on the model, and geometric rules on a layout.

## Message quoting rule

Architecture §7.4. A message that mentions untrusted text follows these rules:

- A message quotes at most the offending token, id or operation, never a whole file line.
- An operation is quoted by its keyword and reference only, for example `"~node trps"`, without its
  label or attributes.
- Every such fragment is written with the string escapes of the format (`\"`, `\\` and `\n`, see
  [Strings, escapes and rejected characters](format.md#strings-escapes-and-rejected-characters)),
  stripped of control, bidirectional and zero-width characters, and truncated to 80 characters with an
  ellipsis.
- Labels and descriptions are never echoed in messages.

## Syntax, operations, files and limits

When one of these occurs in a command, the command does not complete its normal output. Nothing is
written, except in the case of batch rule 5 (a layout failure after an accepted batch writes the batch
and returns status `failed`; see [Batch rules](format.md#batch-rules)). Architecture §7.4 and §7.3.

| Code | Severity | Trigger | Ids / location | Fix | AC |
| --- | --- | --- | --- | --- | --- |
| `E_SYNTAX` | error | Unexpected token, unterminated string, bad escape, control character, malformed edge reference, inline `#` | line or op index | Example of the expected statement | — |
| `E_MISSING_HEADER` | error | First statement is not the header | line | `diagram 1 type=...` | — |
| `E_VERSION_UNSUPPORTED` | error | Header version higher than supported | line | Upgrade the tool | — |
| `E_UNKNOWN_STATEMENT` | error | Unknown keyword | line | List of keywords | — |
| `E_UNKNOWN_ATTR` | error | Attribute key not allowed for the statement (including geometry or style keys) | line, element id | Closest key, or `meta.<key>` | AC-7 |
| `E_BAD_VALUE` | error | Value outside the closed sets of `type`, header `dir`, `theme`, `density`, edge `style` or edge `dir`; empty required value (kinds are never `E_BAD_VALUE`, §6.3) | line, element id | Valid values | — |
| `E_INVALID_OP` | error | Operation without `+`, `~` or `-`, or not allowed (for example `+diagram`) | op index | Correct form | — |
| `E_UNKNOWN_ID` | error | `~` or `-` on an id that does not exist | op index, id | Closest id or `+node` | — |
| `E_DUPLICATE_ID` | error | `+` with an existing id; duplicate id in a file | op index or line, id | `~node <id> ...` | — |
| `E_UNKNOWN_CONSTRAINT` | error | `-rank same` or `-order` that matches no constraint | op index | Existing constraints | — |
| `E_BATCH_INTRODUCES_ERRORS` | error | The batch would add semantic errors | introduced diagnostics | Per introduced diagnostic | — |
| `E_LIMIT_EXCEEDED` | error | A limit of §9 exceeded (bytes, line length, elements, label length, id length, depth, ops, ops bytes, files, PNG pixels) | limit name, value, maximum | Split the diagram into views | — |
| `E_LAYOUT_TIMEOUT` | error | Layout and validation exceeded the time budget or the worker heap limit | — | Split the diagram into views | — |
| `E_UNKNOWN_PROFILE` | error | Profile name not in `doc`, `slide`, `print` | — | Valid names | AC-22 |
| `E_FILE_NOT_FOUND` | error | Input file missing or unreadable | path | — | — |
| `E_NOT_REGULAR_FILE` | error | Path is a symbolic link, directory where a file is expected, device, FIFO or other non-regular file | path | Pass a regular file | — |
| `E_EXISTS` | error | `new` on an existing file | path | Use `apply` | — |
| `E_OUTSIDE_WORKSPACE` | error | Path resolves outside the workspace | path | Use a path inside the workspace | — |
| `E_BAD_EXTENSION` | error | Source not `.bpd`, or output extension not allowed for the format | path | Allowed extensions | — |
| `E_STALE_FILE` | error | The file changed between read and write | path | Re-run the command | — |
| `E_INTERNAL` | error | Unexpected internal failure (bug) | — | Report an issue | — |

Notes:

- `E_BAD_VALUE` is narrowed: node and group kinds outside the closed set are never `E_BAD_VALUE`, they
  are `W_UNKNOWN_KIND` (see [Semantic](#semantic) and the policy in
  [Kinds, styles and dir per diagram type](format.md#kinds-styles-and-dir-per-diagram-type)).
- `E_UNKNOWN_ATTR` covers attribute keys that look like geometry or style (`x`, `y`, `w`, `h`, `width`,
  `height`, `pos`, `color`, `fill`, `stroke`, `font`, `size`) with the specific message "positions,
  sizes and colours are computed", and the update-only keys `label=` and `kind=` in file lines and `+`
  operations, with the fix "the label is positional" (see
  [No coordinates, sizes or colours](format.md#no-coordinates-sizes-or-colours) and
  [Operation language](format.md#operation-language)).
- An explicit path is not skipped by the name rules of directory discovery, but it must be a regular
  file, otherwise `E_NOT_REGULAR_FILE` (architecture §7.5).
- The architecture assigns acceptance criteria to individual codes only in the geometric table and
  for `E_UNKNOWN_ATTR` (AC-7) and `E_UNKNOWN_PROFILE` (AC-22). The column shows "—" where it assigns
  none.

## Semantic

Findings on the model, before any layout. Architecture §7.4.

| Code | Severity | Trigger | Fix | AC |
| --- | --- | --- | --- | --- |
| `E_BAD_ID` | error | Id does not match the id pattern | Valid id | — |
| `E_UNKNOWN_PARENT` | error | `in=` names no element | Closest group or `+group` | — |
| `E_PARENT_NOT_GROUP` | error | `in=` names a node | Use a group | — |
| `E_CONTAINMENT_CYCLE` | error | Groups contain each other | Break the cycle | — |
| `E_DANGLING_EDGE` | error | Edge endpoint does not exist | Closest id or `+node` | — |
| `E_CONSTRAINT_UNKNOWN_ID` | error | Constraint names an unknown id | Closest id | — |
| `E_CONSTRAINT_CONFLICT` | error | One id in two `rank same` constraints, or contradictory `order` | Remove one | — |
| `E_UNSUPPORTED_FOR_TYPE` | error | Construct not allowed for the diagram type (groups or constraints in `sequence`) | Remove it or change `type` | — |
| `W_UNKNOWN_KIND` | warning | Kind not in the closed set | Closest kind | — |
| `W_NOT_FOR_TYPE` | warning | Kind, group kind, edge style or edge `dir` not admissible for the diagram type (§6.3) | Closest admissible value or `~diagram type=...` | — |
| `W_UNLABELED_RELATION` | warning | C4 relation without a label | `~edge <ref> "label"` | — |
| `W_C4_PERSON_IN_BOUNDARY` | warning | A person inside a system boundary | Move it out | — |
| `W_C4_LEVEL_MIX` | warning | Components mixed with containers of another system | Split views | — |
| `I_SELF_LOOP` | info | Edge from a node to itself (non-sequence) | — | — |
| `I_ISOLATED` | info | Node without edges | — | — |

## Geometric, legibility and composition

Findings on a layout, whichever engine produced it (architecture §6.4, §7.4). The architecture states
these rules as a trigger and exceptions. A fix is attached to a finding only when a concrete semantic
correction exists; the catalogue names one for `I_ASPECT` (another `dir`) and `I_DENSITY` (split the
views).

| Code | Severity | Rule | Exceptions | AC |
| --- | --- | --- | --- | --- |
| `E_NODE_OVERLAP` | error | Boxes of unrelated elements intersect | Parent and child | AC-15 |
| `E_OUTSIDE_PARENT` | error | Child outside its group | — | AC-4 |
| `E_TEXT_OVERFLOW` | error | A text line wider than the content box, or content outside a non-rectangular shape | — | AC-16 |
| `E_EDGE_THROUGH_NODE` | error | An edge segment crosses an unrelated leaf node | Source, target and their ancestors | AC-17, AC-18 |
| `E_EDGE_ENDPOINT_GAP` | error | An edge end lies more than 2 px from the real outline of its shape (4 px on curves) | Sequence: distance to the lifeline | AC-1, AC-19 |
| `E_EDGE_UNROUTED` | error | The engine returned no route for an edge | — | — |
| `E_LABEL_OVERLAPS_NODE` | error | A label over a leaf node or over the title of an unrelated group | — | AC-20 |
| `E_LABEL_OVERLAPS_LABEL` | error | Two labels overlap | — | — |
| `E_LABEL_OVERLAPS_EDGE` | error | A label is crossed by a connector other than its own (FR-15) | The label's own connector | AC-20 (node case only; see §20) |
| `W_NODES_TOO_CLOSE` | warning | Gap under 12 px between leaves | — | — |
| `W_TEXT_TRUNCATED` | warning | Text was elided | — | AC-9 |
| `W_EDGE_THROUGH_GROUP` | warning | Edge crosses a group containing neither end | Ancestor groups of an end | AC-18 |
| `W_ARROW_TOO_SHORT` | warning | Last segment under 10 px | `dir=none` | — |
| `W_LABEL_DETACHED` | warning | Label far from its connector | — | — |
| `W_LABEL_AMBIGUOUS` | warning | Label closer to another connector than to its own | Identical fan siblings | AC-20 |
| `W_EDGE_OVERLAP` | warning | Collinear segments overlap by more than 4 px | Edges sharing an end | — |
| `W_MANY_CROSSINGS` | warning | More than 0.5 crossings per edge | — | — |
| `W_EDGE_DETOUR` | warning | Route length minus Manhattan distance above max(300, 0.35 x (width + height)) (provisional, Q-5) | — | — |
| `W_ILLEGIBLE_AT_FIT` | warning | Smallest effective text size under the profile minimum when fitted | — | AC-21 |
| `W_LOW_CONTRAST` | warning | Text contrast under 4.5:1 in the theme | — | — |
| `I_CROSSINGS` | info | Number of crossings | — | — |
| `I_EDGE_HUGS_NODE` | info | Connector within 6 px of an unrelated leaf | — | — |
| `I_ASPECT` | info | Aspect ratio above 3:1 (fix: other `dir`) | — | — |
| `I_DENSITY` | info | More than 30 elements in one view (fix: split views) | — | — |
| `I_CONSTRAINT_UNMET` | info | A `rank same` or `order` constraint does not hold in the layout | — | AC-23 |

Notes:

- `E_LABEL_OVERLAPS_EDGE` (error, FR-15) covers a label crossed by a connector other than its own. The
  architecture records that AC-20 tests only the label-over-node case and that an acceptance criterion
  for the connector case should be added (architecture §20).
- Thresholds in this table are provisional until the calibration with the human evaluation (architecture
  §6.4, §7.4, question Q-5); the architecture marks `W_EDGE_DETOUR` as provisional, and the severities
  of heuristic rules may change (see [Compatibility](#compatibility)).
- Explicit exceptions apply to all rules (architecture §6.4): a parent group containing its child is not
  an overlap; an edge entering a group that contains its own source or target is not "through a group";
  collinear segments of edges that share an end (fans, buses) are legitimate; in sequence diagrams the
  endpoint distance is measured to the lifeline.

## Exit codes

The CLI maps the status of a command to an exit code (architecture §7.5):

| Code | Meaning |
| --- | --- |
| `0` | Success; no error-level finding |
| `1` | Evaluated, and at least one error-level finding (for `fmt --check`: a file is not canonical) |
| `2` | Could not evaluate: usage error, missing or unreadable file, syntax error, limit exceeded, layout timeout, path refused, internal error |
| `3` | Operation batch rejected; nothing written |

With several files, the highest-priority code wins: 3, then 2, then 1, then 0. An uncaught exception is
mapped to `E_INTERNAL` and exit code 2, never 1, so CI cannot confuse a crash with findings.

## Compatibility

Contract scope of architecture §7.1.

Frozen within v1: function signatures, type field names, the text format, the operation language, the
CLI commands, options, output line shapes and exit codes, the MCP tools, and the diagnostic **codes** of
the syntax, operation, file, limit and semantic classes plus the error-level geometric codes.

Not frozen within v1: threshold values, profile canvases, limit defaults, message wording, and the
severity of heuristic `W_` and `I_` codes, which calibration (question Q-5) may change in a minor
release.

v1 only adds: new optional fields, new functions and new codes. Removing or changing a field or a code
needs a major version. See the same section in [Text format and operation
language](format.md#compatibility).
