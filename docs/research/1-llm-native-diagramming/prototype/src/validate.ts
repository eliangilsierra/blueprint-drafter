// Validador geométrico + de legibilidad. Funciona sobre cualquier Layout (nuestro motor,
// dagre o geometría extraída de un SVG de terceros), por lo que sirve también como benchmark.
import type { Layout, LNode, LEdge, P } from './layout.ts';
import { outline } from './layout.ts';
import type { Diagnostic } from './model.ts';
import { THEMES, contrast, TYPE } from './theme.ts';

type R = { x: number; y: number; w: number; h: number };
const inter = (a: R, b: R, m = 0) => a.x < b.x + b.w - m && b.x < a.x + a.w - m && a.y < b.y + b.h - m && b.y < a.y + a.h - m;
const shrink = (r: R, k: number): R => ({ x: r.x + k, y: r.y + k, w: r.w - 2 * k, h: r.h - 2 * k });
const contains = (outer: R, inner: R, tol = 0.5) => inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;

/** ¿El segmento pq atraviesa el interior del rectángulo? (Liang–Barsky) */
export function segHitsRect(p: P, q: P, r: R): boolean {
  if (r.w <= 0 || r.h <= 0) return false;
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const clip = (pp: number, qq: number) => {
    if (Math.abs(pp) < 1e-12) return qq >= 0;
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (clip(-dx, p[0] - r.x) && clip(dx, r.x + r.w - p[0]) && clip(-dy, p[1] - r.y) && clip(dy, r.y + r.h - p[1])) return t1 - t0 > 1e-6;
  return false;
}

function segCross(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0; // cruce propio (no cuenta contactos en extremos)
}

function collinearOverlap(a: P, b: P, c: P, d: P): number {
  const H = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(c[1] - d[1]) < 0.5 && Math.abs(a[1] - c[1]) < 1.5;
  const V = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(c[0] - d[0]) < 0.5 && Math.abs(a[0] - c[0]) < 1.5;
  if (H) return Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) - Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0]));
  if (V) return Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) - Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1]));
  return 0;
}

function distToPolyline(pt: P, pts: P[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = l2 ? Math.max(0, Math.min(1, ((pt[0] - ax) * (bx - ax) + (pt[1] - ay) * (by - ay)) / l2)) : 0;
    best = Math.min(best, Math.hypot(pt[0] - (ax + t * (bx - ax)), pt[1] - (ay + t * (by - ay))));
  }
  return best;
}

function distToOutline(pt: P, n: LNode): number {
  const poly = outline(n);
  return distToPolyline(pt, [...poly, poly[0]]);
}

export type Metrics = {
  nodes: number; edges: number;
  nodeOverlaps: number; textOverflow: number; textTruncated: number; textChecked: number;
  edgeThroughNode: number; edgeThroughGroup: number; crossings: number; edgeOverlaps: number;
  labelOverlapNode: number; labelOverlapLabel: number; labelOnEdge: number; labelDetached: number; labelAmbiguous: number; detours: number; hugging: number;
  endpointGaps: number; shortArrows: number; containment: number; tooClose: number;
  minGap: number; width: number; height: number; aspect: number; fitScale: number; minFontAtFit: number;
  errors: number; warnings: number; infos: number;
};

export type ValidateOptions = { fitWidth?: number; fitHeight?: number; minFontPx?: number; minGap?: number };

export function validateLayout(L: Layout, opts: ValidateOptions = {}): { diags: Diagnostic[]; metrics: Metrics } {
  const fitW = opts.fitWidth ?? 1600, fitH = opts.fitHeight ?? 1000, minFont = opts.minFontPx ?? 8, minGapReq = opts.minGap ?? 12;
  const diags: Diagnostic[] = [];
  const add = (d: Diagnostic) => diags.push(d);
  const byId = new Map(L.nodes.map((n) => [n.id, n]));
  const ancestors = (id: string) => { const s = new Set<string>(); let p = byId.get(id)?.parent; while (p) { s.add(p); p = byId.get(p)?.parent; } return s; };
  const anc = new Map(L.nodes.map((n) => [n.id, ancestors(n.id)]));
  const leaves = L.nodes.filter((n) => !n.group);
  const groups = L.nodes.filter((n) => n.group);
  const m: Metrics = { nodes: leaves.length, edges: L.edges.length, nodeOverlaps: 0, textOverflow: 0, textTruncated: 0, textChecked: 0, edgeThroughNode: 0, edgeThroughGroup: 0, crossings: 0, edgeOverlaps: 0, labelOverlapNode: 0, labelOverlapLabel: 0, labelOnEdge: 0, labelDetached: 0, labelAmbiguous: 0, detours: 0, hugging: 0, endpointGaps: 0, shortArrows: 0, containment: 0, tooClose: 0, minGap: Infinity, width: L.width, height: L.height, aspect: 0, fitScale: 1, minFontAtFit: 0, errors: 0, warnings: 0, infos: 0 };

  // --- nodos: solapes, separación, contención
  const related = (a: LNode, b: LNode) => anc.get(a.id)!.has(b.id) || anc.get(b.id)!.has(a.id);
  for (let i = 0; i < L.nodes.length; i++) for (let j = i + 1; j < L.nodes.length; j++) {
    const a = L.nodes[i], b = L.nodes[j];
    if (related(a, b)) continue;
    if (inter(a, b, 0.5)) {
      m.nodeOverlaps++;
      add({ sev: 'error', code: 'E_NODE_OVERLAP', ids: [a.id, b.id], msg: `'${a.id}' overlaps '${b.id}'`, auto: true, fix: 're-run layout (do not set manual positions)' });
    } else if (!a.group && !b.group) {
      const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      const gap = Math.max(gx, gy);
      m.minGap = Math.min(m.minGap, gap);
      if (gap < minGapReq) { m.tooClose++; add({ sev: 'warning', code: 'W_NODES_TOO_CLOSE', ids: [a.id, b.id], msg: `'${a.id}' and '${b.id}' are ${gap.toFixed(0)}px apart (< ${minGapReq})`, auto: true }); }
    }
  }
  for (const n of L.nodes) {
    if (!n.parent) continue;
    const p = byId.get(n.parent);
    if (p && !contains(p, n)) { m.containment++; add({ sev: 'error', code: 'E_OUTSIDE_PARENT', ids: [n.id, p.id], msg: `'${n.id}' extends outside its group '${p.id}'`, auto: true }); }
  }

  // --- texto: desbordes y truncados (comprobación contra la forma real)
  for (const n of L.nodes) {
    m.textChecked++;
    if (n.truncated) { m.textTruncated++; add({ sev: 'warning', code: 'W_TEXT_TRUNCATED', ids: [n.id], msg: `text of '${n.id}' was shortened with an ellipsis`, fix: `shorten label or move detail to desc=` }); }
    const c = { x: n.x + n.content.x, y: n.y + n.content.y, w: n.content.w, h: n.content.h };
    let overflow = false;
    for (const b of n.blocks) for (const w of b.widths) if (w > n.content.w + 0.5) overflow = true;
    if (!n.group) {
      if (!contains(n, c, 0.5)) overflow = true;
      if (n.shape === 'diamond' && c.w / n.w + c.h / n.h > 1.0001) overflow = true;
    } else if (c.w > n.w - 16) overflow = true;
    if (overflow) { m.textOverflow++; add({ sev: 'error', code: 'E_TEXT_OVERFLOW', ids: [n.id], msg: `text does not fit inside '${n.id}'`, auto: true }); }
  }

  // --- conectores
  const segs = L.edges.map((e) => e.points.slice(1).map((p, i) => [e.points[i], p] as [P, P]));
  L.edges.forEach((e, ei) => {
    const src = byId.get(e.from), dst = byId.get(e.to);
    if (!src || !dst || e.points.length < 2) { add({ sev: 'error', code: 'E_EDGE_UNROUTED', ids: [e.id], msg: `edge '${e.id}' has no valid route` }); return; }
    const okIds = new Set([e.from, e.to, ...anc.get(e.from)!, ...anc.get(e.to)!]);
    const through = new Set<string>(), throughG = new Set<string>();
    for (const [p, q] of segs[ei]) {
      for (const n of leaves) if (!okIds.has(n.id) && segHitsRect(p, q, shrink(n, 1))) through.add(n.id);
      for (const g of groups) if (!okIds.has(g.id) && segHitsRect(p, q, shrink(g, 1))) throughG.add(g.id);
    }
    for (const id of through) { m.edgeThroughNode++; add({ sev: 'error', code: 'E_EDGE_THROUGH_NODE', ids: [e.id, id], msg: `edge '${e.id}' passes through '${id}'`, auto: true }); }
    for (const id of throughG) { m.edgeThroughGroup++; add({ sev: 'warning', code: 'W_EDGE_THROUGH_GROUP', ids: [e.id, id], msg: `edge '${e.id}' crosses group '${id}' that contains neither end`, fix: 'consider moving one end into/out of the group' }); }
    // rodeos: longitud real frente a la distancia Manhattan entre centros (aristas que rodean el diagrama)
    if (L.type !== 'sequence' && e.from !== e.to) {
      let len = 0; for (const [p, q] of segs[ei]) len += Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
      const man = Math.abs(src.x + src.w / 2 - dst.x - dst.w / 2) + Math.abs(src.y + src.h / 2 - dst.y - dst.h / 2);
      const diag = L.width + L.height;
      if (len - man > Math.max(300, 0.35 * diag)) { // umbral heurístico: calibrar con evaluación humana
        m.detours++;
        const grp = [...anc.get(e.to)!, ...anc.get(e.from)!].filter((g) => byId.get(g)?.group)[0];
        add({ sev: 'warning', code: 'W_EDGE_DETOUR', ids: [e.id], msg: `edge '${e.id}' takes a ${Math.round(len)}px detour (direct ≈ ${Math.round(man)}px)`, fix: grp ? `grouping forces this; consider ~node ${anc.get(e.to)!.has(grp) ? e.to : e.from} in= (leave '${grp}') or dir change` : 'consider reversing the relationship or changing dir' });
      }
    }
    // conectores pegados a nodos ajenos (legibles pero visualmente ambiguos)
    for (const [p, q] of segs[ei]) for (const n of leaves) {
      if (okIds.has(n.id)) continue;
      const near = segHitsRect(p, q, { x: n.x - 6, y: n.y - 6, w: n.w + 12, h: n.h + 12 });
      if (near && !segHitsRect(p, q, shrink(n, 1))) { m.hugging++; add({ sev: 'info', code: 'I_EDGE_HUGS_NODE', ids: [e.id, n.id], msg: `edge '${e.id}' runs within 6px of '${n.id}'`, auto: true }); }
    }
    // extremos: deben tocar el contorno real (flechas que "no llegan" o se hunden en la forma)
    const first = e.points[0], last = e.points[e.points.length - 1];
    const seqX = (n: LNode) => n.x + n.w / 2;
    const g1 = L.type === 'sequence' ? Math.abs(first[0] - seqX(src)) : src.group ? distToPolyline(first, [[src.x, src.y], [src.x + src.w, src.y], [src.x + src.w, src.y + src.h], [src.x, src.y + src.h], [src.x, src.y]]) : distToOutline(first, src);
    const g2 = L.type === 'sequence' ? Math.abs(last[0] - seqX(dst)) : dst.group ? distToPolyline(last, [[dst.x, dst.y], [dst.x + dst.w, dst.y], [dst.x + dst.w, dst.y + dst.h], [dst.x, dst.y + dst.h], [dst.x, dst.y]]) : distToOutline(last, dst);
    const tol = e.curved ? 4 : 2;
    if (g1 > tol || g2 > tol) { m.endpointGaps++; add({ sev: 'error', code: 'E_EDGE_ENDPOINT_GAP', ids: [e.id], msg: `edge '${e.id}' does not touch ${g2 > tol ? `'${e.to}'` : `'${e.from}'`} (gap ${Math.max(g1, g2).toFixed(1)}px)`, auto: true }); }
    const [pa, pb] = segs[ei][segs[ei].length - 1];
    if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) < 10 && e.dir !== 'none') { m.shortArrows++; add({ sev: 'warning', code: 'W_ARROW_TOO_SHORT', ids: [e.id], msg: `last segment of '${e.id}' is shorter than the arrowhead; direction may be unclear`, auto: true }); }
    // etiquetas
    if (e.label) {
      const lr = e.label;
      for (const n of leaves) if (inter(lr, n, 0.5)) { m.labelOverlapNode++; add({ sev: 'error', code: 'E_LABEL_OVERLAPS_NODE', ids: [e.id, n.id], msg: `label of '${e.id}' overlaps '${n.id}'`, auto: true }); }
      for (const g of groups) { const band = { x: g.x, y: g.y, w: g.w, h: 32 }; if (inter(lr, band, 0.5) && !okIds.has(g.id)) { m.labelOverlapNode++; add({ sev: 'error', code: 'E_LABEL_OVERLAPS_NODE', ids: [e.id, g.id], msg: `label of '${e.id}' overlaps title of group '${g.id}'`, auto: true }); } }
      const center: P = [lr.x + lr.w / 2, lr.y + lr.h / 2];
      const dist = distToPolyline(center, e.points);
      if (dist > Math.max(lr.w, lr.h) / 2 + 14) { m.labelDetached++; add({ sev: 'warning', code: 'W_LABEL_DETACHED', ids: [e.id], msg: `label of '${e.id}' is ${dist.toFixed(0)}px from its connector (ambiguous ownership)` }); }
      // ambigüedad: la etiqueta está tan cerca (o más) de otro conector que del suyo
      let nearest = Infinity, nearestId = '';
      L.edges.forEach((o, oi) => { if (oi === ei) return; const dd = distToPolyline(center, o.points); if (dd < nearest) { nearest = dd; nearestId = o.id; } });
      if (nearest < 40 && nearest < dist + 6 && !(L.edges.find((x) => x.id === nearestId)!.from === e.from && L.type !== 'flow' && Math.abs(nearest - dist) < 1)) { m.labelAmbiguous++; add({ sev: 'warning', code: 'W_LABEL_AMBIGUOUS', ids: [e.id, nearestId], msg: `label of '${e.id}' is as close to '${nearestId}' (${nearest.toFixed(0)}px) as to its own connector (${dist.toFixed(0)}px)`, auto: true }); }
      L.edges.forEach((o, oi) => {
        if (oi === ei) return;
        if (o.label && oi > ei && inter(lr, o.label, 0.5)) { m.labelOverlapLabel++; add({ sev: 'error', code: 'E_LABEL_OVERLAPS_LABEL', ids: [e.id, o.id], msg: `labels of '${e.id}' and '${o.id}' overlap`, auto: true }); }
        if (segs[oi].some(([p, q]) => segHitsRect(p, q, shrink(lr, 1)))) { m.labelOnEdge++; add({ sev: 'warning', code: 'W_LABEL_ON_EDGE', ids: [e.id, o.id], msg: `edge '${o.id}' runs through the label of '${e.id}'`, auto: true }); }
      });
    }
  });

  // cruces y solapes colineales entre conectores distintos
  for (let i = 0; i < L.edges.length; i++) for (let j = i + 1; j < L.edges.length; j++) {
    const a = L.edges[i], b = L.edges[j];
    const shareEnd = a.from === b.from || a.to === b.to || a.from === b.to || a.to === b.from;
    let crosses = 0, overlap = 0;
    for (const [p, q] of segs[i]) for (const [r, s] of segs[j]) { if (segCross(p, q, r, s)) crosses++; overlap = Math.max(overlap, collinearOverlap(p, q, r, s)); }
    m.crossings += crosses;
    // compartir tramo es legítimo si comparten extremo (bus/abanico); si no, es ambiguo
    if (overlap > 4 && !shareEnd) { m.edgeOverlaps++; add({ sev: 'warning', code: 'W_EDGE_OVERLAP', ids: [a.id, b.id], msg: `edges '${a.id}' and '${b.id}' run on top of each other for ${overlap.toFixed(0)}px`, auto: true }); }
  }
  const ratio = L.edges.length ? m.crossings / L.edges.length : 0;
  if (m.crossings) add({ sev: ratio > 0.5 ? 'warning' : 'info', code: ratio > 0.5 ? 'W_MANY_CROSSINGS' : 'I_CROSSINGS', ids: [], msg: `${m.crossings} edge crossings (${ratio.toFixed(2)} per edge)`, fix: ratio > 0.5 ? 'group related elements or split the view' : undefined });

  // composición y legibilidad al encajar en un lienzo de referencia
  m.aspect = Math.max(L.width / L.height, L.height / L.width);
  m.fitScale = Math.min(1, fitW / L.width, fitH / L.height);
  m.minFontAtFit = Math.min(TYPE.caption.size, TYPE.edge.size) * m.fitScale;
  if (m.minFontAtFit < minFont) add({ sev: 'warning', code: 'W_ILLEGIBLE_AT_FIT', ids: [], msg: `smallest text renders at ${m.minFontAtFit.toFixed(1)}px when fitted to ${fitW}x${fitH}`, fix: 'split into views (e.g. one per boundary) or switch dir' });
  if (m.aspect > 3) add({ sev: 'info', code: 'I_ASPECT', ids: [], msg: `aspect ratio ${m.aspect.toFixed(1)}:1`, fix: L.width > L.height ? 'try dir=TB' : 'try dir=LR' });
  if (leaves.length > 30) add({ sev: 'info', code: 'I_DENSITY', ids: [], msg: `${leaves.length} elements in one view; C4 suggests focused views`, fix: 'split by boundary' });
  if (m.minGap === Infinity) m.minGap = 0;

  // contraste del tema
  const th = THEMES[L.theme] ?? THEMES.light;
  for (const [role, t] of Object.entries(th.roles)) {
    if (contrast(t.text, t.fill) < 4.5) add({ sev: 'warning', code: 'W_LOW_CONTRAST', ids: [role], msg: `theme ${th.name}: ${role} text contrast ${contrast(t.text, t.fill).toFixed(1)} < 4.5` });
    if (contrast(t.sub, t.fill) < 4.5) add({ sev: 'warning', code: 'W_LOW_CONTRAST', ids: [role], msg: `theme ${th.name}: ${role} secondary text contrast ${contrast(t.sub, t.fill).toFixed(1)} < 4.5` });
  }
  for (const d of diags) d.sev === 'error' ? m.errors++ : d.sev === 'warning' ? m.warnings++ : m.infos++;
  return { diags, metrics: m };
}

/** Diagnóstico compacto: una línea por problema, pensado para consumir pocos tokens. */
export function formatDiags(diags: Diagnostic[], max = 20): string {
  const order = { error: 0, warning: 1, info: 2 } as const;
  const s = [...diags].sort((a, b) => order[a.sev] - order[b.sev]);
  const lines = s.slice(0, max).map((d) => `${d.sev[0].toUpperCase()} ${d.code} ${d.ids.join(',')}${d.ids.length ? ' ' : ''}— ${d.msg}${d.fix ? ` | fix: ${d.fix}` : ''}`);
  if (s.length > max) lines.push(`… ${s.length - max} more`);
  return lines.join('\n');
}
