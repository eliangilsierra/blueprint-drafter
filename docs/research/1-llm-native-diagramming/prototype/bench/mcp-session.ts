// Sesión MCP real (cliente oficial del SDK) que simula el flujo de un agente y mide
// el coste en tokens de: definiciones de herramientas + cada llamada + cada respuesta.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const require = createRequire(import.meta.url);
const enc = require('js-tiktoken').getEncoding('o200k_base');
const t = (s: string) => enc.encode(s).length;

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const ws = path.join(root, 'out', 'mcp-ws');
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(ws, { recursive: true });

const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src', 'mcp.ts')], env: { ...process.env, PLANO_WORKSPACE: ws } as Record<string, string> });
const client = new Client({ name: 'bench', version: '1' });
await client.connect(transport);
const tools = await client.listTools();
const toolDefs = JSON.stringify(tools.tools);
const instructions = client.getInstructions() ?? '';
const log: { step: string; in: number; out: number }[] = [];
async function call(step: string, name: string, args: any) {
  const r: any = await client.callTool({ name, arguments: args });
  const out = r.content.map((c: any) => c.text).join('\n');
  log.push({ step, in: t(JSON.stringify({ name, arguments: args })), out: t(out) });
  return out;
}
const spec = fs.readFileSync(path.join(root, 'bench', 'cases', '02-c4-container.plano'), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('plano'));
await call('crear', 'plano_new', { file: 'bank.plano', type: 'c4-container', title: 'Internet Banking', dir: 'TB' });
const r1 = await call('poblar (una sola llamada)', 'plano_apply', { file: 'bank.plano', ops: spec.map((l) => '+' + l) });
await call('validar', 'plano_check', { file: 'bank.plano' });
await call('consulta selectiva', 'plano_show', { file: 'bank.plano', around: 'api', depth: 1 });
const r2 = await call('edición incremental', 'plano_apply', { file: 'bank.plano', ops: ['+node cache cache "Session Cache" in=c1 tech=Redis', '+edge api>cache "Caches sessions in"', '~edge api>db style=async', '-edge customer>webApp'] });
const r3 = await call('operación inválida', 'plano_apply', { file: 'bank.plano', ops: ['-node mainfram'] });
await call('render', 'plano_render', { file: 'bank.plano', format: 'svg' });
await call('export draw.io', 'plano_render', { file: 'bank.plano', format: 'drawio' });
const r4 = await call('fuera del workspace', 'plano_show', { file: '../../secret.plano' }).catch((e) => String(e));
await client.close();
const result = { toolCount: tools.tools.length, toolDefTokens: t(toolDefs), instructionsTokens: t(instructions), steps: log, total: log.reduce((s, x) => s + x.in + x.out, 0), samples: { r1, r2, r3, r4 } };
fs.writeFileSync(path.join(root, 'bench', 'results', 'mcp-session.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
