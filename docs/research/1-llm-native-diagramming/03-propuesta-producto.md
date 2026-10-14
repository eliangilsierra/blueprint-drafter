# Documento 3 · Propuesta de producto

**Nombre provisional: «plano»** — *compilador y validador de diagramas de arquitectura para agentes de programación.* (Nombre de trabajo; verificar disponibilidad de marca y paquete antes de publicar.)

---

## 1. Problema

Los agentes de programación ya escriben y modifican código con fiabilidad porque tienen **compiladores, tests y linters** que les dicen, en texto, qué está mal y dónde. Los diagramas no tienen nada equivalente: el agente produce coordenadas o texto, alguien mira la imagen y pide correcciones. Ese bucle humano es la causa de los solapes, textos cortados, flechas flotantes, iteraciones y tokens desperdiciados (Documento 1, §2).

## 2. Usuarios

| Segmento | Situación | Qué necesita |
|---|---|---|
| **Desarrollador con agente** (Claude Code, Codex, Gemini CLI, OpenHands…) | Pide "documenta la arquitectura" o "añade el servicio X al diagrama" | Un resultado correcto a la primera, en el repositorio, revisable en un PR |
| **Arquitecto / tech lead** | Mantiene vistas C4 que se desactualizan | Sincronización con el código que no pise su curación; diffs semánticos |
| **Equipo de plataforma** | Quiere diagramas como parte de la CI | Un `check` que falle el PR si el diagrama es ilegible o inconsistente |
| **Autor de herramientas/agentes** | Integra diagramas en su producto | Una librería determinista, sin red ni claves, con API estable |

Fuera de foco inicial: diseñadores que dibujan a mano libre, pizarras colaborativas en tiempo real, infografías.

## 3. Propuesta de valor

> **El agente describe la intención; plano garantiza la geometría y lo demuestra.**

1. **Correcto por construcción**: el agente nunca envía coordenadas; tamaños desde métricas reales de la fuente; layout ELK con etiquetas como obstáculos; flechas recortadas al contorno real. Medido: 0 errores geométricos en 8/8 casos.
2. **Verificable por máquina**: `plano check` devuelve diagnósticos de una línea con la corrección sugerida (1–164 tokens en nuestros casos frente a 972–4.784 tokens por mirar una imagen).
3. **Barato de editar**: operaciones `+ ~ -` atómicas con ids estables (64 tokens para la edición del caso 8 frente a 423 regenerando el archivo y ~20.900 en Excalidraw JSON).
4. **Seguro ante cambios**: rechazo atómico con "¿quisiste decir…?", diffs semánticos, modo estable con *layout lockfile*.
5. **Sin encierro**: exporta a SVG/PNG, Mermaid, draw.io y Excalidraw (con flechas realmente enlazadas); el validador también funciona sobre la salida de otras herramientas.
6. **Local‑first y gratuito para lo básico**: Node, sin navegador, sin red, sin claves.

## 4. Diferenciadores (y lo que no lo es)

| Diferenciador | ¿Defendible? | Evidencia |
|---|---|---|
| Validador geométrico + semántico con diagnósticos accionables | **Sí** (nadie lo ofrece; ejecutable en CI) | Documento 6; funciona sobre Mermaid 12 |
| Contrato de operaciones idéntico en CLI y MCP | **Sí, a medio plazo** (copiable, pero requiere diseño cuidadoso) | Sesión MCP real: 967 tokens para crear, validar, consultar, editar, rechazar, renderizar y exportar |
| Sincronización con código por operaciones | **Sí** | Caso 9: curación preservada |
| Exportación validada a draw.io/Excalidraw | Medio (útil para adopción) | Implementado; apertura en apps pendiente |
| Calidad del layout | **No** (ELK es *commodity*; Mermaid 12 empata) | Medido |
| Sintaxis compacta | **No** (empata con Mermaid) | 424 vs 450 tokens (caso 4) |
| Estética por roles semánticos | Medio (subjetivo) | Pendiente de evaluación humana |

## 5. Casos de uso prioritarios

1. **"Documenta la arquitectura de este repositorio"** → el agente extrae módulos y dependencias, crea vistas C4 de contexto y contenedores, `check` sin errores, abre PR con `.plano` + SVG.
2. **"Añade el servicio de fraude y quita notificaciones"** → 3–6 operaciones, validación, diff semántico en el PR.
3. **"Mantén el diagrama al día"** → en CI, extracción determinista + `syncOps` propone operaciones; el humano aprueba.
4. **"Este diagrama Mermaid se ve mal"** → `plano lint` sobre el SVG renderizado lista solapes y etiquetas ambiguas (extensión del validador; ver roadmap).
5. **"Lo necesito en draw.io para la reunión"** → exportación con geometría validada.

## 6. Principios de diseño

1. **Intención, no geometría.** El agente nunca escribe coordenadas, colores ni tamaños.
2. **Determinismo.** Misma entrada → mismos bytes (verificado: 1 salida distinta en 3 ejecuciones × 8 casos).
3. **Errores como API.** Cada problema tiene código, ids afectados y corrección sugerida; los lotes inválidos no escriben nada.
4. **Leer poco, escribir poco.** Consultas selectivas (`--around`, `--ids`), respuestas resumidas en lotes grandes.
5. **La verdad es el modelo semántico**; la geometría es derivada (y opcionalmente fijada en un *lockfile*).
6. **Sin dependencias innecesarias**: nada de bases de datos, servicios ni claves para lo básico.
7. **Adaptadores finos**: CLI, MCP y Skill no contienen lógica de dominio.
8. **Interoperar antes que reemplazar**: exportar a lo que el equipo ya usa.

## 7. Posicionamiento

- **Frente a Mermaid/D2/PlantUML**: no compite en sintaxis ni en layout; aporta la capa que falta para agentes (validación, operaciones, estabilidad, sincronización) y exporta a Mermaid.
- **Frente a Excalidraw/draw.io + MCP**: los convierte en *destinos* de presentación y edición humana fina, no en el formato de trabajo del agente.
- **Frente a Structurizr/LikeC4**: comparte la filosofía "un modelo, varias vistas"; añade validación geométrica y contrato de edición para agentes. Posible colaboración (importador/exportador o contribución upstream).
- **Frente a SaaS (Eraser, IcePanel)**: local‑first, abierto, en el repositorio, sin claves.

**Frase de posicionamiento:** *"plano es a los diagramas lo que un compilador con linter es al código: el agente escribe intención, plano devuelve un diagrama correcto o una lista exacta de lo que corregir."*

## 8. Modelo de negocio (hipótesis, no validada)

- **Núcleo, CLI, MCP y Skill**: Apache‑2.0, gratis.
- **De pago (opcional, posterior)**: visor/revisor web para equipos (comentarios, aprobación de cambios sugeridos por agentes), catálogos de iconos/temas corporativos, integraciones gestionadas (Confluence, Backstage), soporte. Nunca bloquear la validación ni la CLI tras un muro de pago.
- Riesgo: el valor central es copiable por herramientas existentes (Mermaid podría añadir un validador). Mitigación: velocidad, contrato estable, comunidad y la sincronización con código.
