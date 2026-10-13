# Annex: 2026-10-13 study on LLM-native diagramming (Spanish originals and research prototype)

This folder is the **annex** of the research report
[docs/research/1-llm-native-diagramming.md](../1-llm-native-diagramming.md) (Issue #1). It keeps the
original study of 2026-10-13 as evidence. The repository owner allowed archiving the Spanish originals
next to an English report (answer to Q-7 in the "Human decisions" comment on Issue #1).

- **Language.** The documents `01` to `08` and [README.es.md](README.es.md) are in **Spanish**. The
  English summary of their findings, with every measurement labelled FACT, EVIDENCE or ASSUMPTION, is
  the research report linked above. Read that report first.
- **Research prototype, not production code.** [prototype/](prototype/README.md) is the working
  reference implementation the study measured (working name "plano", run directly by Node 24 without a
  build). It has no input limits, no frozen API and uncalibrated thresholds, and it is **not** part of
  the product. It is superseded by the product source under `src/` as the implementation tasks of
  Issue #1 land; it is kept unchanged so that the measurements can be reproduced and audited.
- **Names.** "plano", the `plano` binary, the `.plano` extension and `PLANO_WORKSPACE` are research
  names. The product is **Blueprint Drafter** (package `blueprint-drafter`); its binary name, file
  extension and header keyword are decided in
  [ADR-0006](../../decisions/ADR-0006-name-binary-extension-and-header.md).
- **Architecture.** The product design that builds on this study is
  [docs/architecture/3-mvp-architecture.md](../../architecture/3-mvp-architecture.md).

## Contents

| Path | Content (Spanish unless stated) |
| --- | --- |
| [01-informe-investigacion.md](01-informe-investigacion.md) | Research report: root causes, state of the art, agent ecosystem, evidence |
| [02-matriz-evaluacion.md](02-matriz-evaluacion.md) | Tool comparison and weighted matrix of nine architecture options with sensitivity analysis |
| [03-propuesta-producto.md](03-propuesta-producto.md) | Product proposal: problem, users, value proposition, principles |
| [04-diseno-arquitectura.md](04-diseno-arquitectura.md) | Architecture design of the prototype (input to the architecture document) |
| [05-especificacion-tecnica.md](05-especificacion-tecnica.md) | Technical specification draft: grammar, data model, CLI, MCP, diagnostics catalogue |
| [06-benchmark-validacion.md](06-benchmark-validacion.md) | Benchmark: ten cases, metrics, measured results, pending protocols |
| [07-plan-implementacion.md](07-plan-implementacion.md) | Implementation plan: MVP scope, stack, licences, security, tests, milestones, risks |
| [08-recomendacion-ejecutiva.md](08-recomendacion-ejecutiva.md) | Executive recommendation |
| [README.es.md](README.es.md) | The study's original README (renamed from `README.md` so that this English README can sit next to it) |
| [diagramas/](diagramas/) | The prototype's own architecture diagram (source, SVG, PNG) |
| [prototype/](prototype/README.md) | Research prototype: `src/`, `bench/` (cases, scripts and measured results), `test/`, `integrations/`, `out/` (renders), `package.json`, `package-lock.json` |

## What was left out, and why

| Excluded | Reason |
| --- | --- |
| `prototype/node_modules/` | Installed dependencies; restored by `npm install` from `package-lock.json` |
| `prototype/fonts/*.ttf` | Generated at run time by the prototype from the `@ibm/plex-sans` package |
| `prototype/out/10-complex.png` | Large render (about 0.8 MB); the SVG of the same case is kept in `prototype/bench/results/10-complex.svg` |
| Any file over 1 MB | Repository size; none of the kept evidence needs it |

Links in the Spanish documents that point to the excluded files do not resolve in this archive. No
other file was changed: the prototype and the documents are copies of the study whose content is
identical, except that Git stores text files with LF line endings (twelve originals used CRLF).

## Reproducing the measurements

From `prototype/`, with Node 22.18 or later (the study used Node v24.15.0), no network access is
needed except for `npm install` and the Mermaid baseline, which renders in a browser:

```text
npm install
node bench/run.ts           # quality, ablations, determinism, stability, tokens
node bench/case9.ts         # code sync on a temporary Git repository
node bench/mcp-session.ts   # MCP session with the official client
node bench/vision-cost.ts   # image-token cost
node --test test/*.test.ts  # 21 tests
```
