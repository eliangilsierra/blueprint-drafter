# Documento 6 · Benchmark y estrategia de validación

Todo lo marcado **medido** se reproduce sin red ni claves con:

```bash
cd investigacion-diagramas/prototype && npm install && node bench/run.ts && node bench/case9.ts && node bench/mcp-session.ts && node bench/vision-cost.ts && node --test test/*.test.ts
```

Entorno de medición: Windows 11, Node v24.15.0, elkjs 0.12.0, 13‑10‑2026. La línea base de Mermaid requiere navegador (`bench/mermaid/`, ver §5.2).

---

## 1. Casos de prueba

| # | Caso | Archivo | Qué estresa |
|---|---|---|---|
| 1 | Flujo de 16 nodos con 4 decisiones y 2 ciclos | `cases/01-flow.plano` | Ramas, ciclos, etiquetas sí/no, rombos |
| 2 | C4 contenedores (mismo contenido que [mermaid#7492](https://github.com/mermaid-js/mermaid/issues/7492)) | `cases/02-c4-container.plano` | Descripciones, límites, relaciones etiquetadas |
| 3 | Componentes con dependencias | `cases/03-components.plano` | Dependencias en un límite + sistemas externos |
| 4 | Arquitectura distribuida (16 nodos, 3 zonas, colas, externos) | `cases/04-distributed.plano` | Zonas, asíncrono, proveedores |
| 5 | Secuencia, 6 participantes, 13 mensajes | `cases/05-sequence.plano` | Motor específico, auto‑mensaje |
| 6 | Nombres y etiquetas largos | `cases/06-long-labels.plano` | Ajuste de línea, etiquetas de 50+ caracteres |
| 7 | Grupos anidados (4 niveles) y relaciones cruzadas | `cases/07-groups.plano` | Jerarquía, aristas entre regiones |
| 8 | Edición incremental sobre el caso 4: añadir servicio, cambiar 2 relaciones, eliminar componente | `cases/08-incremental.ops` | Operaciones, estabilidad |
| 9 | Actualización desde código (repositorio Git real con 2 commits) | `bench/case9.ts` | Extracción determinista, sincronización, curación |
| 10 | Complejo: 40 nodos, 6 grupos, 44 relaciones | `cases/10-complex.plano` | Escalabilidad y legibilidad |

## 2. Métricas: definición, medición y umbral de aceptación

| Métrica | Cómo se mide (automático) | Aceptable (MVP) |
|---|---|---|
| Colisiones entre nodos | Intersección de rectángulos de elementos no emparentados (> 0,5 px) | **0** |
| Textos cortados o ilegibles | Ancho medido de cada línea > caja de contenido; contenido fuera de la forma; elipsis aplicada | **0 desbordes**; elipsis = aviso |
| Conectores que atraviesan nodos ajenos | Liang‑Barsky por tramo contra cada hoja (encogida 1 px) excepto extremos y ancestros | **0** |
| Cruces de conectores | Intersecciones propias entre tramos de aristas distintas | Informativo; ≤ 0,5 por arista |
| Calidad de anclajes | Distancia del extremo al contorno real (≤ 2 px; 4 px en curvas) | **0 fallos** |
| Calidad de etiquetas | Solape con nodos/etiquetas; atravesada por conectores; distancia a su conector; ambigüedad (más cerca de otro conector) | **0 solapes**; ambigüedad = aviso |
| Márgenes y espaciado | Separación mínima entre hojas (≥ 12 px) | Sin `W_NODES_TOO_CLOSE` |
| Legibilidad a escala | Tamaño efectivo del texto más pequeño al encajar en 1600×1000 (≥ 8 px) | Aviso si no; **requiere perfiles doc/slide** |
| Estabilidad incremental | Desplazamiento de nodos comunes tras alinear por la mediana de traslación; nº de nodos movidos > 20 px; τ de Kendall del orden X e Y | Objetivo: ≤ 20 % de nodos movidos y τ ≥ 0,9 **sin** aumentar errores ni > +2 cruces |
| Fidelidad semántica | Todo nodo/arista del modelo aparece en el layout; contención respetada | 100 % (por construcción + `E_OUTSIDE_PARENT`) |
| Tiempo | `performance.now()` de layout+validación+render | < 1 s para ≤ 50 nodos |
| Determinismo | Hash SHA‑256 del SVG en 3 ejecuciones | 1 salida distinta |
| Tokens entrada/salida | `o200k_base` (js‑tiktoken) y tokenizador legado de Anthropic sobre cada artefacto/paso | Ver §4 |
| Llamadas al modelo | Protocolo §6 | **Pendiente** |
| Coste monetario | tokens × precio publicado del modelo usado | **Pendiente** (depende del modelo y del protocolo §6) |
| Calidad percibida | Protocolo §7 | **Pendiente** |

**Condiciones que invalidan una prueba:** fuente distinta entre medición y render; caso modificado entre variantes; motor no determinista sin semilla fija; renderizado de terceros con fuentes no cargadas; extracción de geometría que no encuentra todos los nodos/aristas del modelo (se comprobó: Mermaid 12 extrajo 100 % de nodos y aristas en los 7 casos); en experimentos con agentes, contaminación (el agente ve las respuestas esperadas) o cambio de modelo/temperatura entre brazos.

## 3. Calidad geométrica (medido)

### 3.1 Prototipo y ablaciones (`bench/results/results.md`)

Variantes: **plano** (completo) · **elk-naive** (ELK sin reservar etiquetas, sin recorte al contorno, sin homogeneizar anchos) · **dagre** (motor de Mermaid ≤ 11, con etiquetas reservadas).

| Caso | plano E/W | elk‑naive E/W | dagre E/W | Detalle de los errores de las ablaciones |
|---|---|---|---|---|
| 01 flujo | 0/1 | 10/0 | 0/0 | naive: 8 flechas sin tocar el rombo, 2 etiquetas sobre nodos |
| 02 C4 | 0/0 | 5/4 | 1/0 | naive: 4 etiquetas sobre nodos + 1 etiqueta/etiqueta; dagre: 1 arista atraviesa un nodo |
| 03 componentes | 0/0 | 13/4 | 1/0 | naive: 13 etiquetas sobre nodos |
| 04 distribuida | 0/2 | 12/4 | 5/1 | dagre: 5 aristas atraviesan nodos |
| 05 secuencia | 0/0 | — | — | motor específico |
| 06 etiquetas largas | 0/1 | 10/0 | 1/1 | naive: 10 etiquetas sobre nodos |
| 07 grupos | 0/2 | 7/4 | 3/3 | dagre: 3 aristas atraviesan nodos |
| 10 complejo | 0/2 | 43/15 | 13/13 | naive: 33 etiquetas sobre nodos; dagre: 13 aristas atraviesan nodos y 14 cruces |

Los avisos de plano son `W_ILLEGIBLE_AT_FIT` (casos 1, 6, 10), `W_EDGE_DETOUR` (casos 4, 7, 10) — todos con corrección sugerida. **Conclusión:** las decisiones del motor (etiquetas como obstáculos, recorte al contorno, motor ELK con jerarquía) son las que eliminan los errores; ELK "por defecto" no basta.

### 3.2 Línea base externa: Mermaid 12.2.0 real (`bench/mermaid/results/scores.md`)

Mismos diagramas exportados desde el modelo a Mermaid, renderizados en Chromium (navegador integrado) con `mermaid@12.2.0` desde jsDelivr, geometría extraída del SVG y evaluada con **el mismo validador**. E* excluye "extremos sin contacto" (no comparable: Mermaid acorta el trazo para el marcador).

| Caso | Mermaid 12 (ELK, por defecto) E* · cruces | Mermaid 12 (`layout: dagre`) E* · cruces | plano E · cruces |
|---|---|---|---|
| 01 flujo | 0 · 0 | 0 · 0 | 0 · 0 |
| 02 C4 | 0 · 0 (2 rodeos) | 4 · 2 | 0 · 0 |
| 03 componentes | 1 · 1 (etiqueta/etiqueta) | 1 · 3 | 0 · 1 |
| 04 distribuida | 0 · 2 | 5 · 5 | 0 · 0 (2 rodeos) |
| 06 etiquetas largas | 0 · 0 | 0 · 0 | 0 · 0 |
| 07 grupos | 0 · 2 | 3 · 3 | 0 · 5 |
| 10 complejo | **0 · 0** | 10 · 21 | 0 · 8 |

**Lectura honesta:** con ELK por defecto, Mermaid 12 alcanza la calidad geométrica de plano (y menos cruces en los casos 7 y 10). La ventaja de plano frente a Mermaid **no** es geométrica; es validación, operaciones, estabilidad, sincronización y renderizado sin navegador. Frente a dagre (Mermaid ≤ 11 y muchas instalaciones que fijan `layout: dagre`), la mejora es grande. Revisión visual: en el render de Mermaid 12 del caso 4 se observaron conectores corriendo sobre el borde de un grupo y saltos de línea en cruces (no penalizados por el validador actual).

### 3.3 Determinismo (medido)
8/8 casos: 1 salida distinta en 3 ejecuciones (SVG idéntico byte a byte).

### 3.4 Tiempo (medido, layout + validación + render SVG)
9–250 ms por caso (secuencia 9 ms; complejo 169 ms); la primera ejecución incluye la carga de ELK (~200 ms). Mermaid 12 en navegador: 56–397 ms por caso más el arranque del navegador.

### 3.5 El validador sobre sí mismo (medido, `test/validator.test.ts`)
13 pruebas con geometría sintética que cubren 10 defectos (exhaustividad: cada uno debe detectarse) y 5 situaciones legítimas (precisión: no deben dar error — contención, cruce, entrada al propio grupo, tramo compartido, extremo en el vértice de un rombo). 13/13 superadas. La suite total (21 pruebas) pasa.

## 4. Tokens (medido)

### 4.1 Representación del mismo diagrama (tokens `o200k_base`)

| Caso | plano | Mermaid | JSON compacto | JSON indentado | draw.io XML | Excalidraw JSON | SVG |
|---|---|---|---|---|---|---|---|
| 01 flujo | 253 | 238 | 542 | 1.023 | 4.488 | 17.134 | 3.803 |
| 02 C4 | 348 | 366 | 539 | 909 | 3.506 | 11.627 | 4.266 |
| 04 distribuida | 424 | 450 | 769 | 1.399 | 5.940 | 21.123 | 6.529 |
| 10 complejo | 1.003 | 1.036 | 1.852 | 3.412 | 14.829 | 53.975 | 15.999 |

El tokenizador legado de Anthropic da cifras dentro de ±10 % (tabla completa en `bench/results/results.md`).

### 4.2 Coste por paso de edición (caso 8)

| Paso | Tokens |
|---|---|
| Operaciones escritas por el agente | **64** |
| Respuesta de `apply` (cambios + validación) | 92 |
| Regenerar el archivo plano completo | 423 |
| Regenerar Mermaid completo | 449 |
| Regenerar draw.io XML | 5.926 |
| Regenerar Excalidraw JSON | 20.884 |
| Consulta selectiva `--around trips` | 307 |
| `--ids` | 104 |
| Diff semántico | 135 |

**Advertencia metodológica:** un agente con herramienta de edición parcial (p. ej. reemplazo de texto) puede editar Mermaid con un coste del mismo orden que nuestras operaciones. El ahorro frente a Mermaid **no** está en la edición sino en la **verificación** (§4.3). El ahorro frente a draw.io/Excalidraw sí está en ambos.

### 4.3 Coste de verificar: imagen frente a diagnósticos (`bench/results/vision-cost.json`)

Fórmula oficial de Anthropic (consulta 13‑10‑2026): `⌈ancho/28⌉ × ⌈alto/28⌉` tokens visuales, reescalado a ≤ 2.576 px de lado y ≤ 4.784 tokens en modelos de alta resolución ([docs](https://platform.claude.com/docs/en/build-with-claude/vision)).

| Caso | Inspeccionar PNG 1× | PNG 2× | Diagnósticos de texto |
|---|---|---|---|
| 01 | 1.536 | 4.704 | 45 |
| 02 | 1.080 | 4.230 | 1 (sin problemas) |
| 04 | 2.145 | 4.232 | 108 |
| 07 | 2.000 | 2.576 | 145 |
| 10 | 2.116 (reducido al 60 %: ilegible) | 2.116 | 164 |

Una verificación visual cuesta 10–4.000× más que los diagnósticos y **no escala**: en el caso 10 la imagen se reduce hasta hacer el texto ilegible para el propio modelo.

### 4.4 Sesión MCP completa (medido con el cliente oficial)
Definiciones: 587 tokens (6 herramientas) + 133 de instrucciones. Crear → poblar 19 elementos (1 llamada) → validar → consulta selectiva → editar (4 ops) → op inválida → render → export: **967 tokens** de entrada+salida de herramientas. *No incluye el razonamiento ni el texto del modelo.*

## 5. Estabilidad incremental (medido, caso 8)

| Estrategia | Nodos movidos > 20 px (de 15) | Desplazamiento medio | τ orden X / Y | Errores / avisos / cruces tras el cambio |
|---|---|---|---|---|
| Re‑layout con orden de modelo | 15 | 336 px | 0,72 / −0,15 | 0 / 0 / 0 |
| Re‑layout sin orden de modelo | 6 | 321 px | 0,72 / 0,13 | 0 / 0 / 0 |
| ELK semi‑interactivo (posiciones previas como pista) | 14 | 203 px | 0,78 / 0,17 | 0 / 1 / 0 |
| **Reparación local** (prototipo) | **6** | **136 px** | **1,00 / 1,00** | 0 / 2 / **9** |

Caso 9 (sincronización desde Git): reparación local 0 nodos movidos > 20 px (re‑layout: 5), 3 cruces (re‑layout: 1).

Hallazgos adicionales: ELK rechaza la minimización de cruces totalmente interactiva con jerarquía (`UnsupportedGraphException`); el orden de modelo **no** mejora la estabilidad y hace el layout sensible a reordenar sentencias en algunos casos (02 y 10; tabla de sensibilidad en `results.md`) → la serialización canónica es obligatoria.

**Conclusión:** la estabilidad es el problema técnico abierto más importante. La reparación local conserva el "mapa mental" pero degrada cruces con nuestro enrutador A*; el criterio de aceptación de §2 **no se cumple aún**.

## 6. Protocolo pendiente A: experimento con agentes reales (decide la inversión)

- **Brazos:** (A) Skill de convenciones + Mermaid 12 + render a PNG para autoinspección; (A') A + linter geométrico; (F) Skill + CLI/MCP plano.
- **Modelos:** al menos 3 familias (p. ej. Claude, GPT, Gemini) y 2 tamaños; temperatura fija; 5 repeticiones por tarea.
- **Tareas:** los 10 casos (prompts en lenguaje natural redactados a partir de los `.plano`, sin revelarlos) + 10 ediciones.
- **Registro:** tokens de entrada/salida por llamada (de la API), nº de llamadas hasta "aceptable", tiempo de pared, coste (tokens × precio publicado del modelo en la fecha), errores del validador en el resultado final, fidelidad semántica (diff entre el modelo pedido y el obtenido, puntuado por script).
- **"Aceptable"** = 0 errores del validador y fidelidad ≥ 95 % de nodos/aristas.
- **Análisis:** medianas e IC bootstrap al 95 %; prueba de Wilcoxon pareada por tarea.
- **Criterios de decisión (pre‑registrados):**
  - Continuar con F si reduce la **mediana de llamadas** hasta aceptable ≥ 30 % **o** los tokens totales ≥ 40 % frente a A, sin peor fidelidad.
  - Si F no supera a A' en ninguno de los dos → **pivotar a A'** (Skill + linter para Mermaid/D2) y abandonar el formato propio.

## 7. Protocolo pendiente B: evaluación humana

- 12 evaluadores (6 desarrolladores, 6 arquitectos), comparación por pares ciega entre plano, Mermaid 12 (ELK), Mermaid (dagre) y draw.io (ELK+libavoid) para los casos 1–7.
- Escalas: claridad, estética profesional, facilidad para responder 3 preguntas de comprensión por diagrama (tiempo y acierto).
- Uso adicional: **calibrar los umbrales heurísticos** del validador (`W_EDGE_DETOUR`, `W_ILLEGIBLE_AT_FIT`, `I_EDGE_HUGS_NODE`) correlacionándolos con las valoraciones.

## 8. Resumen de criterios de aceptación del MVP

| Criterio | Estado |
|---|---|
| 0 errores geométricos en los casos 1–7 y 10 | **Cumplido (medido)** |
| Determinismo total | **Cumplido** |
| < 1 s por diagrama ≤ 50 nodos | **Cumplido** (≤ 250 ms) |
| Operación inválida → rechazo atómico con sugerencia | **Cumplido** |
| Edición incremental ≤ 100 tokens de operaciones en el caso 8 | **Cumplido** (64) |
| Estabilidad: ≤ 20 % nodos movidos, τ ≥ 0,9, ≤ +2 cruces | **No cumplido** (reparación: 40 %, τ = 1,0, +9 cruces) |
| Exportaciones abren correctamente en draw.io/Excalidraw | **Pendiente** |
| Experimento con agentes (§6) supera criterio de continuación | **Pendiente** |
| Evaluación humana ≥ Mermaid 12 en claridad | **Pendiente** |
