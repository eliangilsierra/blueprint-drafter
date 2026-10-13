#!/usr/bin/env node
// CLI universal: cualquier agente con shell puede usarla. Salida compacta por defecto, --json para máquinas.
// Códigos de salida: 0 ok · 1 hay errores de validación · 2 error de uso/sintaxis · 3 operación rechazada
import fs from 'node:fs';
import path from 'node:path';
import * as P from './index.ts';

const HELP = `plano — semantic diagrams for agents
  plano new <file> --type <flow|c4-context|c4-container|component|architecture|sequence> [--title T] [--dir LR]
  plano apply <file> <op>... [--ops-file F] [--dry-run] [--render out.svg] [--stable]   ops: +stmt  ~stmt  -ref
  (--stable: keep previous positions from <file>.lock.json and repair locally; falls back to relayout on errors)
  plano check <file> [--json] [--max N] [--engine elk|dagre]
  plano show <file> [--around ID] [--depth N] [--ids] [--stats]
  plano render <file> -o <out.svg|out.png> [--theme light|dark] [--engine elk|dagre] [--no-embed-font] [--lock]
  plano export <file> --to <mermaid|excalidraw|drawio|layout-json> [-o out]
  plano diff <a> <b> [--layout]
  plano fmt <file>
statements: node ID KIND "Label" [in=G tech=T desc=D tags=a,b] · group ID KIND "Label" [in=G]
            edge FROM>TO "label" [tech=T style=sync|async|reply|dep dir=fwd|both|none] · rank same A,B · first A · last B`;

type Args = { _: string[]; [k: string]: string | boolean | string[] };
function parseArgs(argv: string[]): Args {
  const a: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--no-')) a[t.slice(5)] = false;
    else if (t.startsWith('--') || (t.startsWith('-') && t.length === 2 && !'+~'.includes(t[0]))) {
      const k = t.replace(/^-+/, '');
      const nx = argv[i + 1];
      if (nx !== undefined && !nx.startsWith('--') && !(nx.startsWith('-') && nx.length === 2)) { a[k] = nx; i++; } else a[k] = true;
    } else (a._ as string[]).push(t);
  }
  return a;
}

const read = (f: string) => P.parse(fs.readFileSync(f, 'utf8'));
const write = (f: string, d: P.Diagram) => fs.writeFileSync(f, P.serialize(d));
function out(s: string) { process.stdout.write(s.endsWith('\n') ? s : s + '\n'); }
function fail(code: number, s: string): never { process.stderr.write(s + '\n'); process.exit(code); }

async function writeRender(d: P.Diagram, file: string, opts: { theme?: string; engine?: any; embedFont?: boolean }) {
  const L = await P.buildLayout(d, { engine: opts.engine });
  const svg = P.renderSvg(L, { theme: opts.theme, embedFont: opts.embedFont });
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  if (file.endsWith('.png')) fs.writeFileSync(file, P.toPng(svg)); else fs.writeFileSync(file, svg);
  return L;
}

function summary(m: P.Metrics) {
  return `${m.errors}E ${m.warnings}W ${m.infos}I · nodes=${m.nodes} edges=${m.edges} crossings=${m.crossings} size=${Math.round(m.width)}x${Math.round(m.height)}`;
}

export async function main(argv: string[]) {
  const a = parseArgs(argv);
  const [cmd, file, file2] = a._ as string[];
  const engine = (a.engine as any) || undefined;
  try {
    switch (cmd) {
      case 'new': {
        if (!file) fail(2, 'usage: plano new <file> --type T');
        if (fs.existsSync(file) && !a.force) fail(2, `E_EXISTS ${file} already exists (use --force)`);
        const d = P.emptyDiagram((a.type as any) || 'architecture');
        if (a.title) d.title = String(a.title);
        if (a.dir) d.dir = a.dir as any;
        write(file, d);
        return out(`created ${file}`);
      }
      case 'apply': {
        const d = read(file);
        let ops = (a._ as string[]).slice(2);
        if (a['ops-file']) ops = ops.concat(fs.readFileSync(String(a['ops-file']), 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')));
        if (!ops.length) fail(2, 'no operations given');
        let r;
        try { r = P.applyOps(d, ops); } catch (e: any) {
          if (e instanceof P.OpError) fail(3, `REJECTED ${e.code} op#${e.index + 1} "${ops[e.index]}": ${e.message}${e.fix ? ` | fix: ${e.fix}` : ''}\nno changes written`);
          throw e;
        }
        if (r.introduced.length) fail(3, `REJECTED batch would introduce errors:\n${P.formatDiags(r.introduced)}\nno changes written`);
        const { metrics, diags } = await P.check(r.diagram, { engine });
        const lockFile = file + '.lock.json';
        let stableNote = '';
        if (a.stable) {
          const prevL = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : await P.buildLayout(d, { engine });
          const sr = await P.stableLayout(r.diagram, prevL);
          const st = P.stability(prevL, sr.layout);
          const { validateLayout } = await import('./validate.ts');
          const vm = validateLayout(sr.layout).metrics;
          stableNote = `
layout: ${sr.mode} (${sr.reason}) · moved>20px=${st.moved20}/${st.common} order=${Math.min(st.tauX, st.tauY).toFixed(2)} · ${vm.errors}E ${vm.warnings}W crossings=${vm.crossings}`;
          if (!a['dry-run']) fs.writeFileSync(lockFile, JSON.stringify(sr.layout));
          if (a.render) { const svg = P.renderSvg(sr.layout); fs.writeFileSync(String(a.render), String(a.render).endsWith('.png') ? P.toPng(svg) : svg); }
        } else if (!a['dry-run'] && fs.existsSync(lockFile)) fs.writeFileSync(lockFile, JSON.stringify(await P.buildLayout(r.diagram, { engine })));
        if (!a['dry-run']) write(file, r.diagram);
        if (a.render && !a.stable) await writeRender(r.diagram, String(a.render), { engine });
        out(`${a['dry-run'] ? 'DRY-RUN ' : ''}ok ${r.changes.length} change(s)\n${P.summarizeChanges(r.changes)}\ncheck: ${summary(metrics)}${stableNote}${diags.some((x) => x.sev !== 'info') ? '\n' + P.formatDiags(diags.filter((x) => x.sev !== 'info'), 10) : ''}`);
        return process.exit(metrics.errors ? 1 : 0);
      }
      case 'check': {
        const d = read(file);
        const { diags, metrics } = await P.check(d, { engine });
        if (a.json) out(JSON.stringify({ metrics, diags }, null, 1));
        else out(`check: ${summary(metrics)}${diags.length ? '\n' + P.formatDiags(diags, Number(a.max ?? 20)) : ''}`);
        return process.exit(metrics.errors ? 1 : 0);
      }
      case 'show': {
        const d = read(file);
        if (a.around) return out(P.around(d, String(a.around), Number(a.depth ?? 1)));
        if (a.ids) return out(P.idsOnly(d));
        if (a.stats) return out(P.stats(d));
        return out(P.serialize(d));
      }
      case 'render': {
        const o = String(a.o ?? a.out ?? file.replace(/\.plano$/, '') + '.svg');
        const L = await writeRender(read(file), o, { theme: a.theme as string, engine, embedFont: a['embed-font'] !== false });
        if (a.lock) fs.writeFileSync(file + '.lock.json', JSON.stringify(L));
        return out(`wrote ${o} (${Math.round(L.width)}x${Math.round(L.height)}, ${L.engine}, ${L.ms.toFixed(0)}ms)`);
      }
      case 'export': {
        const d = read(file);
        const to = String(a.to ?? 'mermaid');
        let s: string;
        if (to === 'mermaid') s = P.toMermaid(d);
        else {
          const L = await P.buildLayout(d, { engine });
          s = to === 'excalidraw' ? P.toExcalidraw(L) : to === 'drawio' ? P.toDrawio(L) : JSON.stringify(L, null, 1);
        }
        if (a.o) { fs.writeFileSync(String(a.o), s); return out(`wrote ${a.o}`); }
        return out(s);
      }
      case 'diff': {
        const A = read(file), B = read(file2);
        const lines = P.semanticDiff(A, B);
        let s = lines.length ? lines.join('\n') : 'no semantic changes';
        if (a.layout) {
          const st = P.stability(await P.buildLayout(A), await P.buildLayout(B));
          s += `\nlayout: common=${st.common} meanShift=${st.meanShift.toFixed(1)}px maxShift=${st.maxShift.toFixed(0)}px moved>20px=${st.moved20} orderX=${st.tauX.toFixed(2)} orderY=${st.tauY.toFixed(2)} area${st.sizeChange >= 0 ? '+' : ''}${(st.sizeChange * 100).toFixed(0)}%`;
        }
        return out(s);
      }
      case 'fmt': { write(file, read(file)); return out(`formatted ${file}`); }
      default: return out(HELP);
    }
  } catch (e: any) {
    if (e instanceof P.ParseError) fail(2, `${e.message}`);
    if (e?.code === 'ENOENT') fail(2, `E_NOT_FOUND ${e.path}`);
    throw e;
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1]?.endsWith('cli.ts')) await main(process.argv.slice(2));
