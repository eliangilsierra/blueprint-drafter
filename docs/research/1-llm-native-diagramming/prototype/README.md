# plano — prototipo experimental

Motor de diagramas semántico para agentes: el agente describe la intención; plano mide el texto, hace el layout (ELK), enruta, valida y renderiza. **Prototipo de investigación, no producto.**

Requisitos: Node ≥ 22.18 (ejecuta TypeScript directamente; probado con 24.15). Sin navegador, sin red, sin claves.

```bash
npm install
node src/cli.ts new demo.plano --type c4-container --title "Demo" --dir TB
node src/cli.ts apply demo.plano '+node user person "User"' '+node api service "API" tech=Go' '+edge user>api "Uses" tech=HTTPS'
node src/cli.ts check demo.plano
node src/cli.ts render demo.plano -o demo.svg          # o .png, --theme dark
node src/cli.ts export demo.plano --to drawio -o demo.drawio
```

## Estructura

| Ruta | Contenido |
|---|---|
| `src/model.ts` | Modelo, gramática `.plano`, serialización canónica, reglas semánticas |
| `src/ops.ts` | Operaciones `+ ~ -` atómicas |
| `src/query.ts` | Consultas selectivas, diff semántico, métricas de estabilidad, `syncOps` |
| `src/fonts.ts` | Medición tipográfica real (fontkit + IBM Plex Sans) |
| `src/theme.ts` | Roles semánticos, temas, densidad, contraste |
| `src/layout.ts` | Dimensionado + ELK Layered + recorte al contorno de la forma (+ baseline dagre) |
| `src/layout-seq.ts` | Motor de secuencia |
| `src/stable.ts` | Edición estable experimental (reparación local + enrutador A*) |
| `src/validate.ts` | Validador geométrico y de legibilidad |
| `src/render.ts`, `src/export.ts` | SVG, PNG, Mermaid, Excalidraw, draw.io |
| `src/cli.ts`, `src/mcp.ts` | Adaptadores CLI y MCP (stdio) |
| `bench/` | Casos, benchmark, línea base Mermaid (navegador), caso 9, sesión MCP, matriz |
| `test/` | 21 pruebas (`node --test test/*.test.ts`) |
| `integrations/` | Skill, hooks (Claude Code, Codex, Gemini CLI), OpenHands, GitHub Actions |

## Línea base Mermaid 12 (requiere navegador)

`node bench/mermaid/gen.ts` genera las entradas; `node bench/mermaid/server.ts` sirve el arnés en `http://localhost:8765/` (y `/?layout=dagre`), que renderiza con `mermaid@12.2.0` desde jsDelivr y envía la geometría a `bench/mermaid/results/`; `node bench/mermaid/score.ts` la evalúa con el validador.

## Limitaciones conocidas

- `rank same` y `order` se parsean pero no se aplican al layout.
- El modo estable aumenta cruces (enrutador A* sencillo).
- Umbrales heurísticos sin calibrar; la regla de legibilidad usa un único lienzo de referencia (1600×1000).
- Sin límites de tamaño de entrada (no usar con archivos no confiables enormes).
- Exportaciones a draw.io/Excalidraw no verificadas en sus aplicaciones.

Licencia propuesta: Apache‑2.0. Dependencias: elkjs (EPL‑2.0 OR GPL‑3.0+), fontkit (MIT), @resvg/resvg-js (MPL‑2.0), IBM Plex Sans (OFL‑1.1), MCP SDK y zod (MIT).
