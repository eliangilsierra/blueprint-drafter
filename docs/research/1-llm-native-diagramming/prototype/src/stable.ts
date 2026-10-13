// Edición estable ("reparación local"): conserva las coordenadas de lo que no cambió,
// inserta lo nuevo en espacio libre y re-enruta conectores con un enrutador ortogonal propio
// (A* sobre una rejilla de Hanan con penalización de giros, cruces y solapes).
// El validador arbitra: si la reparación introduce errores, se recurre a un re-layout completo.
import type { Diagram } from './model.ts';
import { sizeNode, edgeLabelBox, clipEnd, layout as freshLayout, type Layout, type LNode, type LEdge, type P, type LayoutOptions } from './layout.ts';
import { validateLayout } from './validate.ts';
import { DENSITY } from './theme.ts';

type R = { x: number; y: number; w: number; h: number };
const overl = (a: R, b: R, m = 0) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
const GROUP_PAD = { top: 40, side: 18, bottom: 18 };

/** Coloca nodos: conserva los existentes, inserta los nuevos cerca de sus vecinos, recalcula grupos. */
function place(d: Diagram, prev: Layout): Map<string, LNode> {
  const dens = DENSITY[d.density] ?? DENSITY.normal;
  const prevBy = new Map(prev.nodes.map((n) => [n.id, n]));
  const out = new Map<string, LNode>();
  const depthOf = (id: string) => { let k = 0; let p = d.nodes.find((n) => n.id === id)?.in; while (p) { k++; p = d.nodes.find((n) => n.id === p)?.in; } return k; };
  // 1) hojas existentes: mismo centro (el tamaño puede cambiar si cambió el texto)
  const leaves = d.nodes.filter((n) => !n.group);
  for (const n of leaves) {
    const p = prevBy.get(n.id);
    if (!p || p.group) continue;
    const s = sizeNode(n, d);
    const w = Math.max(s.w, p.w), cxOff = (w - s.w) / 2;
    out.set(n.id, { ...s, w, h: s.h, content: { ...s.content, x: s.content.x + cxOff }, parent: n.in, depth: depthOf(n.id), x: p.x + p.w / 2 - w / 2, y: p.y + p.h / 2 - s.h / 2 });
  }
  // 2) hojas nuevas: búsqueda en espiral alrededor del centroide de sus vecinos, en la dirección del flujo
  const horizontal = d.dir === 'LR' || d.dir === 'RL';
  for (const n of leaves) {
    if (out.has(n.id)) continue;
    const s = sizeNode(n, d);
    const nb = d.edges.filter((e) => e.from === n.id || e.to === n.id).map((e) => ({ other: out.get(e.from === n.id ? e.to : e.from), incoming: e.to === n.id })).filter((x) => x.other);
    let cx = 0, cy = 0;
    if (nb.length) {
      for (const { other, incoming } of nb) {
        const o = other!;
        const step = (horizontal ? o.w : o.h) / 2 + dens.between + (horizontal ? s.w : s.h) / 2;
        const sign = incoming ? 1 : -1;
        cx += o.x + o.w / 2 + (horizontal ? sign * step : 0);
        cy += o.y + o.h / 2 + (horizontal ? 0 : sign * step);
      }
      cx /= nb.length; cy /= nb.length;
    } else { cx = Math.max(...[...out.values()].map((o) => o.x + o.w)) + dens.between + s.w / 2; cy = 0; }
    const grp = n.in ? prevBy.get(n.in) : undefined;
    let best: { x: number; y: number; score: number } | undefined;
    for (let r = 0; r <= 1200 && !best; r += 12) {
      const cands: [number, number][] = r === 0 ? [[0, 0]] : [];
      for (let a = 0; a < 360 && r > 0; a += Math.max(6, 360 / (r / 6))) cands.push([r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)]);
      for (const [dx, dy] of cands) {
        const rect = { x: cx + dx - s.w / 2, y: cy + dy - s.h / 2, w: s.w, h: s.h };
        if ([...out.values()].some((o) => overl(rect, o, dens.nodeNode * 0.75))) continue;
        // no invadir grupos ajenos
        if (prev.nodes.some((g) => g.group && g.id !== n.in && !isAncestor(d, g.id, n.id) && overl(rect, g, 8))) continue;
        const inside = !grp || (rect.x >= grp.x + GROUP_PAD.side - 1 && rect.x + rect.w <= grp.x + grp.w - GROUP_PAD.side + 1 && rect.y >= grp.y + GROUP_PAD.top - 1 && rect.y + rect.h <= grp.y + grp.h - GROUP_PAD.bottom + 1);
        const score = Math.hypot(dx, dy) + (inside ? 0 : 400);
        if (!best || score < best.score) best = { x: rect.x, y: rect.y, score };
      }
      if (best && best.score > 400 && r < 600) best = undefined; // seguir buscando dentro del grupo
    }
    best ??= { x: cx - s.w / 2, y: cy - s.h / 2, score: 0 };
    out.set(n.id, { ...s, parent: n.in, depth: depthOf(n.id), x: best.x, y: best.y });
  }
  // 3) grupos: envolvente de sus descendientes (de dentro hacia fuera); los vacíos conservan su rectángulo
  const groups = d.nodes.filter((n) => n.group).sort((a, b) => depthOf(b.id) - depthOf(a.id));
  for (const g of groups) {
    const kids = [...out.values()].filter((k) => k.parent === g.id);
    const p = prevBy.get(g.id);
    let rect: R;
    if (kids.length) {
      const x0 = Math.min(...kids.map((k) => k.x)) - GROUP_PAD.side, y0 = Math.min(...kids.map((k) => k.y)) - GROUP_PAD.top;
      const x1 = Math.max(...kids.map((k) => k.x + k.w)) + GROUP_PAD.side, y1 = Math.max(...kids.map((k) => k.y + k.h)) + GROUP_PAD.bottom;
      rect = { x: x0, y: y0, w: Math.max(x1 - x0, p?.w ?? 0), h: y1 - y0 };
      if (p) { // conservar el marco anterior si sigue conteniendo a los hijos (menos cambio visual)
        const fits = p.x <= x0 && p.y <= y0 && p.x + p.w >= x1 && p.y + p.h >= y1;
        if (fits) rect = { x: p.x, y: p.y, w: p.w, h: p.h };
      }
    } else rect = p ? { x: p.x, y: p.y, w: p.w, h: p.h } : { x: 0, y: 0, w: 160, h: 80 };
    const base = p ?? ({ blocks: [], content: { x: 12, y: 10, w: 100, h: 16 }, truncated: false } as any);
    out.set(g.id, { id: g.id, kind: g.kind, group: true, parent: g.in, depth: depthOf(g.id), ...rect, shape: 'rect', role: 'neutral', blocks: base.blocks, content: base.content, truncated: base.truncated });
  }
  resolveOverlaps(d, out, dens.nodeNode);
  return out;
}

/** Empuja hermanos solapados (con todos sus descendientes) a lo largo del eje de menor penetración. */
function resolveOverlaps(d: Diagram, nodes: Map<string, LNode>, gap: number) {
  const desc = (id: string): LNode[] => [...nodes.values()].filter((n) => n.parent === id).flatMap((n) => [n, ...desc(n.id)]);
  const regrow = () => {
    const groups = [...nodes.values()].filter((n) => n.group).sort((a, b) => b.depth - a.depth);
    for (const g of groups) {
      const kids = [...nodes.values()].filter((k) => k.parent === g.id);
      if (!kids.length) continue;
      const x0 = Math.min(g.x, ...kids.map((k) => k.x - GROUP_PAD.side)), y0 = Math.min(g.y, ...kids.map((k) => k.y - GROUP_PAD.top));
      const x1 = Math.max(g.x + g.w, ...kids.map((k) => k.x + k.w + GROUP_PAD.side)), y1 = Math.max(g.y + g.h, ...kids.map((k) => k.y + k.h + GROUP_PAD.bottom));
      g.x = x0; g.y = y0; g.w = x1 - x0; g.h = y1 - y0;
    }
  };
  const horizontal = d.dir === 'LR' || d.dir === 'RL';
  for (let iter = 0; iter < 200; iter++) {
    regrow();
    const all = [...nodes.values()];
    let moved = false;
    outer: for (const a of all) for (const b of all) {
      if (a === b || a.parent !== b.parent) continue;
      const m = a.group || b.group ? 24 : gap * 0.75;
      if (!overl(a, b, m - 0.5)) continue;
      // mover el que está "después" en el sentido del flujo
      const ac = horizontal ? a.x + a.w / 2 : a.y + a.h / 2, bc = horizontal ? b.x + b.w / 2 : b.y + b.h / 2;
      const [fixed, mov] = ac <= bc ? [a, b] : [b, a];
      const px = fixed.x + fixed.w + m - mov.x, py = fixed.y + fixed.h + m - mov.y;
      const pxl = mov.x + mov.w + m - fixed.x, pyl = mov.y + mov.h + m - fixed.y;
      // eje principal del flujo primero; si la penetración transversal es mucho menor, usarla
      let dx = 0, dy = 0;
      const along = horizontal ? px : py, across = horizontal ? Math.min(py, pyl) : Math.min(px, pxl);
      if (across < along * 0.5) { if (horizontal) dy = py <= pyl ? py : -pyl; else dx = px <= pxl ? px : -pxl; }
      else if (horizontal) dx = px; else dy = py;
      for (const n of [mov, ...desc(mov.id)]) { n.x += dx; n.y += dy; }
      moved = true;
      break outer;
    }
    if (!moved) break;
  }
  regrow();
}

function isAncestor(d: Diagram, g: string, id: string): boolean {
  let p = d.nodes.find((n) => n.id === id)?.in;
  while (p) { if (p === g) return true; p = d.nodes.find((n) => n.id === p)?.in; }
  return false;
}

// ------------------------------------------------------------ enrutador ortogonal
type Seg = [P, P];
function segIntersectsRect(a: P, b: P, r: R): boolean {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  return x0 < r.x + r.w && x1 > r.x && y0 < r.y + r.h && y1 > r.y;
}

export function routeAll(d: Diagram, nodes: Map<string, LNode>, margin = 14): LEdge[] {
  const leaves = [...nodes.values()].filter((n) => !n.group);
  const groups = [...nodes.values()].filter((n) => n.group);
  const routed: Seg[] = [];
  const usedSlots = new Map<string, number>();
  const edges: LEdge[] = [];
  const ancestors = (id: string) => { const s = new Set<string>(); let p = nodes.get(id)?.parent; while (p) { s.add(p); p = nodes.get(p)?.parent; } return s; };
  for (const e of d.edges) {
    const s = nodes.get(e.from), t = nodes.get(e.to);
    if (!s || !t) continue;
    const okGroups = new Set([...ancestors(e.from), ...ancestors(e.to), e.from, e.to]);
    const obstacles = leaves.filter((n) => n.id !== e.from && n.id !== e.to).map((n) => ({ x: n.x - margin, y: n.y - margin, w: n.w + 2 * margin, h: n.h + 2 * margin }));
    const ownS = { x: s.x - 1, y: s.y - 1, w: s.w + 2, h: s.h + 2 }, ownT = { x: t.x - 1, y: t.y - 1, w: t.w + 2, h: t.h + 2 };
    const softGroups = groups.filter((g) => !okGroups.has(g.id));
    // puertos: siguiente ranura libre de cada lado
    const ports = (n: LNode, role: string) => (['N', 'S', 'E', 'W'] as const).map((side) => {
      const k = usedSlots.get(n.id + side) ?? 0;
      const frac = [0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6][k % 7];
      const bx = side === 'E' ? n.x + n.w : side === 'W' ? n.x : n.x + n.w * frac;
      const by = side === 'S' ? n.y + n.h : side === 'N' ? n.y : n.y + n.h * frac;
      const off = margin + 2;
      const stub: P = [bx + (side === 'E' ? off : side === 'W' ? -off : 0), by + (side === 'S' ? off : side === 'N' ? -off : 0)];
      return { side, border: [bx, by] as P, stub, key: n.id + side, role };
    });
    const sp = ports(s, 'src'), tp = ports(t, 'dst');
    // rejilla de Hanan
    const xs = new Set<number>(), ys = new Set<number>();
    for (const o of obstacles) { xs.add(o.x); xs.add(o.x + o.w); ys.add(o.y); ys.add(o.y + o.h); }
    for (const p of [...sp, ...tp]) { xs.add(p.stub[0]); ys.add(p.stub[1]); }
    for (const g of softGroups) { xs.add(g.x - margin); xs.add(g.x + g.w + margin); ys.add(g.y - margin); ys.add(g.y + g.h + margin); }
    const sx = [...xs].sort((a, b) => a - b), sy = [...ys].sort((a, b) => a - b);
    const mid = (arr: number[]) => arr.flatMap((v, i) => (i ? [(arr[i - 1] + v) / 2, v] : [v]));
    const X = mid(sx), Y = mid(sy);
    const blocked = (p: P) => obstacles.some((o) => p[0] > o.x && p[0] < o.x + o.w && p[1] > o.y && p[1] < o.y + o.h) || (p[0] > ownS.x && p[0] < ownS.x + ownS.w && p[1] > ownS.y && p[1] < ownS.y + ownS.h) || (p[0] > ownT.x && p[0] < ownT.x + ownT.w && p[1] > ownT.y && p[1] < ownT.y + ownT.h);
    const key = (i: number, j: number) => i * 100000 + j;
    const xi = new Map(X.map((v, i) => [v, i])), yi = new Map(Y.map((v, i) => [v, i]));
    const targets = new Map(tp.map((p) => [key(xi.get(p.stub[0])!, yi.get(p.stub[1])!), p]));
    // A* con estado (punto, dirección)
    type St = { i: number; j: number; dir: number; g: number; f: number; prev?: St; port?: (typeof sp)[number] };
    const open: St[] = [];
    const best = new Map<string, number>();
    const tc = [t.x + t.w / 2, t.y + t.h / 2];
    const h = (i: number, j: number) => Math.abs(X[i] - tc[0]) + Math.abs(Y[j] - tc[1]);
    for (const p of sp) { const i = xi.get(p.stub[0])!, j = yi.get(p.stub[1])!; const dir = p.side === 'N' || p.side === 'S' ? 1 : 0; open.push({ i, j, dir, g: 0, f: h(i, j), port: p }); }
    let found: St | undefined;
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]];
    let iter = 0;
    while (open.length && iter++ < 60000) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift()!;
      const k = key(cur.i, cur.j) * 2 + cur.dir;
      if ((best.get(String(k)) ?? Infinity) <= cur.g) continue;
      best.set(String(k), cur.g);
      const tpHit = targets.get(key(cur.i, cur.j));
      if (tpHit) { found = { ...cur, port: tpHit, prev: cur }; break; }
      for (const [di, dj, dd] of DIRS) {
        const ni = cur.i + di, nj = cur.j + dj;
        if (ni < 0 || nj < 0 || ni >= X.length || nj >= Y.length) continue;
        const a: P = [X[cur.i], Y[cur.j]], b: P = [X[ni], Y[nj]];
        if (blocked(b) || obstacles.some((o) => segIntersectsRect(a, b, o))) continue;
        if (segIntersectsRect(a, b, ownS) || segIntersectsRect(a, b, ownT)) continue;
        let cost = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
        if (dd !== cur.dir) cost += 60; // giro
        for (const [p, q] of routed) {
          const vert = p[0] === q[0], mv = a[0] === b[0];
          if (vert !== mv) { // posible cruce perpendicular
            const [hx0, hx1, hy] = vert ? [Math.min(a[0], b[0]), Math.max(a[0], b[0]), a[1]] : [Math.min(p[0], q[0]), Math.max(p[0], q[0]), p[1]];
            const [vx, vy0, vy1] = vert ? [p[0], Math.min(p[1], q[1]), Math.max(p[1], q[1])] : [a[0], Math.min(a[1], b[1]), Math.max(a[1], b[1])];
            if (vx > hx0 && vx < hx1 && hy > vy0 && hy < vy1) cost += 80;
          } else if ((vert && Math.abs(p[0] - a[0]) < 6 && Math.min(Math.max(p[1], q[1]), Math.max(a[1], b[1])) > Math.max(Math.min(p[1], q[1]), Math.min(a[1], b[1]))) ||
                     (!vert && Math.abs(p[1] - a[1]) < 6 && Math.min(Math.max(p[0], q[0]), Math.max(a[0], b[0])) > Math.max(Math.min(p[0], q[0]), Math.min(a[0], b[0])))) cost += 400; // solape colineal
        }
        for (const g of softGroups) { const ina = a[0] > g.x && a[0] < g.x + g.w && a[1] > g.y && a[1] < g.y + g.h; const inb = b[0] > g.x && b[0] < g.x + g.w && b[1] > g.y && b[1] < g.y + g.h; if (ina !== inb || ina) cost += 120; }
        open.push({ i: ni, j: nj, dir: dd, g: cur.g + cost, f: cur.g + cost + h(ni, nj), prev: cur });
      }
    }
    let pts: P[];
    if (!found) pts = [[s.x + s.w / 2, s.y + s.h], [t.x + t.w / 2, t.y]]; // sin ruta: el validador lo reportará
    else {
      const chain: P[] = [];
      let c: St | undefined = found.prev;
      let startPort = sp[0];
      while (c) { chain.unshift([X[c.i], Y[c.j]]); if (!c.prev) startPort = c.port!; c = c.prev; }
      const endPort = found.port!;
      pts = [startPort.border, ...chain, endPort.border];
      usedSlots.set(startPort.key, (usedSlots.get(startPort.key) ?? 0) + 1);
      usedSlots.set(endPort.key, (usedSlots.get(endPort.key) ?? 0) + 1);
    }
    pts = orthoSimplify(pts);
    if (pts.length >= 2) { pts = clipEnd(pts, t); pts = clipEnd([...pts].reverse() as P[], s).reverse() as P[]; }
    for (let i = 1; i < pts.length; i++) routed.push([pts[i - 1], pts[i]]);
    edges.push({ id: e.id, from: e.from, to: e.to, points: pts, style: e.style, dir: e.dir });
  }
  // etiquetas: sobre el tramo más largo libre de colisiones
  const placed: R[] = [];
  for (const le of edges) {
    const src = d.edges.find((x) => x.id === le.id)!;
    if (!src.label) continue;
    const lb = edgeLabelBox(src.label + (src.tech ? ` [${src.tech}]` : ''));
    const segs = le.points.slice(1).map((p, i) => [le.points[i], p] as Seg).sort((a, b) => Math.abs(b[1][0] - b[0][0]) + Math.abs(b[1][1] - b[0][1]) - (Math.abs(a[1][0] - a[0][0]) + Math.abs(a[1][1] - a[0][1])));
    let bestR: R | undefined, bestBad = Infinity;
    for (const [a, b] of segs) for (const t of [0.5, 0.3, 0.7]) {
      const cx = a[0] + (b[0] - a[0]) * t, cy = a[1] + (b[1] - a[1]) * t;
      const r = { x: cx - lb.w / 2, y: cy - lb.h / 2, w: lb.w, h: lb.h };
      let bad = 0;
      for (const n of leaves) if (overl(r, n, 2)) bad += 10;
      for (const p of placed) if (overl(r, p, 2)) bad += 10;
      for (const o of edges) if (o !== le) for (let i = 1; i < o.points.length; i++) if (segIntersectsRect(o.points[i - 1], o.points[i], r)) bad += 1;
      if (bad < bestBad) { bestBad = bad; bestR = r; }
      if (bad === 0) break;
    }
    if (bestR) { placed.push(bestR); le.label = { ...bestR, lines: lb.lines }; }
  }
  return edges;
}

function orthoSimplify(pts: P[]): P[] {
  const out: P[] = [];
  for (const p of pts) {
    if (out.length && out[out.length - 1][0] === p[0] && out[out.length - 1][1] === p[1]) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      if ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1])) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

export type StableResult = { layout: Layout; mode: 'repair' | 'relayout'; reason: string; candidate?: Layout };

/** Política: reparación local si el validador no encuentra errores nuevos; si no, re-layout completo. */
export async function stableLayout(d: Diagram, prev: Layout, opts: LayoutOptions = {}): Promise<StableResult> {
  const t0 = performance.now();
  const nodes = place(d, prev);
  const edges = routeAll(d, nodes);
  const all = [...nodes.values()];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of all) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h); }
  for (const e of edges) for (const [x, y] of e.points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const titleH = d.title ? 34 : 0, M = 24;
  // conservar el origen anterior si cabe (no trasladar todo el dibujo)
  const dx = minX < M ? M - minX : 0, dy = minY < M + titleH ? M + titleH - minY : 0;
  for (const n of all) { n.x += dx; n.y += dy; }
  for (const e of edges) { e.points = e.points.map(([x, y]) => [x + dx, y + dy] as P); if (e.label) { e.label.x += dx; e.label.y += dy; } }
  const order = new Map(d.nodes.map((n, i) => [n.id, i]));
  const repaired: Layout = { width: maxX + dx + M, height: maxY + dy + M, nodes: all.sort((a, b) => order.get(a.id)! - order.get(b.id)!), edges, engine: 'plano-repair', ms: performance.now() - t0, title: d.title, theme: d.theme, type: d.type };
  const v = validateLayout(repaired).metrics;
  if (v.errors === 0) return { layout: repaired, mode: 'repair', reason: `kept ${prev.nodes.filter((n) => nodes.has(n.id)).length} element positions` };
  const fresh = await freshLayout(d, opts);
  return { layout: fresh, mode: 'relayout', reason: `local repair produced ${v.errors} geometric error(s)`, candidate: repaired };
}
