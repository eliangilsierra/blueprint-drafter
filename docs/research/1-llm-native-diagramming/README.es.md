# Diagramación de arquitectura nativa para LLMs — investigación y prototipo

Investigación de 13‑10‑2026 sobre cómo eliminar desde su origen los defectos de los diagramas generados por agentes de programación (solapes, textos cortados, flechas ambiguas, iteraciones y tokens desperdiciados), con un prototipo funcional («plano») y un benchmark reproducible.

## Conclusión en cinco líneas

1. La causa raíz no es el prompt: se pide al LLM geometría que no puede medir y no existe un oráculo de calidad ejecutable.
2. El layout automático ya es *commodity*: Mermaid 12 adoptó ELK por defecto (09‑2026) y en nuestras mediciones **iguala la calidad geométrica** del prototipo.
3. Lo que falta en el mercado es el **bucle cerrado**: validación geométrica/semántica con diagnósticos accionables, operaciones atómicas con ids estables, sincronización con código y estabilidad entre versiones.
4. Recomendación: **núcleo determinista local + CLI**, después MCP fino, Skill estándar y CI; reutilizar ELK; exportar a Mermaid/draw.io/Excalidraw; Apache‑2.0.
5. Condición: un experimento A/B con agentes reales debe mostrar ≥ 30 % menos llamadas o ≥ 40 % menos tokens frente a "Mermaid 12 + Skill"; si no, pivotar a "Skill + linter".

## Documentos

| # | Documento | Contenido |
|---|---|---|
| 1 | [Informe de investigación](01-informe-investigacion.md) | Causas raíz, estado del arte (herramientas, agentes, protocolos, algoritmos), evidencia de problemas reales, oportunidades |
| 2 | [Matriz de evaluación](02-matriz-evaluacion.md) | Comparativa de 15 herramientas; matriz ponderada de 9 arquitecturas con análisis de sensibilidad |
| 3 | [Propuesta de producto](03-propuesta-producto.md) | Problema, usuarios, propuesta de valor, diferenciadores, casos de uso, principios, posicionamiento |
| 4 | [Diseño de arquitectura](04-diseno-arquitectura.md) | Diagrama, módulos, flujos, modelo, motores por tipo, validación, render, dirección visual, integración con agentes |
| 5 | [Especificación técnica](05-especificacion-tecnica.md) | Gramática, modelo de datos, versiones/extensiones, ejemplos reales, CLI, MCP, catálogo de diagnósticos |
| 6 | [Benchmark y validación](06-benchmark-validacion.md) | 10 casos, métricas, resultados medidos (incl. Mermaid 12 real), protocolos pendientes, criterios de aceptación |
| 7 | [Plan de implementación](07-plan-implementacion.md) | MVP, exclusiones, repositorio, interfaces, stack, licencias, seguridad, pruebas, hitos, riesgos, roadmap |
| 8 | [Recomendación ejecutiva](08-recomendacion-ejecutiva.md) | Qué construir, por qué, qué falta por demostrar y cuándo revertir la decisión |

## Artefactos

- **Prototipo**: [`prototype/`](prototype/README.md) — núcleo, CLI, servidor MCP, benchmark, pruebas, integraciones (Skill, hooks, CI).
- **Resultados**: [`prototype/bench/results/results.md`](prototype/bench/results/results.md), [`prototype/bench/mermaid/results/scores.md`](prototype/bench/mermaid/results/scores.md), [`matrix.md`](prototype/bench/results/matrix.md), `case9.json`, `mcp-session.json`, `vision-cost.json`.
- **Renders**: [`prototype/out/`](prototype/out) (PNG de cada caso) y [`diagramas/`](diagramas) (arquitectura propuesta, generada con el propio prototipo).

## Reproducir

```bash
cd investigacion-diagramas/prototype
npm install
node bench/run.ts          # calidad, ablaciones, determinismo, estabilidad, tokens
node bench/case9.ts        # sincronización desde un repositorio Git (crea un repo temporal)
node bench/mcp-session.ts  # sesión MCP real con el cliente oficial
node --test test/*.test.ts # 21 pruebas
```

## Limitaciones declaradas

Sin sesiones con modelos reales (no había clave de API): se midieron artefactos y pasos, no tareas completas de un agente. Sin evaluación humana. Exportaciones a draw.io/Excalidraw no abiertas en sus aplicaciones. Detalle en el Documento 1 §9 y el Documento 6 §8.
