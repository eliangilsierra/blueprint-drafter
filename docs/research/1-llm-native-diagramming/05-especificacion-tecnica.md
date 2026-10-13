# Documento 5 · Especificación técnica (contrato v1, borrador)

Todos los ejemplos de este documento son **salidas reales** del prototipo (`prototype/`), no ilustraciones; solo se abreviaron los nombres de archivo (p. ej. `ride.plano` = copia de `bench/cases/04-distributed.plano`).

---

## 1. Decisión de representación

**Pregunta:** ¿JSON, YAML, DSL propio o llamadas tipadas?

| Representación | Tokens (caso 4) | Diffs en Git | Errores típicos del LLM | Uso propuesto |
|---|---|---|---|---|
| JSON indentado | 1.399 | Ruidosos (llaves, comas) | Comas/llaves, escapes | Intercambio máquina‑máquina (`--json`) |
| JSON compacto | 769 | Ilegibles | Igual | — |
| YAML | no medido | Buenos | Indentación | Descartado (sin ventaja medible frente al DSL) |
| **DSL de una sentencia por línea** | **424** | **Una línea por elemento** | Comillas (rechazadas con `E_SYNTAX` y nº de línea) | **Archivo canónico y operaciones** |
| Mermaid (referencia) | 450 | Buenos | Sintaxis variable por tipo de diagrama | Exportación |

**Decisión:** el *archivo* y las *operaciones* comparten una misma gramática de una sentencia por línea; MCP envuelve esas operaciones en un esquema tipado (`ops: string[]`); `--json` ofrece la forma estructurada para integraciones. **No es la sintaxis lo que ahorra tokens** (empata con Mermaid): es (1) que una operación cuesta lo que una línea, (2) que la misma línea sirve de diff y de respuesta, y (3) que la validación devuelve texto en vez de imágenes.

**Cómo refutarla:** si en el experimento con agentes (Documento 6) la tasa de `E_SYNTAX` con el DSL supera la tasa de errores de esquema con operaciones JSON tipadas, migrar el MCP a operaciones JSON estructuradas (el núcleo ya trabaja con objetos; solo cambia el adaptador).

## 2. Gramática (EBNF)

```ebnf
file        = header , { statement } ;
header      = "plano" , version , { attr } ;            (* attr: type, dir, theme, density, title *)
statement   = node | group | edge | constraint | comment ;
node        = "node"  , ID , KIND , STRING , { attr } ; (* attr: in, tech, desc, tags, <ext>=valor *)
group       = "group" , ID , GKIND , STRING , { attr } ;
edge        = "edge"  , ID , ">" , ID , [ "#" , INT ] , [ STRING ] , { attr } ;
                                                         (* attr: id, tech, style, dir, label, <ext> *)
constraint  = "rank same" , IDLIST | ("order"|"first"|"last") , IDLIST ;
op          = ("+" , statement) | ("~" , statement_parcial) | ("-" , ["node"|"edge"|"group"] , REF) ;
attr        = KEY , "=" , (WORD | STRING) ;               (* valor vacío = borrar atributo en ~ *)
ID          = /[A-Za-z_][A-Za-z0-9_.-]*/ ;
STRING      = '"' , { char | '\"' | '\\' | '\n' } , '"' ;
comment     = "#" , { any } ;
```

- `KIND` ∈ `start end process decision io subprocess person system external container service component webapp mobile gateway function db cache storage queue topic module actor participant`.
- `GKIND` ∈ `boundary zone cluster layer group`.
- `style` ∈ `sync async reply dep`; `dir` (arista) ∈ `fwd both none`; `dir` (diagrama) ∈ `TB LR BT RL`; `density` ∈ `compact normal airy`; `theme` ∈ `light dark`.

## 3. Modelo de datos

| Entidad | Campos | Reglas |
|---|---|---|
| `Diagram` | `v`, `type`, `title?`, `dir`, `theme`, `density`, `nodes[]`, `edges[]`, `constraints[]` | `type` ∈ `flow c4-context c4-container component architecture sequence generic` |
| `Node` | `id`, `kind`, `label`, `group?`, `in?`, `desc?`, `tech?`, `tags?`, `ext?` | `id` único global (nodos y aristas); `in` debe ser un grupo; sin ciclos de contención |
| `Edge` | `id`, `from`, `to`, `label?`, `tech?`, `style?`, `dir?`, `ext?` | `id` automático `from>to` (`#n` si se repite) o explícito con `id=` |
| `Constraint` | `type`, `ids[]` | Ver §3.3 |

### 3.1 Identificadores estables
- Los ids de nodos los elige el autor (agente o humano) y **nunca** los cambia el motor.
- Ids automáticos de aristas: derivados (`from>to`). Al reconectar (`~edge a>b to=c`) se **regeneran**; los explícitos (`id=keep`) se conservan (probado en `test/model.test.ts`).
- Todos los elementos del SVG llevan `data-id` → base para visor, diff visual y selección.

### 3.2 Atributos tipados y metadatos por tipo de diagrama
- C4: `kind` define el nivel (person/system/external/container/component); el renderizador añade `[Container: tecnología]` automáticamente.
- Flujo: `start/end/process/decision/io/subprocess`; las aristas que salen de `decision` colocan su etiqueta junto al origen.
- Secuencia: nodos = participantes en orden; aristas = mensajes en orden; `style=reply|async`.

### 3.3 Restricciones (estado honesto)
| Restricción | Efecto en el prototipo |
|---|---|
| `first A` / `last B` | Aplicada (`layerConstraint` de ELK) |
| `rank same A,B` | **Parseada y validada semánticamente, no aplicada al layout** (ELK Layered no ofrece "misma capa" directa; pendiente: particiones o post‑proceso) |
| `order A,B,C` | **Parseada, no aplicada** (pendiente: orden de modelo forzado) |
| Conflictos (`first` y `last` sobre el mismo id; un id en dos `rank same`) | Detectados: `E_CONSTRAINT_CONFLICT` |

Una restricción no satisfecha debería producir `I_CONSTRAINT_UNMET` (no implementado aún).

### 3.4 Versiones, extensiones y elementos desconocidos
- `plano <v>` en la cabecera. Regla: **v1 solo añade**; eliminar o cambiar semántica requiere v2 y un migrador (`plano migrate`).
- **Atributos desconocidos se preservan** (`ext`) y se re‑serializan ordenados (probado: `owner=team-x`, `sla=99.9`).
- **`kind` desconocido** → `W_UNKNOWN_KIND` con sugerencia (`~node x kind=service`) y render genérico; no bloquea.
- **Sentencia desconocida** → `E_UNKNOWN_STATEMENT` con número de línea (bloquea: no se puede adivinar la intención).
- Serialización **canónica y determinista**: grupos (de exterior a interior), nodos y aristas en orden de modelo, restricciones al final; `parse ∘ serialize` es idempotente en todos los casos (probado).

## 4. Ejemplos reales

### 4.1 Especificación inicial (caso 2, completa: 21 líneas, 348 tokens o200k)
```text
plano 1 type=c4-container dir=TB title="Container diagram for Internet Banking System"
group c1 boundary "Internet Banking"
node customer person "Customer" desc="A customer of the bank, with personal bank accounts"
node mailSystem external "E-Mail System" desc="The internal Microsoft Exchange system"
node mainframe external "Mainframe Banking System" desc="Stores all of the core banking information"
node spa webapp "Single-Page App" in=c1 tech="JavaScript, Angular" desc="Provides all the Internet banking functionality"
node webApp container "Web Application" in=c1 tech="Java, Spring MVC" desc="Delivers the static content and the SPA"
node db db "Database" in=c1 tech="SQL Database" desc="Stores user registration information"
node mobile mobile "Mobile App" in=c1 tech="C#, Xamarin" desc="Provides a limited subset of functionality"
node api container "API Application" in=c1 tech="Java, Docker Container" desc="Provides Internet banking functionality via API"
edge customer>spa "Uses" tech=HTTPS
edge customer>mobile "Uses"
edge customer>webApp "Uses" tech=HTTPS
edge webApp>spa "Delivers"
edge spa>api "Uses" tech="async, JSON/HTTPS"
edge mobile>api "Uses" tech="async, JSON/HTTPS"
edge api>db "Reads from and writes to" tech="sync, JDBC"
edge mailSystem>customer "Sends e-mails to"
edge api>mailSystem "Sends e-mails using" tech="sync, SMTP"
edge api>mainframe "Uses" tech="sync/async, XML/HTTPS"
```
Es el mismo contenido que el issue [mermaid#7492](https://github.com/mermaid-js/mermaid/issues/7492) (C4 nativo de Mermaid con etiquetas solapadas). Resultado con plano: `check: 0E 0W 0I · nodes=8 edges=10 crossings=0` — render en [`out/02-c4-container.png`](prototype/out/02-c4-container.png).

### 4.2 Operación incremental: añadir un componente
```console
$ plano apply ride.plano '+node fraud service "Fraud Detection" in=core tech=Python' '+edge trips>fraud "score trip"'
ok 2 change(s)
+node fraud service "Fraud Detection" in=core tech=Python
+edge trips>fraud "score trip"
check: 0E 0W 0I · nodes=17 edges=17 crossings=0 size=1797x902
```

### 4.3 Modificar relaciones (reconectar, cambiar estilo y etiqueta)
```console
$ plano apply ride.plano '~edge pricing>maps to=geo label="cached ETA"' '~edge events>pay style=async label="trip settled"'
ok 2 change(s)
~edge pricing>geo "cached ETA" tech=HTTPS (was pricing>maps)
~edge events>pay "trip settled" style=async
check: 0E 0W 1I · nodes=17 edges=17 crossings=0 size=1816x780
```

### 4.4 Operación inválida (rechazo atómico con sugerencia)
```console
$ plano apply ride.plano '~node trps label="Trips"'
REJECTED E_UNKNOWN_ID op#1 "~node trps label="Trips"": no node 'trps' | fix: did you mean 'trips'?
no changes written            # código de salida 3
```

### 4.5 Resultado de validación con errores y sugerencias (caso 7)
```console
$ plano check multi-region.plano
check: 0E 2W 2I · nodes=10 edges=13 crossings=5 size=2235x673
W W_EDGE_DETOUR usapi>eudb — edge 'usapi>eudb' takes a 1978px detour (direct ≈ 451px) | fix: grouping forces this; consider ~node eudb in= (leave 'eu') or dir change
W W_ILLEGIBLE_AT_FIT — smallest text renders at 7.5px when fitted to 1600x1000 | fix: split into views (e.g. one per boundary) or switch dir
I I_CROSSINGS — 5 edge crossings (0.38 per edge)
I I_ASPECT — aspect ratio 3.3:1 | fix: try dir=TB
```
(145 tokens.) Con `--json`, cada diagnóstico es `{sev, code, ids[], msg, fix?, auto?}` más un bloque `metrics` con 30 métricas.

### 4.6 Consulta compacta de estado
```console
$ plano show ride.plano --around fraud
group core boundary "Core services"
node trips service "Trip Service" in=core tech=Kotlin
node fraud service "Fraud Detection" in=core tech=Python
edge trips>fraud "score trip"
# 17 other elements omitted

$ plano show ride.plano --ids
groups: edge core data
nodes: rider driver gw@edge auth@core trips@core match@core pricing@core pay@core notify@core tripsdb@data geo@data events@data ledger@data psp maps push fraud@core
edges: rider>gw driver>gw gw>auth gw>trips gw>match trips>match match>geo trips>pricing pricing>geo trips>tripsdb trips>events events>pay events>notify pay>ledger pay>psp notify>push trips>fraud
```

### 4.7 Diff entre versiones (semántico + estabilidad visual)
```console
$ plano diff before.plano after.plano --layout
+ node fraud service "Fraud Detection" in=core tech=Python
+ edge pricing>geo "cached ETA" tech=HTTPS
+ edge trips>fraud "score trip"
- edge pricing>maps "ETA" tech=HTTPS
~ edge events>pay "trip settled" style=async   (was: edge events>pay "trip completed" style=async)
layout: common=16 meanShift=122.8px maxShift=1549px moved>20px=10 orderX=0.87 orderY=0.85 area-13%
```
La línea `layout:` cuantifica cuánto cambiará la imagen (útil en revisiones de PR).

### 4.8 Exportación
```console
$ plano render ride.plano -o ride.svg            # SVG con fuente incrustada
$ plano render ride.plano -o ride.png --theme dark
$ plano export ride.plano --to drawio -o ride.drawio
$ plano export ride.plano --to excalidraw -o ride.excalidraw
$ plano export ride.plano --to mermaid
flowchart LR
  subgraph edge["Edge"]
    gw{{"API Gateway<br/><small>[Envoy]</small>"}}
  end
  ...
```
Excalidraw: las flechas salen **enlazadas en ambos sentidos** (lo que pide [excalidraw-mcp#33](https://github.com/excalidraw/excalidraw-mcp/issues/33)):
```json
{"id":"e_rider>gw","startBinding":{"elementId":"n_rider","focus":0,"gap":1},"endBinding":{"elementId":"n_gw","focus":0,"gap":1}, "...": "..."}
// y en la forma de origen: "boundElements":[{"id":"t_trips","type":"text"},{"id":"e_gw>trips","type":"arrow"},...]
```
**Pendiente:** verificar que Excalidraw y draw.io abren estos archivos sin pérdidas (no se probaron en las aplicaciones).

## 5. CLI

| Comando | Descripción | Salida |
|---|---|---|
| `plano new <f> --type T [--title] [--dir]` | Crea un diagrama vacío | `created <f>` |
| `plano apply <f> <op>… [--ops-file F] [--dry-run] [--render out] [--stable]` | Lote atómico + validación | cambios (resumidos si >8) + `check:` + problemas |
| `plano check <f> [--json] [--max N] [--engine elk\|dagre]` | Validación completa | diagnósticos de una línea o JSON |
| `plano show <f> [--around ID --depth N] [--ids] [--stats]` | Lectura selectiva | texto canónico parcial |
| `plano render <f> -o out.svg\|png [--theme] [--no-embed-font] [--lock]` | Render | `wrote … (WxH, motor, ms)` |
| `plano export <f> --to mermaid\|excalidraw\|drawio\|layout-json [-o]` | Exportación | archivo |
| `plano diff <a> <b> [--layout]` | Diff semántico (+ estabilidad) | líneas `+ - ~` |
| `plano fmt <f>` | Canonicaliza | — |

**Códigos de salida:** `0` correcto · `1` el diagrama tiene errores de validación · `2` error de uso/sintaxis/archivo · `3` operación rechazada (nada escrito).

## 6. Herramientas MCP (stdio)

Descripciones cortas por diseño (lección de [drawio-mcp#76](https://github.com/jgraph/drawio-mcp/issues/76)): **587 tokens** para las 6 definiciones + **133** de instrucciones del servidor (medido).

| Herramienta | Entrada (zod) | Salida |
|---|---|---|
| `plano_new` | `{file, type, title?, dir?}` | `created <file>` |
| `plano_apply` | `{file, ops: string[≥1], dryRun?}` | `ok` + cambios + `nE nW` + problemas · o `REJECTED <código>` (`isError: true`) |
| `plano_check` | `{file, max?}` | resumen + diagnósticos |
| `plano_show` | `{file, around?, depth?, idsOnly?}` | texto canónico parcial |
| `plano_render` | `{file, format: svg\|png\|mermaid\|excalidraw\|drawio, theme?}` | `wrote <ruta> (WxH)` |
| `plano_diff` | `{a, b}` | diff semántico |

Sesión real medida con el cliente oficial del SDK (`bench/mcp-session.ts`): crear + poblar 19 elementos + validar + consulta selectiva + edición de 4 operaciones + operación inválida + render + export = **967 tokens** de entrada+salida de herramientas (sin contar el razonamiento del modelo).

**Seguridad:** rutas restringidas a `PLANO_WORKSPACE` y extensión `.plano` (`E_OUTSIDE_WORKSPACE`, `E_BAD_EXTENSION`).

## 7. Catálogo de diagnósticos

### 7.1 Sintaxis y operaciones
| Código | Sev. | Cuándo | Comportamiento |
|---|---|---|---|
| `E_SYNTAX` | error | Token inesperado, cadena sin cerrar, referencia de arista mal formada | Rechazo con nº de línea/op |
| `E_UNKNOWN_STATEMENT` | error | Palabra clave desconocida | Rechazo |
| `E_INVALID_OP` | error | Op sin prefijo `+ ~ -` o no permitida | Rechazo |
| `E_UNKNOWN_ID` | error | `~`/`-` sobre id inexistente | Rechazo + "did you mean" |
| `E_DUPLICATE_ID` | error | `+` con id existente | Rechazo + "use ~node … to modify" |
| `REJECTED batch would introduce errors` | error | El lote crearía errores semánticos nuevos | Rechazo con la lista |

### 7.2 Semántica
`E_DUPLICATE_ID`, `E_BAD_ID`, `E_UNKNOWN_PARENT` (fix: grupo similar o `+group`), `E_PARENT_NOT_GROUP`, `E_CONTAINMENT_CYCLE`, `E_DANGLING_EDGE` (fix: id similar o `+node`), `E_CONSTRAINT_UNKNOWN_ID`, `E_CONSTRAINT_CONFLICT`, `W_UNKNOWN_KIND` (fix: kind similar), `W_UNLABELED_RELATION` (C4), `W_C4_PERSON_IN_BOUNDARY`, `W_C4_LEVEL_MIX`, `I_SELF_LOOP`, `I_ISOLATED`.

### 7.3 Geometría y legibilidad
| Código | Sev. | Regla (resumen) | Excepciones explícitas |
|---|---|---|---|
| `E_NODE_OVERLAP` | error | Rectángulos de elementos no emparentados se intersecan | Padre/hijo |
| `W_NODES_TOO_CLOSE` | aviso | Separación < 12 px entre hojas | — |
| `E_OUTSIDE_PARENT` | error | Hijo fuera de su grupo | — |
| `E_TEXT_OVERFLOW` | error | Línea más ancha que la caja de contenido, o contenido fuera de la forma (rombo: `cw/W + ch/H ≤ 1`) | — |
| `W_TEXT_TRUNCATED` | aviso | Se aplicó elipsis (máx. 3 líneas de nombre, 4 de descripción) | — |
| `E_EDGE_THROUGH_NODE` | error | Un tramo atraviesa una hoja ajena | Origen, destino y sus ancestros |
| `W_EDGE_THROUGH_GROUP` | aviso | Atraviesa un grupo que no contiene ningún extremo | Grupos ancestros de un extremo |
| `E_EDGE_ENDPOINT_GAP` | error | Extremo a > 2 px (4 px en curvas) del **contorno real** | Secuencia: distancia a la línea de vida |
| `W_ARROW_TOO_SHORT` | aviso | Último tramo < 10 px (punta ambigua) | `dir=none` |
| `E_LABEL_OVERLAPS_NODE` | error | Etiqueta sobre una hoja o sobre el título de un grupo ajeno | — |
| `E_LABEL_OVERLAPS_LABEL` | error | Dos etiquetas se solapan | — |
| `W_LABEL_ON_EDGE` | aviso | Otro conector atraviesa la etiqueta | — |
| `W_LABEL_DETACHED` | aviso | Etiqueta lejos de su conector | — |
| `W_LABEL_AMBIGUOUS` | aviso | Etiqueta tan cerca de otro conector como del suyo | Hermanos de abanico idénticos fuera de flujo |
| `W_EDGE_OVERLAP` | aviso | Tramos colineales superpuestos > 4 px | Aristas que comparten extremo |
| `I_CROSSINGS` / `W_MANY_CROSSINGS` | info/aviso | Cruces propios (> 0,5 por arista → aviso) | Los cruces no son errores |
| `W_EDGE_DETOUR` | aviso | Longitud − distancia Manhattan > max(300, 0,35·(ancho+alto)) — **umbral heurístico a calibrar** | — |
| `I_EDGE_HUGS_NODE` | info | Conector a < 6 px de una hoja ajena | — |
| `W_ILLEGIBLE_AT_FIT` | aviso | Texto más pequeño < 8 px al encajar en 1600×1000 — **necesita perfiles (doc/slide)** | — |
| `I_ASPECT`, `I_DENSITY` | info | Relación > 3:1; > 30 elementos | — |
| `W_LOW_CONTRAST` | aviso | Contraste de texto < 4,5:1 en el tema | — |

Cada diagnóstico incluye `auto: true` cuando el motor puede resolverlo sin el agente (re‑layout), y `fix` cuando existe una corrección semántica concreta.

## 8. Comportamiento ante operaciones inválidas (garantías)

1. **Atomicidad:** se aplica todo el lote en una copia; si cualquier op falla o el resultado introduce errores semánticos nuevos, **no se escribe nada** (probado).
2. **Idempotencia de lectura:** `show`, `check`, `diff`, `render` nunca modifican la fuente.
3. **Sin efectos fuera del workspace** (MCP).
4. **Determinismo:** misma fuente → mismo SVG (probado, 8 casos × 3 ejecuciones).
5. **Errores preexistentes** no bloquean ediciones que no los empeoran (comparación antes/después por código+ids).
