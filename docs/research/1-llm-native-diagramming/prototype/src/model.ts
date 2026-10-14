// Modelo semántico + formato de texto canónico (.plano).
// Una sentencia por línea => diffs de Git legibles y operaciones incrementales con la misma gramática.

export const FORMAT_VERSION = 1;

export type DiagramType = 'flow' | 'c4-context' | 'c4-container' | 'component' | 'architecture' | 'sequence' | 'generic';
export type Direction = 'TB' | 'LR' | 'BT' | 'RL';

export const NODE_KINDS = [
  // flujo
  'start', 'end', 'process', 'decision', 'io', 'subprocess',
  // arquitectura / C4
  'person', 'system', 'external', 'container', 'service', 'component', 'webapp', 'mobile', 'gateway',
  'function', 'db', 'cache', 'storage', 'queue', 'topic', 'module',
  // secuencia
  'actor', 'participant',
] as const;
export const GROUP_KINDS = ['boundary', 'zone', 'cluster', 'layer', 'group'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export type GroupKind = (typeof GROUP_KINDS)[number];

export type Node = {
  id: string;
  kind: string;
  label: string;
  group?: boolean;
  in?: string;
  desc?: string;
  tech?: string;
  tags?: string[];
  ext?: Record<string, string>; // atributos desconocidos: se preservan (política de extensiones)
};

export type Edge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  tech?: string;
  style?: 'sync' | 'async' | 'reply' | 'dep';
  dir?: 'fwd' | 'both' | 'none';
  ext?: Record<string, string>;
};

export type Constraint =
  | { type: 'same-rank'; ids: string[] }
  | { type: 'order'; ids: string[] }
  | { type: 'first' | 'last'; ids: string[] };

export type Diagram = {
  v: number;
  type: DiagramType;
  title?: string;
  dir: Direction;
  theme: string;
  density: 'compact' | 'normal' | 'airy';
  nodes: Node[];
  edges: Edge[];
  constraints: Constraint[];
};

export function emptyDiagram(type: DiagramType = 'generic'): Diagram {
  return { v: FORMAT_VERSION, type, dir: type === 'flow' || type === 'sequence' ? 'TB' : 'LR', theme: 'light', density: 'normal', nodes: [], edges: [], constraints: [] };
}

// ---------------------------------------------------------------- tokenizer
export class ParseError extends Error {
  code: string; line: number;
  constructor(code: string, line: number, msg: string) { super(`${code} line ${line}: ${msg}`); this.code = code; this.line = line; }
}

type Tok = { kind: 'word' | 'str' | 'kv'; key?: string; value: string };

export function tokenize(line: string, lineNo = 0): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const readQuoted = (): string => {
    let s = '';
    i++; // opening quote
    while (i < line.length && line[i] !== '"') {
      if (line[i] === '\\' && i + 1 < line.length) { i++; s += line[i] === 'n' ? '\n' : line[i]; } else s += line[i];
      i++;
    }
    if (line[i] !== '"') throw new ParseError('E_SYNTAX', lineNo, 'unterminated string');
    i++;
    return s;
  };
  while (i < line.length) {
    if (line[i] === ' ' || line[i] === '\t') { i++; continue; }
    if (line[i] === '#') break;
    if (line[i] === '"') { toks.push({ kind: 'str', value: readQuoted() }); continue; }
    let w = '';
    while (i < line.length && line[i] !== ' ' && line[i] !== '\t' && line[i] !== '=') w += line[i++];
    if (line[i] === '=') {
      i++;
      const value = line[i] === '"' ? readQuoted() : (() => { let v = ''; while (i < line.length && line[i] !== ' ' && line[i] !== '\t') v += line[i++]; return v; })();
      toks.push({ kind: 'kv', key: w, value });
    } else toks.push({ kind: 'word', value: w });
  }
  return toks;
}

const q = (s: string) => (/^[A-Za-z0-9_.:/-]+$/.test(s) && s.length > 0 ? s : '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"');
const qs = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';

// ---------------------------------------------------------------- statements
export type Statement =
  | { t: 'header'; attrs: Record<string, string> }
  | { t: 'node'; node: Node }
  | { t: 'edge'; edge: Edge }
  | { t: 'constraint'; c: Constraint };

const NODE_KEYS = new Set(['in', 'desc', 'tech', 'tags']);
const EDGE_KEYS = new Set(['id', 'tech', 'style', 'dir']);

/** Parsea una sentencia. `partial` permite omitir campos (para operaciones ~update). */
export function parseStatement(line: string, lineNo = 0, partial = false): Statement | null {
  const toks = tokenize(line, lineNo);
  if (toks.length === 0) return null;
  const head = toks[0];
  if (head.kind !== 'word') throw new ParseError('E_SYNTAX', lineNo, 'statement must start with a keyword');
  const rest = toks.slice(1);
  switch (head.value) {
    case 'plano': {
      const attrs: Record<string, string> = {};
      for (const t of rest) {
        if (t.kind === 'kv') attrs[t.key!] = t.value;
        else if (t.kind === 'word' && /^\d+$/.test(t.value)) attrs.v = t.value;
        else if (t.kind === 'str') attrs.title = t.value;
      }
      return { t: 'header', attrs };
    }
    case 'node':
    case 'group': {
      const [idT, kindT, ...more] = rest;
      if (!idT || idT.kind !== 'word') throw new ParseError('E_SYNTAX', lineNo, `${head.value} requires an id`);
      const node: Node = { id: idT.value, kind: '', label: '' };
      if (head.value === 'group') node.group = true;
      let others = more;
      if (kindT && kindT.kind === 'word') node.kind = kindT.value;
      else if (kindT) others = [kindT, ...more];
      for (const t of others) {
        if (t.kind === 'str' && !node.label) node.label = t.value;
        else if (t.kind === 'kv') {
          if (t.key === 'tags') node.tags = t.value.split(',').filter(Boolean);
          else if (NODE_KEYS.has(t.key!)) (node as any)[t.key!] = t.value;
          else if (t.key === 'label') node.label = t.value;
          else if (t.key === 'kind') node.kind = t.value;
          else (node.ext ??= {})[t.key!] = t.value;
        } else throw new ParseError('E_SYNTAX', lineNo, `unexpected token '${t.value}'`);
      }
      if (!partial) {
        if (!node.kind) node.kind = node.group ? 'group' : 'service';
        if (!node.label) node.label = node.id;
      }
      return { t: 'node', node };
    }
    case 'edge': {
      const [refT, ...more] = rest;
      if (!refT || refT.kind !== 'word') throw new ParseError('E_SYNTAX', lineNo, 'edge requires from>to');
      const m = /^([^>]+)>([^>#]+)(?:#(\d+))?$/.exec(refT.value);
      // en actualizaciones (~edge) se admite también un id explícito sin '>'
      if (!m && !(partial && /^[A-Za-z_][\w.-]*$/.test(refT.value))) throw new ParseError('E_SYNTAX', lineNo, `bad edge reference '${refT.value}', expected from>to`);
      const edge: Edge = m ? { id: '', from: m[1], to: m[2] } : { id: refT.value, from: '', to: '' };
      if (m?.[3]) edge.id = `${m[1]}>${m[2]}#${m[3]}`;
      for (const t of more) {
        if (t.kind === 'str' && edge.label === undefined) edge.label = t.value;
        else if (t.kind === 'kv') {
          if (EDGE_KEYS.has(t.key!)) (edge as any)[t.key!] = t.value;
          else if (t.key === 'label') edge.label = t.value;
          else (edge.ext ??= {})[t.key!] = t.value;
        } else throw new ParseError('E_SYNTAX', lineNo, `unexpected token '${t.value}'`);
      }
      return { t: 'edge', edge };
    }
    case 'rank':
    case 'order':
    case 'first':
    case 'last': {
      let type: Constraint['type'] = head.value === 'rank' ? 'same-rank' : (head.value as any);
      const words = rest.filter((t) => t.kind === 'word').map((t) => t.value);
      if (head.value === 'rank') { if (words[0] !== 'same') throw new ParseError('E_SYNTAX', lineNo, "expected 'rank same a,b'"); words.shift(); }
      const ids = words.join(',').split(',').filter(Boolean);
      return { t: 'constraint', c: { type, ids } as Constraint };
    }
    default:
      throw new ParseError('E_UNKNOWN_STATEMENT', lineNo, `unknown statement '${head.value}' (expected plano|node|group|edge|rank|order|first|last)`);
  }
}

export function edgeAutoId(e: Edge, existing: Set<string>): string {
  let id = `${e.from}>${e.to}`;
  let n = 2;
  while (existing.has(id)) id = `${e.from}>${e.to}#${n++}`;
  return id;
}

export function parse(src: string): Diagram {
  const d = emptyDiagram();
  const ids = new Set<string>();
  src.split(/\r?\n/).forEach((line, i) => {
    const st = parseStatement(line, i + 1);
    if (!st) return;
    if (st.t === 'header') {
      const a = st.attrs;
      if (a.v) d.v = Number(a.v);
      if (a.type) d.type = a.type as DiagramType;
      if (a.title) d.title = a.title;
      d.dir = (a.dir as Direction) ?? (d.type === 'flow' || d.type === 'sequence' ? 'TB' : 'LR');
      if (a.theme) d.theme = a.theme;
      if (a.density) d.density = a.density as any;
    } else if (st.t === 'node') { d.nodes.push(st.node); ids.add(st.node.id); }
    else if (st.t === 'edge') {
      if (!st.edge.id) st.edge.id = edgeAutoId(st.edge, ids);
      ids.add(st.edge.id);
      d.edges.push(st.edge);
    } else d.constraints.push(st.c);
  });
  return d;
}

export function serializeNode(n: Node): string {
  let s = `${n.group ? 'group' : 'node'} ${n.id} ${n.kind} ${qs(n.label)}`;
  if (n.in) s += ` in=${q(n.in)}`;
  if (n.tech) s += ` tech=${q(n.tech)}`;
  if (n.desc) s += ` desc=${q(n.desc)}`;
  if (n.tags?.length) s += ` tags=${q(n.tags.join(','))}`;
  for (const [k, v] of Object.entries(n.ext ?? {}).sort()) s += ` ${k}=${q(v)}`;
  return s;
}

export function serializeEdge(e: Edge): string {
  const auto = `${e.from}>${e.to}`;
  const ref = e.id.startsWith(auto + '#') ? e.id : auto;
  let s = `edge ${ref}`;
  if (e.label !== undefined) s += ` ${qs(e.label)}`;
  if (e.id !== auto && !e.id.startsWith(auto + '#')) s += ` id=${q(e.id)}`;
  if (e.tech) s += ` tech=${q(e.tech)}`;
  if (e.style) s += ` style=${e.style}`;
  if (e.dir) s += ` dir=${e.dir}`;
  for (const [k, v] of Object.entries(e.ext ?? {}).sort()) s += ` ${k}=${q(v)}`;
  return s;
}

/** Serialización canónica y determinista: misma entrada => mismos bytes. */
export function serialize(d: Diagram): string {
  const out: string[] = [];
  let h = `plano ${d.v} type=${d.type} dir=${d.dir}`;
  if (d.theme !== 'light') h += ` theme=${d.theme}`;
  if (d.density !== 'normal') h += ` density=${d.density}`;
  if (d.title) h += ` title=${qs(d.title)}`;
  out.push(h);
  // grupos primero (padres antes que hijos), luego nodos en orden de modelo
  const groups = d.nodes.filter((n) => n.group);
  const depth = (n: Node): number => { let k = 0; let p = n.in; const seen = new Set<string>(); while (p && !seen.has(p)) { seen.add(p); k++; p = d.nodes.find((x) => x.id === p)?.in; } return k; };
  [...groups].sort((a, b) => depth(a) - depth(b)).forEach((g) => out.push(serializeNode(g)));
  d.nodes.filter((n) => !n.group).forEach((n) => out.push(serializeNode(n)));
  d.edges.forEach((e) => out.push(serializeEdge(e)));
  for (const c of d.constraints) {
    if (c.type === 'same-rank') out.push(`rank same ${c.ids.join(',')}`);
    else out.push(`${c.type} ${c.ids.join(',')}`);
  }
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------- diagnostics
export type Severity = 'error' | 'warning' | 'info';
export type Diagnostic = {
  sev: Severity;
  code: string;
  ids: string[];
  msg: string;
  fix?: string; // corrección sugerida, preferiblemente como operación aplicable
  auto?: boolean; // el motor puede resolverlo sin el agente
};

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function suggest(id: string, candidates: string[]): string | undefined {
  let best: string | undefined; let bestD = Infinity;
  for (const c of candidates) { const dd = levenshtein(id.toLowerCase(), c.toLowerCase()); if (dd < bestD) { bestD = dd; best = c; } }
  return best !== undefined && bestD <= Math.max(2, Math.floor(id.length / 3)) ? best : undefined;
}

/** Reglas semánticas: no requieren geometría ni LLM. */
export function semanticCheck(d: Diagram): Diagnostic[] {
  const out: Diagnostic[] = [];
  const byId = new Map<string, Node>();
  for (const n of d.nodes) {
    if (byId.has(n.id)) out.push({ sev: 'error', code: 'E_DUPLICATE_ID', ids: [n.id], msg: `duplicate id '${n.id}'`, fix: `rename one of them` });
    byId.set(n.id, n);
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(n.id)) out.push({ sev: 'error', code: 'E_BAD_ID', ids: [n.id], msg: `invalid id '${n.id}' (use [A-Za-z_][A-Za-z0-9_.-]*)` });
    const kinds: readonly string[] = n.group ? GROUP_KINDS : NODE_KINDS;
    if (!kinds.includes(n.kind)) {
      const s = suggest(n.kind, [...kinds]);
      out.push({ sev: 'warning', code: 'W_UNKNOWN_KIND', ids: [n.id], msg: `unknown ${n.group ? 'group' : 'node'} kind '${n.kind}', rendered as generic`, fix: s ? `~${n.group ? 'group' : 'node'} ${n.id} kind=${s}` : undefined });
    }
  }
  const allIds = [...byId.keys()];
  for (const n of d.nodes) {
    if (!n.in) continue;
    const p = byId.get(n.in);
    if (!p) { const s = suggest(n.in, d.nodes.filter((x) => x.group).map((x) => x.id)); out.push({ sev: 'error', code: 'E_UNKNOWN_PARENT', ids: [n.id], msg: `'${n.id}' is in unknown group '${n.in}'`, fix: s ? `~node ${n.id} in=${s}` : `+group ${n.in} boundary "${n.in}"` }); }
    else if (!p.group) out.push({ sev: 'error', code: 'E_PARENT_NOT_GROUP', ids: [n.id, p.id], msg: `'${n.id}' is inside '${p.id}', which is not a group` });
    // ciclos de contención
    const seen = new Set<string>([n.id]); let cur = n.in;
    while (cur) { if (seen.has(cur)) { out.push({ sev: 'error', code: 'E_CONTAINMENT_CYCLE', ids: [...seen], msg: `containment cycle through '${cur}'` }); break; } seen.add(cur); cur = byId.get(cur)?.in as string; }
  }
  const edgeIds = new Set<string>();
  const degree = new Map<string, number>();
  for (const e of d.edges) {
    if (edgeIds.has(e.id)) out.push({ sev: 'error', code: 'E_DUPLICATE_ID', ids: [e.id], msg: `duplicate edge id '${e.id}'` });
    edgeIds.add(e.id);
    for (const end of [e.from, e.to]) {
      if (!byId.has(end)) { const s = suggest(end, allIds); out.push({ sev: 'error', code: 'E_DANGLING_EDGE', ids: [e.id], msg: `edge '${e.id}' references unknown element '${end}'`, fix: s ? `did you mean '${s}'?` : `+node ${end} service "${end}"` }); }
      degree.set(end, (degree.get(end) ?? 0) + 1);
    }
    if (e.from === e.to) out.push({ sev: 'info', code: 'I_SELF_LOOP', ids: [e.id], msg: `self-loop on '${e.from}'` });
    if ((d.type === 'c4-context' || d.type === 'c4-container' || d.type === 'component') && !e.label)
      out.push({ sev: 'warning', code: 'W_UNLABELED_RELATION', ids: [e.id], msg: `C4 recommends labelling every relationship ('${e.id}')`, fix: `~edge ${e.id} label="…"` });
  }
  for (const n of d.nodes) if (!n.group && !degree.has(n.id) && d.type !== 'sequence') out.push({ sev: 'info', code: 'I_ISOLATED', ids: [n.id], msg: `'${n.id}' has no relationships` });
  if (d.type === 'c4-container' || d.type === 'c4-context') {
    for (const n of d.nodes) if (n.kind === 'person' && n.in) out.push({ sev: 'warning', code: 'W_C4_PERSON_IN_BOUNDARY', ids: [n.id], msg: `person '${n.id}' should be outside system boundaries`, fix: `~node ${n.id} in=` });
    if (d.type === 'c4-context') for (const n of d.nodes) if (['container', 'db', 'queue', 'component'].includes(n.kind)) out.push({ sev: 'warning', code: 'W_C4_LEVEL_MIX', ids: [n.id], msg: `'${n.id}' (${n.kind}) belongs to a container diagram, not a context diagram` });
  }
  for (const c of d.constraints) for (const id of c.ids) if (!byId.has(id)) out.push({ sev: 'error', code: 'E_CONSTRAINT_UNKNOWN_ID', ids: [id], msg: `constraint references unknown '${id}'` });
  // restricciones incompatibles: el mismo nodo en dos 'same-rank' distintos, o first y last a la vez
  const rankOf = new Map<string, number>();
  d.constraints.forEach((c, i) => { if (c.type === 'same-rank') for (const id of c.ids) { if (rankOf.has(id) && rankOf.get(id) !== i) out.push({ sev: 'error', code: 'E_CONSTRAINT_CONFLICT', ids: [id], msg: `'${id}' appears in two different same-rank constraints` }); rankOf.set(id, i); } });
  const firsts = new Set(d.constraints.filter((c) => c.type === 'first').flatMap((c) => c.ids));
  for (const c of d.constraints) if (c.type === 'last') for (const id of c.ids) if (firsts.has(id)) out.push({ sev: 'error', code: 'E_CONSTRAINT_CONFLICT', ids: [id], msg: `'${id}' cannot be both first and last` });
  return out;
}
