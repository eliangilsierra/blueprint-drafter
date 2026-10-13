// API del núcleo: la usan la CLI, el servidor MCP y el benchmark. Ningún adaptador contiene lógica propia.
import { type Diagram, semanticCheck, type Diagnostic } from './model.ts';
import { layout, type Layout, type LayoutOptions } from './layout.ts';
import { layoutSequence } from './layout-seq.ts';
import { validateLayout, type Metrics, type ValidateOptions } from './validate.ts';

export * from './model.ts';
export { renderSvg } from './render.ts';
export { applyOps, OpError, summarizeChanges } from './ops.ts';
export { around, idsOnly, stats, semanticDiff, stability, syncOps } from './query.ts';
export { toMermaid, toExcalidraw, toDrawio, toPng } from './export.ts';
export { formatDiags } from './validate.ts';
export { stableLayout } from './stable.ts';
export type { Layout, LayoutOptions, Metrics };

export async function buildLayout(d: Diagram, opts: LayoutOptions = {}): Promise<Layout> {
  return d.type === 'sequence' ? layoutSequence(d) : layout(d, opts);
}

/** Pipeline completo y determinista: semántica -> layout -> validación geométrica. */
export async function check(d: Diagram, opts: LayoutOptions & ValidateOptions = {}): Promise<{ layout: Layout; diags: Diagnostic[]; metrics: Metrics }> {
  const sem = semanticCheck(d);
  const L = await buildLayout(d, opts);
  const { diags, metrics } = validateLayout(L, opts);
  const all = [...sem, ...diags];
  metrics.errors = all.filter((x) => x.sev === 'error').length;
  metrics.warnings = all.filter((x) => x.sev === 'warning').length;
  metrics.infos = all.filter((x) => x.sev === 'info').length;
  return { layout: L, diags: all, metrics };
}
