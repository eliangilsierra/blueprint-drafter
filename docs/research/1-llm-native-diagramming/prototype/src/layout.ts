// Motor de layout: el LLM nunca calcula coordenadas.
// 1) dimensiona cada nodo a partir de la medición real del texto,
// 2) delega colocación y enrutamiento ortogonal a ELK Layered (con etiquetas como obstáculos),
// 3) post-procesa: recorta extremos de conectores al contorno real de la forma.
import { createRequire } from 'node:module';
import type { Diagram, Node } from './model.ts';
import { wrap, textWidth, type TextStyle } from './fonts.ts';
import { styleOf, TYPE, DENSITY, type Role, type Shape } from './theme.ts';

const require = createRequire(import.meta.url);
const ELK = require('elkjs/lib/elk.bundled.js');
const elk = new ELK();

export type P = [number, number];
export type TextBlock = { lines: string[]; widths: number[]; style: TextStyle; color: 'text' | 'sub'; y: number };
export type LNode = {
  id: string; kind: string; group: boolean; parent?: string; depth: number;
  x: number; y: number; w: number; h: number;
  shape: Shape; role: Role;
  blocks: TextBlock[];
  content: { x: number; y: number; w: number; h: number }; // caja de texto relativa al nodo
  truncated: boolean;
};
export type LLabel = { x: number; y: number; w: number; h: number; lines: string[] };
export type LEdge = { id: string; from: string; to: string; points: P[]; label?: LLabel; style?: string; dir?: string; curved?: boolean };
export type Layout = { width: number; height: number; nodes: LNode[]; edges: LEdge[]; engine: string; ms: number; title?: string; theme: string; type: string; lifelines?: { x: number; y1: number; y2: number }[] };

export type LayoutOptions = {
  engine?: 'elk' | 'dagre';
  modelOrder?: boolean; // estabilidad incremental (orden de modelo como desempate)
  labelsAsObstacles?: boolean; // reservar espacio para etiquetas de conectores durante el layout
  uniformWidth?: boolean;
  clipToShape?: boolean;
  inlineLabels?: boolean; // etiqueta centrada sobre la línea (sin ambigüedad de pertenencia)
  previous?: Layout; // layout anterior: sus posiciones guían capas y orden (modo estable)
};
const DEFAULTS: Required<LayoutOptions> = { engine: 'elk', modelOrder: true, labelsAsObstacles: true, uniformWidth: true, clipToShape: true, inlineLabels: true, previous: undefined as any };

const PAD_X = 14, PAD_Y = 11, GAP = 3;
const GROUP_PAD = { top: 40, side: 18, bottom: 18 };

function captionFor(n: Node, d: Diagram): string | undefined {
  if (d.type === 'flow' || d.type === 'sequence') return n.tech ? `[${n.tech}]` : undefined;
  const cap = styleOf(n.kind).caption;
  if (!cap && !n.tech) return undefined;
  return `[${[cap, n.tech].filter(Boolean).join(': ')}]`;
}

/** Calcula tamaño y bloques de texto de un nodo hoja. */
export function sizeNode(n: Node, d: Diagram): Omit<LNode, 'x' | 'y' | 'parent' | 'depth'> {
  const dens = DENSITY[d.density] ?? DENSITY.normal;
  const st = styleOf(n.kind);
  const maxW = dens.maxTextW;
  const blocks: TextBlock[] = [];
  let truncated = false;
  const add = (text: string | undefined, style: TextStyle, color: 'text' | 'sub', maxLines: number) => {
    if (!text) return;
    const r = wrap(text, style, maxW, maxLines);
    truncated ||= r.truncated;
    blocks.push({ lines: r.lines, widths: r.lines.map((l) => textWidth(l, style.size, style.weight)), style, color, y: 0 });
  };
  add(n.label, TYPE.label, 'text', 3);
  add(captionFor(n, d), TYPE.caption, 'sub', 2);
  add(n.desc, TYPE.desc, 'sub', 4);
  let cy = 0;
  blocks.forEach((b, i) => { if (i) cy += GAP + (i === 2 ? 3 : 0); b.y = cy; cy += b.lines.length * b.style.lineHeight; });
  const cw = Math.max(...blocks.map((b) => Math.max(...b.widths)));
  const ch = cy;
  let w = cw + 2 * PAD_X, h = ch + 2 * PAD_Y;
  let cx = PAD_X, cyy = PAD_Y;
  const flow = d.type === 'flow';
  const minW = flow ? 96 : 132, minH = flow ? 40 : 52;
  switch (st.shape) {
    case 'diamond': { w = Math.max(2 * cw + 24, 120); h = Math.max(2 * ch + 16, 64); break; }
    case 'pill': { w = Math.max(cw + h + 8, 96); break; }
    case 'cylinder': { h += 14; cyy += 10; break; }
    case 'pipe': { w += 24; break; }
    case 'person': { h += 22; cyy += 22; break; }
    case 'parallelogram': { w += 24; break; }
    case 'hexagon': { w += 28; break; }
  }
  w = Math.max(minW, Math.ceil(w / 4) * 4);
  h = Math.max(minH, Math.ceil(h / 2) * 2);
  // centrar contenido
  cx = (w - cw) / 2;
  if (st.shape === 'diamond') cyy = (h - ch) / 2;
  else if (st.shape === 'cylinder') cyy = 10 + (h - 10 - ch) / 2;
  else if (st.shape === 'person') cyy = 22 + (h - 22 - ch) / 2;
  else cyy = (h - ch) / 2;
  return { id: n.id, kind: n.kind, group: false, w, h, shape: st.shape, role: st.role, blocks, content: { x: cx, y: cyy, w: cw, h: ch }, truncated };
}

function sizeGroupLabel(n: Node): Pick<LNode, 'blocks' | 'content' | 'truncated'> & { minW: number } {
  const r = wrap(n.label, TYPE.group, 360, 1);
  const cap = n.tech || n.kind === 'boundary' ? wrap(n.tech ? `[${n.tech}]` : '', TYPE.caption, 360, 1) : null;
  const blocks: TextBlock[] = [{ lines: r.lines, widths: r.lines.map((l) => textWidth(l, TYPE.group.size, TYPE.group.weight)), style: TYPE.group, color: 'text', y: 0 }];
  if (cap && cap.lines.length && cap.lines[0]) blocks.push({ lines: cap.lines, widths: cap.lines.map((l) => textWidth(l, TYPE.caption.size, TYPE.caption.weight)), style: TYPE.caption, color: 'sub', y: TYPE.group.lineHeight });
  const cw = Math.max(...blocks.map((b) => Math.max(...b.widths)));
  return { blocks, content: { x: 12, y: 10, w: cw, h: blocks.length > 1 ? 30 : 16 }, truncated: r.truncated, minW: cw + 24 };
}

const ELK_DIR: Record<string, string> = { TB: 'DOWN', LR: 'RIGHT', BT: 'UP', RL: 'LEFT' };

export function edgeLabelBox(text: string): { w: number; h: number; lines: string[] } {
  const r = wrap(text, TYPE.edge, 150, 3);
  return { w: Math.ceil(r.width) + 8, h: r.lines.length * TYPE.edge.lineHeight + 4, lines: r.lines };
}

function percentile(xs: number[], p: number) { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; }

export async function layout(d: Diagram, opts: LayoutOptions = {}): Promise<Layout> {
  const o = { ...DEFAULTS, ...opts };
  const t0 = performance.now();
  const dens = DENSITY[d.density] ?? DENSITY.normal;
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const sized = new Map<string, ReturnType<typeof sizeNode>>();
  for (const n of d.nodes) if (!n.group) sized.set(n.id, sizeNode(n, d));
  if (o.uniformWidth && d.type !== 'flow') {
    // ritmo visual: anchos homogéneos (p75) sin inflar los nodos pequeños en exceso
    const target = percentile([...sized.values()].filter((s) => s.shape !== 'person' && s.shape !== 'diamond').map((s) => s.w), 0.75);
    for (const s of sized.values()) if (s.w < target && s.shape !== 'diamond') { s.content.x += (target - s.w) / 2; s.w = target; }
  }
  const depthOf = (id: string) => { let k = 0; let p = byId.get(id)?.in; while (p) { k++; p = byId.get(p)?.in; } return k; };

  const res = o.engine === 'dagre' ? await layoutDagre(d, sized, o) : await layoutElk(d, sized, o, dens);
  const nodes: LNode[] = [];
  for (const n of d.nodes) {
    const g = res.pos.get(n.id);
    if (!g) continue;
    if (n.group) {
      const gl = sizeGroupLabel(n);
      nodes.push({ id: n.id, kind: n.kind, group: true, parent: n.in, depth: depthOf(n.id), x: g.x, y: g.y, w: g.w, h: g.h, shape: 'rect', role: 'neutral', blocks: gl.blocks, content: gl.content, truncated: gl.truncated });
    } else {
      const s = sized.get(n.id)!;
      nodes.push({ ...s, parent: n.in, depth: depthOf(n.id), x: g.x, y: g.y });
    }
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: LEdge[] = res.edges.map((e) => {
    const src = d.edges.find((x) => x.id === e.id)!;
    let pts = e.points;
    if (o.clipToShape && pts.length >= 2) {
      pts = clipEnd(pts, nodeById.get(src.to)!);
      pts = clipEnd([...pts].reverse() as P[], nodeById.get(src.from)!).reverse() as P[];
    }
    return { id: e.id, from: src.from, to: src.to, points: pts, label: e.label, style: src.style, dir: src.dir, curved: e.curved };
  });
  // normalizar a origen (0,0) + margen
  const M = 24;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  nodes.forEach((n) => { grow(n.x, n.y); grow(n.x + n.w, n.y + n.h); });
  edges.forEach((e) => { e.points.forEach(([x, y]) => grow(x, y)); if (e.label) { grow(e.label.x, e.label.y); grow(e.label.x + e.label.w, e.label.y + e.label.h); } });
  const titleH = d.title ? 34 : 0;
  const dx = M - minX, dy = M + titleH - minY;
  nodes.forEach((n) => { n.x = round(n.x + dx); n.y = round(n.y + dy); });
  edges.forEach((e) => { e.points = e.points.map(([x, y]) => [round(x + dx), round(y + dy)] as P); if (e.label) { e.label.x = round(e.label.x + dx); e.label.y = round(e.label.y + dy); } });
  return { width: round(maxX - minX + 2 * M), height: round(maxY - minY + 2 * M + titleH), nodes, edges, engine: res.engine, ms: performance.now() - t0, title: d.title, theme: d.theme, type: d.type };
}
const round = (v: number) => Math.round(v * 10) / 10;

type EngineResult = { engine: string; pos: Map<string, { x: number; y: number; w: number; h: number }>; edges: { id: string; points: P[]; label?: LLabel; curved?: boolean }[] };

async function layoutElk(d: Diagram, sized: Map<string, ReturnType<typeof sizeNode>>, o: Required<LayoutOptions>, dens: (typeof DENSITY)['normal']): Promise<EngineResult> {
  const children = new Map<string | undefined, any[]>();
  const elkNodes = new Map<string, any>();
  const firstIds = new Set(d.constraints.filter((c) => c.type === 'first').flatMap((c) => c.ids));
  const lastIds = new Set(d.constraints.filter((c) => c.type === 'last').flatMap((c) => c.ids));
  for (const n of d.nodes) {
    const s = sized.get(n.id);
    const en: any = { id: n.id, layoutOptions: {} as Record<string, string> };
    if (s) { en.width = s.w; en.height = s.h; }
    else {
      const gl = sizeGroupLabel(n);
      en.layoutOptions['elk.padding'] = `[top=${GROUP_PAD.top},left=${GROUP_PAD.side},bottom=${GROUP_PAD.bottom},right=${GROUP_PAD.side}]`;
      en.layoutOptions['elk.nodeSize.constraints'] = 'MINIMUM_SIZE';
      en.layoutOptions['elk.nodeSize.minimum'] = `(${Math.ceil(gl.minW)},60)`;
      en.children = [];
    }
    if (firstIds.has(n.id)) en.layoutOptions['elk.layered.layering.layerConstraint'] = 'FIRST';
    if (lastIds.has(n.id)) en.layoutOptions['elk.layered.layering.layerConstraint'] = 'LAST';
    elkNodes.set(n.id, en);
    const parent = n.in && d.nodes.some((g) => g.id === n.in && g.group) ? n.in : undefined;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(en);
  }
  for (const [pid, list] of children) if (pid) elkNodes.get(pid).children = list;
  if (o.previous) {
    // modo estable: posiciones previas como pistas; los nodos nuevos se colocan junto a sus vecinos
    const prev = new Map(o.previous.nodes.map((n) => [n.id, n]));
    const center = (id: string) => { const p = prev.get(id); return p ? [p.x + p.w / 2, p.y + p.h / 2] : undefined; };
    let maxX = 0; for (const p of prev.values()) maxX = Math.max(maxX, p.x + p.w);
    for (const n of d.nodes) {
      const en = elkNodes.get(n.id);
      let c = center(n.id);
      if (!c) {
        const nb = d.edges.filter((e) => e.from === n.id || e.to === n.id).map((e) => center(e.from === n.id ? e.to : e.from)).filter(Boolean) as number[][];
        c = nb.length ? [nb.reduce((s, p) => s + p[0], 0) / nb.length + 1, nb.reduce((s, p) => s + p[1], 0) / nb.length + 1] : [maxX + 100, 0];
      }
      en.x = c[0] - (en.width ?? 0) / 2; en.y = c[1] - (en.height ?? 0) / 2;
      en.layoutOptions['elk.position'] = `(${en.x.toFixed(1)},${en.y.toFixed(1)})`;
    }
  }
  const valid = new Set(d.nodes.map((n) => n.id));
  const edges = d.edges.filter((e) => valid.has(e.from) && valid.has(e.to)).map((e) => {
    const ee: any = { id: e.id, sources: [e.from], targets: [e.to] };
    if (e.label && o.labelsAsObstacles) {
      const lb = edgeLabelBox(e.label + (e.tech ? ` [${e.tech}]` : ''));
      // en decisiones la etiqueta ("sí"/"no") pertenece a la salida: junto al origen
      const fromDecision = d.nodes.find((x) => x.id === e.from)?.kind === 'decision';
      ee.labels = [{ id: e.id + ':l', text: e.label, width: lb.w, height: lb.h, layoutOptions: { 'elk.edgeLabels.placement': fromDecision ? 'TAIL' : 'CENTER', ...(o.inlineLabels ? { 'elk.edgeLabels.inline': 'true' } : {}) } }];
    }
    return ee;
  });
  const root = {
    id: '__root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIR[d.dir] ?? 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.json.edgeCoords': 'ROOT',
      'elk.json.shapeCoords': 'ROOT',
      'elk.spacing.nodeNode': String(dens.nodeNode),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(dens.between),
      'elk.spacing.edgeNode': String(dens.edgeNode),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(dens.edgeNode),
      'elk.spacing.edgeEdge': String(dens.edgeEdge),
      'elk.layered.spacing.edgeEdgeBetweenLayers': String(dens.edgeEdge),
      'elk.spacing.edgeLabel': '4',
      'elk.spacing.labelNode': '8',
      'elk.spacing.componentComponent': String(dens.between),
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.thoroughness': '12',
      'elk.layered.unnecessaryBendpoints': 'false',
      'elk.layered.edgeRouting.selfLoopDistribution': 'EQUALLY',
      'elk.layered.mergeEdges': 'false',
      'elk.randomSeed': '7',
      ...(o.previous ? { 'elk.layered.cycleBreaking.strategy': 'INTERACTIVE', 'elk.layered.layering.strategy': 'INTERACTIVE', 'elk.layered.crossingMinimization.semiInteractive': 'true' } : {}),
      ...(o.modelOrder && !o.previous ? { 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.layered.considerModelOrder.crossingCounterNodeInfluence': '0.001' } : {}),
    },
    children: children.get(undefined) ?? [],
    edges,
  };
  let out;
  try { out = await elk.layout(root); } catch (err: any) { throw new Error("ELK: " + String(err?.message ?? err).slice(0, 300)); }
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  const walk = (n: any) => { for (const c of n.children ?? []) { pos.set(c.id, { x: c.x, y: c.y, w: c.width, h: c.height }); walk(c); } };
  walk(out);
  const resEdges: EngineResult['edges'] = [];
  const collect = (n: any) => {
    for (const e of n.edges ?? []) {
      const pts: P[] = [];
      for (const s of e.sections ?? []) {
        if (!pts.length) pts.push([s.startPoint.x, s.startPoint.y]);
        for (const b of s.bendPoints ?? []) pts.push([b.x, b.y]);
        pts.push([s.endPoint.x, s.endPoint.y]);
      }
      const src = d.edges.find((x) => x.id === e.id)!;
      let label: LLabel | undefined;
      if (src.label) {
        const lb = edgeLabelBox(src.label + (src.tech ? ` [${src.tech}]` : ''));
        const l = e.labels?.[0];
        if (l && l.x !== undefined) label = { x: l.x, y: l.y, w: lb.w, h: lb.h, lines: lb.lines };
        else label = midpointLabel(pts, lb);
      }
      resEdges.push({ id: e.id, points: simplify(pts), label });
    }
    for (const c of n.children ?? []) collect(c);
  };
  collect(out);
  return { engine: 'elk-layered', pos, edges: resEdges };
}

/** Etiqueta colocada a posteriori en el punto medio del trazado (como hacen muchas herramientas). */
function midpointLabel(pts: P[], lb: { w: number; h: number; lines: string[] }): LLabel {
  let total = 0; const segs: number[] = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
  let half = total / 2, i = 0;
  while (i < segs.length - 1 && half > segs[i]) { half -= segs[i]; i++; }
  const [ax, ay] = pts[i], [bx, by] = pts[i + 1] ?? pts[i];
  const t = segs[i] ? half / segs[i] : 0;
  const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
  return { x: mx - lb.w / 2, y: my - lb.h / 2, w: lb.w, h: lb.h, lines: lb.lines };
}

function simplify(pts: P[]): P[] {
  const out: P[] = [];
  for (const p of pts) {
    if (out.length && Math.abs(out[out.length - 1][0] - p[0]) < 0.01 && Math.abs(out[out.length - 1][1] - p[1]) < 0.01) continue;
    if (out.length >= 2) {
      const [a, b] = [out[out.length - 2], out[out.length - 1]];
      const col = (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - p[0]) < 0.01) || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - p[1]) < 0.01);
      if (col) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

async function layoutDagre(d: Diagram, sized: Map<string, ReturnType<typeof sizeNode>>, o: Required<LayoutOptions>): Promise<EngineResult> {
  const dagre = require('@dagrejs/dagre');
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: d.dir, nodesep: 44, ranksep: 72, edgesep: 14, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of d.nodes) {
    const s = sized.get(n.id);
    if (s) g.setNode(n.id, { width: s.w, height: s.h });
    else g.setNode(n.id, { label: n.label, paddingTop: GROUP_PAD.top, paddingLeft: GROUP_PAD.side, paddingRight: GROUP_PAD.side, paddingBottom: GROUP_PAD.bottom });
  }
  for (const n of d.nodes) if (n.in) g.setParent(n.id, n.in);
  for (const e of d.edges) {
    const lb = e.label ? edgeLabelBox(e.label + (e.tech ? ` [${e.tech}]` : '')) : undefined;
    // dagre no admite aristas hacia/desde clusters: se omiten (limitación real conocida)
    if (d.nodes.find((n) => n.id === e.from)?.group || d.nodes.find((n) => n.id === e.to)?.group) continue;
    g.setEdge(e.from, e.to, lb && o.labelsAsObstacles ? { width: lb.w, height: lb.h, labelpos: 'c' } : {}, e.id);
  }
  dagre.layout(g);
  const pos = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const id of g.nodes()) { const n = g.node(id); if (n) pos.set(id, { x: n.x - n.width / 2, y: n.y - n.height / 2, w: n.width, h: n.height }); }
  const edges: EngineResult['edges'] = [];
  for (const ed of g.edges()) {
    const e = g.edge(ed);
    const src = d.edges.find((x) => x.id === ed.name)!;
    const pts = (e.points as { x: number; y: number }[]).map((p) => [p.x, p.y] as P);
    let label: LLabel | undefined;
    if (src.label) {
      const lb = edgeLabelBox(src.label + (src.tech ? ` [${src.tech}]` : ''));
      label = e.x !== undefined && o.labelsAsObstacles ? { x: e.x - lb.w / 2, y: e.y - lb.h / 2, w: lb.w, h: lb.h, lines: lb.lines } : midpointLabel(pts, lb);
    }
    edges.push({ id: ed.name, points: pts, label, curved: true });
  }
  return { engine: 'dagre', pos, edges };
}

// ------------------------------------------------------------ geometría de formas
export function outline(n: LNode): P[] {
  const { x, y, w, h } = n;
  switch (n.shape) {
    case 'diamond': return [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
    case 'hexagon': return [[x + 14, y], [x + w - 14, y], [x + w, y + h / 2], [x + w - 14, y + h], [x + 14, y + h], [x, y + h / 2]];
    case 'parallelogram': return [[x + 12, y], [x + w, y], [x + w - 12, y + h], [x, y + h]];
    case 'pill': { const r = h / 2; const pts: P[] = []; for (let a = -90; a <= 90; a += 15) pts.push([x + w - r + r * Math.cos((a * Math.PI) / 180), y + r + r * Math.sin((a * Math.PI) / 180)]); for (let a = 90; a <= 270; a += 15) pts.push([x + r + r * Math.cos((a * Math.PI) / 180), y + r + r * Math.sin((a * Math.PI) / 180)]); return pts; }
    case 'cylinder': { const pts: P[] = []; const ry = 7; for (let a = 180; a <= 360; a += 15) pts.push([x + w / 2 + (w / 2) * Math.cos((a * Math.PI) / 180), y + ry + ry * Math.sin((a * Math.PI) / 180)]); pts.push([x + w, y + h - ry]); for (let a = 0; a <= 180; a += 15) pts.push([x + w / 2 + (w / 2) * Math.cos((a * Math.PI) / 180), y + h - ry + ry * Math.sin((a * Math.PI) / 180)]); pts.push([x, y + ry]); return pts; }
    default: return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }
}

function segInter(p: P, q: P, a: P, b: P): number | null {
  const r = [q[0] - p[0], q[1] - p[1]], s = [b[0] - a[0], b[1] - a[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / den;
  const u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/** Mueve el último punto a la primera intersección con el contorno real de la forma destino. */
export function clipEnd(pts: P[], n: LNode): P[] {
  if (!n || n.group || n.shape === 'rect' || n.shape === 'person' || n.shape === 'pipe') return pts;
  const prev = pts[pts.length - 2], end = pts[pts.length - 1];
  const dx = end[0] - prev[0], dy = end[1] - prev[1];
  const len = Math.hypot(dx, dy) || 1;
  const far: P = [end[0] + (dx / len) * (n.w + n.h), end[1] + (dy / len) * (n.w + n.h)];
  const poly = outline(n);
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const t = segInter(prev, far, poly[i], poly[(i + 1) % poly.length]);
    if (t !== null && (best === null || t < best)) best = t;
  }
  if (best === null) return pts;
  const hit: P = [prev[0] + (far[0] - prev[0]) * best, prev[1] + (far[1] - prev[1]) * best];
  return [...pts.slice(0, -1), hit];
}
