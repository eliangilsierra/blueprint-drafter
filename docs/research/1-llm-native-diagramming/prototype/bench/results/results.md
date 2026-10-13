# Resultados del benchmark (generado por bench/run.ts)

Fecha: 2026-10-13T16:21:00.963Z · Node v24.15.0 · Tokenizadores: o200k_base (js-tiktoken) y tokenizador legado de Anthropic (@anthropic-ai/tokenizer, aproximación; los modelos Claude actuales no publican su tokenizador).

## Calidad geométrica por caso y variante

| caso | variante | E | W | solapes nodo | texto desbordado | arista atraviesa nodo | arista atraviesa grupo | cruces | aristas superpuestas | etiqueta/nodo | etiqueta/etiqueta | arista sobre etiqueta | etiqueta ambigua | extremos sin contacto | rodeos | ancho×alto | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01-flow | plano | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 891×1336 | 334 |
| 01-flow | elk-naive | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 8 | 0 | 807×1226 | 67 |
| 01-flow | dagre | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 835×1298 | 20 |
| 02-c4-container | plano | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 655×1254 | 135 |
| 02-c4-container | elk-naive | 5 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 1 | 4 | 0 | 0 | 0 | 609×932 | 44 |
| 02-c4-container | dagre | 1 | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1150×1004 | 14 |
| 03-components | plano | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1502×494 | 78 |
| 03-components | elk-naive | 13 | 4 | 0 | 0 | 0 | 0 | 1 | 0 | 13 | 0 | 3 | 1 | 0 | 0 | 937×523 | 35 |
| 03-components | dagre | 1 | 0 | 0 | 0 | 1 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1207×739 | 10 |
| 04-distributed | plano | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 1807×902 | 114 |
| 04-distributed | elk-naive | 12 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 1 | 2 | 0 | 4 | 2 | 1180×902 | 88 |
| 04-distributed | dagre | 5 | 1 | 0 | 0 | 5 | 0 | 5 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1949×820 | 15 |
| 05-sequence | plano | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1051×812 | 10 |
| 06-long-labels | plano | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2267×381 | 45 |
| 06-long-labels | elk-naive | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 1380×381 | 27 |
| 06-long-labels | dagre | 1 | 1 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1979×369 | 5 |
| 07-groups | plano | 0 | 2 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2235×673 | 88 |
| 07-groups | elk-naive | 7 | 4 | 0 | 0 | 0 | 0 | 4 | 0 | 3 | 2 | 2 | 1 | 2 | 1 | 1533×663 | 46 |
| 07-groups | dagre | 3 | 3 | 0 | 0 | 3 | 0 | 5 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 1705×905 | 19 |
| 10-complex | plano | 0 | 2 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 4262×1032 | 185 |
| 10-complex | elk-naive | 43 | 15 | 0 | 0 | 0 | 0 | 10 | 0 | 33 | 4 | 12 | 1 | 6 | 1 | 2943×1094 | 101 |
| 10-complex | dagre | 13 | 13 | 0 | 0 | 13 | 5 | 14 | 0 | 0 | 0 | 6 | 1 | 0 | 0 | 3300×1944 | 41 |

## Determinismo (3 ejecuciones, hash del SVG)

| caso | salidas distintas |
|---|---|
| 01-flow | 1 |
| 02-c4-container | 1 |
| 03-components | 1 |
| 04-distributed | 1 |
| 05-sequence | 1 |
| 06-long-labels | 1 |
| 07-groups | 1 |
| 10-complex | 1 |

## Estabilidad tras la edición incremental (caso 8 sobre caso 4)

| estrategia | nodos comunes | desplazamiento medio (px) | máx (px) | movidos >20px | τ orden X | τ orden Y | Δ área | E después | W después | cruces después |
|---|---|---|---|---|---|---|---|---|---|---|
| relayout (orden de modelo) | 15 | 336.19 | 1548 | 15 | 0.72 | -0.15 | -18% | 0 | 0 | 0 |
| relayout (sin orden de modelo) | 15 | 320.61 | 1664.71 | 6 | 0.72 | 0.13 | 4% | 0 | 0 | 0 |
| interactive-elk | 15 | 203.37 | 996.63 | 14 | 0.78 | 0.17 | -19% | 0 | 1 | 0 |
| repair (repair) | 15 | 136.04 | 424.41 | 6 | 1 | 1 | 20% | 0 | 2 | 9 |

Cambios aplicados:
```
+node fraud service "Fraud Detection" in=core tech=Python
+edge trips>fraud "score trip"
+edge fraud>events "fraud alerts" style=async
~edge events>pay "trip settled" style=async
~edge pricing>geo "cached ETA" tech=HTTPS (was pricing>maps)
-node notify (+2 edges)
```

## Sensibilidad al reordenamiento de sentencias (3 permutaciones)

| caso | orden de modelo | desplazamiento medio (px) | τ mínimo |
|---|---|---|---|
| 02-c4-container | true | 97 | -0.64 |
| 02-c4-container | false | 107 | -0.43 |
| 04-distributed | true | 15 | 0.82 |
| 04-distributed | false | 178 | -0.6 |
| 10-complex | true | 403 | -0.75 |
| 10-complex | false | 87 | 0.55 |

## Tokens por representación

| caso | formato | caracteres | tokens o200k | tokens Claude (legado) |
|---|---|---|---|---|
| 01-flow | plano (DSL canónico) | 1042 | 253 | 281 |
| 01-flow | JSON semántico (indentado) | 3316 | 1023 | 1027 |
| 01-flow | JSON semántico (compacto) | 2061 | 542 | 571 |
| 01-flow | Mermaid (export) | 884 | 238 | 232 |
| 01-flow | Excalidraw JSON (export, con coordenadas) | 48023 | 17134 | 16301 |
| 01-flow | draw.io XML (export, con coordenadas) | 12982 | 4488 | 4738 |
| 01-flow | SVG renderizado (sin fuente) | 10644 | 3803 | 3986 |
| 02-c4-container | plano (DSL canónico) | 1408 | 348 | 387 |
| 02-c4-container | JSON semántico (indentado) | 3068 | 909 | 928 |
| 02-c4-container | JSON semántico (compacto) | 2107 | 539 | 572 |
| 02-c4-container | Mermaid (export) | 1398 | 366 | 390 |
| 02-c4-container | Excalidraw JSON (export, con coordenadas) | 32876 | 11627 | 11119 |
| 02-c4-container | draw.io XML (export, con coordenadas) | 10193 | 3506 | 3803 |
| 02-c4-container | SVG renderizado (sin fuente) | 12067 | 4282 | 4509 |
| 04-distributed | plano (DSL canónico) | 1570 | 424 | 451 |
| 04-distributed | JSON semántico (indentado) | 4436 | 1399 | 1390 |
| 04-distributed | JSON semántico (compacto) | 2787 | 769 | 790 |
| 04-distributed | Mermaid (export) | 1547 | 450 | 465 |
| 04-distributed | Excalidraw JSON (export, con coordenadas) | 58502 | 21123 | 19922 |
| 04-distributed | draw.io XML (export, con coordenadas) | 16694 | 5940 | 6332 |
| 04-distributed | SVG renderizado (sin fuente) | 17224 | 6537 | 6750 |
| 10-complex | plano (DSL canónico) | 3750 | 1003 | 1071 |
| 10-complex | JSON semántico (indentado) | 11035 | 3412 | 3421 |
| 10-complex | JSON semántico (compacto) | 6932 | 1852 | 1946 |
| 10-complex | Mermaid (export) | 3584 | 1036 | 1079 |
| 10-complex | Excalidraw JSON (export, con coordenadas) | 150076 | 53975 | 51180 |
| 10-complex | draw.io XML (export, con coordenadas) | 41642 | 14829 | 15778 |
| 10-complex | SVG renderizado (sin fuente) | 41710 | 16084 | 16586 |
| 08-incremental | ops escritas por el agente (plano, caso 8) | 224 | 64 | 69 |
| 08-incremental | respuesta de plano apply (cambios + validación) | 295 | 92 | 96 |
| 08-incremental | archivo plano completo regenerado | 1560 | 423 | 451 |
| 08-incremental | Mermaid completo regenerado | 1540 | 449 | 464 |
| 08-incremental | Excalidraw JSON completo regenerado | 57846 | 20884 | 19715 |
| 08-incremental | draw.io XML completo regenerado | 16647 | 5926 | 6322 |
| 08-incremental | consulta selectiva: show --around trips --depth 1 | 1137 | 307 | 327 |
| 08-incremental | consulta: show --ids | 357 | 104 | 102 |
| 08-incremental | diagnósticos de check (caso 07, texto compacto) | 406 | 145 | 142 |
| 08-incremental | diff semántico 04 -> 08 | 468 | 135 | 138 |
