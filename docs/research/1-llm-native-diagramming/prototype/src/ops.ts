// Operaciones incrementales. Misma gramática que el archivo, con prefijo:
//   +<sentencia>   añade          (+node cache cache "Redis" in=core)
//   ~<sentencia>   actualiza      (~node api label="Orders API"   ~edge api>db style=async to=cache)
//   -<ref>         elimina        (-node legacy   -edge api>db   -group core)
// Un lote es atómico: o se aplican todas o ninguna, y nunca introduce errores semánticos nuevos.
import { type Diagram, type Node, type Edge, type Diagnostic, parseStatement, semanticCheck, suggest, edgeAutoId, ParseError, serializeNode, serializeEdge } from './model.ts';

export class OpError extends Error {
  code: string; index: number; fix?: string;
  constructor(code: string, index: number, msg: string, fix?: string) { super(msg); this.code = code; this.index = index; this.fix = fix; }
}

export type ApplyResult = { diagram: Diagram; changes: string[]; introduced: Diagnostic[] };

const clone = (d: Diagram): Diagram => JSON.parse(JSON.stringify(d));

function findEdge(d: Diagram, ref: string): Edge | undefined {
  return d.edges.find((e) => e.id === ref) ?? d.edges.find((e) => `${e.from}>${e.to}` === ref);
}

export function applyOps(d0: Diagram, ops: string[]): ApplyResult {
  const d = clone(d0);
  const changes: string[] = [];
  const allIds = () => [...d.nodes.map((n) => n.id), ...d.edges.map((e) => e.id)];
  ops.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const sign = line[0];
    const body = line.slice(1).trim();
    if (!'+~-'.includes(sign)) throw new OpError('E_INVALID_OP', i, `op must start with + ~ or - (got '${line.slice(0, 20)}')`);
    if (sign === '-') {
      const [kw, ref] = body.split(/\s+/);
      const id = ref ?? kw;
      const node = d.nodes.find((n) => n.id === id);
      const edge = findEdge(d, id);
      if (node && kw !== 'edge') {
        const removed = d.edges.filter((e) => e.from === id || e.to === id);
        d.edges = d.edges.filter((e) => !removed.includes(e));
        // los hijos de un grupo eliminado suben al contenedor padre (no se destruyen)
        const kids = d.nodes.filter((n) => n.in === id);
        kids.forEach((k) => { if (node.in) k.in = node.in; else delete k.in; });
        d.nodes = d.nodes.filter((n) => n !== node);
        d.constraints.forEach((c) => (c.ids = c.ids.filter((x) => x !== id)));
        d.constraints = d.constraints.filter((c) => c.ids.length > 0);
        changes.push(`-${node.group ? 'group' : 'node'} ${id}${removed.length ? ` (+${removed.length} edges)` : ''}${kids.length ? ` (${kids.length} children re-parented)` : ''}`);
      } else if (edge) {
        d.edges = d.edges.filter((e) => e !== edge);
        changes.push(`-edge ${edge.id}`);
      } else {
        const s = suggest(id, allIds());
        throw new OpError('E_UNKNOWN_ID', i, `no element '${id}'`, s ? `did you mean '${s}'?` : undefined);
      }
      return;
    }
    let st;
    try { st = parseStatement(body, i + 1, sign === '~'); } catch (e) { if (e instanceof ParseError) throw new OpError(e.code, i, e.message); throw e; }
    if (!st) return;
    if (st.t === 'header') {
      if (sign !== '~') throw new OpError('E_INVALID_OP', i, 'use ~plano key=value to change diagram settings');
      const a = st.attrs;
      if (a.type) d.type = a.type as any;
      if (a.dir) d.dir = a.dir as any;
      if (a.theme) d.theme = a.theme;
      if (a.density) d.density = a.density as any;
      if (a.title !== undefined) d.title = a.title || undefined;
      changes.push(`~plano ${Object.entries(a).map(([k, v]) => `${k}=${v}`).join(' ')}`);
      return;
    }
    if (st.t === 'constraint') {
      if (sign === '+') { d.constraints.push(st.c); changes.push(`+${st.c.type} ${st.c.ids.join(',')}`); }
      else throw new OpError('E_INVALID_OP', i, 'constraints can only be added (+) or removed with -rank/-order is not supported yet');
      return;
    }
    if (st.t === 'node') {
      const n = st.node;
      const existing = d.nodes.find((x) => x.id === n.id);
      if (sign === '+') {
        if (existing || d.edges.some((e) => e.id === n.id)) throw new OpError('E_DUPLICATE_ID', i, `'${n.id}' already exists`, `use ~node ${n.id} ... to modify it`);
        d.nodes.push(n);
        changes.push('+' + serializeNode(n));
      } else {
        if (!existing) { const s = suggest(n.id, d.nodes.map((x) => x.id)); throw new OpError('E_UNKNOWN_ID', i, `no node '${n.id}'`, s ? `did you mean '${s}'?` : `use +node to create it`); }
        const before = serializeNode(existing);
        if (n.kind) existing.kind = n.kind;
        if (n.label) existing.label = n.label;
        for (const k of ['in', 'desc', 'tech'] as const) if (n[k] !== undefined) { if (n[k] === '') delete existing[k]; else existing[k] = n[k]; }
        if (n.tags) existing.tags = n.tags.length ? n.tags : undefined;
        if (n.ext) for (const [k, v] of Object.entries(n.ext)) { existing.ext ??= {}; if (v === '') delete existing.ext[k]; else existing.ext[k] = v; }
        const after = serializeNode(existing);
        if (before !== after) changes.push(`~${after}`);
      }
      return;
    }
    if (st.t === 'edge') {
      const e = st.edge;
      const ref = e.id || `${e.from}>${e.to}`;
      if (sign === '+') {
        if (!e.id) e.id = edgeAutoId(e, new Set(allIds()));
        else if (allIds().includes(e.id)) throw new OpError('E_DUPLICATE_ID', i, `'${e.id}' already exists`);
        d.edges.push(e);
        changes.push('+' + serializeEdge(e));
      } else {
        const existing = findEdge(d, ref);
        if (!existing) { const s = suggest(ref, d.edges.map((x) => x.id)); throw new OpError('E_UNKNOWN_ID', i, `no edge '${ref}'`, s ? `did you mean '${s}'?` : `use +edge ${ref} to create it`); }
        const before = serializeEdge(existing);
        if (e.label !== undefined) { if (e.label === '') delete existing.label; else existing.label = e.label; }
        for (const k of ['tech', 'style', 'dir'] as const) if (e[k] !== undefined) { if (e[k] === '') delete existing[k]; else (existing as any)[k] = e[k]; }
        // reconexión: from=/to= llegan como atributos de extensión
        const auto = existing.id === `${existing.from}>${existing.to}` || existing.id.startsWith(`${existing.from}>${existing.to}#`);
        let reconnected = false;
        if (e.ext?.from) { existing.from = e.ext.from; delete e.ext.from; reconnected = true; }
        if (e.ext?.to) { existing.to = e.ext.to; delete e.ext.to; reconnected = true; }
        if (e.ext) for (const [k, v] of Object.entries(e.ext)) { existing.ext ??= {}; if (v === '') delete existing.ext[k]; else existing.ext[k] = v; }
        if (reconnected && auto) existing.id = edgeAutoId(existing, new Set(allIds().filter((x) => x !== existing.id)));
        const after = serializeEdge(existing);
        if (before !== after) changes.push(`~${after}${reconnected ? ` (was ${before.split(' ')[1]})` : ''}`);
      }
    }
  });
  // atomicidad semántica: rechazar si el lote introduce errores que no existían
  const key = (x: Diagnostic) => x.code + ':' + x.ids.join(',');
  const before = new Set(semanticCheck(d0).filter((x) => x.sev === 'error').map(key));
  const introduced = semanticCheck(d).filter((x) => x.sev === 'error' && !before.has(key(x)));
  return { diagram: d, changes, introduced };
}

/** Resumen compacto de cambios: lista completa si son pocos, recuento por tipo si son muchos. */
export function summarizeChanges(changes: string[], max = 8): string {
  if (changes.length <= max) return changes.join('\n');
  const count = new Map<string, number>();
  for (const c of changes) { const k = c.split(' ')[0]; count.set(k, (count.get(k) ?? 0) + 1); }
  return [...count].map(([k, n]) => `${k} x${n}`).join(', ') + ` (${changes.length} changes; use show to read state)`;
}
