// Motor especializado para secuencia: no es un problema de grafos sino de columnas y filas.
// El ancho entre columnas se calcula a partir de las etiquetas medidas => nunca se solapan.
import type { Diagram } from './model.ts';
import { sizeNode, edgeLabelBox, type Layout, type LNode, type LEdge, type P } from './layout.ts';

export function layoutSequence(d: Diagram): Layout {
  const t0 = performance.now();
  const parts = d.nodes.filter((n) => !n.group);
  const idx = new Map(parts.map((p, i) => [p.id, i]));
  const sized = parts.map((p) => sizeNode({ ...p, desc: undefined }, { ...d, type: 'sequence' }));
  const headerH = Math.max(...sized.map((s) => s.h));
  // separación mínima entre columnas adyacentes
  const gaps = parts.slice(1).map((_, i) => (sized[i].w + sized[i + 1].w) / 2 + 36);
  const msgs = d.edges.filter((e) => idx.has(e.from) && idx.has(e.to));
  for (const e of msgs) {
    if (!e.label || e.from === e.to) continue;
    const a = Math.min(idx.get(e.from)!, idx.get(e.to)!), b = Math.max(idx.get(e.from)!, idx.get(e.to)!);
    const need = edgeLabelBox(e.label).w + 32;
    const have = gaps.slice(a, b).reduce((s, g) => s + g, 0);
    if (have < need) for (let k = a; k < b; k++) gaps[k] += (need - have) / (b - a);
  }
  // los auto-mensajes necesitan espacio a la derecha de su columna
  for (const e of msgs) if (e.from === e.to && e.label) { const i = idx.get(e.from)!; if (i < gaps.length) gaps[i] = Math.max(gaps[i], 48 + edgeLabelBox(e.label).w + 16); }
  const xs: number[] = [sized[0].w / 2];
  gaps.forEach((g, i) => xs.push(xs[i] + g));
  const top = d.title ? 34 : 0;
  const nodes: LNode[] = sized.map((s, i) => ({ ...s, x: xs[i] - s.w / 2, y: top, depth: 0 }));
  let y = top + headerH + 34;
  const edges: LEdge[] = [];
  for (const e of msgs) {
    const lb = e.label ? edgeLabelBox(e.label) : undefined;
    const xa = xs[idx.get(e.from)!], xb = xs[idx.get(e.to)!];
    if (e.from === e.to) {
      const lh = lb ? lb.h : 0;
      y += lh;
      const pts: P[] = [[xa, y], [xa + 40, y], [xa + 40, y + 20], [xa, y + 20]];
      edges.push({ id: e.id, from: e.from, to: e.to, points: pts, style: e.style, label: lb && { x: xa + 48, y: y + 10 - lb.h / 2 - lh / 2, w: lb.w, h: lb.h, lines: lb.lines } });
      y += 40;
    } else {
      y += lb ? lb.h + 2 : 0;
      edges.push({ id: e.id, from: e.from, to: e.to, points: [[xa, y], [xb, y]], style: e.style, label: lb && { x: (xa + xb) / 2 - lb.w / 2, y: y - lb.h - 3, w: lb.w, h: lb.h, lines: lb.lines } });
      y += 26;
    }
  }
  const bottom = y + 10;
  const M = 24;
  const shift = (v: number) => v + M;
  nodes.forEach((n) => { n.x = shift(n.x); n.y = shift(n.y); });
  edges.forEach((e) => { e.points = e.points.map(([px, py]) => [shift(px), shift(py)] as P); if (e.label) { e.label.x = shift(e.label.x); e.label.y = shift(e.label.y); } });
  const lifelines = nodes.map((n) => ({ x: n.x + n.w / 2, y1: n.y + n.h, y2: shift(bottom) }));
  const width = Math.max(...nodes.map((n) => n.x + n.w), ...edges.map((e) => (e.label ? e.label.x + e.label.w : 0))) + M;
  return { width, height: shift(bottom) + M, nodes, edges, engine: 'sequence', ms: performance.now() - t0, title: d.title, theme: d.theme, type: 'sequence', lifelines } as Layout;
}
