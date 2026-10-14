# Acceptance corpus (benchmark cases)

The versioned inputs that every later task tests against (architecture section 7.9, assumption A-3 of
the requirements). The cases are the benchmark cases 1 to 8 and 10 of research report 06, section 1,
converted from the research prototype (`.plano`) to the product format (`.bpd`, text format v1 of
architecture sections 7.2 and 7.3). The file names keep the case numbers.

Case 9 (update from code, a real Git repository with two commits) is out of scope: it is not a text
diagram and has no file in this directory. The performance task generates the 50-node synthetic case
on its own.

## Cases

| Case | File | Type | Content | What it exercises | Acceptance criteria that use it |
| --- | --- | --- | --- | --- | --- |
| 1 | `01-flow.bpd` | `flow` | 16 nodes (4 decisions), 18 edges, 2 cycles (`wait>stock`, `retry>pay`) | Branches, cycles, yes/no labels, diamonds | AC-1, AC-25, AC-26, AC-29, AC-37, AC-38, AC-40 |
| 2 | `02-c4-container.bpd` | `c4-container` | 8 nodes, 1 boundary group, 10 labelled relations | Descriptions, boundaries, labelled relations | AC-2, AC-27, AC-28, AC-34, AC-37, AC-40 |
| 3 | `03-components.bpd` | `component` | 12 nodes, 1 boundary group, 13 edges | Dependencies inside a boundary and on external systems | AC-3, AC-37 |
| 4 | `04-distributed.bpd` | `architecture` | 16 nodes, 3 groups, 16 edges (3 `async`) | Zones, asynchronous edges, external providers; base of case 8 | AC-24, AC-37, AC-40 |
| 5 | `05-sequence.bpd` | `sequence` | 6 participants (1 actor), 13 messages, 1 self-message (`orders>orders`) | Sequence engine, declared order, `reply` and `async` messages | AC-5, AC-37 |
| 6 | `06-long-labels.bpd` | `architecture` | 6 nodes, 6 edges; labels of 52, 53 and 56 characters on edges, 59 and 53 on nodes | Wrapping of labels of 50 or more characters | AC-8, AC-37 |
| 7 | `07-groups.bpd` | `architecture` | 10 nodes, 6 groups, 13 edges; groups nest `aws` > `eu` > `euapp` (3 group levels, the nodes are the fourth containment level) | Hierarchy, edges between regions | AC-4, AC-37, AC-40 |
| 8 | `08-before.bpd` and `08-incremental.ops` | `architecture` | `08-before.bpd` is case 4 byte for byte; the operations add a service, change two relations and remove a component (6 lines, 225 bytes) | Operations, id stability, semantic diff, token budget | AC-11, AC-36, AC-37, AC-39 |
| 10 | `10-complex.bpd` | `architecture` | 40 nodes, 6 groups, 44 edges (stress test) | Scale and legibility | AC-21, AC-22, AC-35, AC-37, AC-40 |

The edit of case 8, in plain words: add the service `fraud` (`+node`) with the edges `trips>fraud` and
`fraud>events`; relabel `events>pay` to "trip settled"; reconnect `pricing>maps` to `geo` with the new
label "cached ETA" (the update-only `label=` form of architecture section 7.3); remove the node
`notify` (its edges `events>notify` and `notify>push` go with it).

## Admissibility check (architecture section 6.3)

Every node kind, group kind, edge style and edge `dir` used by a file is in the admissible set of the
file's diagram type, so the corpus produces no `W_NOT_FOR_TYPE`. Edge `dir` is never written in the
corpus, so every edge has the default `fwd`, which is admissible everywhere.

| File | Type | Node kinds used | Group kinds used | Edge styles used | Edge `dir` | Admissible |
| --- | --- | --- | --- | --- | --- | --- |
| `01-flow.bpd` | `flow` | `start`, `end`, `process`, `decision` | none | `sync` (default) | `fwd` | yes |
| `02-c4-container.bpd` | `c4-container` | `person`, `external`, `webapp`, `container`, `db`, `mobile` | `boundary` | `sync` | `fwd` | yes |
| `03-components.bpd` | `component` | `component`, `db`, `queue`, `external` | `boundary` | `sync` | `fwd` | yes |
| `04-distributed.bpd`, `08-before.bpd` | `architecture` | `mobile`, `gateway`, `service`, `db`, `cache`, `topic`, `external` | `zone`, `boundary` | `sync`, `async` | `fwd` | yes |
| `05-sequence.bpd` | `sequence` | `actor`, `participant` | none (groups are not allowed) | `sync`, `async`, `reply` | `fwd` | yes |
| `06-long-labels.bpd` | `architecture` | `webapp`, `service`, `db`, `external` | none | `sync`, `async` | `fwd` | yes |
| `07-groups.bpd` | `architecture` | `gateway`, `service`, `db`, `queue`, `external` | `zone`, `boundary`, `cluster` | `sync`, `async` | `fwd` | yes |
| `10-complex.bpd` | `architecture` | `webapp`, `mobile`, `external`, `gateway`, `service`, `topic`, `db`, `cache`, `storage` | `zone`, `boundary` | `sync`, `async` | `fwd` | yes |
| `08-incremental.ops` (applied to case 4) | `architecture` | adds `service` | none | adds `async` | `fwd` | yes |

The per-type sets are the table "Kinds and edge styles per diagram type" of section 6.3: `flow` admits
`start`, `end`, `process`, `decision`, `io`, `subprocess`; `architecture` admits every kind except the
flow kinds, `actor` and `participant`; `sequence` admits only `actor` and `participant`, and no groups.

## Conversion notes

The prototype was already in canonical order and quoting, so the conversion is mechanical except for
the points below. Every other line is byte-identical to the prototype file.

1. **Header.** `plano 1 ...` becomes `diagram 1 ...`. A `dir` equal to the default of the type is
   omitted, as the canonical serialisation requires (section 7.2): `dir=TB` for `flow` and
   `c4-container`, `dir=LR` for `component` and `architecture`. The directions are unchanged in effect.
   `05-sequence.bpd` keeps `dir=TB` because section 6.3 states no default direction for `sequence`.
2. **Kinds.** No kind or style had to be replaced: every prototype value is admissible for its type
   (table above).
3. **Group id `edge` (case 4 and 8 before).** The group `edge` is kept as is. Section 7.2 gives
   `ID` no reserved words, so `group edge zone "Edge"` and `in=edge` are valid, and no line of the
   corpus uses `edge` as the first token of an operation. In the operation grammar of section 7.3 a
   removal `-edge` followed by one token is `-edge REF`, and `-edge` alone would be the bare id `edge`;
   the corpus has no such operation. If the architecture later reserves the word, rename the group
   to `edgez` in `04-distributed.bpd` and `08-before.bpd` (case 10 already uses `edgez` for the same
   idea).
4. **Parallel edges.** No file has two edges between the same ordered pair of nodes, so no `#2`
   reference is needed. The requirement for stable references (`a>b`, `a>b#2`) is met by the rule of
   section 7.2, which the files follow.
5. **Operation file.** `08-incremental.ops` has the same six operations as the prototype, without the
   Spanish comment line of the prototype (the architecture defines no comment syntax for an operation
   file; the description is in this README). `label=` appears only there, in the update
   `~edge pricing>maps to=geo label="cached ETA"`; the other relation change is the positional form
   `~edge events>pay "trip settled"`.
6. **Case 7 nesting.** The research report and the requirements (AC-4) call case 7 "4 nested levels".
   The prototype file has three nested group levels (`aws` > `eu` > `euapp`); the nodes inside
   `euapp` are the fourth level. The file was not changed, to keep measurements comparable.
7. **Line endings.** LF, with a final newline, no blank lines, no comments. `.gitattributes` in this directory forces LF on checkout, so Windows checkouts keep the same bytes.
