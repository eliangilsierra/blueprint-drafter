// Consultas selectivas y diff: el agente lee solo lo que necesita.
import { type Diagram, serializeNode, serializeEdge, serialize } from './model.ts';
import type { Layout } from './layout.ts';

/** Vecindario de un elemento a N saltos (más sus grupos contenedores). */
export function around(d: Diagram, id: string, depth = 1): string {
  const keep = new Set<string>([id]);
  for (let k = 0; k < depth; k++) for (const e of d.edges) { if (keep.has(e.from)) keep.add(e.to); if (keep.has(e.to)) keep.add(e.from); }
  // incluir hijos si es grupo
  for (const n of d.nodes) if (n.in === id) keep.add(n.id);
  const groups = new Set<string>();
  for (const k of keep) { let p = d.nodes.find((n) => n.id === k)?.in; while (p) { groups.add(p); p = d.nodes.find((n) => n.id === p)?.in; } }
  const lines: string[] = [];
  for (const g of d.nodes.filter((n) => groups.has(n.id) && !keep.has(n.id))) lines.push(serializeNode(g));
  for (const n of d.nodes.filter((n) => keep.has(n.id))) lines.push(serializeNode(n));
  for (const e of d.edges.filter((e) => keep.has(e.from) && keep.has(e.to))) lines.push(serializeEdge(e));
  const omitted = d.nodes.length - lines.filter((l) => l.startsWith('node') || l.startsWith('group')).length;
  return lines.join('\n') + `\n# ${omitted} other elements omitted`;
}

export function idsOnly(d: Diagram): string {
  const g = d.nodes.filter((n) => n.group).map((n) => n.id);
  const n = d.nodes.filter((x) => !x.group).map((x) => (x.in ? `${x.id}@${x.in}` : x.id));
  return `groups: ${g.join(' ') || '-'}\nnodes: ${n.join(' ')}\nedges: ${d.edges.map((e) => e.id).join(' ')}`;
}

export function stats(d: Diagram): string {
  return `type=${d.type} dir=${d.dir} nodes=${d.nodes.filter((n) => !n.group).length} groups=${d.nodes.filter((n) => n.group).length} edges=${d.edges.length} constraints=${d.constraints.length}`;
}

/** Diff semántico entre dos versiones (independiente de la geometría). */
export function semanticDiff(a: Diagram, b: Diagram): string[] {
  const out: string[] = [];
  const an = new Map(a.nodes.map((n) => [n.id, serializeNode(n)])), bn = new Map(b.nodes.map((n) => [n.id, serializeNode(n)]));
  for (const [id, s] of bn) if (!an.has(id)) out.push(`+ ${s}`);
  for (const [id, s] of an) if (!bn.has(id)) out.push(`- ${s}`);
  for (const [id, s] of bn) if (an.has(id) && an.get(id) !== s) out.push(`~ ${s}   (was: ${an.get(id)})`);
  const ae = new Map(a.edges.map((e) => [e.id, serializeEdge(e)])), be = new Map(b.edges.map((e) => [e.id, serializeEdge(e)]));
  for (const [id, s] of be) if (!ae.has(id)) out.push(`+ ${s}`);
  for (const [id, s] of ae) if (!be.has(id)) out.push(`- ${s}`);
  for (const [id, s] of be) if (ae.has(id) && ae.get(id) !== s) out.push(`~ ${s}   (was: ${ae.get(id)})`);
  const ha = serialize(a).split('\n')[0], hb = serialize(b).split('\n')[0];
  if (ha !== hb) out.push(`~ ${hb}   (was: ${ha})`);
  return out;
}

function kendall(xs: number[], ys: number[]): number {
  let c = 0, dsc = 0;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    const s = Math.sign(xs[i] - xs[j]) * Math.sign(ys[i] - ys[j]);
    if (s > 0) c++; else if (s < 0) dsc++;
  }
  return c + dsc ? (c - dsc) / (c + dsc) : 1;
}

export type Stability = { common: number; meanShift: number; maxShift: number; moved20: number; tauX: number; tauY: number; sizeChange: number };

/** Estabilidad visual entre dos layouts: desplazamiento de nodos comunes (alineado por centroide) y conservación del orden relativo. */
export function stability(A: Layout, B: Layout): Stability {
  const bm = new Map(B.nodes.filter((n) => !n.group).map((n) => [n.id, n]));
  const common = A.nodes.filter((n) => !n.group && bm.has(n.id));
  if (!common.length) return { common: 0, meanShift: 0, maxShift: 0, moved20: 0, tauX: 1, tauY: 1, sizeChange: 0 };
  const ca = common.map((n) => [n.x + n.w / 2, n.y + n.h / 2]);
  const cb = common.map((n) => { const m = bm.get(n.id)!; return [m.x + m.w / 2, m.y + m.h / 2]; });
  // alinear por el centroide para no penalizar traslaciones globales
  // traslación global robusta (mediana): una traslación de todo el dibujo no cuenta como cambio
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const ox = med(cb.map((p, i) => p[0] - ca[i][0])), oy = med(cb.map((p, i) => p[1] - ca[i][1]));
  const shifts = ca.map((p, i) => Math.hypot(cb[i][0] - p[0] - ox, cb[i][1] - p[1] - oy));
  return {
    common: common.length,
    meanShift: shifts.reduce((s, x) => s + x, 0) / shifts.length,
    maxShift: Math.max(...shifts),
    moved20: shifts.filter((s) => s > 20).length,
    tauX: kendall(ca.map((p) => p[0]), cb.map((p) => p[0])),
    tauY: kendall(ca.map((p) => p[1]), cb.map((p) => p[1])),
    sizeChange: (B.width * B.height) / (A.width * A.height) - 1,
  };
}

/** Sincronización con código: genera operaciones (no un archivo nuevo) para llevar `current` hacia `extracted`.
 *  Solo elimina elementos marcados como generados (tags=code), preservando lo añadido o curado por humanos. */
export function syncOps(current: Diagram, extracted: Diagram, tag = 'code'): string[] {
  const ops: string[] = [];
  const cur = new Map(current.nodes.map((n) => [n.id, n]));
  const ext = new Map(extracted.nodes.map((n) => [n.id, n]));
  for (const n of extracted.nodes) if (!cur.has(n.id)) ops.push('+' + serializeNode({ ...n, tags: [...new Set([...(n.tags ?? []), tag])] }));
  const curE = new Map(current.edges.map((e) => [`${e.from}>${e.to}`, e]));
  const extE = new Map(extracted.edges.map((e) => [`${e.from}>${e.to}`, e]));
  for (const [k, e] of extE) if (!curE.has(k)) ops.push('+' + serializeEdge({ ...e, ext: { ...(e.ext ?? {}), src: tag } }));
  for (const [k, e] of curE) if (!extE.has(k) && e.ext?.src === tag && cur.has(e.from) && cur.has(e.to) && ext.has(e.from) && ext.has(e.to)) ops.push(`-edge ${e.id}`);
  for (const n of current.nodes) if (!ext.has(n.id) && n.tags?.includes(tag)) ops.push(`-node ${n.id}`);
  return ops;
}
