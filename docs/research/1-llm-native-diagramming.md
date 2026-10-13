**Research report** · Researcher · state: research

> **Archive.** Faithful copy of the research report posted on Issue #1
> ([comment](https://github.com/eliangilsierra/blueprint-drafter/issues/1#issuecomment-6153937658)) on
> 2026-10-13, archived by the architecture stage (Issue #3). Only this note was added. The original
> Spanish study documents and the research prototype are kept as an annex in
> [1-llm-native-diagramming/](1-llm-native-diagramming/README.md); the "study doc N" references below
> map to the annex files `0N-*.md`, and the benchmark files (`results.md`, `scores.md`, `case9.json`,
> `mcp-session.json`, `vision-cost.json`) are under
> [prototype/bench/](1-llm-native-diagramming/prototype/bench/). The architecture that builds on this
> report is [docs/architecture/3-mvp-architecture.md](../architecture/3-mvp-architecture.md).

# Research: How should a deterministic diagram engine for AI coding agents be built, and what does the evidence say about it?

**Issue:** #1 · **Requested by:** Product Manager (hand-off to `agent:research`) · **Time box:** not set (persists an existing study; no new investigation) · **Date:** 2026-10-13

> **Provenance.** This report persists the 2026-10-13 study (to be archived under docs/research/ by the architecture stage; the Spanish originals become an annex, Q-7). All external sources were accessed on 2026-10-13. Labelling rules used here: **FACT** = measured by the study's reproducible benchmark, or verified by the study in a primary source (project docs, release notes, issue or PR pages, licence files); four load-bearing links were re-opened in this stage and are marked *(re-checked)*. **EVIDENCE** = a secondary source, a third-party paper or benchmark, or a claim the study could not fully verify. **ASSUMPTION** = unverified, with a way to verify. Measured numbers are the study's own measurements (prototype working name "plano", Node v24.15.0, elkjs 0.12.0, Mermaid 12.2.0 as baseline); they were **not re-run** in this stage. The commands to reproduce them are in the Appendix.

## Summary

- **Recommendation:** Build a local-first deterministic core (TypeScript) with a CLI first, then a thin MCP server, an Agent Skill and a CI check, reusing ELK for layout; treat the geometric quality as table stakes, not as the differentiator, and gate the investment on the pre-registered agent A/B experiment (Q-1) with "Skill + linter on Mermaid" as the fallback (R-1, R-2).
- **Confidence:** Medium. The weighted matrix ranks the hybrid first in 4 of 5 priority profiles and its minimal subset (core + CLI) first under cost/risk, and the step-level token savings are measured; but no real-agent session, no human rating and no export opened in a target application exist yet (see Unknowns).
- **Would change if:** the agent experiment shows less than 30% fewer calls and less than 40% fewer tokens than "Mermaid 12 + Skill" (pivot to the fallback); Mermaid or another widely used tool ships geometric validation and atomic operations; human raters rate Mermaid 12 with ELK at least as clear and the project's remaining differentiators do not matter to users.

## Question

- **Decision supported:** The Architect's ADRs (already accepted in principle by the owner: local-first core, ELK reuse, one canonical line-based format that doubles as the operation language, CLI first then MCP/Skill/CI, Apache-2.0) and the Planner's scope, plus the evidence for open questions Q-2 (layout stability as MVP acceptance) and Q-4 (input limits).
- **Sub-questions:** 1. What are the root causes of the defects agents produce in diagrams? 2. What is the state of the art in diagram tools and in layout algorithms? 3. What integration mechanisms (Agent Skills, MCP, hooks) exist per agent client? 4. What does a prototype measure for geometric quality, determinism, tokens and edit stability against the strongest baseline (Mermaid 12)? 5. Which architecture option is best under explicit weighted criteria, and how robust is the ranking? 6. What is not yet known?
- **Evaluation criteria (weight, base profile, sum 100):** visual quality (15), automatic validation / fewer correction cycles (15), tokens per complete task (12), incremental editing and stability (10), portability across agents (10), development and maintenance cost (10), installation and dependencies (8), interoperability / Git (8), commercialisation (6), technical risk (6).
- **Constraints:** local-first, no keys or network for the basic workflow; open-source friendly licences; small team; Claude Code, Codex, Gemini CLI and OpenHands as target clients.

## Search strategy

| Priority | Source type | Sources / queries | Consulted | Useful |
| --- | --- | --- | --- | --- |
| 1 | Official documentation | Docs of Claude Code, OpenAI Codex, Gemini CLI, OpenHands (Skills, MCP, hooks); agentskills.io; MCP Apps; Anthropic vision-token documentation; licence files of Mermaid, D2, tldraw, Graphviz, elkjs | yes | yes |
| 2 | Primary sources | Release notes (Mermaid 12.0.0, D2 0.9.0), issue and PR trackers (mermaid, excalidraw-mcp, drawio-mcp, likec4), package registry metadata | yes | yes |
| 3 | Maintainers | D2 blog posts (TALA open-sourced, non-profit transition), draw.io maintainers' PR discussions | yes | yes |
| 4 | Reputable technical sources | NeurIPS 2026 workshop page (DIAGRAM-FAIL-BENCH), arXiv papers (MermaidSeqBench, DiagramAgent, DiagramEval), a university report | yes | yes |
| 5 | Community | MCP directory descriptions (glama.ai), third-party pricing pages, reviews quoting GitHub projects | yes | leads only (EVIDENCE) |
| — | Own measurement | Reproducible benchmark: 10 cases, ablations, Mermaid 12 baseline rendered in Chromium, token counts, MCP session, code-sync case | yes | yes |

## Findings

### A. Root causes and evidence of the problem

| ID | Label | Statement | Source / basis |
| --- | --- | --- | --- |
| F-1 | FACT | An issue opened on 2026-02-15 reports that arrows in agent-created Excalidraw diagrams are "almost always" unbound/floating, because binding needs an undocumented two-sided protocol (`startBinding` plus the shape's bound elements). *(re-checked)* | https://github.com/excalidraw/excalidraw-mcp/issues/33 (accessed 2026-10-13) |
| F-2 | FACT | A draw.io MCP PR (opened 2026-07-21) proposed a manual "rendered diagram quality gate" because a valid export does not detect crossings, clipped labels or unclear branches; a maintainer closed it the same day, arguing that geometry and routing should be handled by deterministic passes instead of inspecting renders and adjusting coordinates. *(re-checked)* The study had cited this PR as showing visual inspection as the gate; the PR was a proposal that was not adopted, which supports the same premise. | https://github.com/jgraph/drawio-mcp/pull/56 (accessed 2026-10-13) |
| F-3 | FACT | A draw.io MCP tool description of 34,527 characters (about 16k tokens) broke VS Code's tool search and was cut to about 1k tokens. | https://github.com/jgraph/drawio-mcp/issues/76 and https://github.com/jgraph/drawio-mcp/pull/78 (accessed 2026-10-13) |
| F-4 | FACT | Mermaid has open issues on clipped text and overlaps (for example #6424, #4918, #7359, #7175, #7492, #7316); a repository search on 2026-10-13 returned 18 results for label/edge overlaps and 25 for clipped text. | https://github.com/mermaid-js/mermaid/issues (accessed 2026-10-13) |
| E-1 | EVIDENCE | DIAGRAM-FAIL-BENCH (630 Mermaid tasks, 21 diagram types) reports that documentation raises render rate but not constraint compliance, verifier-guided repair closes most of the gap, and in a coding-agent test iterations with a black-box verifier raised success from 51.43% to 60.00%. | https://neurips.cc/virtual/2026/173008 (NeurIPS 2026 workshop, accessed 2026-10-13) |
| E-2 | EVIDENCE | DiagramEval reports that CLIPScore can rate diagrams highly without a clear data flow; MermaidSeqBench (132 sequence cases) reports notable gaps between models; DiagramAgent proposes plan/code/verify agents. | https://arxiv.org/abs/2510.25761, https://arxiv.org/abs/2511.14967, https://arxiv.org/abs/2411.11916 (accessed 2026-10-13) |
| E-3 | EVIDENCE | A university report states that a Mermaid CLI validation loop raised syntactic validity from about 70% to about 95%, and that structured JSON converted deterministically to Mermaid "guarantees valid syntax". Secondary source. | https://llm-enabled-development-41d6d8.pages.cms.hu-berlin.de/en/experiments/diagram/diagram-long (accessed 2026-10-13) |
| E-4 | EVIDENCE | Reviews quoting the GitDiagram author say the LLM sometimes produces invalid Mermaid and there is "no reliable fix" (not verified at the primary source). | Study doc 1 §3.3 (accessed 2026-10-13) |
| I-1 | INTERPRETATION | The problem is a missing control loop, not drawing: models are asked for geometry they cannot measure (text widths, coordinates, anchors), in formats made for graphical editors, with no machine-checkable quality oracle. Causes 1-4 of the study's table (clipped text, overlaps, floating arrows, connectors crossing nodes) disappear by construction when the model stops producing geometry; cause 5 (many correction cycles) needs a validator; cause 6 (token use) needs incremental operations and textual diagnostics; cause 7 (fragility under change) needs an explicit stability policy; causes 8-9 (tool lock-in, no executable definition of "acceptable") need a semantic model separate from presentation and geometry. | F-1, F-2, F-3, F-4, E-1, F-22, F-24 |
| A-1 | ASSUMPTION | H1: the number of correction iterations falls when the agent receives textual diagnostics with a suggested fix instead of an image. Verify by: the pre-registered agent experiment (Q-1). | — |
| A-2 | ASSUMPTION | H2: developers stop updating diagrams because manual re-layout costs more than it returns, and syncing from code reduces that cost. Verify by: user interviews or usage data after v1. | — |
| A-3 | ASSUMPTION | H3: visual stability between versions matters more in architecture reviews than layout optimality. Verify by: human evaluation and review-session observation. | — |

### B. State of the art: tools and layout

| ID | Label | Statement | Source / basis |
| --- | --- | --- | --- |
| F-5 | FACT | Mermaid 12.0.0 (release dated 10 September; the study records 2026) "ships ELK as the bundled default layout engine" for flowchart, state, class, entity-relationship, requirement and use-case diagrams; mindmaps keep cose-bilkent. *(re-checked)* | https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0 (accessed 2026-10-13) |
| F-6 | FACT | `layout: dagre` remains available in Mermaid 12; rendering needs a DOM (browser or mermaid-cli with Chromium); beautiful-mermaid (MIT) is a third-party DOM-free renderer with synchronous ELK for 6 diagram types. Mermaid is MIT-licensed. | Mermaid docs and https://github.com/lukilabs/beautiful-mermaid (accessed 2026-10-13) |
| F-7 | FACT | D2 released TALA under MPL-2.0 on 2026-09-07 with v0.9.0; its author states TALA is less stable under change (adding a node can rearrange the diagram) and that dagre/ELK preserve the previous layout better. Terrastruct is winding down and D2 became a non-profit project fiscally sponsored by Hack Club. | https://d2lang.com/blog/tala-is-open-source/ and https://d2lang.com/blog/d2-non-profit/ (accessed 2026-10-13) |
| F-8 | FACT | The official draw.io MCP (Apache-2.0) offers an MCP App and an npm tools server (XML, CSV, Mermaid) plus plugins/skills for Claude Code, Codex and Copilot CLI; its post-layout uses ELK with libavoid routing. | https://github.com/jgraph/drawio-mcp (accessed 2026-10-13) |
| F-9 | FACT | LikeC4 (MIT) ships an official MCP server (`@likec4/mcp`) whose tools are mostly query/preview (`search-element`, `query-graph`, `find-relationship-paths`, `preview-view`); an orthogonal-routing PR (#3278) is open. | https://github.com/likec4/likec4 (accessed 2026-10-13) |
| F-10 | FACT | tldraw's licence forbids production use without a commercial key; Graphviz is EPL; PlantUML is multi-licensed with ELK only in the EPL variant; Structurizr is Apache-2.0 (`structurizr/lite` archived); IcePanel has an MCP server in beta since 2025-05-15. | Licence files and docs of each project (accessed 2026-10-13) |
| E-5 | EVIDENCE | Several community Excalidraw MCP servers describe the same idea (the server owns spatial reasoning, the LLM works on nodes and edges), per MCP directory descriptions. | https://glama.ai (accessed 2026-10-13) |
| E-6 | EVIDENCE | Eraser pricing (Free, about 15 USD/member/month, about 45 USD) comes from third-party pages. | Study doc 1 §3.3 (accessed 2026-10-13) |
| A-4 | ASSUMPTION | Current capabilities of Ilograph, Lucidchart/Miro AI and yFiles could not be verified; the study treats them as unknown. Verify by: reading their current documentation. | — |
| I-2 | INTERPRETATION | Automatic layout is now a commodity (Mermaid 12 on ELK, D2 with three engines, draw.io on ELK plus libavoid) and the space is filling quickly (E-5), so a defensible position must rest on validation, atomic id-stable operations, code synchronisation, stability and export of validated geometry, not on "yet another layout engine". D2's governance change (F-7) is a maintenance risk to watch. | F-5, F-7, F-8, E-5, F-24 |

### C. Layout algorithms and techniques

| ID | Label | Statement | Source / basis |
| --- | --- | --- | --- |
| F-11 | FACT | ELK Layered (elkjs 0.12.0, EPL-2.0 OR GPL-3.0-or-later) supports ports, labels as obstacles, hierarchy (`INCLUDE_CHILDREN`) and model order; dagre (MIT) compound graphs do not support edges to clusters (the study had to omit them in its dagre variant). | elkjs package metadata and docs (accessed 2026-10-13); prototype measurement |
| F-12 | FACT | libavoid (Adaptagrams) is LGPL-2.1-or-later (or a Monash commercial licence); a WASM port `libavoid-js` exists (LGPL-2.1-or-later). | Project licence files (accessed 2026-10-13) |
| F-13 | FACT | In the prototype, reserving label space in the layout removed all label-over-node overlaps seen when labels are placed afterwards (33 in the complex case), and sequence diagrams needed a dedicated engine (a generic graph engine is not adequate). ELK rejects fully interactive crossing minimisation with hierarchy (`UnsupportedGraphException`). | Prototype benchmark (see F-17, F-21) |
| E-7 | EVIDENCE | Academic references for layered layout (Sugiyama 1981; Gansner et al. 1993; Brandes-Koepf 2001), mental map (Misue et al. 1995), orthogonal routing (Wybrow et al. 2010), ELK ports (Schulze et al. 2014) and HOLA (Kieffer et al. 2016) were cited from memory and not re-verified. | Study doc 1 §5 |
| I-3 | INTERPRETATION | Reuse ELK Layered for architecture/flow graphs (including C4 and grouped views), keep a dedicated engine for sequence diagrams, and spend own effort on text measurement, presets, edge clipping to the real shape outline, the validator, the operations and the stability policy. Incremental stability remains an open problem in open-source tooling. | F-11, F-13, F-12, F-7 |

### D. Agent ecosystem

| ID | Label | Statement | Source / basis |
| --- | --- | --- | --- |
| F-14 | FACT | Agent Skills is an open format (a folder with `SKILL.md`, optional scripts, references, assets; discovery, activation, execution by progressive disclosure) originally developed by Anthropic; the client showcase lists 46 clients (my count of the page), including Claude Code, Codex, Gemini CLI, OpenHands, Cursor, VS Code and GitHub Copilot, Goose and Kiro. *(re-checked)* | https://agentskills.io/ (accessed 2026-10-13) |
| F-15 | FACT | Per-client support, as documented (table below the findings): Skills in all four target clients; MCP in all four; hooks documented for Claude Code, Codex and Gemini CLI. | Per-client docs (accessed 2026-10-13) |
| F-16 | FACT | MCP Apps is an official MCP extension that returns interactive UI into the chat and is used by Excalidraw, draw.io and LikeC4; a Skill carries procedural knowledge and can bundle scripts, MCP carries typed tools, and a Codex Skill can declare MCP dependencies. | https://modelcontextprotocol.io/docs/extensions/apps and the Codex skills docs (accessed 2026-10-13) |
| E-8 | EVIDENCE | Gemini CLI MCP support and hook maturity (version-dependent) were only partially verified, and its documentation says it was replaced by "Antigravity CLI" on 2026-06-18 for free-tier and Google One users. | https://geminicli.com/docs/ (accessed 2026-10-13) |
| A-5 | ASSUMPTION | OpenHands supports hooks comparable to the others; no source found. Verify by: reading the OpenHands docs for lifecycle hooks or testing in a run. | — |
| I-4 | INTERPRETATION | A Skill alone cannot measure text, route or validate geometry; if it bundles that code it is a CLI distributed as a Skill. Therefore the CLI is the universal interface (any client with a shell), the MCP server and the Skill are thin adapters, and the CI check gives an agent-independent guarantee. Client fragmentation (for example Gemini CLI to Antigravity CLI) is a reason not to couple to one client. | F-14, F-15, F-16, E-8, F-25 |

**Per-client mechanisms (FACT unless marked; sources are each client's own documentation, accessed 2026-10-13):**

| Mechanism | Claude Code | OpenAI Codex | Gemini CLI | OpenHands |
| --- | --- | --- | --- | --- |
| Agent Skills (`SKILL.md`) | Yes (code.claude.com/docs/en/skills) | Yes: `.agents/skills`, `$HOME/.agents/skills`, implicit or `$skill` invocation; discovery budget 2% of context / 8,000 characters (learn.chatgpt.com/docs/build-skills) | Yes: `.gemini/skills` or `.agents/skills`; `activate_skill` with consent (geminicli.com/docs/cli/skills/) | Yes: `.agents/skills`, extensions `triggers` and `paths` (docs.openhands.dev/overview/skills) |
| MCP | Yes | Yes: `config.toml`, stdio and Streamable HTTP (developers.openai.com/codex/mcp) | EVIDENCE (partially verified) | Yes: `~/.openhands/mcp.json` in CLI 1.x; format changed from TOML to JSON (docs.openhands.dev/openhands/usage/cli/mcp-servers) |
| Hooks | Yes: `PreToolUse`/`PostToolUse` with matchers `mcp__<server>__.*`; exit 2 blocks (code.claude.com/docs/en/hooks) | Yes: `hooks.json` or `[hooks]` in `config.toml`; unmanaged hooks need trust (developers.openai.com/codex/hooks) | Yes: `BeforeTool`/`AfterTool` in `settings.json`; exit 2 blocks (geminicli.com/docs/hooks/); maturity is EVIDENCE | ASSUMPTION (A-5): not verified |
| Repository instructions | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` | `AGENTS.md`; also recognises `CLAUDE.md` and `GEMINI.md` |

Client-specific extensions are not portable (for example `agents/openai.yaml` in Codex, `triggers` in OpenHands); the Skill body is.

### E. Measured results (prototype and baselines; the study's reproducible benchmark)

Ten cases: 1 flow (16 nodes), 2 C4 containers, 3 components, 4 distributed architecture (16 nodes, 3 zones), 5 sequence (6 participants, 13 messages), 6 long labels, 7 nested groups (4 levels), 8 incremental edit of case 4, 9 code-to-architecture sync on a real Git repository (2 commits), 10 complex (40 nodes, 6 groups, 44 relations).

| ID | Label | Statement | Source / basis |
| --- | --- | --- | --- |
| F-17 | FACT | Geometric quality: the prototype has 0 error-level findings in all 8 graph and sequence cases measured in the main run (cases 1-7 and 10); warnings are `W_ILLEGIBLE_AT_FIT` (cases 1, 6, 10), `W_EDGE_DETOUR` (cases 4, 7, 10), each with a suggested fix. Ablations without the engine's decisions give 5-43 errors per case (for example 43 errors and 33 labels over nodes in case 10 for naive ELK; 13 edges through nodes and 14 crossings for dagre). | results.md (benchmark, 2026-10-13); see Appendix |
| F-18 | FACT | Mermaid 12.2.0 with ELK (default), rendered in Chromium, geometry extracted from the SVG and scored with the same validator, has 0 errors in 6 of 7 cases (case 3 has 1 label/label overlap), 0 edges through nodes and 0 crossings in the complex case; with `layout: dagre` it has up to 10 edges through nodes and 21 crossings in the complex case. Geometric quality is at parity (prototype: 0 errors in 7 of 7 compared cases, but more crossings in cases 7 and 10). | scores.md and results.md (see table below) |
| F-19 | FACT | Determinism: 3 runs per case give 1 distinct SVG hash in all 8 cases (byte-identical). Time for layout, validation and SVG: 10-334 ms per case in the main run (sequence 10 ms, complex 185 ms; the 334 ms first case includes loading ELK); under 1 s for up to 50 nodes was the acceptance target and the largest case measured has 40 nodes. Mermaid 12 in the browser: 56-2,273 ms per case (first render slowest) excluding browser start-up. | results.md, scores.md |
| F-20 | FACT | The validator was tested against itself with synthetic geometry: 13 tests covering 10 defect types (recall) and 5 legitimate situations (precision), 13/13 pass; the whole suite is 21 tests. The same validator was applied unchanged to geometry extracted from Mermaid 12 SVGs (100% of nodes and edges extracted in all 7 cases). | Study doc 6 §3.5 and §2 |
| F-21 | FACT | Tokens per representation of the same diagram (o200k_base; the legacy Anthropic tokenizer is within about 10%): canonical text 253 / 348 / 424 / 1,003 (cases 1, 2, 4, 10) versus Mermaid 238 / 366 / 450 / 1,036, compact JSON 542 / 539 / 769 / 1,852, draw.io XML 4,488 / 3,506 / 5,940 / 14,829 and Excalidraw JSON 17,134 / 11,627 / 21,123 / 53,975. Draw.io XML is therefore 10-18 times and Excalidraw JSON 33-68 times the canonical text. The canonical text is as compact as Mermaid, so its value is not brevity. | results.md (Tokens por representación) |
| F-22 | FACT | Edit step (case 8, 6 operations on case 4): 64 tokens of operations (response 92) versus 423 for regenerating the canonical file, 449 for Mermaid, 5,926 for draw.io XML and 20,884 for Excalidraw JSON; selective query 104-307 tokens; semantic diff 135 tokens. The study warns that an agent with a partial-edit tool can edit Mermaid at a cost of the same order, so the saving against Mermaid is in verification, not editing. | results.md; study doc 6 §4.2 |
| F-23 | FACT | Verification cost: inspecting a rendered PNG costs 972-2,145 visual tokens at 1x and 1,472-4,704 at 2x (Anthropic's documented formula, ceil(w/28) x ceil(h/28), capped at 4,784 on high-resolution models), against 1-164 tokens of textual diagnostics; in the complex case the image is downscaled to 60% of its size, making text hard to read. | vision-cost.json; https://platform.claude.com/docs/en/build-with-claude/vision (accessed 2026-10-13) |
| F-24 | FACT | A real MCP session with the official client (6 tools): 587 tokens of tool definitions plus 133 of instructions; create, populate 19 elements in one call, validate, selective query, edit with 4 ops, rejected invalid op, render and export cost 967 tokens of tool input and output in total (model reasoning not included). An invalid operation is rejected atomically with a suggestion ("did you mean 'mainframe'?"); a path outside the workspace returns `E_OUTSIDE_WORKSPACE`. | mcp-session.json |
| F-25 | FACT | The hook script was tested with simulated events only (exit 2 plus diagnostic on error, exit 0 otherwise); it was not run inside any of the clients. | Study doc 4 §integration |
| F-26 | FACT | Code sync (case 9, synthetic repository, 2 commits): 7 operations (77 tokens) versus 286 tokens to regenerate; hand-added labels and actors are preserved (only elements tagged `tags=code` are removed) and regeneration would have lost them; 0 introduced errors. | case9.json |
| I-5 | INTERPRETATION | The prototype's value over Mermaid 12 is not geometric: it is textual validation, atomic rejection with suggestions, semantic diff and code sync, rendering without a browser, and large savings against draw.io and Excalidraw representations; the claim that agents need fewer iterations or tokens per complete task is not measured. A caveat: the validator was written by the same study that scored Mermaid with it, and the study's visual review of Mermaid case 4 noticed connectors running along a group border and line jumps that the validator does not penalise. | F-17 to F-24, F-26 |

**Geometric comparison with the strongest baseline (errors E*, which excludes endpoint-contact checks that are not comparable for Mermaid, and edge crossings), from the study benchmark:**

| Case | Prototype E / crossings | Mermaid 12 ELK (default) E* / crossings | Mermaid 12 dagre E* / crossings |
| --- | --- | --- | --- |
| 01 flow | 0 / 0 | 0 / 0 | 0 / 0 |
| 02 C4 | 0 / 0 | 0 / 0 | 4 / 2 |
| 03 components | 0 / 1 | 1 / 1 | 1 / 3 |
| 04 distributed | 0 / 0 | 0 / 2 | 5 / 5 |
| 06 long labels | 0 / 0 | 0 / 0 | 0 / 0 |
| 07 groups | 0 / 5 | 0 / 2 | 3 / 3 |
| 10 complex | 0 / 8 | 0 / 0 | 10 / 21 |

**Stability after incremental editing (case 8 on case 4, 15 common nodes):**

| Strategy | Nodes moved >20 px | Mean shift | Kendall tau X / Y | Errors / warnings / crossings after |
| --- | --- | --- | --- | --- |
| Full re-layout (model order) | 15 | 336 px | 0.72 / -0.15 | 0 / 0 / 0 |
| Full re-layout (no model order) | 6 | 321 px | 0.72 / 0.13 | 0 / 0 / 0 |
| ELK semi-interactive | 14 | 203 px | 0.78 / 0.17 | 0 / 1 / 0 |
| Local repair (prototype router) | 6 (40%) | 136 px | 1.00 / 1.00 | 0 / 2 / 9 |

| ID | Label | Statement | Source / basis |
| --- | --- | --- | --- |
| F-27 | FACT | Stability trade-off: local repair preserves the mental map (tau 1.0) but adds 9 crossings in case 8 with the prototype's A* orthogonal router, while full re-layout adds none but moves all 15 nodes; in case 9 repair moved 0 nodes (re-layout 5) and had 3 crossings against 1. The study's target (at most 20% of nodes moved, tau at least 0.9, at most +2 crossings, without more errors) is **not met** by either strategy in case 8. | results.md (stability); case9.json |
| F-28 | FACT | Statement order matters for layout: reordering statements changed the layout in some cases (mean shift 97 px and tau as low as -0.64 in case 2, tau -0.75 in case 10), and model order did not improve stability, so a canonical serialisation is mandatory. | results.md (reordering sensitivity) |
| I-6 | INTERPRETATION | Layout stability is the main open technical problem; with the prototype router a stable mode cannot meet the study's target, a better router (libavoid, LGPL, F-12) or a policy that compares candidates is needed, and a stable mode should not be a hard MVP gate. | F-27, F-28, F-12, F-7 |
| A-6 | ASSUMPTION | ELK scales to hundreds of elements within an acceptable time (the study states this without measuring it; the largest measured case has 40 nodes), and an elkjs call can be bounded by a time budget (not stated by the study). Verify by: a sizing spike on synthetic graphs, with ELK run in a worker with a timeout. | — |
| A-7 | ASSUMPTION | Reasonable limits for element count and label length can be chosen without measuring real repositories. Verify by: the same spike plus a check on real repositories, then owner decision (Q-4). | — |

## Options compared

Scores are 1-5 judgments by the study's author, backed by the cited measurements; where nothing was measured the study says so. Alternatives: **A** Skill over Mermaid 12 (the strongest "do nothing new" baseline); **A'** Skill plus geometric linter over Mermaid; **B** semantic core plus CLI; **C** MCP server only; **D** own layout engine from scratch; **E** visual application first; **F** hybrid (core + CLI + thin MCP + Skill + CI); **G1** extend LikeC4 upstream; **G2** use the official draw.io MCP/Skill.

| Criterion (weight) | A | A' | B | C | D | E | F | G1 | G2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Visual quality (15) | 4 (parity measured, F-18) | 4 | 4 (F-17) | 4 | 3 | 4 | 4 | 4 | 4 (not measured) |
| Validation / fewer corrections (15) | 2 (syntax only) | 4 (validator ran on Mermaid SVG, F-20) | 5 | 5 | 5 | 3 | 5 | 4 | 2 (visual inspection, F-2) |
| Tokens per complete task (12) | 4 | 4 | 5 (F-22, F-23) | 4 (+720 tokens per session, F-24) | 5 | 2 | 5 | 4 | 1 (F-21) |
| Incremental editing / stability (10) | 2 | 2 | 3 (F-27) | 3 | 4 | 4 | 3 | 3 | 3 |
| Portability across agents (10) | 5 | 5 | 4 | 3 | 4 | 2 | 5 | 4 | 4 |
| Development / maintenance cost (10) | 5 | 4 | 4 | 4 | 1 | 2 | 3 | 4 | 5 |
| Installation / dependencies (8) | 3 (needs Chromium) | 3 | 4 (pure Node) | 4 | 4 | 2 | 4 | 4 | 3 |
| Interoperability / Git (8) | 4 | 4 | 4 | 4 | 4 | 3 | 5 | 4 | 4 |
| Commercialisation (6) | 1 | 3 | 3 | 3 | 4 | 4 | 4 | 2 | 1 |
| Technical risk (6) | 5 | 4 | 4 | 4 | 1 | 2 | 3 | 3 | 4 |
| Security, licence | MIT | MIT plus own code | Apache-2.0 proposed; elkjs EPL-2.0, resvg-js MPL-2.0 (unmodified use), font OFL-1.1 | as B | as B | tldraw excluded (F-10) | as B | MIT, upstream acceptance uncertain | Apache-2.0 |

**Weighted result (0-100) and sensitivity, from the study's reproducible script:**

| Alternative | Base | Cost/risk priority | Commercial priority | Agents/tokens priority | Visual-quality priority |
| --- | --- | --- | --- | --- | --- |
| A Skill over Mermaid 12 | 70.0 | 81.2 | 61.8 | 70.4 | 70.2 |
| A' Skill + linter | 75.2 | 78.0 | 71.6 | 76.0 | 75.6 |
| B core + CLI | 82.2 | **83.0** | 78.0 | 84.8 | 81.6 |
| C MCP only | 77.8 | 79.8 | 74.8 | 78.4 | 78.4 |
| D own engine | 72.8 | 57.6 | 74.4 | 78.0 | 70.8 |
| E app first | 57.0 | 50.6 | 62.0 | 55.2 | 62.2 |
| **F hybrid** | **83.8** | 78.0 | **82.6** | **86.4** | **82.8** |
| G1 extend LikeC4 | 74.4 | 76.0 | 69.2 | 76.0 | 75.0 |
| G2 draw.io MCP/Skill | 61.6 | 72.8 | 56.6 | 57.6 | 64.8 |

| ID | Label | Statement | Source / basis |
| --- | --- | --- | --- |
| I-7 | INTERPRETATION | F wins 4 of 5 profiles and B wins under cost/risk; B is the minimal subset of F, so the ranking is robust to start with B and add F's adapters when they pay off. The gap between F and B is 1.6 points in the base profile, smaller than the uncertainty of 1-5 judgments. A, the serious cheap alternative, is 1.8 points behind B under cost/risk and 13.8 behind F in the base profile. D (own engine) never wins and E (app first) is last in four profiles. | Weighted table; the weights were recomputed for F (83.8) and B (82.2) in this stage, see Appendix |
| I-8 | INTERPRETATION | A Skill alone is enough only if diagrams are small (15 nodes or fewer), the team already renders Mermaid 12, no stability or code-sync need exists, and cost is the priority; otherwise verification falls back to image inspection (F-23). The study did not score "no tooling at all". | F-18, F-23, study doc 2 §B.4 |

## Trade-offs

- **A (Skill over Mermaid 12):** gains zero build cost, universal text, ELK-quality layout; gives up geometric validation (falls back to image inspection at 1,000-4,700 tokens per look), operations and edit stability.
- **A' (Skill + linter):** gains validation at low cost using the measured validator-on-Mermaid result (F-20); gives up the operation contract, stable ids, code sync and a browser-free render; it is the pre-agreed fallback if the experiment fails.
- **B / F (core + CLI, then adapters):** gain textual diagnostics, atomic id-stable operations, determinism, code sync, browser-free render and export of validated geometry; give up simplicity (a new format and about 0.3-0.5 FTE maintenance after v1, a study estimate) and carry an unresolved stability problem (F-27) and a sizeable risk that Mermaid adds similar features.
- **D (own engine):** gains control over stability; gives up cost and risk, for a layout that is already a commodity (I-2).
- **E (app first):** gains human editing; gives up agent token efficiency and the minimal-human-intervention goal.
- **G1 / G2:** reuse existing ecosystems (LikeC4 for C4-only teams; draw.io for editing) but leave validation to visual inspection (G2) or depend on upstream acceptance (G1).

## Recommendation

| ID | Label | Recommendation | Relies on | Confidence |
| --- | --- | --- | --- | --- |
| R-1 | RECOMMENDATION | Build the deterministic core and CLI first (option B), then add the thin MCP server, the Agent Skill and the CI check (option F), reusing ELK Layered and a dedicated sequence engine; this matches the owner's accepted decisions. | I-7, F-17, F-22, F-24, I-4 | Medium |
| R-2 | RECOMMENDATION | Make the agent A/B experiment (Q-1; arms A, A' and F, at least 3 model families, 5 repetitions, criteria fixed in advance) the decision gate before v1; if it does not show at least 30% fewer calls or 40% fewer tokens than A without lower fidelity, pivot to A' and reuse the validator and diagnostic contract. Position the product on validation, operations, sync and agent contract, not on layout. | I-5, I-2, I-8, F-18, A-1 | Medium |
| R-3 | RECOMMENDATION | For Q-2: do not make the layout-stability target an MVP release gate; make determinism, canonical serialisation and id-stable atomic operations the MVP edit guarantees, show the change policy in the diff, and keep the stability target as the acceptance criterion of the later stable-mode increment (with a better router and a legal decision on libavoid). | I-6, F-27, F-28, F-12 | Medium |
| R-4 | RECOMMENDATION | For Q-4: do not fix numeric input limits from this study; run a short sizing spike on synthetic graphs (for example 10, 25, 50, 100, 200 and 400 elements, plus long labels) to measure layout time and memory, then set configurable defaults for element count, label length and a layout time budget, and reject before layout (NFR-9, AC-45). | F-19, A-6, A-7 | Low (the values are unknown) |
| R-5 | RECOMMENDATION | Before claiming interoperability, verify the exports by opening them in draw.io and Excalidraw and run the Skill, MCP server and hooks inside Claude Code, Codex, Gemini CLI and OpenHands; add the human evaluation (Q-3) to calibrate the heuristic warning thresholds. | F-25, A-5, Unknowns | Medium |

## Evidence for open questions

- **Q-2 (layout stability as MVP acceptance).** F-27 and F-28 are the measured evidence: neither re-layout nor local repair meets the study's target in case 8 (re-layout moves 100% of nodes; repair moves 40% of nodes and adds 9 crossings), only the case-9 repair run is within the thresholds (0 moved, tau 1.0 / 0.93, +2 crossings against re-layout). The study's own documents disagree on whether stability is an MVP criterion (acceptance list) or optional (stable mode); this report supplies the evidence, not the decision, and R-3 recommends deferring it. D2's author reports the same instability trade-off in a different engine (F-7).
- **Q-4 (input limits).** No source or measurement in the study fixes limit values. What exists: the parser is linear and uses no `eval`; limits on element count, label length and layout time are listed as pending (study doc 7 §7); the largest measured case is 40 nodes, 6 groups and 44 relations in 185 ms (F-19); the acceptance target is under 1 s for up to 50 nodes; diagrams over 100 nodes are a listed risk, and the claim that ELK scales to hundreds of nodes was not measured (study doc 7 R7); the validator already warns at 40 elements in one view (`I_DENSITY`); the MCP server is confined to the workspace (F-24). R-4 proposes a sizing spike.

## Unknowns

| Unknown | Why it matters | How to resolve |
| --- | --- | --- |
| A-6: Layout time, memory and abort behaviour of elkjs above 40 elements; whether a call can be interrupted for a time budget | Needed for Q-4 limits and NFR-9 | Sizing spike on synthetic graphs, test running ELK in a worker with a timeout |
| A-7: Which element-count, label-length and time limits are acceptable to users for real repositories | Q-4 thresholds | Spike results plus owner decision; check on real repositories |
| Fewer iterations and tokens per complete task than "Mermaid 12 + Skill" (A-1) | Decides continue or pivot (Q-1) | Pre-registered experiment, protocol in the study (paired Wilcoxon, bootstrap CIs, "acceptable" = 0 validator errors and at least 95% fidelity) |
| Human-perceived clarity versus Mermaid 12 with ELK, and calibration of heuristic thresholds | Q-3, false positives of warnings | Blind pairwise evaluation (12 raters, cases 1-7), as in the study protocol |
| Exports (draw.io, Excalidraw) opening correctly in the target apps | Interoperability claim | Round-trip tests in the target applications |
| Skill, MCP and hooks behaviour inside each client, and OpenHands hooks | Portability claim | Run in each client (A-5) |
| Stable layout with a better router, and the LGPL implications of libavoid | Q-2 target, licence | Router spike and legal review (F-12) |
| Mermaid 12 artefacts the validator does not penalise (connectors along group borders, line jumps at crossings) | Validator blind spots; fairness of the baseline comparison | Add checks, or include them in the human evaluation |
| Competitor capabilities for Ilograph, Lucidchart/Miro AI and yFiles (A-4) | Positioning | Read current documentation |

## Gaps and limitations

- **No real-agent sessions:** the environment had no model API key; the study measured tokens of artifacts and steps (an MCP session of 967 tokens excludes model reasoning), not complete agent tasks, so calls to an acceptable result, wall time and cost are pending.
- **No human evaluation:** perceived quality, professional appearance and threshold calibration are not measured (Q-3).
- **Exports not opened in target apps:** the draw.io and Excalidraw files were generated but not opened, to avoid sending data to external services.
- **Tokenizers:** o200k_base and the legacy Anthropic tokenizer were used; current Claude models do not publish their tokenizer.
- **Baseline method:** Mermaid geometry was extracted from SVG in a browser; curves are sampled every 4 px, arrowhead endpoints are not comparable (so E* is reported), and the baseline is scored by the study's own validator (I-5). Excalidraw and draw.io with an LLM writing coordinates were not measured as quality baselines (only the cost of the representation).
- **Scope of the measurements:** 8 graph/sequence cases written by the study, one run for timing, one synthetic repository for code sync, no case above 40 nodes; matrix scores are judgments and the alternative profile weights are in the study's script.
- **Citations:** academic references for layout algorithms were cited from memory (E-7); Gemini CLI details are version-dependent (E-8); the study did not re-verify third-party pricing and review claims.
- **Corrections recorded while persisting the study:** (1) the study's text gives 4,784 as an upper image cost, while the measured maximum is 4,704 (4,784 is the documented cap); (2) the study's timing range "9-250 ms" differs from the benchmark file (10-334 ms); this report uses the benchmark file; (3) drawio-mcp PR 56 was closed unmerged by a maintainer (F-2).

## Appendix: reproductions

Measured figures come from the study's benchmark files; to reproduce them (no network or keys needed, except the Mermaid baseline which needs a browser), from the study's prototype directory:

```text
npm install
node bench/run.ts           # quality, ablations, determinism, stability, tokens (results.md/json, matrix.md)
node bench/case9.ts         # code sync on a temporary Git repository (case9.json)
node bench/mcp-session.ts   # MCP session with the official client (mcp-session.json)
node bench/vision-cost.ts   # image-token cost (vision-cost.json)
node --test test/*.test.ts  # 21 tests
```

Checks performed in this stage (not a re-run of the benchmark):

```text
Weighted score F (base weights 15,15,12,10,10,10,8,8,6,6; scores 4,5,5,3,5,3,4,5,4,3): 419 / 5 = 83.8  (matches matrix.md)
Weighted score B (scores 4,5,5,3,4,4,4,4,3,4): 411 / 5 = 82.2  (matches matrix.md)
Token ratios from results.md: Excalidraw/canonical text 33.4x (case 2) to 67.7x (case 1); draw.io XML 10.1x (case 2) to 17.7x (case 1)
Link re-checks 2026-10-13: Mermaid 12.0.0 release (ELK bundled default; 10 Sep), excalidraw-mcp#33 (opened 2026-02-15),
  drawio-mcp#56 (opened 2026-07-21, closed same day by a maintainer), agentskills.io (open format by Anthropic; 46 clients listed)
```

