// Convierte la geometría extraída de los SVG de Mermaid 12 al formato Layout y aplica el MISMO validador.
// Limitaciones (documentadas en el informe): aristas curvas muestreadas cada 4 px; los extremos de Mermaid
// terminan antes del nodo para dejar sitio al marcador, por lo que "extremos sin contacto" no es comparable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../../src/index.ts';
import { validateLayout } from '../../src/validate.ts';
import type { Layout, LNode, LEdge } from '../../src/layout.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(dir, '..', 'cases');
const rows: any[] = [];
for (const mode of ['default', 'dagre']) {
  const file = path.join(dir, 'results', `mermaid-${mode}.json`);
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [name, r] of Object.entries<any>(data)) {
    if (r.error) { rows.push({ case: name, variant: `mermaid12-${mode}`, error: r.error }); continue; }
    const d = P.parse(fs.readFileSync(path.join(casesDir, name + '.plano'), 'utf8'));
    const model = new Map(d.nodes.map((n) => [n.id, n]));
    const nodes: LNode[] = [];
    for (const n of r.nodes) {
      const m = model.get(n.id);
      nodes.push({ id: n.id, kind: m?.kind ?? 'process', group: false, parent: m?.in, depth: 0, ...n.shape, shape: n.diamond ? 'diamond' : 'rect', role: 'neutral',
        blocks: [{ lines: [''], widths: [n.textW], style: { size: 14, weight: 400, lineHeight: 18 }, color: 'text', y: 0 }],
        content: { x: n.label.x - n.shape.x, y: n.label.y - n.shape.y, w: Math.max(n.foW, 0), h: n.label.h }, truncated: false });
    }
    for (const c of r.clusters) {
      const id = String(c.id).split('-').pop()!;
      const m = model.get(id);
      nodes.push({ id, kind: m?.kind ?? 'group', group: true, parent: m?.in, depth: 0, ...c.rect, shape: 'rect', role: 'neutral', blocks: [], content: { x: 8, y: 4, w: 10, h: 10 }, truncated: false });
    }
    const labels = new Map(r.labels.map((l: any) => [l.forId, l.rect]));
    const edges: LEdge[] = r.edges.map((e: any) => {
      const [, from, to] = /^L_(.+?)_(.+)_\d+$/.exec(e.id) ?? [];
      const lr: any = labels.get(e.id);
      return { id: e.id, from, to, points: e.pts, curved: true, label: lr ? { ...lr, lines: [''] } : undefined };
    });
    const L: Layout = { width: r.viewBox[2], height: r.viewBox[3], nodes, edges, engine: `mermaid12-${mode}`, ms: r.ms, theme: 'light', type: d.type };
    const { metrics: m } = validateLayout(L);
    rows.push({ case: name, variant: `mermaid12-${mode === 'default' ? 'elk' : 'dagre'}`, errors: m.errors, nodeOverlaps: m.nodeOverlaps, textOverflow: m.textOverflow, edgeThroughNode: m.edgeThroughNode, edgeThroughGroup: m.edgeThroughGroup, crossings: m.crossings, edgeOverlaps: m.edgeOverlaps, labelOverlapNode: m.labelOverlapNode, labelOverlapLabel: m.labelOverlapLabel, labelOnEdge: m.labelOnEdge, labelAmbiguous: m.labelAmbiguous, detours: m.detours, endpointGapsNC: m.endpointGaps, width: Math.round(m.width), height: Math.round(m.height), ms: Math.round(r.ms) });
  }
}
fs.writeFileSync(path.join(dir, 'results', 'scores.json'), JSON.stringify(rows, null, 1));
const md = ['| caso | variante | E* | solapes nodo | texto desbordado | arista atraviesa nodo | arista atraviesa grupo | cruces | aristas superpuestas | etiqueta/nodo | etiqueta/etiqueta | arista sobre etiqueta | etiqueta ambigua | rodeos | ancho×alto | ms |', '|' + '---|'.repeat(16)];
for (const r of rows) md.push(r.error ? `| ${r.case} | ${r.variant} | error: ${r.error} |` : `| ${r.case} | ${r.variant} | ${r.errors - r.endpointGapsNC} | ${r.nodeOverlaps} | ${r.textOverflow} | ${r.edgeThroughNode} | ${r.edgeThroughGroup} | ${r.crossings} | ${r.edgeOverlaps} | ${r.labelOverlapNode} | ${r.labelOverlapLabel} | ${r.labelOnEdge} | ${r.labelAmbiguous} | ${r.detours} | ${r.width}×${r.height} | ${r.ms} |`);
fs.writeFileSync(path.join(dir, 'results', 'scores.md'), md.join('\n') + '\n');
console.log(md.join('\n'));
