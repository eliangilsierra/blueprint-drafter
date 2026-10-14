# The .bpd text format and operation language

This document specifies the text format of Blueprint Drafter diagram files (extension `.bpd`) and the
operation language that edits them. Both use the same statements. The closed list of diagnostic codes
the tool reports is in [Diagnostic catalogue](diagnostics.md).

Source of truth: the [architecture document](../architecture/3-mvp-architecture.md) (cited as
"architecture §n" below), [ADR-0003](../decisions/ADR-0003-one-canonical-line-format-as-operation-language.md)
and [ADR-0006](../decisions/ADR-0006-name-binary-extension-and-header.md). If this document and the
architecture disagree, the architecture wins and the difference is a defect of this document.

Names (ADR-0006): the command-line binary and the npm package are `blueprint-drafter`, diagram files
end in `.bpd`, and the first statement of every file starts with the keyword `diagram`.

## Contents

- [File structure](#file-structure)
- [Header](#header)
- [Statements and attributes](#statements-and-attributes)
- [Closed value sets](#closed-value-sets)
- [Kinds, styles and dir per diagram type](#kinds-styles-and-dir-per-diagram-type)
- [Ids and edge ids](#ids-and-edge-ids)
- [Comments](#comments)
- [Strings, escapes and rejected characters](#strings-escapes-and-rejected-characters)
- [No coordinates, sizes or colours](#no-coordinates-sizes-or-colours)
- [Canonical serialisation](#canonical-serialisation)
- [Worked example](#worked-example)
- [Operation language](#operation-language)
- [Versioning](#versioning)
- [Compatibility](#compatibility)

## File structure

One statement per line. Architecture §7.2.

- Encoding: UTF-8. A leading byte-order mark is accepted and dropped.
- Line endings: LF or CRLF on input; LF on output, with a final newline.
- The first statement is the header. A file whose first statement is not the header fails with
  `E_MISSING_HEADER`.
- After the header come comment lines, blank lines and the statements `group`, `node`, `edge`, `rank
  same` and `order`.
- A statement keyword that is not one of these fails with `E_UNKNOWN_STATEMENT`.

Grammar (EBNF, architecture §7.2):

```ebnf
file        = { comment-line | blank-line } , header , { comment-line | blank-line | statement } ;
header      = "diagram" , VERSION , { header-attr } ;
header-attr = ( "type" | "dir" | "theme" | "density" | "title" ) , "=" , value ;
statement   = group | node | edge | constraint ;
group       = "group" , ID , GROUP-KIND , STRING , { attr } ;     (* attr: in desc tags meta.* *)
node        = "node" , ID , NODE-KIND , STRING , { attr } ;       (* attr: in tech desc tags meta.* *)
edge        = "edge" , EDGE-REF , [ STRING ] , { attr } ;          (* attr: id tech style dir meta.* *)
constraint  = ( "rank" , "same" | "order" ) , ID , "," , ID , { "," , ID } ;
attr        = KEY , "=" , value ;
value       = WORD | STRING ;
EDGE-REF    = ID , ">" , ID , [ "#" , INT ] ;
ID          = letter-or-underscore , { letter | digit | "_" | "." | "-" } ;   (* at most 64 chars *)
KEY         = known-key | "meta." , ID ;
WORD        = 1*( letter | digit | "_" | "." | ":" | "/" | "," | "+" | "-" ) ;
STRING      = '"' , { char-except-quote-backslash-control | '\"' | '\\' | '\n' } , '"' ;
comment-line = { " " | "\t" } , "#" , { any-char } ;
VERSION     = "1" ;
```

## Header

```text
diagram 1 type=c4-container dir=TB title="Container diagram for Internet Banking System"
```

| Part | Meaning |
| --- | --- |
| `diagram` | The header keyword (ADR-0006) |
| `1` | The format version (see [Versioning](#versioning)) |
| `type=` | The diagram type: one of the values in [Closed value sets](#closed-value-sets) |
| `dir=` | The layout direction: `TB`, `LR`, `BT` or `RL` |
| `theme=` | `light` or `dark` |
| `density=` | `compact`, `normal` or `airy` |
| `title=` | The diagram title, a word or a quoted string |

The default direction depends on the type (architecture §6.3): `TB` for `flow`, `c4-context` and
`c4-container`; `LR` for `component` and `architecture`. A header value outside the closed set of
`type`, `dir`, `theme` or `density` fails with `E_BAD_VALUE`.

## Statements and attributes

| Statement | Form | Attributes (in canonical order) |
| --- | --- | --- |
| Group | `group <id> <group-kind> "<label>" {attr}` | `in`, `desc`, `tags`, `meta.*` |
| Node | `node <id> <node-kind> "<label>" {attr}` | `in`, `tech`, `desc`, `tags`, `meta.*` |
| Edge | `edge <edge-ref> ["<label>"] {attr}` | `id`, `tech`, `style`, `dir`, `meta.*` |
| Same rank | `rank same <id>,<id>{,<id>}` | none |
| Order | `order <id>,<id>{,<id>}` | none |

- The label of a group, node or edge is **positional**: a quoted string after the kind (or after the
  edge reference). `label=` is not an attribute; in a file line it fails with `E_UNKNOWN_ATTR` and the
  fix "the label is positional".
- `in=<group-id>` places the element in a group. It must name a group, containment cannot form a
  cycle, and nesting depth is limited (architecture §7.2, Containment).
- An edge may connect nodes or groups.
- `meta.<key>` attributes are opaque user metadata: they are preserved, serialised sorted by key, and
  never used for layout or rendering.
- An attribute key that is not in the list of its statement and does not start with `meta.` fails
  with `E_UNKNOWN_ATTR`.

## Closed value sets

Architecture §7.2.

| Item | Values |
| --- | --- |
| `type` | `flow`, `c4-context`, `c4-container`, `component`, `architecture`, `sequence` |
| Node kind | `start`, `end`, `process`, `decision`, `io`, `subprocess`, `person`, `system`, `external`, `container`, `service`, `component`, `webapp`, `mobile`, `gateway`, `function`, `db`, `cache`, `storage`, `queue`, `topic`, `module`, `actor`, `participant` |
| Group kind | `boundary`, `zone`, `cluster`, `layer`, `group` |
| `dir` (header) | `TB`, `LR`, `BT`, `RL` |
| `theme` | `light`, `dark` |
| `density` | `compact`, `normal`, `airy` |
| Edge `style` | `sync` (default), `async`, `reply`, `dep` |
| Edge `dir` | `fwd` (default), `both`, `none` |

## Kinds, styles and dir per diagram type

Not every member of a closed set is meaningful in every diagram type. Architecture §6.3 defines the
admissible values:

| Item | `flow` | `c4-context` | `c4-container` | `component` | `architecture` | `sequence` |
| --- | --- | --- | --- | --- | --- | --- |
| Node kinds | `start`, `end`, `process`, `decision`, `io`, `subprocess` | `person`, `system`, `external` | `person`, `system`, `external`, `container`, `service`, `webapp`, `mobile`, `gateway`, `function`, `db`, `cache`, `storage`, `queue`, `topic` | `component`, `module`, `service`, `container`, `system`, `external`, `person`, `db`, `cache`, `storage`, `queue`, `topic` | every kind except the flow kinds and `actor`, `participant` | `actor`, `participant` |
| Groups | any group kind | `boundary` | `boundary` | `boundary`, `layer`, `group` | any group kind | not allowed |
| Edge `style` | `sync`, `async` | `sync`, `async`, `dep` | `sync`, `async`, `dep` | `sync`, `async`, `dep` | `sync`, `async`, `dep` | `sync`, `async`, `reply` |
| Edge `dir` | any | any | any | any | any | `fwd` only |
| Constraints | allowed | allowed | allowed | allowed | allowed | not allowed |

Violation policy (architecture §6.3):

| Situation | Diagnostic | Result |
| --- | --- | --- |
| A kind, group kind, edge `style` or edge `dir` exists in the closed set but is not admissible for the diagram type | `W_NOT_FOR_TYPE` (warning), with the closest admissible value as fix | The element is rendered with its usual shape. A `~diagram type=...` change stays possible without rewriting every element first |
| A structure the engine cannot draw: groups or constraints in a `sequence` diagram | `E_UNSUPPORTED_FOR_TYPE` (error) | The construct is not drawn |
| A node or group kind outside the closed set | `W_UNKNOWN_KIND` (warning), with the closest kind as fix | Rendered with the generic shape. Never `E_BAD_VALUE` |
| A value that does not exist at all in `type`, header `dir`, `theme`, `density`, edge `style` or edge `dir`, or an empty required value | `E_BAD_VALUE` (error) | The file or operation is rejected |

## Ids and edge ids

Architecture §7.2, Rules.

- **Ids** are case-sensitive and unique across groups, nodes and edges. The engine never changes an
  id chosen by the author. An id matches the `ID` token of the grammar, which allows at most 64
  characters (the limit `maxIdChars`, architecture §9). An id that does not match the id pattern is
  `E_BAD_ID`; a duplicate id is `E_DUPLICATE_ID`; an id longer than the limit is reported as
  `E_LIMIT_EXCEEDED` when the limit check runs.
- **Edge ids are stable once assigned.** An edge has either an explicit id (`id=x`, kept across
  reconnections) or a derived id of the form `from>to` or `from>to#n`, with n >= 2.
- The derived id is assigned **once**, when the edge is added: `+edge a>b` takes `a>b` if it is free,
  otherwise the lowest free `a>b#n`. The reference `#1` is not used.
- The derived id is **written in the file as the edge reference**. An edge whose id is `a>b#2`
  serialises as `edge a>b#2 ...` and reloads with the same id even if `a>b` no longer exists.
- Removing or reconnecting one edge never renumbers its siblings.
- Only a reconnection (`from=` or `to=`) of an edge with a derived id gives that edge a new derived
  id, and the change line reports it as `(was a>b#2)`. An explicit id is kept.
- Within a batch, every operation refers to ids as they are after the earlier operations of the same
  batch.
- The reference `a>b#n` in a file must be consistent with the endpoints of the edge and unique;
  otherwise the file fails with `E_DUPLICATE_ID`.

Example: two parallel edges, then removal of the first.

```text
edge api>mail "Sends receipts" style=async
edge api>mail#2 "Sends alerts" style=async
```

After `-edge api>mail`, the file keeps `edge api>mail#2 "Sends alerts" style=async`. The remaining
edge is not renamed to `api>mail`.

## Comments

A line whose first non-blank character is `#` is a comment (architecture §7.2).

- Comments directly above a statement are attached to it and move with it in canonical order.
- Removing a statement removes its comments.
- Comments after the last statement stay at the end.
- A `#` anywhere else outside a string is a syntax error (`E_SYNTAX`), except inside an edge
  reference (`a>b#2`).

## Strings, escapes and rejected characters

A string is written between double quotes. Only three escapes exist: `\"`, `\\` and `\n`. Any other
escape, and an unterminated string, fails with `E_SYNTAX`.

The following are rejected with `E_SYNTAX` and a specific message (architecture §7.2, Strings):

| Rejected | Characters |
| --- | --- |
| Control characters | C0 and C1 controls |
| Bidirectional controls | U+202A to U+202E, and U+2066 to U+2069 |
| Zero-width characters | U+200B to U+200D, and U+FEFF inside a line |
| Noncharacters | Unicode noncharacters |
| Unpaired surrogates | Unpaired UTF-16 surrogates |

## No coordinates, sizes or colours

The format has no geometry or style input (requirements #1, FR-6 and assumption A-9). Positions, sizes
and colours are always computed.

- An attribute key that is not in the known set of its statement and does not start with `meta.` is
  rejected with `E_UNKNOWN_ATTR`, and the diagnostic names the line.
- A line with any of the keys `x`, `y`, `w`, `h`, `width`, `height`, `pos`, `color`, `fill`, `stroke`,
  `font` or `size` is rejected with `E_UNKNOWN_ATTR` naming the line, with the specific message
  "positions, sizes and colours are computed".
- Invalid file line: `node n1 process "Step" x=10`. In an operation batch, the batch is rejected and
  nothing is applied.

## Canonical serialisation

The serialiser writes one canonical text for a model (architecture §7.2, Canonical serialisation;
FR-8, AC-10).

1. The header, with attributes in the order `type`, `dir`, `theme`, `density`, `title`, omitting
   defaults.
2. Groups from outer to inner, siblings in model order.
3. Nodes in model order.
4. Edges in model order.
5. Constraints.

Further rules:

- Attributes of a statement follow the order in the table of [Statements and
  attributes](#statements-and-attributes), then `meta.*` sorted by key.
- A value is a bare word when it matches `WORD`, and quoted otherwise.
- Blank lines are not emitted. Line endings are LF, with a final newline.
- Comments are attached to their statement as described in [Comments](#comments).

Consequences:

- Loading a file in non-canonical order and saving it gives canonical text.
- Saving a canonical file again yields the same bytes (`parse` then `serialize` is idempotent), and
  reloading it gives the same model. The command `blueprint-drafter fmt <path>... [--check]` rewrites
  files canonically; with `--check` it only reports files that are not canonical (architecture §7.5).

## Worked example

A `c4-container` diagram in canonical order. Every line is a statement of the grammar above.

```text
diagram 1 type=c4-container title="Order Platform"
group platform boundary "Order Platform"
node customer person "Customer"
node web webapp "Web App" in=platform tech="TypeScript, React"
node api service "Order API" in=platform tech=Node.js desc="Accepts and validates orders"
node db db "Orders DB" in=platform tech=PostgreSQL
node mail external "Mail Provider"
node push external "Push Service"
edge customer>web "Uses" tech=HTTPS
edge web>api "Calls" tech=JSON/HTTPS
edge api>db "Reads and writes"
edge api>mail "Sends receipts" style=async
edge api>mail#2 "Sends alerts" style=async
edge api>push "Sends pushes" style=async
rank same web,api
```

The same file contains no `x`, `y`, `width`, `color` or any other geometry or style attribute; the
engine computes them.

## Operation language

An operation is one line: a prefix (`+`, `~` or `-`) and a statement. It uses the tokens and
non-terminals of the file grammar (`ID`, `EDGE-REF`, `STRING`, `attr`, `header-attr`, `statement`,
`constraint`). Architecture §7.3 and ADR-0003.

Grammar (EBNF, architecture §7.3):

```ebnf
op            = add | update | remove ;
add           = "+" , statement ;                                 (* same as a file line *)
update        = "~" , ( node-update | group-update | edge-update | header-update ) ;
node-update   = "node" , ID , [ NODE-KIND ] , [ STRING ] , { attr | upd-attr } ;
group-update  = "group" , ID , [ GROUP-KIND ] , [ STRING ] , { attr | upd-attr } ;
edge-update   = "edge" , ( EDGE-REF | ID ) , [ STRING ] , { attr | upd-attr | reconnect } ;
header-update = "diagram" , header-attr , { header-attr } ;       (* no version *)
upd-attr      = ( "label" | "kind" ) , "=" , value ;              (* update only; "kind" not on edges *)
reconnect     = ( "from" | "to" ) , "=" , ID ;                     (* update only, edges only *)
remove        = "-" , ( [ "node" | "group" | "edge" ] , ( EDGE-REF | ID )
                      | "rank" , "same" , ID , "," , ID , { "," , ID }
                      | "order" , ID , "," , ID , { "," , ID } ) ;
```

### Rules

- **Add** (`+`) is the same as a file line. `+diagram` is not allowed (`E_INVALID_OP`).
- **Update** (`~`) changes only the given fields. In `node-update` and `group-update` the optional
  positional parts come in this order: kind, then label. They are told apart by token type: a bare
  word is a kind, a quoted string is a label.
- `label=` and `kind=` are accepted **only in updates**, as an alternative to the positional forms.
  They are not accepted on file lines and in `+` operations: those fail with `E_UNKNOWN_ATTR` and the
  fix "the label is positional". `kind=` does not exist on edges.
- `from=` and `to=` exist only in edge updates and reconnect the edge (see [Ids and edge
  ids](#ids-and-edge-ids)).
- **How to clear an optional attribute is not yet specified.** The architecture prose (§7.3) says
  that an empty value (`key=`) clears an optional attribute, but the grammar (`value = WORD | STRING`
  in §7.2) admits no empty value, so such a line is not a valid operation and this reference gives no
  example of it. The question is tracked in
  [#56](https://github.com/eliangilsierra/blueprint-drafter/issues/56). Clearing `kind` or `label`
  is `E_BAD_VALUE` in any case.
- An edge update and a removal accept an explicit edge id as a bare `ID`.
- **Remove** (`-`) removes the element. Removing a node removes its edges and its ids from
  constraints; a constraint left with fewer than two ids is dropped. Removing a group re-parents its
  children to the parent of the group. Other edges keep their ids.

| Operation | Form | Failure codes |
| --- | --- | --- |
| Add | `+group ...`, `+node ...`, `+edge ...`, `+rank same ...`, `+order ...` | `E_DUPLICATE_ID` (fix: `~node id ...`), syntax codes |
| Update | `~node ID [KIND] ["Label"] {attr}`, `~group ID [KIND] ["Label"] {attr}`, `~edge REF ["label"] {attr} [from=ID] [to=ID]`, `~diagram {header-attr}` | `E_UNKNOWN_ID` (fix: closest id or `+node`), `E_BAD_VALUE`, `E_UNKNOWN_ATTR` |
| Remove | `-node ID`, `-group ID`, `-edge REF`, `-ID`, `-rank same ID,...`, `-order ID,...` | `E_UNKNOWN_ID`, `E_UNKNOWN_CONSTRAINT` |

An operation without a prefix, or one that is not allowed, fails with `E_INVALID_OP`.

### Examples

Valid operations against the worked example above. Each line is an independent example, not a
sequence; the `pricing>maps` line assumes a diagram with an edge `pricing>maps` and a node `geo`, as in the
[rejection example](#rejection-example):

```text
+node cache cache "Session Cache" in=platform
+edge api>cache "Reads sessions" tech=Redis
+rank same api,cache
~node api "Order Service"
~node api service "Order Service"
~node api kind=gateway label="Order Gateway"
~edge api>db "Reads and writes orders"
~edge api>mail "Sends invoices"
~edge pricing>maps to=geo label="cached ETA"
~edge api>mail#2 style=dep to=push
~diagram theme=dark dir=LR
-node cache
-group platform
-edge api>db
-api>mail#2
-rank same api,cache
```

Invalid:

| Line | Where | Result |
| --- | --- | --- |
| `edge a>b label="x"` | file line | `E_UNKNOWN_ATTR`, fix "the label is positional" |
| `+edge a>b label="x"` | operation | `E_UNKNOWN_ATTR`, fix "the label is positional" |
| `node n1 process "Step" x=10` | file line | `E_UNKNOWN_ATTR`, names the line |
| `+diagram type=flow` | operation | `E_INVALID_OP` |

### Batch rules

Architecture §7.3 (FR-10, AC-12). A batch is a list of operations applied together.

1. Operations apply in order on a copy of the diagram. Each one sees the effect of the earlier ones.
2. A failing operation is recorded with its index, text and diagnostic, skipped, and evaluation
   continues, so the response lists **every** failing operation.
3. After the last operation, the semantic rules run on the copy. Error-level semantic findings that
   did not exist before the batch (compared by code and ids) are reported as
   `E_BATCH_INTRODUCES_ERRORS` with the list. Pre-existing errors do not block edits that do not add
   new ones.
4. If any operation failed or any error was introduced, the batch is **rejected** and nothing is
   written. Otherwise the canonical text is written atomically, unless `dryRun` is set.
5. Geometric findings do not reject a batch: the file is written and the findings are returned (CLI
   exit code 1 when any is an error). A layout that fails or exceeds the time budget after an accepted
   batch does not reject it either: the batch is written, and `E_LAYOUT_TIMEOUT` or `E_INTERNAL` is
   returned as a problem with status `failed` (CLI exit code 2).
6. Unknown ids get a suggestion: the closest existing id by edit distance, within a distance bound
   and computed over at most the configured element limit (AC-13).
7. A batch larger than `maxOpsPerBatch` is rejected with `E_LIMIT_EXCEEDED` before any operation
   runs.

### Rejection example

The product output for a diagram with the nodes `trips`, `notify` and `geo` and an edge `pricing>maps`
(operation 2 is valid only on such a diagram), one valid and two invalid operations
(benchmark case 4). Every failure is listed and nothing is written. Messages quote untrusted text under the
[quoting rule](diagnostics.md#message-quoting-rule).

```text
$ npx --yes blueprint-drafter@<x.y.z> apply ride.bpd '~node trps "Trips"' '~edge pricing>maps to=geo label="cached ETA"' '-node notfy'
REJECTED E_UNKNOWN_ID op#1 "~node trps": no node "trps" | fix: did you mean "trips"?
REJECTED E_UNKNOWN_ID op#3 "-node notfy": no node "notfy" | fix: did you mean "notify"?
no changes written
```

The CLI exits with code 3 when a batch is rejected (architecture §7.5). The examples in this
repository use the pinned form `npx --yes blueprint-drafter@<x.y.z> ...` (architecture §7.7); replace
`<x.y.z>` with the exact released version.

## Versioning

- The header carries the format version: `diagram 1 ...`. A header version higher than the supported
  one fails with `E_VERSION_UNSUPPORTED`.
- Within v1, the format only adds statements, attributes, kinds and codes. A breaking change requires
  v2 and a migrator (architecture §7.2, ADR-0003).
- The core API exports `FORMAT_VERSION = 1`.

## Compatibility

Contract scope of architecture §7.1.

Frozen within v1: function signatures, type field names, **the text format, the operation language**,
the CLI commands, options, output line shapes and exit codes, the MCP tools, and the diagnostic codes
of the syntax, operation, file, limit and semantic classes plus the error-level geometric codes.

Not frozen within v1: threshold values, profile canvases, limit defaults, message wording, and the
severity of heuristic `W_` and `I_` codes, which calibration may change in a minor release.

v1 only adds: new optional fields, new functions and new codes. Removing or changing a field or a code
needs a major version. See the same section in [Diagnostic catalogue](diagnostics.md#compatibility).
