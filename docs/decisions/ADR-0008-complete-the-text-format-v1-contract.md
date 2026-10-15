# ADR-0008: Complete the text format v1 contract with the points left open by the first review

## Status

Proposed

| Field | Value |
| --- | --- |
| Date proposed | 2026-10-15 |
| Date decided | — |
| Decided by | — |
| Related Issue | #56 (open points), #3 (architecture), #1 (requirements) |
| Supersedes | None |
| Related ADRs | ADR-0003 (format and operation language), ADR-0006 (header keyword and extension) |

## Context

ADR-0003 (Accepted) decides one line-based canonical format that is also the operation language and
leaves the concrete grammar to the architecture document. Reviews of the architecture (PR #4) and of
the format reference (PR #57), the corpus conversion (PR #58) and the model types (PR #60) found points
that the grammar of architecture §7.2 and §7.3 leaves open or contradicts. They are collected on #56:

- The `letter` of `ID` and `WORD` is undefined, so it is unclear which files are valid (#56 item 6).
- "An empty value (`key=`) clears an optional attribute", but `value = WORD | STRING` admits no bare
  empty value, and an edge label is optional while "clearing `label` is `E_BAD_VALUE`" (CR-21, QA-4).
- Two bare lines `edge a>b` are `E_DUPLICATE_ID`, although `+edge a>b` twice is valid (CR-20).
- `-edge` is ambiguous when an element has the id `edge`, which corpus case 4 has (CR-21).
- The canonical form "omits defaults", but the defaults of `sequence` `dir`, `theme` and `density`, and
  whether edge `style=sync` and `dir=fwd` are written, are undefined (CR-2, PR #58 review).
- `tags` has no defined value form (CR-5); the model of PR #60 already holds `tags?: string[]`.
- The rejected-character rule is stated for strings only, does not name the exempt characters, and
  misses blank-looking characters such as U+3164 and U+034F and the line separators (SR-1, SR-12,
  #56 item 9).

These are public contract: once files exist in users' repositories, changing which files are valid
or how they serialise needs a format v2 and a migrator (ADR-0003). Facts checked: the corpus
`bench/cases` (9 files) passes every rule below except that `05-sequence.bpd` writes `dir=TB`, which
rule 5 makes a default; no corpus file uses a non-ASCII bare word, a tag, an id over 64 characters, a
repeated edge reference or a rejected character.

## Decision

We will complete text format v1 with the following rules. Architecture §6.3, §7.2 and §7.3 hold the
detailed wording and the examples; this ADR fixes their substance.

1. **ASCII ids and words.** `letter` is `A` to `Z` and `a` to `z`, `digit` is `0` to `9`, for `ID`,
   `WORD` and `KEY`. Other text is written as a quoted string; the serialiser quotes it by itself. Id
   length is the limit `maxIdChars` (`E_LIMIT_EXCEEDED`), not part of the pattern; `E_BAD_ID` is a
   pattern mismatch only.
2. **The empty value is `""`.** On a file line or an add operation, `""` for an optional attribute or
   the optional edge label is the same as not writing it. In an update, `""` clears an optional
   attribute or the edge label, or resets an attribute with a default to it. `""` for a required value
   (`type`, a kind, a node or group label, an edge `id`) is `E_BAD_VALUE`. A bare `key=` is `E_SYNTAX`
   with the fix `key=""`.
3. **Repeated bare edge references.** `parse` first takes every explicit `id=` and every written
   `a>b#n` as written, then gives each bare `a>b` without `id=`, in file order, `a>b` if free, else the
   lowest free `a>b#n` (the `+edge` rule). The canonical form writes the assigned reference.
4. **Keyword or bare id after `-`.** No id is reserved. After `-`, `node`, `group`, `edge`, `rank` and
   `order` are keywords only when another token follows on the line; one token after `-` is the bare
   form. `-edge` removes the element `edge`; `-edge gw>auth` removes that edge.
5. **Defaults and canonical omission.** Defaults: the header `dir` of the current type (architecture
   §6.3), `theme=light`, `density=normal`, edge `style=sync`, edge `dir=fwd`. A default and an absent
   value are the same model value; the serialiser writes neither, and `diff` reports no change between
   them. For `sequence` the default and only header `dir` is `TB` (another value is `W_NOT_FOR_TYPE`);
   this point is the owner's choice (Proposed — owner confirms by merging).
6. **Tags.** `tags` is a set of tags separated by `,`, each matching
   `1*( letter | digit | "_" | "." | ":" | "/" | "+" | "-" )`; an empty or invalid tag is `E_BAD_VALUE`;
   duplicates are dropped; the serialiser writes them sorted by code point. Tags are opaque and never
   used for layout or rendering in v1.
7. **Rejected characters, everywhere.** A file line or an operation that contains a character of the
   classes `Cc` (except LF as the line end, CR directly before LF, TAB outside quoted strings), `Zl`,
   `Zp`, `Bidi_Control`, `Default_Ignorable_Code_Point` (except a leading byte-order mark),
   `Noncharacter_Code_Point` or an unpaired surrogate is rejected with `E_SYNTAX`, wherever the
   character is: strings, bare words, `meta.*` values and comments. The zero-width joiner and
   non-joiner and the variation selectors are therefore rejected in v1, an accepted limitation
   (Proposed — owner confirms by merging).

Out of scope: output line shapes, path quoting and the API types, which the architecture document
settles in place (§7.1, §7.4, §7.5) because they do not decide which files are valid.

## Alternatives

| Alternative | Summary | Why not chosen |
| --- | --- | --- |
| Unicode letters in ids (`\p{L}`) | Ids in any script | Composed and decomposed forms and homoglyphs give ids that look equal and differ; needs a normalisation rule; ASCII can be relaxed later additively |
| A bare empty value `key=` | Add an empty alternative to `value` | Changes the `value` grammar and is produced by accident (a missing word); `""` is already a valid `STRING` and the catalogue already has "empty required value" |
| No clearing at all | Remove the sentence from §7.3 | An agent cannot remove a description, a parent or an edge label without removing and re-adding the element, which changes model order and comments |
| `E_DUPLICATE_ID` for a second bare `a>b` | Keep the strict file rule | Hand-written files fail where `+edge` succeeds; repeated messages are normal in sequence diagrams |
| Reserve keywords as ids | `edge`, `node`, `group`, `rank`, `order` invalid as ids | Makes a valid corpus file invalid (case 4, group `edge`) and needs a rename; the token-count rule has no ambiguous case |
| Write every default | Canonical form always writes `dir`, `theme`, `density`, `style`, `dir` | Longer files and token cost for every edge (NFR-3); the merged corpus already omits defaults |
| No default `dir` for `sequence` | Keep `dir` free and written | The sequence engine draws top to bottom only, so the value has no effect and the canonical form is undefined |
| `tags` as a free string | Keep the value opaque | The model of PR #60 is a list; a free string has no canonical form and cannot be filtered |
| Rejected characters in strings only | Keep the rule of §7.2 as written | A bidirectional control in a comment is kept and re-emitted and can reorder a pull request diff; blank-looking characters (U+3164) pass |
| A context rule for the joiners | Allow U+200C and U+200D between letters | Tokenizer complexity and its own spoofing cases; allowing more later is additive |

## Consequences

**Positive**

- Every open format point of #56 has one testable rule, so the parser (#12), the serialiser (#13),
  the operations (#15) and the diff (#16) cannot diverge.
- The merged code (model types of PR #60) and the corpus need no rework except one header attribute
  in `bench/cases/05-sequence.bpd`.
- Each restriction (ASCII ids, rejected characters) can be relaxed later without breaking a file.

**Negative**

- Ids and bare words in other scripts are not possible; such text must be quoted.
- Labels that need the zero-width joiner or non-joiner, or emoji with variation selectors, are
  rejected in v1.
- The parser assigns edge ids in two passes.

**Follow-up actions**

- Update `docs/reference/format.md` and `diagnostics.md` (their "Open points" sections) and
  `bench/cases/05-sequence.bpd` and `bench/cases/README.md` (notes 1 and 3) after acceptance.
- Add the rules to the acceptance tests of tasks #12, #13, #15, #16 and #46 (planner).

## Security considerations

Rule 7 closes display spoofing in comments and through blank-looking characters (trust boundaries B1
and B3 of the architecture): no rejected character can reach a canonical file, an export or a
diagnostic. Rule 1 removes homoglyph ids, so an id in a message or a suggestion cannot look like
another. The check is a per-character Unicode property test, linear and without backtracking
(NFR-8, NFR-9). No new dependency, trust boundary or secret.

## Operational considerations

None at run time. The rules apply from the first release, before any user file exists, so no
migration is needed. Relaxing rule 1 or rule 7 later is additive within v1; tightening them would
need format v2 and a migrator (ADR-0003).
