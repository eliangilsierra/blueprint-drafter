// Adaptador MCP (stdio). Sin lógica propia: traduce llamadas tipadas al núcleo.
// Descripciones cortas a propósito (lección de jgraph/drawio-mcp#76: 34.5k caracteres rompían la búsqueda de herramientas).
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as P from './index.ts';

const ROOT = path.resolve(process.env.PLANO_WORKSPACE ?? process.cwd());
/** Solo se permiten archivos .plano dentro del workspace (sin path traversal). */
function safe(file: string): string {
  const abs = path.resolve(ROOT, file);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) throw new Error(`E_OUTSIDE_WORKSPACE ${file}`);
  if (!abs.endsWith('.plano')) throw new Error('E_BAD_EXTENSION only .plano files');
  return abs;
}
const text = (s: string, isError = false) => ({ content: [{ type: 'text' as const, text: s }], isError });
const GRAMMAR = 'node ID KIND "Label" [in=GROUP tech=T desc=D] | group ID KIND "Label" [in=G] | edge FROM>TO "label" [tech=T style=sync|async|reply|dep]';

const server = new McpServer({ name: 'plano', version: '0.1.0' }, { instructions: `Semantic diagrams: never send coordinates. Ops: +stmt add, ~stmt update, -ref remove. Grammar: ${GRAMMAR}. Kinds: ${P.NODE_KINDS.join(',')}; groups: ${P.GROUP_KINDS.join(',')}.` });

server.registerTool('plano_new', { description: 'Create a diagram file.', inputSchema: { file: z.string(), type: z.enum(['flow', 'c4-context', 'c4-container', 'component', 'architecture', 'sequence']), title: z.string().optional(), dir: z.enum(['TB', 'LR']).optional() } }, async ({ file, type, title, dir }) => {
  const f = safe(file);
  if (fs.existsSync(f)) return text(`E_EXISTS ${file}`, true);
  const d = P.emptyDiagram(type); if (title) d.title = title; if (dir) d.dir = dir;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, P.serialize(d));
  return text(`created ${file}`);
});

server.registerTool('plano_apply', { description: 'Apply an atomic batch of ops (+add ~update -remove) and validate. Returns changes and problems only.', inputSchema: { file: z.string(), ops: z.array(z.string()).min(1), dryRun: z.boolean().optional() } }, async ({ file, ops, dryRun }) => {
  const f = safe(file);
  const d = P.parse(fs.readFileSync(f, 'utf8'));
  try {
    const r = P.applyOps(d, ops);
    if (r.introduced.length) return text(`REJECTED\n${P.formatDiags(r.introduced)}`, true);
    const { metrics, diags } = await P.check(r.diagram);
    if (!dryRun) fs.writeFileSync(f, P.serialize(r.diagram));
    const probs = diags.filter((x) => x.sev !== 'info');
    return text(`${dryRun ? 'DRY-RUN ' : ''}ok\n${P.summarizeChanges(r.changes)}\n${metrics.errors}E ${metrics.warnings}W${probs.length ? '\n' + P.formatDiags(probs, 10) : ''}`);
  } catch (e: any) {
    if (e instanceof P.OpError) return text(`REJECTED ${e.code} op#${e.index + 1}: ${e.message}${e.fix ? ` | fix: ${e.fix}` : ''}`, true);
    throw e;
  }
});

server.registerTool('plano_check', { description: 'Validate semantics and rendered geometry.', inputSchema: { file: z.string(), max: z.number().int().optional() } }, async ({ file, max }) => {
  const { diags, metrics } = await P.check(P.parse(fs.readFileSync(safe(file), 'utf8')));
  return text(`${metrics.errors}E ${metrics.warnings}W ${metrics.infos}I crossings=${metrics.crossings}\n${P.formatDiags(diags, max ?? 20)}`);
});

server.registerTool('plano_show', { description: 'Read diagram state: full, neighbourhood of an id, or ids only.', inputSchema: { file: z.string(), around: z.string().optional(), depth: z.number().int().optional(), idsOnly: z.boolean().optional() } }, async ({ file, around, depth, idsOnly }) => {
  const d = P.parse(fs.readFileSync(safe(file), 'utf8'));
  return text(around ? P.around(d, around, depth ?? 1) : idsOnly ? P.idsOnly(d) : P.serialize(d));
});

server.registerTool('plano_render', { description: 'Render to svg/png or export to mermaid/excalidraw/drawio next to the source.', inputSchema: { file: z.string(), format: z.enum(['svg', 'png', 'mermaid', 'excalidraw', 'drawio']), theme: z.enum(['light', 'dark']).optional() } }, async ({ file, format, theme }) => {
  const f = safe(file);
  const d = P.parse(fs.readFileSync(f, 'utf8'));
  const base = f.replace(/\.plano$/, '');
  if (format === 'mermaid') { fs.writeFileSync(base + '.mmd', P.toMermaid(d)); return text(`wrote ${path.relative(ROOT, base)}.mmd`); }
  const L = await P.buildLayout(d);
  const outPath = base + { svg: '.svg', png: '.png', excalidraw: '.excalidraw', drawio: '.drawio' }[format];
  const svg = P.renderSvg(L, { theme });
  fs.writeFileSync(outPath, format === 'svg' ? svg : format === 'png' ? P.toPng(svg) : format === 'excalidraw' ? P.toExcalidraw(L) : P.toDrawio(L));
  return text(`wrote ${path.relative(ROOT, outPath)} (${Math.round(L.width)}x${Math.round(L.height)})`);
});

server.registerTool('plano_diff', { description: 'Semantic diff between two diagram files.', inputSchema: { a: z.string(), b: z.string() } }, async ({ a, b }) => {
  const lines = P.semanticDiff(P.parse(fs.readFileSync(safe(a), 'utf8')), P.parse(fs.readFileSync(safe(b), 'utf8')));
  return text(lines.join('\n') || 'no semantic changes');
});

await server.connect(new StdioServerTransport());
