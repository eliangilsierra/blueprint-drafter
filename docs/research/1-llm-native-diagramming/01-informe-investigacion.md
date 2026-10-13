# Documento 1 · Informe de investigación

**Diagramación de arquitectura nativa para LLMs: estado del arte, causas raíz y oportunidades**

Fecha de consulta de todas las fuentes: **13‑10‑2026**. Convenciones: **[V]** verificado en fuente primaria durante esta investigación · **[PV]** parcialmente verificado (fuente secundaria o documentación incompleta) · **[M]** medido con el prototipo de esta investigación (reproducible) · **[I]** inferencia técnica · **[H]** hipótesis no verificada.

---

## 1. Resumen

1. **El problema no es de dibujo, es de bucle de control.** A los modelos se les pide resolver geometría y tipografía (coordenadas, anchos de texto, anclajes) que no pueden medir, en formatos pensados para editores gráficos, y sin un contrato de calidad comprobable por máquina. Los defectos que describes (solapes, textos cortados, flechas flotantes, correcciones interminables) son la consecuencia esperable de ese diseño, no de "malos prompts". La evidencia pública lo confirma: el issue [excalidraw-mcp#33](https://github.com/excalidraw/excalidraw-mcp/issues/33) afirma que "casi siempre" las flechas generadas por agentes quedan sin enlazar; el PR [drawio-mcp#56](https://github.com/jgraph/drawio-mcp/pull/56) admite que una exportación válida "no detecta intersecciones, etiquetas recortadas ni ramas ambiguas" y añade una inspección visual manual **[V]**.
2. **El layout automático ya es una *commodity*.** En septiembre de 2026 Mermaid 12 adoptó ELK como motor por defecto ([release 12.0.0](https://github.com/mermaid-js/mermaid/releases/tag/mermaid%4012.0.0)), D2 liberó TALA bajo MPL‑2.0 ([blog D2](https://d2lang.com/blog/tala-is-open-source/)), el MCP oficial de draw.io usa ELK + libavoid y LikeC4 está incorporando enrutamiento ortogonal **[V]**. En nuestras mediciones, **Mermaid 12 con ELK produce prácticamente la misma calidad geométrica que nuestro prototipo** (0 errores en 6 de 7 casos) **[M]**. Construir "otro motor de layout" no es una ventaja defendible.
3. **La oportunidad real está en lo que nadie cierra todavía:** (a) validación geométrica y semántica automática con diagnósticos accionables, (b) operaciones semánticas incrementales y atómicas con identificadores estables, (c) sincronización con el código que no destruye la curación humana, (d) estabilidad visual entre versiones y (e) exportación con geometría ya validada hacia herramientas existentes. El prototipo demuestra (a), (b), (c) y (e); (d) sigue siendo un problema abierto con un compromiso medido **[M]**.
4. **Recomendación (detallada en el Documento 8):** construir un **núcleo determinista local (TypeScript) con CLI como interfaz universal**, un adaptador MCP fino, una Skill estándar (formato Agent Skills) y una acción de CI; **no** un editor nuevo, **no** un motor de layout propio, **no** un formato propietario cerrado. Antes de invertir en editor visual o en estabilidad avanzada, validar con un experimento A/B con agentes reales frente a "Mermaid 12 + Skill" (criterios de abandono en el Documento 6).

---

## 2. El problema, descompuesto en causas raíz

| # | Síntoma observado | Causa raíz | Evidencia |
|---|---|---|---|
| 1 | Textos cortados o desbordados | El LLM no conoce las métricas de la fuente; estima anchos por número de caracteres. | Issues abiertos en Mermaid sobre texto cortado: [#6424](https://github.com/mermaid-js/mermaid/issues/6424), [#4918](https://github.com/mermaid-js/mermaid/issues/4918), [#7359](https://github.com/mermaid-js/mermaid/issues/7359) **[V]** |
| 2 | Nodos superpuestos / mal distribuidos | Coordenadas absolutas elegidas por el modelo sin restricciones globales. | Skill comunitaria de Excalidraw advierte que paneles laterales "VAN a solaparse" y pide planificar una rejilla **[PV]**; issue [mermaid#7175](https://github.com/mermaid-js/mermaid/issues/7175) **[V]** |
| 3 | Flechas que no llegan o "flotan" | Formatos con enlaces bidireccionales implícitos (Excalidraw: `startBinding` + `boundElements`) que el modelo debe mantener coherentes a mano. | [excalidraw-mcp#33](https://github.com/excalidraw/excalidraw-mcp/issues/33) **[V]** |
| 4 | Conectores que atraviesan nodos/etiquetas | Enrutadores sin obstáculos (splines de dagre) o etiquetas colocadas después del layout. | Medido: dagre produce 13 aristas que atraviesan nodos en el caso complejo; ELK sin reservar etiquetas produce 33 etiquetas sobre nodos **[M]** |
| 5 | Muchos ciclos de corrección | No existe un oráculo de calidad: el único "test" es mirar la imagen. | drawio-mcp [#56](https://github.com/jgraph/drawio-mcp/pull/56): "quality gate" basado en inspección visual **[V]**; [DIAGRAM-FAIL-BENCH](https://neurips.cc/virtual/2026/173008): código que renderiza pero viola restricciones ("render‑constraint gap") **[V]** |
| 6 | Alto consumo de tokens | Formatos con coordenadas y estilo por elemento; regeneración completa en cada ajuste; inspección visual por imagen. | Medido: Excalidraw JSON ≈ 33–68× y draw.io XML ≈ 10–18× los tokens del modelo semántico del mismo diagrama (4 casos); la descripción de una herramienta de draw.io MCP llegó a ~16k tokens ([#76](https://github.com/jgraph/drawio-mcp/issues/76), [#78](https://github.com/jgraph/drawio-mcp/pull/78)) **[M][V]** |
| 7 | Fragilidad ante cambios | Re‑layout global en cada edición. | Medido: tras un cambio de 6 operaciones, los 15 nodos comunes se desplazan (media 336 px) con re‑layout completo **[M]** |
| 8 | Dependencia de la herramienta | La "verdad" vive en la representación gráfica, no en un modelo. | [I] |
| 9 | Imposible verificar automáticamente | No hay una especificación de "diagrama aceptable" ejecutable. | Benchmarks académicos usan CLIPScore o jueces LLM; [DiagramEval](https://arxiv.org/abs/2510.25761) muestra que CLIPScore puede puntuar alto diagramas sin flujo de datos claro **[V]** |

**Conclusión de la sección [I]:** las causas 1–4 se eliminan *por construcción* si el modelo deja de producir geometría; la 5 requiere un validador; la 6 requiere operaciones incrementales y diagnósticos textuales; la 7 requiere una política explícita de estabilidad; la 8–9 requiere separar modelo semántico, presentación y geometría.

---

## 3. Estado del arte: herramientas (Fase I · 4.1)

La matriz comparativa completa está en el **Documento 2**. Aquí, lo esencial y verificable.

### 3.1 Diagramación "como código"

- **Mermaid** (MIT, ~90,6k estrellas) **[V]**. Versión 12.0.0 (10‑09‑2026): ELK incluido y **por defecto** para flowchart, estado, clases, ER, requisitos y casos de uso; dagre sigue disponible con `layout: dagre`. Renderizado requiere DOM (navegador o `@mermaid-js/mermaid-cli` con Chromium) **[V]**. Hay un renderizador sin DOM de terceros, [beautiful‑mermaid](https://github.com/lukilabs/beautiful-mermaid) (MIT, ELK síncrono, 6 tipos de diagrama) **[V]**. Debilidades documentadas: el renderizador C4 nativo de Mermaid tiene solapes de etiquetas y cruces ([#7492](https://github.com/mermaid-js/mermaid/issues/7492), [#7316](https://github.com/mermaid-js/mermaid/issues/7316)); falta un layout de rejilla con enrutado consciente de obstáculos ([#8401](https://github.com/mermaid-js/mermaid/issues/8401), propuesta de 07‑10‑2026) **[V]**.
- **D2** (MPL‑2.0) **[V]**. Motores dagre, ELK y TALA; TALA liberado el 07‑09‑2026 con D2 v0.9.0. El propio autor reconoce que TALA es menos estable ante cambios (añadir un nodo puede reorganizar el diagrama) y que dagre/ELK preservan mejor el layout previo **[V]**. Terrastruct está en cierre y D2 pasó a ser un proyecto sin ánimo de lucro patrocinado fiscalmente por Hack Club ([blog](https://d2lang.com/blog/d2-non-profit/)) → **riesgo de mantenimiento** a vigilar **[V]**.
- **PlantUML** (multilicencia: GPL/LGPL/Apache/EPL/MIT, con funciones excluidas en las variantes permisivas; ELK solo en la variante EPL) **[V]**. Java; amplio catálogo UML.
- **Graphviz** (EPL, según [graphviz.org/license](https://graphviz.org/license/)) **[V]**: referencia histórica del layout jerárquico (algoritmo de Gansner et al.); disponible en WASM (`@hpcc-js/wasm-graphviz`, Apache‑2.0) **[V]**.
- **Structurizr** (Apache‑2.0; `structurizr/lite` archivado, repositorio unificado `structurizr/structurizr`) **[V]**: implementación de referencia de C4 "models as code"; un modelo, varias vistas.
- **LikeC4** (MIT, TypeScript) **[V]**: DSL de arquitectura, vistas, exportación a PNG/SVG/Mermaid/D2/PlantUML/draw.io, **servidor MCP oficial** (`@likec4/mcp`) con herramientas de consulta (`search-element`, `query-graph`, `find-relationship-paths`, `preview-view`…) **[V]**. Sus herramientas MCP son mayoritariamente de lectura y consulta; la edición se hace sobre el DSL **[I]**. PR abierto de enrutamiento ortogonal ([#3278](https://github.com/likec4/likec4/pull/3278)) **[V]**.
- **Kroki** (MIT): pasarela unificada de renderizado para muchos lenguajes **[V]**.
- **mingrammer/diagrams** (MIT, Python): diagramas cloud como código sobre Graphviz **[V]**.

### 3.2 Editores gráficos con integración para agentes

- **Excalidraw** (MIT) + **MCP App oficial** (`excalidraw/excalidraw-mcp`, ~5,5k estrellas; remoto en `mcp.excalidraw.com`) **[V]**. Usa la extensión **MCP Apps** (UI interactiva dentro del chat). Problemas documentados: flechas sin enlazar ([#33](https://github.com/excalidraw/excalidraw-mcp/issues/33)), exportación que pierde textos ([#22](https://github.com/excalidraw/excalidraw-mcp/issues/22)) **[V]**.
- **draw.io / diagrams.net** (Apache‑2.0) + **MCP oficial** `jgraph/drawio-mcp` (Apache‑2.0, ~5,6k estrellas): servidor MCP App (hosted en `mcp.draw.io`), servidor de herramientas npm `@drawio/mcp` (XML, CSV, Mermaid), plugins/skills para Claude Code, Codex y Copilot CLI; post‑layout con ELK y enrutado con **libavoid** **[V]**. Lecciones públicas valiosas: descripción de herramienta de 34.527 caracteres (~16k tokens) que rompía la búsqueda de herramientas de VS Code, reducida a ~1k tokens ([#78](https://github.com/jgraph/drawio-mcp/pull/78)); "quality gate" basado en inspección visual ([#56](https://github.com/jgraph/drawio-mcp/pull/56)) **[V]**.
- **tldraw**: licencia propia que **prohíbe uso en producción sin clave comercial** (LICENSE del repositorio) **[V]** → descartado como base de producto abierto.
- **React Flow / xyflow** (MIT), **Cytoscape.js** (MIT), **WebCola** (MIT): bibliotecas de visualización/edición de grafos útiles para un visor futuro **[V]**.

### 3.3 Herramientas de IA y "repositorio → diagrama"

- **Eraser / DiagramGPT**: SaaS; texto → diagrama‑como‑código; precios publicados por terceros (Free, Starter ~15 $/miembro/mes, Business ~45 $) **[PV]**.
- **IcePanel**: modelado C4 SaaS con **servidor MCP en beta** desde 15‑05‑2025 ([docs](https://docs.icepanel.io/experiments/mcp-server-beta)) **[V]**.
- **GitDiagram** (MIT, ~18k estrellas) **[V]**: repositorio → Mermaid mediante LLM; reconoce que el LLM genera Mermaid inválido y que "no hay una solución fiable" **[PV]** (vía reseñas que citan al autor).
- **Ilograph**, **Lucidchart/Miro AI**, **yFiles** (comercial, con layout incremental de referencia): **desconocido** en esta investigación (no se pudo verificar capacidades actuales con fuentes primarias).

### 3.4 Patrón emergente que ya aparece en el ecosistema

Varios servidores MCP comunitarios para Excalidraw convergen en la misma idea: "el servidor posee todo el razonamiento espacial (coordenadas, enlaces, medición de texto, detección de solapes) y el LLM opera a nivel semántico de nodos y aristas" **[PV]** (descripciones en directorios MCP como glama.ai). Es exactamente la premisa central de este trabajo; **la convergencia valida la dirección, pero también indica que el espacio se llenará rápido** → la diferenciación debe estar en validación, estabilidad y contrato de operaciones, no solo en "layout automático".

---

## 4. Ecosistema de agentes y protocolos (Fase I · 4.2)

| Mecanismo | Claude Code | OpenAI Codex | Gemini CLI | OpenHands |
|---|---|---|---|---|
| **Skills (formato Agent Skills, `SKILL.md`)** | Sí ([docs](https://code.claude.com/docs/en/skills)) **[V]** | Sí: `.agents/skills`, `$HOME/.agents/skills`, invocación implícita o `$skill`; presupuesto de descubrimiento 2 % del contexto / 8.000 caracteres ([docs](https://learn.chatgpt.com/docs/build-skills)) **[V]** | Sí: `.gemini/skills` o `.agents/skills`; activación con `activate_skill` y consentimiento ([docs](https://geminicli.com/docs/cli/skills/)) **[V]** | Sí: `.agents/skills`, extensiones `triggers` y `paths` ([docs](https://docs.openhands.dev/overview/skills)) **[V]** |
| **MCP** | Sí **[V]** | Sí: `config.toml`, stdio y Streamable HTTP ([docs](https://developers.openai.com/codex/mcp)) **[V]** | Sí **[PV]** | Sí: `~/.openhands/mcp.json` en la CLI 1.x; formato cambió de TOML a JSON ([docs](https://docs.openhands.dev/openhands/usage/cli/mcp-servers)) **[V]** |
| **Hooks** | Sí: `PreToolUse`/`PostToolUse`… con *matchers* `mcp__<server>__.*`; exit 2 bloquea ([docs](https://code.claude.com/docs/en/hooks)) **[V]** | Sí: `hooks.json` o `[hooks]` en `config.toml`; hooks no gestionados requieren confianza ([docs](https://developers.openai.com/codex/hooks)) **[V]** | Sí: `BeforeTool`/`AfterTool` en `settings.json`; exit 2 bloquea ([docs](https://geminicli.com/docs/hooks/)) **[V]**; madurez según versión **[PV]** | No verificado en esta investigación (**desconocido**) |
| **Instrucciones de repositorio** | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` | `AGENTS.md`, reconoce `CLAUDE.md`/`GEMINI.md` **[V]** |

Hechos relevantes adicionales:

- **Agent Skills es un estándar abierto** originado por Anthropic y adoptado por más de 40 clientes listados en [agentskills.io](https://agentskills.io/) (Claude Code, Codex, Gemini CLI, OpenHands, Cursor, VS Code/Copilot, Goose, Kiro, Junie…) **[V]**. Una Skill escrita una vez es portable, aunque las extensiones de cada cliente no lo son (p. ej. `agents/openai.yaml` en Codex, `triggers` en OpenHands) **[V]**.
- **Una Skill no es intercambiable con un servidor MCP**: la Skill aporta *conocimiento procedimental* y puede empaquetar scripts; MCP aporta *herramientas tipadas* con esquema y transporte. Una Skill puede declarar dependencias de MCP (Codex) **[V]**.
- **MCP Apps** es una extensión oficial de MCP que permite devolver UI interactiva al chat ([docs](https://modelcontextprotocol.io/docs/extensions/apps)); la usan Excalidraw, draw.io y LikeC4 **[V]**. Útil para una vista previa futura, no imprescindible.
- **Gemini CLI**: su documentación indica que fue reemplazada por "Antigravity CLI" el 18‑06‑2026 para usuarios del nivel gratuito y Google One **[PV]** → otra razón para no acoplarse a un único cliente.
- **Coste de contexto de las herramientas**: lo que se carga en cada sesión importa (caso draw.io #76). Nuestro servidor MCP expone 6 herramientas en **587 tokens** de definiciones + **133** de instrucciones **[M]**.

---

## 5. Algoritmos y técnicas de layout (Fase I · 4.3)

| Problema | Técnica de referencia | Disponibilidad abierta | Evaluación |
|---|---|---|---|
| Grafos dirigidos / capas | Método de Sugiyama (eliminación de ciclos, asignación de capas, minimización de cruces, posicionamiento, enrutado); `dot` (Gansner et al., 1993); Brandes‑Köpf; *network simplex* | **ELK Layered** (EPL‑2.0 o GPL‑3.0+, `elkjs` 0.12.0), dagre (MIT), Graphviz | ELK es el más completo: puertos, etiquetas como obstáculos, jerarquía (`INCLUDE_CHILDREN`), orden de modelo, opciones interactivas **[V][M]** |
| Enrutamiento ortogonal | Grafo de visibilidad ortogonal + A* con penalización de giros + "nudging" (Wybrow, Marriott y Stuckey, 2010) | **libavoid** (Adaptagrams, LGPL‑2.1+ o licencia comercial de Monash), puerto WASM `libavoid-js` (LGPL‑2.1+) **[V]** | El mejor para editar sin mover nodos; la LGPL impone obligaciones de redistribución **[I]** |
| Grafos no dirigidos | Fuerzas / estrés (Kamada‑Kawai, stress majorization), restricciones de separación (IPSep‑CoLa) | ELK `stress`/`force`, WebCola (MIT), Cytoscape (MIT) | Útil para mapas de dependencias sin dirección dominante **[I]** |
| Etiquetas | Etiquetas como nodos ficticios durante el layout; colocación en extremos (TAIL/HEAD) | ELK (`edgeLabels.placement`, `inline`) | Medido: reservar espacio para etiquetas elimina 100 % de solapes etiqueta/nodo en nuestros casos frente a colocarlas después **[M]** |
| Grupos / contenedores | Layout jerárquico compuesto | ELK `INCLUDE_CHILDREN`; dagre `compound` (no admite aristas a clusters) | dagre falla con aristas hacia grupos (limitación real; tuvimos que omitirlas) **[M]** |
| Estabilidad incremental (*mental map*) | Layout incremental/interactivo; restricciones de posición; reparación local | ELK interactivo (limitado), yFiles (comercial), libavoid | **Problema abierto en abierto**: ELK rechaza la minimización de cruces interactiva con jerarquía (`UnsupportedGraphException`) **[M]** |
| Diagramas de secuencia, Gantt, ER tabulares | Motores específicos (columnas/filas) | Mermaid, PlantUML | Un motor genérico de grafos **no** es adecuado: lo confirmamos implementando un motor de secuencia separado (0 errores) **[M]** |
| Diagramas "humanos" ortogonales | HOLA (Kieffer et al., 2016), TALA | Adaptagrams (LGPL), TALA (MPL‑2.0, Go) | TALA prioriza simetría pero es inestable ante cambios según su autor **[V]** |

**Decisión técnica derivada [M][I]:** reutilizar ELK Layered para grafos de arquitectura/flujo, motores específicos para secuencia (y en el futuro ER/estados si lo justifican los datos), y concentrar el desarrollo propio en: medición tipográfica, presets, recorte de extremos al contorno real de cada forma, validador, operaciones y la política de estabilidad.

> Referencias académicas citadas de memoria (no re‑verificadas en línea durante esta sesión): Sugiyama, Tagawa y Toda (1981); Gansner, Koutsofios, North y Vo (1993); Brandes y Köpf (2001); Misue, Eades, Lai y Sugiyama (1995, *mental map*); Purchase (1997, impacto de los cruces en la comprensión); Wybrow, Marriott y Stuckey (2010); Schulze, Spönemann y von Hanxleden (2014, ELK con puertos); Kieffer, Dwyer, Marriott y Wybrow (2016, HOLA).

---

## 6. Evidencia sobre problemas reales (Fase I · 4.4)

**Documentado (fuentes primarias):**

- Agentes que generan Excalidraw producen flechas no enlazadas de forma sistemática ([excalidraw-mcp#33](https://github.com/excalidraw/excalidraw-mcp/issues/33)).
- La validación de diagramas de draw.io generados por agentes depende de exportar y mirar ([drawio-mcp#56](https://github.com/jgraph/drawio-mcp/pull/56), [#45](https://github.com/jgraph/drawio-mcp/pull/45)).
- Las descripciones de herramientas muy largas degradan el ecosistema entero de herramientas del cliente ([drawio-mcp#76](https://github.com/jgraph/drawio-mcp/issues/76)).
- Mermaid acumula issues abiertos sobre solapes y textos cortados (búsqueda en el repositorio: 18 resultados para solapes de etiquetas/aristas y 25 para texto cortado, 13‑10‑2026) **[V]**.
- **Académico:** DIAGRAM‑FAIL‑BENCH (630 tareas Mermaid, 21 tipos): la documentación aumenta la tasa de renderizado pero no cierra la brecha entre "renderiza" y "cumple las restricciones"; la reparación guiada por verificador cierra la mayor parte; en una prueba con agentes de código, las iteraciones con verificador de caja negra subieron el éxito de 51,43 % a 60,00 % ([NeurIPS 2026 workshop](https://neurips.cc/virtual/2026/173008)) **[V]**. MermaidSeqBench (132 casos de secuencia) observa brechas notables entre modelos ([arXiv 2511.14967](https://arxiv.org/abs/2511.14967)) **[V]**. DiagramAgent/DiagramGenBenchmark (CVPR 2025) propone agentes de plan/código/verificación ([arXiv 2411.11916](https://arxiv.org/abs/2411.11916)) **[V]**. DiagramEval evalúa diagramas como grafos ([arXiv 2510.25761](https://arxiv.org/abs/2510.25761)) **[V]**.
- **Experiencia práctica:** un informe de la Universidad Humboldt reporta que un bucle de validación con Mermaid CLI subió la validez sintáctica de ~70 % a ~95 %, y que generar JSON estructurado convertido deterministamente a Mermaid "garantiza sintaxis válida" ([informe](https://llm-enabled-development-41d6d8.pages.cms.hu-berlin.de/en/experiments/diagram/diagram-long)) **[PV]**.

**Hipótesis propias (no verificadas con usuarios) [H]:**

- H1. El número de iteraciones de corrección se reduce cuando el agente recibe diagnósticos textuales con la corrección sugerida en lugar de una imagen.
- H2. Los desarrolladores dejan de actualizar diagramas porque el coste de re‑maquetar a mano supera el valor; la sincronización desde código lo reduce.
- H3. La estabilidad visual entre versiones importa más en revisiones de arquitectura que la optimalidad del layout.

---

## 7. Lo que el prototipo demostró (resumen de Fases II–XIII)

| Hipótesis | Resultado | Estado |
|---|---|---|
| Un motor determinista elimina solapes, texto cortado y conectores que atraviesan nodos sin que el LLM calcule coordenadas | 0 errores geométricos en los 8 casos de grafo y secuencia; ablaciones sin nuestras decisiones: 5–43 errores por caso | **Confirmada [M]** |
| Esa calidad supera a las herramientas existentes | Supera a dagre (Mermaid ≤11 / variante dagre de Mermaid 12): hasta 10 aristas atravesando nodos y 21 cruces en el caso complejo. **No supera a Mermaid 12 + ELK** (equivalente; menos cruces en el caso complejo) | **Refutada frente a Mermaid 12 [M]** |
| Las operaciones incrementales reducen tokens | Caso 8: 64 tokens de operaciones frente a 423 (regenerar el archivo), 449 (Mermaid), 5.926 (draw.io) y 20.884 (Excalidraw) | **Confirmada para el paso de edición [M]**; el coste de la tarea completa con un agente real queda **pendiente** |
| Los diagnósticos textuales sustituyen a la inspección visual a menor coste | 1–164 tokens de diagnósticos frente a 972–4.784 tokens por imagen inspeccionada (fórmula oficial de Anthropic) | **Confirmada para coste [M]**; su eficacia para guiar al modelo queda **pendiente** |
| El validador es útil más allá de nuestro motor | Se aplicó sin cambios a la geometría extraída de SVGs de Mermaid 12 | **Confirmada [M]** |
| La edición incremental puede preservar el layout | Re‑layout: 15/15 nodos movidos; reparación local: 6/15 movidos y orden relativo perfecto (τ = 1,0), pero 9 cruces frente a 0 | **Parcial: compromiso estabilidad‑calidad no resuelto [M]** |
| La sincronización con código preserva la curación humana | 7 operaciones (77 tokens) frente a regenerar (286); etiquetas y actores añadidos a mano se conservan; regenerar los perdería | **Confirmada en un caso sintético [M]** |

---

## 8. Oportunidades de innovación (ordenadas por valor/evidencia)

1. **Validador de diagramas como "linter" universal** (para nuestro formato y para la salida de Mermaid/D2/draw.io): ningún producto analizado ofrece un contrato de calidad geométrico ejecutable en CI. Evidencia de necesidad: [drawio-mcp#56](https://github.com/jgraph/drawio-mcp/pull/56), DIAGRAM‑FAIL‑BENCH. **[V][M]**
2. **Contrato de operaciones semánticas atómicas** (`+ ~ -` con ids estables, rechazo atómico, "¿quisiste decir…?"), idéntico en CLI y MCP. **[M]**
3. **Sincronización código→arquitectura por operaciones**, no por regeneración (preserva curación). **[M]**
4. **"Compilador de layout" hacia herramientas existentes**: exportar a draw.io/Excalidraw con geometría validada y flechas realmente enlazadas (resuelve el problema de #33 sin pedírselo al LLM). Implementado; **pendiente verificar apertura en las aplicaciones de destino**. **[M][H]**
5. **Política de estabilidad explícita** (*layout lockfile* + reparación local arbitrada por el validador). Implementado como prototipo; requiere un enrutador de mayor calidad (libavoid o propio) para no degradar cruces. **[M]**
6. **Sistema visual por roles semánticos** (el agente elige `kind`, nunca colores): tema claro/oscuro con contraste WCAG validado. Calidad estética pendiente de evaluación humana. **[M][H]**

**Lo que no es una oportunidad:** otro motor de layout genérico, otro editor de pizarra, o "otra sintaxis" por sí misma. Nuestro DSL es tan compacto como Mermaid (424 vs 450 tokens en el caso 4) — su valor no es la brevedad, sino que la misma gramática sirve de archivo, de operación incremental y de diff. **[M]**

---

## 9. Limitaciones de esta investigación

- No se ejecutaron pruebas con agentes reales llamando a modelos (no hay clave de API en el entorno); los tokens medidos son de **artefactos y pasos**, no de sesiones completas. El número de llamadas necesarias para un resultado aceptable queda **pendiente** (protocolo en el Documento 6).
- Los tokenizadores usados son `o200k_base` (OpenAI) y el tokenizador **legado** de Anthropic; los modelos Claude actuales no publican su tokenizador.
- No hubo evaluación humana de calidad percibida.
- Las exportaciones a draw.io y Excalidraw se generaron pero **no se abrieron** en esas aplicaciones (evitamos enviar datos a servicios externos).
- La línea base de Mermaid se midió extrayendo geometría del SVG en un navegador; las curvas se muestrean cada 4 px y los extremos de flecha no son comparables.
- Excalidraw/draw.io con LLM generando coordenadas no se midieron como línea base de calidad (requeriría un modelo); se midió su coste de representación.
