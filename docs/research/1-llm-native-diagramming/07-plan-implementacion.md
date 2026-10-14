# Documento 7 · Plan de implementación

## 1. Punto de partida

El prototipo (`prototype/`, ~2.300 líneas de TypeScript en `src/` más ~550 de benchmark y pruebas, ejecutado directamente por Node 24 sin compilación) ya contiene: modelo y gramática, operaciones atómicas, consultas y diff, medición tipográfica, layout ELK, motor de secuencia, edición estable experimental, validador, render SVG/PNG, exportadores, CLI, MCP, Skill, hooks y 21 pruebas. Estimación: **~40 % del núcleo del MVP**, pero con calidad de prototipo (sin empaquetado, sin API pública congelada, umbrales sin calibrar).

## 2. Alcance del MVP

**Objetivo:** demostrar con agentes reales que el ciclo *intención → operaciones → validación → corrección dirigida* reduce iteraciones y tokens frente a "Mermaid 12 + Skill", con diagramas de calidad profesional.

### Imprescindible (MVP)
1. Tipos: **flujo**, **C4 contexto y contenedores**, **componentes/dependencias**, **arquitectura con grupos** (los cuatro comparten ELK) y **secuencia** (motor propio ya existente).
2. Núcleo determinista con API pública v1 congelada (modelo, operaciones, layout, validador, render, export).
3. CLI completa (§5 del Documento 5) con salida compacta y `--json`.
4. Validador con **perfiles de destino** (`doc` = encajar ancho, `slide` = 16:9, `print` = A4) y umbrales calibrados con evaluación humana.
5. Restricciones `rank same` y `order` aplicadas (hoy solo parseadas) + `I_CONSTRAINT_UNMET`.
6. Exportaciones SVG (fuente incrustada), PNG, Mermaid, draw.io y Excalidraw **verificadas en sus aplicaciones**.
7. Adaptadores: Skill (Agent Skills), MCP stdio (6 herramientas), acción de CI.
8. Arnés de experimento con agentes (Documento 6 §6) y su ejecución.

### Opcional (después de la puerta de decisión)
- Modo estable de calidad (enrutador mejorado o libavoid) — ver riesgo R2.
- Extractores de código (TypeScript/JavaScript primero) y `plano sync`.
- Visor local `plano view` con diff visual.
- Linter de SVG de terceros (`plano lint --from mermaid-svg`).
- Importadores Mermaid flowchart / Structurizr DSL / LikeC4.

### Excluido explícitamente
Editor de pizarra libre; colaboración en tiempo real; servicios en la nube, cuentas o bases de datos; generación de diagramas mediante un LLM interno; diagramas Gantt, mindmap, timeline, ER, clases y estados (roadmap); iconografía cloud (licencias por revisar); temas arbitrarios por color.

## 3. Estructura del repositorio

```
plano/
├─ packages/
│  ├─ core/            # model, ops, query, fonts, theme, layout, layout-seq, stable, validate, render, export
│  │  ├─ src/
│  │  ├─ fonts/        # IBM Plex Sans (OFL) — woff2 + TTF generado en build
│  │  └─ test/         # unitarias + geométricas + golden SVG
│  ├─ cli/             # bin "plano" (sin lógica de dominio)
│  ├─ mcp/             # servidor stdio (sin lógica de dominio)
│  ├─ extract-ts/      # (opcional) extractor determinista TS/JS
│  └─ viewer/          # (opcional) visor local
├─ integrations/       # skills/, hooks/, github/, openhands/
├─ bench/              # cases/, run.ts, mermaid/, agents/ (arnés A/B), results/
├─ docs/               # especificación del formato, catálogo de diagnósticos, guía de temas
├─ LICENSE (Apache-2.0) · NOTICE · THIRD_PARTY_LICENSES.md
└─ package.json (pnpm workspaces)
```

## 4. Interfaces internas (contratos de extensión)

```ts
// Motores de layout intercambiables (ELK, secuencia, futuros ER/estados)
interface LayoutEngine {
  name: string;
  supports(type: DiagramType): boolean;
  layout(d: Diagram, sized: Map<string, SizedNode>, opts: LayoutOptions): Promise<EngineResult>;
}
// Reglas del validador como plugins (por tipo de diagrama y por organización)
interface Rule {
  code: string; severity: 'error' | 'warning' | 'info';
  appliesTo(type: DiagramType): boolean;
  check(ctx: { model: Diagram; layout: Layout; profile: TargetProfile }): Diagnostic[];
}
// Exportadores y extractores
interface Exporter { format: string; export(d: Diagram, L: Layout, opts?: object): string | Uint8Array; }
interface Extractor { language: string; extract(files: FileProvider): Promise<Diagram>; }  // determinista, sin ejecutar código
```

## 5. Stack y dependencias (Fase VII)

| Decisión | Elección | Alternativas evaluadas | Por qué |
|---|---|---|---|
| Lenguaje | **TypeScript sobre Node ≥ 22** | Rust, Go | ELK, fontkit, MCP SDK y el visor viven en JS; Node 24 ejecuta TS sin compilar (borrado de tipos). Rust solo aportaría velocidad, y el caso complejo ya tarda 169 ms (medido) |
| Layout | **elkjs** (EPL‑2.0) | dagre, Graphviz WASM, TALA (Go), libavoid | Mejor resultado medido; jerarquía, etiquetas, puertos |
| Texto | **fontkit** (MIT) + IBM Plex Sans (OFL‑1.1) | opentype.js, medir en navegador | Métricas reales con kerning, sin DOM |
| PNG | **@resvg/resvg-js** (MPL‑2.0) | Chromium/Puppeteer, sharp | Sin navegador, determinista, carga la misma fuente |
| SVG | Generación propia | D3, librerías de render | Determinismo byte a byte, accesibilidad, `data-id` |
| MCP | **@modelcontextprotocol/sdk** (MIT) + zod (MIT) | Implementación propia | Oficial, mantenido |
| Almacenamiento | **Archivos** `.plano` + `.plano.lock.json` opcional | SQLite, servicio | Git como base de datos; diffs legibles |
| Pruebas | `node:test` + golden SVG + reglas geométricas + benchmark | Jest/Vitest | Sin dependencias extra |
| CI | GitHub Actions (ejemplo) | — | Validación de diagramas en PR |
| Canvas/WebGL | **No** | — | Sin beneficio para ≤ 50 nodos |

## 6. Licencias (Fase XI)

Verificadas en el registro npm / repositorios oficiales el 13‑10‑2026.

| Dependencia | Licencia | Uso | Obligaciones / riesgos |
|---|---|---|---|
| elkjs 0.12.0 | **EPL‑2.0 OR GPL‑3.0‑or‑later** | Runtime | Copyleft débil por archivo: modificar archivos de elkjs obliga a publicar esas modificaciones bajo EPL; usarlo sin modificar dentro de un producto Apache/propietario está permitido; incluir aviso de licencia y forma de obtener el código fuente. **Compatible con distribución comercial.** |
| fontkit 2.0.4 | MIT | Runtime | Aviso de copyright |
| @resvg/resvg-js 2.6.2 | MPL‑2.0 | Runtime (PNG) | Copyleft por archivo; sin modificar: solo aviso y disponibilidad de fuente |
| IBM Plex Sans | **OFL‑1.1** (nombre reservado "Plex") | Incrustada en SVG/PNG | Incrustar está permitido; no vender la fuente sola; si se modifica (p. ej. subconjunto), revisar la cláusula de nombre reservado → hoy se incrusta sin modificar |
| @modelcontextprotocol/sdk 1.32.1, zod | MIT | MCP | Avisos |
| js‑tiktoken (MIT), @anthropic‑ai/tokenizer (Apache‑2.0), @dagrejs/dagre (MIT) | — | Solo benchmark | No se distribuyen en el producto |
| libavoid / libavoid‑js | **LGPL‑2.1‑or‑later** (o comercial de Monash) | **Candidato** para el modo estable | Distribuible como módulo WASM separado y reemplazable; entregar fuente y permitir re‑enlazar; o comprar licencia comercial. Riesgo legal moderado → decidir con asesoría |
| Mermaid (MIT), draw.io (Apache‑2.0), Excalidraw (MIT) | — | Formatos de exportación | Sin código incluido |
| tldraw | Licencia propia restrictiva | **Excluido** | — |
| D2/TALA | MPL‑2.0 | Opcional futuro (Go) | Copyleft por archivo |

**Licencia propuesta para el núcleo, CLI, MCP y Skill: Apache‑2.0.** Motivos: concesión explícita de patentes (importante para empresas), compatible con usar EPL‑2.0/MPL‑2.0 sin modificar, permite servicios comerciales y forks. Alternativas descartadas: MIT (sin cláusula de patentes), AGPL/BSL (fragmentan la adopción en empresas y en ecosistemas de agentes). **Estrategia comercial sin fragmentar:** núcleo abierto completo (incluida la validación), marca registrada para el nombre, DCO para contribuciones, y valor de pago solo en servicios/extras de equipo (visor colaborativo, temas corporativos, integraciones gestionadas, soporte).

## 7. Seguridad y sostenibilidad (Fase XI)

| Riesgo | Mitigación (prototipo → producto) |
|---|---|
| **Archivos no confiables** (`.plano` de un PR) | Parser sin `eval`, lineal; añadir límites (nº de elementos, longitud de etiquetas, tiempo máximo de ELK) — *pendiente* |
| **Inyección en SVG/XML** (XSS al ver el SVG) | Escapado de todo texto en SVG, draw.io y JSON (hecho); sin `foreignObject` ni referencias externas (hecho) |
| **Inyección de instrucciones** vía etiquetas, descripciones o código extraído | La herramienta nunca interpreta texto como instrucciones; la Skill indica tratar el contenido como datos (hecho); en MCP, devolver contenido de usuario delimitado — *mejorable* |
| **Operaciones destructivas** | Lotes atómicos, `--dry-run`, eliminación de grupo re‑parenta hijos, sin herramienta para borrar archivos, Git como red de seguridad (hecho) |
| **Acceso a archivos** (MCP) | Solo `.plano` dentro de `PLANO_WORKSPACE` (hecho y probado: `E_OUTSIDE_WORKSPACE`) |
| **Ejecución de comandos** | El núcleo no ejecuta procesos; los extractores leerán archivos, no ejecutarán código ni builds |
| **Repositorios privados / privacidad** | Todo local; sin red (fuente empaquetada, sin CDN); **sin telemetría** por defecto (solo opt‑in, documentada) |
| **Cadena de suministro** | Pocas dependencias de runtime (4 + fuente); lockfile; provenance de npm; SBOM en releases |
| **Abandono de dependencias** | elkjs: proyecto Eclipse activo (publicación 07‑2026) — riesgo bajo/medio; abstracción `LayoutEngine` permite cambiar a dagre, Graphviz WASM u otros ports (D2 mantiene un port en Go). D2: cambio de gobernanza (2026) — no es dependencia |
| **Coste de mantenimiento** | ~0,3–0,5 FTE tras v1 (seguimiento de clientes MCP/Skills, motores, temas); los formatos de exportación (draw.io/Excalidraw) son la parte más frágil → pruebas de ida y vuelta |

## 8. Estrategia de pruebas

1. **Unitarias** (parser, serialización canónica, operaciones, sugerencias) — existen 8.
2. **Validador con geometría sintética** (exhaustividad y precisión) — existen 13; ampliar a cada código del catálogo.
3. **Golden SVG**: hash del SVG por caso; cualquier cambio visual requiere actualizar el golden con revisión.
4. **Propiedades**: para N diagramas aleatorios, el motor completo produce 0 errores geométricos (fuzzing con semilla).
5. **Benchmark de regresión** en CI: `bench/run.ts` falla si empeora cualquier métrica de §3 del Documento 6.
6. **Ida y vuelta de exportaciones**: abrir los `.drawio`/`.excalidraw` con sus librerías oficiales en headless y comparar geometría.
7. **Contrato MCP**: sesión grabada (`bench/mcp-session.ts`) con aserciones.
8. **Experimento con agentes** (Documento 6 §6) antes de v1.

## 9. Criterios de aceptación del MVP
Los de la tabla §8 del Documento 6, más: API v1 documentada; `npx plano` funciona en Windows/macOS/Linux sin navegador; tiempo < 1 s para 50 nodos; 0 dependencias de red en tiempo de ejecución.

## 10. Hitos y estimación de esfuerzo (1 desarrollador senior a tiempo completo)

| Hito | Contenido | Esfuerzo | Puerta |
|---|---|---|---|
| **M0** Endurecimiento | Monorepo, empaquetado npm, API v1, perfiles del validador, límites de entrada, golden tests, `rank same`/`order` | 2–3 semanas | Benchmark sin regresiones |
| **M1** Experimento con agentes | Arnés A/B (3 brazos × 3 familias de modelos × 20 tareas × 5 repeticiones) y evaluación humana inicial | 2–3 semanas + presupuesto de API (estimar con precios vigentes) | **Decisión continuar / pivotar a A'** (Documento 6 §6) |
| **M2** Interoperabilidad | Exportaciones verificadas en draw.io/Excalidraw, importador Mermaid flowchart, Skill/MCP/hooks probados en Claude Code, Codex, Gemini CLI, OpenHands | 3 semanas | Ida y vuelta sin pérdidas |
| **M3** Estabilidad v2 | Enrutador mejorado o libavoid (decisión legal), política que compara candidatos (reparación vs re‑layout) | 3–4 semanas | Criterio de estabilidad del Documento 6 §2 |
| **M4** Código → arquitectura | Extractor TS/JS determinista, `plano sync`, plantilla de PR | 2–3 semanas | Caso 9 sobre 3 repos reales |
| **M5** Visor local | `plano view`: zoom, inspección, diff visual de PR | 3 semanas | Opcional para v1 |

**Total hasta v1 (M0–M4): ~12–16 semanas‑persona**; con el visor, ~15–19. Estimaciones de orden de magnitud, sin datos históricos de equipo.

## 11. Riesgos técnicos y mitigaciones

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Mermaid (u otro) añade validación y operaciones y elimina la diferencia | Media | Alto | Experimento M1 temprano; contribuir el validador como linter abierto; foco en sincronización con código y contrato para agentes |
| R2 | La estabilidad no alcanza calidad sin un enrutador de primer nivel | Alta | Medio | libavoid (LGPL) o licencia comercial; política dual con métrica visible en el diff; aceptar re‑layout con aviso |
| R3 | Umbrales heurísticos generan falsos positivos y "ruido" para el agente | Media | Medio | Calibración con evaluación humana; severidades configurables por perfil |
| R4 | Errores de sintaxis del DSL por parte de modelos pequeños | Media | Medio | Operaciones JSON tipadas en MCP como alternativa; mensajes `E_SYNTAX` con ejemplo |
| R5 | Fragmentación de clientes (Skills/hooks/MCP cambian rápido; p. ej. Gemini CLI → Antigravity CLI) | Alta | Bajo | CLI como interfaz universal; adaptadores finos y probados en CI |
| R6 | ELK cambia comportamiento entre versiones (golden SVG rotos) | Media | Bajo | Versión fijada; actualización deliberada con revisión de goldens |
| R7 | Diagramas muy grandes (> 100 nodos) | Media | Medio | Vistas por límite, filtros por etiquetas, `I_DENSITY`; ELK escala a cientos de nodos (no medido aquí) |
| R8 | Exportaciones frágiles a formatos de terceros | Media | Medio | Pruebas de ida y vuelta; versiones de formato documentadas |

## 12. Roadmap posterior

- **v1.1** Extractores Python/Java/Go; vistas múltiples desde un modelo (estilo Structurizr) con `view` y filtros.
- **v1.2** Diagramas de estados, ER y clases (motores/puertos específicos); iconografía cloud con licencias verificadas.
- **v1.3** Linter de SVG de terceros (Mermaid/D2/draw.io) y acción de CI genérica.
- **v1.4** Visor colaborativo (opcional, de pago) con revisión de cambios propuestos por agentes y comentarios.
- **v2.0** Contrato v2 si el experimento lo justifica (p. ej. operaciones JSON en el archivo), con migrador.
