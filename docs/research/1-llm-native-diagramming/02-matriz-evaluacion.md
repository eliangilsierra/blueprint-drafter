# Documento 2 · Matriz de evaluación

Fecha de consulta: 13‑10‑2026. Valores de verificación: **verificado** · **parcialmente verificado** · **no disponible** · **desconocido**. "Medido" indica dato obtenido con el benchmark reproducible de este trabajo (`prototype/bench`).

---

## Parte A · Herramientas existentes

### A.1 Representación, tipos y layout

| Herramienta (categoría) | Modelo de representación | Tipos de diagrama | Calidad / flexibilidad del layout | Control de colisiones y conectores | Legibilidad del texto |
|---|---|---|---|---|---|
| **Mermaid 12** (DSL texto) | Texto declarativo | Flujo, secuencia, clases, estados, ER, C4 (beta), Gantt, mindmap, casos de uso… — verificado | ELK por defecto desde 12.0.0; dagre opcional — verificado. Medido: 0 errores en 6/7 casos con ELK | Medido con ELK: 0 aristas atravesando nodos; 1 solape etiqueta/etiqueta (caso 3). Con dagre: hasta 10 aristas atravesando nodos (caso 10) | Ajuste de línea automático; issues abiertos de texto cortado — verificado. Medido: 0 desbordes detectados |
| **D2** (DSL texto) | Texto declarativo | Grafos, contenedores, secuencia, SQL tables, clases — verificado | dagre, ELK, TALA (MPL‑2.0 desde 07‑09‑2026) — verificado | Depende del motor — parcialmente verificado | desconocido (no medido) |
| **PlantUML** (DSL texto) | Texto declarativo | Suite UML completa + C4 vía librería — verificado | Graphviz/Smetana; ELK solo en variante EPL — verificado | desconocido (no medido) | desconocido |
| **Structurizr** (modelo como código) | DSL → modelo C4 → vistas | C4 (contexto, contenedores, componentes, despliegue, dinámicos) — verificado | Auto‑layout + ajuste manual — parcialmente verificado | desconocido | desconocido |
| **LikeC4** (modelo como código) | DSL → modelo → vistas | Arquitectura C4‑like, despliegue, dinámicas, secuencia — verificado | Auto‑layout; ortogonal en PR abierto (#3278) — verificado | Issue abierto de etiquetas solapadas (#1224) — verificado | desconocido |
| **Graphviz** (motor) | DOT | Grafos | Referencia jerárquica — verificado | Splines; sin etiquetas como obstáculos completos — parcialmente verificado | Dependiente de fuentes del sistema |
| **Kroki** (pasarela) | Delegado | Todos los que integra | Delegado | Delegado | Delegado |
| **Excalidraw + MCP oficial** (pizarra) | JSON con coordenadas absolutas | Libre (dibujo) | Sin layout automático en el formato; el LLM coloca — verificado | Enlaces de flechas manuales (#33) — verificado | El LLM estima tamaños — inferencia |
| **draw.io + MCP oficial** (editor) | XML mxGraph con coordenadas | Libre + bibliotecas (AWS, Azure, UML, BPMN…) — verificado | ELK post‑layout + libavoid — verificado | libavoid evita nodos — verificado (no medido) | `whiteSpace=wrap`; sin medición previa — parcialmente verificado |
| **tldraw** (SDK lienzo) | JSON | Libre | No | No | — |
| **Eraser / DiagramGPT** (SaaS IA) | Diagram‑as‑code propietario | Flujo, cloud, ER, secuencia, BPMN — parcialmente verificado | desconocido | desconocido | desconocido |
| **IcePanel** (SaaS C4) | Modelo C4 propietario | C4 — verificado | desconocido | desconocido | desconocido |
| **GitDiagram** (repo→diagrama) | Mermaid generado por LLM | Arquitectura de repositorio | Delegado en Mermaid | Delegado | Riesgo de Mermaid inválido — parcialmente verificado |
| **beautiful‑mermaid** (renderizador) | Mermaid | 6 tipos — verificado | ELK síncrono sin DOM — verificado | desconocido (no medido) | desconocido |
| **Prototipo «plano»** (este trabajo) | Modelo semántico + texto canónico + operaciones | Flujo, C4 (contexto/contenedores), componentes, arquitectura, secuencia — medido | ELK Layered + motor de secuencia — medido: 0 errores en 8/8 casos | Etiquetas como obstáculos, recorte al contorno real, validador — medido | Medición con métricas reales de la fuente — medido: 0 desbordes |

### A.2 Edición, agentes, tokens, coste y licencia

| Herramienta | Edición incremental | Integración con agentes | Tokens (tareas representativas) | Dependencias / coste operativo | Licencia y restricciones |
|---|---|---|---|---|---|
| **Mermaid 12** | Edición de texto (el agente puede usar ediciones parciales); re‑layout completo en cada render | Universal vía texto; MCP comunitarios (`mcp-mermaid`, MIT) — verificado | Medido: 238–1.036 tokens por diagrama (casos 1, 2, 4, 10) | Render requiere DOM/Chromium (mermaid‑cli) o renderizador de terceros | MIT — verificado |
| **D2** | Texto; TALA inestable ante cambios — verificado | CLI; MCP desconocido | desconocido (no medido) | Binario Go | MPL‑2.0 (copyleft por archivo) — verificado. Riesgo de mantenimiento: empresa en cierre — verificado |
| **PlantUML** | Texto | CLI/servidor | desconocido | JVM | GPL/LGPL/Apache/EPL/MIT según variante — verificado |
| **Structurizr** | Texto (DSL) | CLI/Docker; MCP desconocido | desconocido | JVM/Docker | Apache‑2.0 — verificado |
| **LikeC4** | Texto (DSL) + snapshots de layout manual — verificado | **MCP oficial** (consulta, vista previa, render MCP Apps) — verificado | desconocido (no medido) | Node | MIT — verificado |
| **Graphviz** | Re‑layout | CLI/WASM | — | C / WASM (Apache‑2.0 el empaquetado hpcc) | EPL — verificado |
| **Excalidraw + MCP** | Regenerar/editar elementos con coordenadas | MCP App oficial (remoto o local) — verificado | Medido (export equivalente): 11.627–53.975 tokens por diagrama | Navegador / servicio remoto | MIT — verificado |
| **draw.io + MCP** | Edición XML; libavoid re‑enruta | MCP App, MCP herramientas, plugins Claude Code/Codex/Copilot CLI — verificado | Medido (export equivalente): 3.506–14.829 tokens por diagrama; descripción de herramienta reducida de ~16k a ~1k tokens (#78) — verificado | draw.io Desktop para exportar desde el plugin — verificado | Apache‑2.0 — verificado |
| **tldraw** | — | — | — | — | **Licencia propia: prohíbe producción sin clave** — verificado |
| **Eraser** | Texto | Integraciones IDE/Notion — parcialmente verificado | desconocido | SaaS de pago | Propietaria — parcialmente verificado |
| **IcePanel** | UI | MCP beta (2025) — verificado | desconocido | SaaS | Propietaria |
| **GitDiagram** | Regeneración por LLM | Web | desconocido | Clave de API de LLM | MIT — verificado |
| **Prototipo «plano»** | **Operaciones `+ ~ -` atómicas, ids estables, modo estable con lockfile** — medido | **CLI + MCP (6 herramientas) + Skill** — medido | Medido: modelo 253–1.003 tokens; edición 64 tokens; diagnósticos 1–164 tokens; definiciones MCP 587+133 | Node puro, sin navegador ni red; render 9–250 ms por caso (medido) | Propuesta: Apache‑2.0 (núcleo); dependencias EPL‑2.0 (elkjs), MPL‑2.0 (resvg‑js), OFL (fuente) |

### A.3 Ventajas, limitaciones y oportunidad

| Herramienta | Ventaja principal | Limitación principal para agentes | Oportunidad que deja abierta |
|---|---|---|---|
| Mermaid 12 | Ubicuidad + ELK por defecto | Sin validación geométrica ni operaciones; render con DOM | Linter + operaciones + exportación validada |
| D2 | Calidad y tres motores | Gobernanza en transición; TALA inestable | — |
| Structurizr / LikeC4 | Modelo único → muchas vistas (C4) | Sin validación geométrica; edición vía DSL | Validador + operaciones sobre su modelo |
| Excalidraw / draw.io | Edición humana excelente; MCP oficial | Coordenadas y enlaces a cargo del LLM; coste en tokens | Usarlos como *destino* de exportación, no como formato de trabajo del agente |
| Eraser / IcePanel | Producto pulido | Cerrado, de pago, no local | Alternativa local‑first abierta |
| GitDiagram | Repositorio→diagrama | Regeneración no determinista, Mermaid inválido | Extracción determinista + operaciones |

---

## Parte B · Arquitecturas candidatas (Fase III)

### B.1 Criterios y pesos (perfil base)

| Criterio | Peso | Justificación del peso |
|---|---|---|
| Calidad visual alcanzable | 15 | Requisito de producto, pero ya es *commodity* con ELK (medido), por eso no domina |
| Validación automática / correcciones necesarias | 15 | Causa raíz principal de los ciclos de corrección (Documento 1, §2) |
| Tokens por tarea completa | 12 | Coste recurrente para cada usuario y cada agente |
| Edición incremental y estabilidad | 10 | Síntoma explícito del enunciado (fragilidad ante cambios) |
| Portabilidad entre agentes | 10 | Enunciado: Claude Code, Codex, Gemini CLI, OpenHands… |
| Coste de desarrollo y mantenimiento | 10 | Viabilidad de un equipo pequeño |
| Instalación y dependencias | 8 | Local‑first, sin claves, CI |
| Interoperabilidad / Git | 8 | Evita reinventar formatos; revisiones en PR |
| Comercialización | 6 | Deseable, no prioritario frente a adopción |
| Riesgo técnico | 6 | Probabilidad de no alcanzar la calidad prometida |

### B.2 Puntuaciones (1–5) con evidencia

| Alternativa | Calid. | Valid. | Tokens | Increm. | Portab. | Coste | Instal. | Interop | Comerc. | Riesgo |
|---|---|---|---|---|---|---|---|---|---|---|
| **A** · Skill sobre Mermaid 12 | 4 *(medido ≈ plano)* | 2 *(solo sintaxis; sin geometría)* | 4 *(texto compacto; validar = mirar imagen, 1–5k tokens)* | 2 *(re‑layout global)* | 5 *(Agent Skills + Mermaid universal)* | 5 | 3 *(render con Chromium)* | 4 | 1 | 5 |
| **A'** · Skill + linter geométrico sobre Mermaid | 4 | 4 *(validador probado sobre SVG de Mermaid)* | 4 | 2 | 5 | 4 | 3 | 4 | 3 | 4 |
| **B** · Núcleo semántico + CLI | 4 *(medido: 0 errores)* | 5 *(validador + diagnósticos accionables)* | 5 *(ops 64 tk; diagnósticos ≤164 tk)* | 3 *(modo estable con compromiso)* | 4 *(cualquier agente con shell; requiere instrucciones)* | 4 | 4 *(Node puro)* | 4 | 3 | 4 |
| **C** · Solo servidor MCP | 4 | 5 | 4 *(+720 tk/sesión de definiciones)* | 3 | 3 *(no cubre CI ni scripts)* | 4 | 4 | 4 | 3 | 4 |
| **D** · Motor de layout propio desde cero | 3 *(incierto)* | 5 | 5 | 4 *(podría diseñarse para estabilidad)* | 4 | 1 | 4 | 4 | 4 | 1 |
| **E** · Aplicación visual primero | 4 | 3 | 2 *(interacción vía UI/imágenes)* | 4 | 2 | 2 | 2 | 3 | 4 | 2 |
| **F** · Híbrido (núcleo + CLI + MCP fino + Skill + CI) | 4 | 5 | 5 | 3 | 5 | 3 | 4 | 5 *(exporta a Mermaid/draw.io/Excalidraw)* | 4 | 3 |
| **G1** · Extender LikeC4 (contribuir upstream) | 4 | 4 | 4 | 3 | 4 *(MCP oficial)* | 4 | 4 | 4 | 2 | 3 *(aceptación upstream)* |
| **G2** · draw.io MCP/Skill oficial | 4 *(no medido)* | 2 *(inspección visual)* | 1 *(XML 10–18×)* | 3 *(libavoid)* | 4 | 5 | 3 | 4 | 1 | 4 |

Las puntuaciones son juicios del autor apoyados en las mediciones citadas; donde no hubo medición, se indica. Script reproducible: `node prototype/bench/matrix.ts`.

### B.3 Resultados ponderados (0–100) y sensibilidad

| alternativa | Base (equilibrado) | Prioridad coste/riesgo | Prioridad producto comercial | Prioridad agentes/tokens | Prioridad calidad visual |
|---|---|---|---|---|---|
| A · Skill sobre Mermaid 12 | 70.0 | 81.2 | 61.8 | 70.4 | 70.2 |
| A' · Skill + linter geométrico sobre Mermaid | 75.2 | 78.0 | 71.6 | 76.0 | 75.6 |
| B · CLI semántica (núcleo + CLI) | 82.2 | **83.0** | 78.0 | 84.8 | 81.6 |
| C · Solo servidor MCP | 77.8 | 79.8 | 74.8 | 78.4 | 78.4 |
| D · Motor de layout propio desde cero | 72.8 | 57.6 | 74.4 | 78.0 | 70.8 |
| E · Aplicación visual primero | 57.0 | 50.6 | 62.0 | 55.2 | 62.2 |
| **F · Híbrido** | **83.8** | 78.0 | **82.6** | **86.4** | **82.8** |
| G1 · Extender LikeC4 | 74.4 | 76.0 | 69.2 | 76.0 | 75.0 |
| G2 · draw.io MCP/Skill oficial | 61.6 | 72.8 | 56.6 | 57.6 | 64.8 |

Pesos de los perfiles alternativos en `prototype/bench/matrix.ts`.

**Lectura:**

- **F gana en 4 de 5 perfiles; B gana cuando se priorizan coste y riesgo.** B es exactamente el subconjunto mínimo de F (núcleo + CLI). La decisión es por tanto robusta: **empezar por B y añadir los adaptadores de F (MCP fino, Skill, CI) solo cuando aportan**, lo que coincide con el plan del Documento 7.
- **A (Skill sobre Mermaid 12) es la alternativa "barata" seria**: con prioridad de coste queda a 1,8 puntos de B. Si el experimento A/B con agentes (Documento 6) no muestra menos ciclos de corrección con B/F que con A, **la recomendación debe cambiar a A' (Skill + linter)**.
- **D (motor propio desde cero) no compensa**: la ventaja en estabilidad no justifica el riesgo, y el layout ya es *commodity*.
- **E (editor primero) es la peor opción** para el objetivo de "intervención humana mínima".
- **G1 (extender LikeC4)** es razonable para equipos solo‑C4 y debe revisarse si el proyecto upstream acepta validador y operaciones.

### B.4 ¿Por qué una Skill sola es insuficiente… y cuándo basta?

- **Insuficiente** porque una Skill transmite *conocimiento*, no *cómputo*: no puede medir texto, enrutar ni validar geometría sin ejecutar código; y si empaqueta ese código, ya no es "solo una Skill" sino una CLI distribuida como Skill. Además, la verificación sin herramientas cae en la inspección visual (1–5k tokens por imagen, poco fiable a escala: el caso complejo se vería al 60 % de su tamaño).
- **Basta** si: (1) el equipo ya usa Mermaid 12 renderizado en su plataforma (ELK por defecto); (2) los diagramas son pequeños (≤15 nodos); (3) no hay requisitos de estabilidad ni de sincronización con código; (4) la prioridad es coste cero. En ese caso, la recomendación es la Skill + convenciones (dirección, agrupación, longitud de etiquetas) y, si es posible, el linter.
