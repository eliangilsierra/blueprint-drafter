# Documento 8 · Recomendación ejecutiva

## Qué construir

**Un núcleo determinista y local (librería TypeScript) que convierte intención semántica en diagramas validados, expuesto primero como CLI, y después mediante un servidor MCP fino, una Skill estándar y una acción de CI.** Nombre de trabajo: *plano*. Licencia Apache‑2.0.

Concretamente:

1. **Reutilizar ELK** para el layout de grafos (no construir un motor propio) y un motor específico para secuencia.
2. **Invertir en lo que nadie cierra**: validador geométrico+semántico con diagnósticos accionables, operaciones atómicas con ids estables, sincronización con código que preserva la curación humana, y una política explícita de estabilidad.
3. **Interoperar en vez de reemplazar**: exportar a Mermaid, draw.io y Excalidraw con geometría ya validada.
4. **No construir** un editor de pizarra, un motor de layout desde cero ni un servicio en la nube.

## Por qué es superior a las alternativas (con evidencia)

| Frente a… | Ventaja demostrada | Evidencia |
|---|---|---|
| **Excalidraw / draw.io con LLM** | El agente no escribe coordenadas ni enlaces: 0 solapes, 0 flechas sin contacto; representación 10–68× menor; edición de 64 tokens frente a 5.926–20.884 | Medido (Documento 6 §3–4); problemas documentados en [excalidraw-mcp#33](https://github.com/excalidraw/excalidraw-mcp/issues/33) y [drawio-mcp#56](https://github.com/jgraph/drawio-mcp/pull/56) |
| **Mermaid ≤ 11 / `layout: dagre`** | Elimina aristas que atraviesan nodos (hasta 10–13 en el caso complejo) y reduce cruces | Medido con el mismo validador |
| **Mermaid 12 (ELK por defecto)** | **No en geometría** (empate medido). Sí en: validación automática en texto (1–164 tokens frente a 1.000–4.800 por inspeccionar una imagen), rechazo atómico con sugerencias, diff semántico, sincronización con código, render sin navegador | Medido; la eficacia para reducir iteraciones de un agente **no está medida** |
| **Una Skill sola** | Una Skill no puede medir texto, enrutar ni validar; termina en inspección visual | Documento 2 §B.4 |
| **Motor propio desde cero** | Mismo valor con mucho menos riesgo | Matriz ponderada: 72,8 frente a 83,8 |

Matriz ponderada (Documento 2): **el híbrido gana en 4 de 5 perfiles de prioridades (83,8 en el perfil base)**; su subconjunto mínimo (núcleo + CLI) gana cuando se priorizan coste y riesgo. Por eso el plan empieza por ese subconjunto.

## Lo que la evidencia NO confirma todavía

1. **Que los agentes necesiten menos iteraciones y menos tokens por tarea completa** que con "Mermaid 12 + Skill". Medimos el coste de cada paso, no sesiones reales con modelos. → Experimento A/B pre‑registrado (Documento 6 §6).
2. **Que la edición sea estable sin degradar la calidad.** La reparación local conserva el orden (τ = 1,0) pero añadió 9 cruces en el caso 8; el re‑layout no añade cruces pero mueve todos los nodos. → Enrutador de mayor calidad (libavoid o propio) y política dual.
3. **Que los humanos prefieran la estética** frente a Mermaid 12 o draw.io. → Evaluación ciega (Documento 6 §7).
4. **Que las exportaciones abran sin pérdidas** en draw.io y Excalidraw. → Pruebas de ida y vuelta.
5. **Calibración** de los umbrales heurísticos (rodeos, legibilidad) y perfiles de destino.

## Si una solución existente basta

Sí, para un subconjunto de usuarios: **si tus diagramas son pequeños, ya usas Mermaid 12 y no necesitas estabilidad ni sincronización con código, una Skill con convenciones sobre Mermaid 12 es suficiente** (es la alternativa A, 81,2 puntos con prioridad de coste). La mejora mínima con más valor sobre esa base sería añadir el validador de este trabajo como *linter* del SVG (alternativa A').

## Decisión y condición de reversión

- **Ahora (2–3 semanas):** endurecer el prototipo (M0) y ejecutar el experimento con agentes (M1).
- **Continuar con el híbrido** si reduce ≥ 30 % la mediana de llamadas hasta un resultado aceptable **o** ≥ 40 % los tokens totales frente a "Mermaid 12 + Skill", sin peor fidelidad.
- **Si no:** pivotar a "Skill + linter para Mermaid/D2" (A'), reutilizando el validador y el contrato de diagnósticos ya construidos — nada del trabajo se pierde.

## Siguientes pasos inmediatos

1. Congelar el contrato v1 (gramática, operaciones, catálogo de diagnósticos) y publicar el validador como paquete independiente.
2. Implementar perfiles de destino del validador y aplicar `rank same` / `order`.
3. Construir el arnés A/B con 3 familias de modelos y presupuestar su coste con los precios vigentes.
4. Probar la Skill, el MCP y los hooks dentro de Claude Code, Codex, Gemini CLI y OpenHands.
5. Evaluar libavoid (técnica y legalmente) para el modo estable.
