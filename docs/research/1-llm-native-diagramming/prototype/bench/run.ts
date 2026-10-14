// Benchmark reproducible: `node bench/run.ts` (sin red, sin claves de API, determinista).
// Mide calidad geométrica (con ablaciones), determinismo, estabilidad incremental, tiempo y tokens de representación.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as P from '../src/index.ts';
import { validateLayout } from '../src/validate.ts';

const require = createRequire(import.meta.url);
const { getEncoding } = require('js-tiktoken');
const o200k = getEncoding('o200k_base');
const anth = require('@anthropic-ai/tokenizer');
const tok = (s: string) => ({ o200k: o200k.encode(s).length, claudeLegacy: anth.countTokens(s) });

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const casesDir = path.join(dir, 'cases');
const outDir = path.join(dir, 'results');
fs.mkdirSync(outDir, { recursive: true });
const load = (f: string) => P.parse(fs.readFileSync(path.join(casesDir, f), 'utf8'));

const VARIANTS: Record<string, P.LayoutOptions> = {
  plano: {},
  'elk-naive': { labelsAsObstacles: false, clipToShape: false, uniformWidth: false, inlineLabels: false },
  'dagre': { engine: 'dagre' },
};
const CASES = ['01-flow', '02-c4-container', '03-components', '04-distributed', '05-sequence', '06-long-labels', '07-groups', '10-complex'];
const KEYS = ['errors', 'warnings', 'nodeOverlaps', 'textOverflow', 'textTruncated', 'edgeThroughNode', 'edgeThroughGroup', 'crossings', 'edgeOverlaps', 'labelOverlapNode', 'labelOverlapLabel', 'labelOnEdge', 'labelAmbiguous', 'endpointGaps', 'detours', 'width', 'height'] as const;

const results: any = { date: new Date().toISOString(), node: process.version, quality: [], determinism: [], stability: [], reorder: [], tokens: [], timing: [] };

// ---------------------------------------------------------------- calidad (+ ablaciones)
for (const c of CASES) {
  const d = load(c + '.plano');
  for (const [v, opts] of Object.entries(VARIANTS)) {
    if (d.type === 'sequence' && v !== 'plano') continue;
    const t0 = performance.now();
    const r = await P.check(d, opts);
    const svg = P.renderSvg(r.layout, { embedFont: false });
    const ms = performance.now() - t0;
    const row: any = { case: c, variant: v, ms: Math.round(ms) };
    for (const k of KEYS) row[k] = Math.round((r.metrics as any)[k]);
    results.quality.push(row);
    if (v === 'plano') {
      fs.writeFileSync(path.join(outDir, `${c}.svg`), P.renderSvg(r.layout));
      fs.writeFileSync(path.join(outDir, `${c}.diagnostics.txt`), P.formatDiags(r.diags, 50) + '\n');
    } else fs.writeFileSync(path.join(outDir, `${c}.${v}.svg`), svg);
  }
}

// ---------------------------------------------------------------- determinismo
for (const c of CASES) {
  const d = load(c + '.plano');
  const hashes = new Set<string>();
  for (let i = 0; i < 3; i++) hashes.add(crypto.createHash('sha256').update(P.renderSvg(await P.buildLayout(d), { embedFont: false })).digest('hex').slice(0, 12));
  results.determinism.push({ case: c, runs: 3, distinctOutputs: hashes.size });
}

// ---------------------------------------------------------------- caso 8: edición incremental y estabilidad
const base = load('04-distributed.plano');
const ops = fs.readFileSync(path.join(casesDir, '08-incremental.ops'), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
const applied = P.applyOps(base, ops);
fs.writeFileSync(path.join(outDir, '08-after.plano'), P.serialize(applied.diagram));
for (const mo of [true, false]) {
  const A = await P.buildLayout(base, { modelOrder: mo });
  const B = await P.buildLayout(applied.diagram, { modelOrder: mo });
  const st = P.stability(A, B);
  const v = validateLayout(B).metrics;
  results.stability.push({ case: '08-incremental', modelOrder: mo ? 'relayout (orden de modelo)' : 'relayout (sin orden de modelo)', ...Object.fromEntries(Object.entries(st).map(([k, x]) => [k, Math.round((x as number) * 100) / 100])), errorsAfter: v.errors, warningsAfter: v.warnings, crossingsAfter: v.crossings });
  if (mo) { fs.writeFileSync(path.join(outDir, '08-before.svg'), P.renderSvg(A)); fs.writeFileSync(path.join(outDir, '08-after.svg'), P.renderSvg(B)); }
}
{
  const A = await P.buildLayout(base);
  const I = await P.buildLayout(applied.diagram, { previous: A });
  const S = await P.stableLayout(applied.diagram, A);
  for (const [name, L] of [['interactive-elk', I], ['repair (' + S.mode + ')', S.layout]] as const) {
    const st = P.stability(A, L); const v = validateLayout(L).metrics;
    results.stability.push({ case: '08-incremental', modelOrder: name, ...Object.fromEntries(Object.entries(st).map(([k, x]) => [k, Math.round((x as number) * 100) / 100])), errorsAfter: v.errors, warningsAfter: v.warnings, crossingsAfter: v.crossings });
  }
  fs.writeFileSync(path.join(outDir, '08-after-repair.svg'), P.renderSvg(S.layout));
  fs.writeFileSync(path.join(outDir, '08-after-interactive.svg'), P.renderSvg(I));
}
results.changes8 = applied.changes;

// robustez ante reordenación de sentencias (un LLM que regenera el archivo suele cambiar el orden)
function shuffle<T>(xs: T[], seed: number): T[] { const a = [...xs]; let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2 ** 31; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
for (const c of ['02-c4-container', '04-distributed', '10-complex']) {
  const d = load(c + '.plano');
  for (const mo of [true, false]) {
    const A = await P.buildLayout(d, { modelOrder: mo });
    const shifts: number[] = [], taus: number[] = [];
    for (const seed of [1, 2, 3]) {
      const d2 = { ...d, nodes: [...d.nodes.filter((n) => n.group), ...shuffle(d.nodes.filter((n) => !n.group), seed)], edges: shuffle(d.edges, seed + 10) };
      const st = P.stability(A, await P.buildLayout(d2, { modelOrder: mo }));
      shifts.push(st.meanShift); taus.push(Math.min(st.tauX, st.tauY));
    }
    results.reorder.push({ case: c, modelOrder: mo, meanShiftAvg: Math.round(shifts.reduce((s, x) => s + x, 0) / 3), minOrderTau: Math.round(Math.min(...taus) * 100) / 100 });
  }
}

// ---------------------------------------------------------------- tokens de representación (mismo diagrama, distintos formatos)
for (const c of ['01-flow', '02-c4-container', '04-distributed', '10-complex']) {
  const d = load(c + '.plano');
  const L = await P.buildLayout(d);
  const json = JSON.stringify({ nodes: d.nodes, edges: d.edges, type: d.type, dir: d.dir, title: d.title }, null, 2);
  const forms: Record<string, string> = {
    'plano (DSL canónico)': P.serialize(d),
    'JSON semántico (indentado)': json,
    'JSON semántico (compacto)': JSON.stringify(JSON.parse(json)),
    'Mermaid (export)': P.toMermaid(d),
    'Excalidraw JSON (export, con coordenadas)': P.toExcalidraw(L),
    'draw.io XML (export, con coordenadas)': P.toDrawio(L),
    'SVG renderizado (sin fuente)': P.renderSvg(L, { embedFont: false }),
  };
  for (const [k, s] of Object.entries(forms)) results.tokens.push({ case: c, format: k, chars: s.length, ...tok(s) });
}
// costes por operación (caso 8): lo que el agente escribe y lee en cada paso
{
  const after = applied.diagram;
  const r = await P.check(after);
  const applyOut = `ok ${applied.changes.length} change(s)\n${applied.changes.join('\n')}\ncheck: ${r.metrics.errors}E ${r.metrics.warnings}W ...`;
  const L0 = await P.buildLayout(base), L1 = await P.buildLayout(after);
  const items: Record<string, string> = {
    'ops escritas por el agente (plano, caso 8)': ops.join('\n'),
    'respuesta de plano apply (cambios + validación)': applyOut,
    'archivo plano completo regenerado': P.serialize(after),
    'Mermaid completo regenerado': P.toMermaid(after),
    'Excalidraw JSON completo regenerado': P.toExcalidraw(L1),
    'draw.io XML completo regenerado': P.toDrawio(L1),
    'consulta selectiva: show --around trips --depth 1': P.around(after, 'trips', 1),
    'consulta: show --ids': P.idsOnly(after),
    'diagnósticos de check (caso 07, texto compacto)': fs.readFileSync(path.join(outDir, '07-groups.diagnostics.txt'), 'utf8'),
    'diff semántico 04 -> 08': P.semanticDiff(base, after).join('\n'),
  };
  void L0;
  for (const [k, s] of Object.entries(items)) results.tokens.push({ case: '08-incremental', format: k, chars: s.length, ...tok(s) });
}

fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));

// ---------------------------------------------------------------- informe Markdown
const md: string[] = [`# Resultados del benchmark (generado por bench/run.ts)`, ``, `Fecha: ${results.date} · Node ${results.node} · Tokenizadores: o200k_base (js-tiktoken) y tokenizador legado de Anthropic (@anthropic-ai/tokenizer, aproximación; los modelos Claude actuales no publican su tokenizador).`, ``];
md.push('## Calidad geométrica por caso y variante', '', '| caso | variante | E | W | solapes nodo | texto desbordado | arista atraviesa nodo | arista atraviesa grupo | cruces | aristas superpuestas | etiqueta/nodo | etiqueta/etiqueta | arista sobre etiqueta | etiqueta ambigua | extremos sin contacto | rodeos | ancho×alto | ms |', '|' + '---|'.repeat(19));
for (const r of results.quality) md.push(`| ${r.case} | ${r.variant} | ${r.errors} | ${r.warnings} | ${r.nodeOverlaps} | ${r.textOverflow} | ${r.edgeThroughNode} | ${r.edgeThroughGroup} | ${r.crossings} | ${r.edgeOverlaps} | ${r.labelOverlapNode} | ${r.labelOverlapLabel} | ${r.labelOnEdge} | ${r.labelAmbiguous} | ${r.endpointGaps} | ${r.detours} | ${r.width}×${r.height} | ${r.ms} |`);
md.push('', '## Determinismo (3 ejecuciones, hash del SVG)', '', '| caso | salidas distintas |', '|---|---|');
for (const r of results.determinism) md.push(`| ${r.case} | ${r.distinctOutputs} |`);
md.push('', '## Estabilidad tras la edición incremental (caso 8 sobre caso 4)', '', '| estrategia | nodos comunes | desplazamiento medio (px) | máx (px) | movidos >20px | τ orden X | τ orden Y | Δ área | E después | W después | cruces después |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of results.stability) md.push(`| ${r.modelOrder} | ${r.common} | ${r.meanShift} | ${r.maxShift} | ${r.moved20} | ${r.tauX} | ${r.tauY} | ${Math.round(r.sizeChange * 100)}% | ${r.errorsAfter} | ${r.warningsAfter} | ${r.crossingsAfter} |`);
md.push('', 'Cambios aplicados:', '```', ...results.changes8, '```');
md.push('', '## Sensibilidad al reordenamiento de sentencias (3 permutaciones)', '', '| caso | orden de modelo | desplazamiento medio (px) | τ mínimo |', '|---|---|---|---|');
for (const r of results.reorder) md.push(`| ${r.case} | ${r.modelOrder} | ${r.meanShiftAvg} | ${r.minOrderTau} |`);
md.push('', '## Tokens por representación', '', '| caso | formato | caracteres | tokens o200k | tokens Claude (legado) |', '|---|---|---|---|---|');
for (const r of results.tokens) md.push(`| ${r.case} | ${r.format} | ${r.chars} | ${r.o200k} | ${r.claudeLegacy} |`);
fs.writeFileSync(path.join(outDir, 'results.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
