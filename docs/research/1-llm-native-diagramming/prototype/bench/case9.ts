// Caso 9: actualizar la arquitectura a partir de cambios de código (Git real, dos commits).
// El extractor es determinista (sin LLM). La sincronización genera operaciones, no un archivo nuevo,
// y por eso preserva la curación humana (etiquetas, descripciones, actores añadidos a mano).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as P from '../src/index.ts';
import { validateLayout } from '../src/validate.ts';

const require = createRequire(import.meta.url);
const enc = require('js-tiktoken').getEncoding('o200k_base');
const tk = (s: string) => enc.encode(s).length;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
// repositorio en el directorio temporal del sistema (rutas cortas: Windows limita la longitud)
const repo = process.env.CASE9_REPO ?? path.join(os.tmpdir(), 'plano-case9-repo');
fs.rmSync(repo, { recursive: true, force: true });
fs.mkdirSync(repo, { recursive: true });
const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: repo, encoding: 'utf8' });
const write = (f: string, s: string) => { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), s); };

// ---- commit 1
git('init', '-q');
write('src/api/routes.ts', `import { createOrder } from '../orders/service';\nimport { auth } from '../auth/jwt';\nexport const routes = [createOrder, auth];\n`);
write('src/auth/jwt.ts', `import jwt from 'jsonwebtoken';\nexport const auth = () => jwt;\n`);
write('src/orders/service.ts', `import { db } from '../db/client';\nimport { publish } from '../events/bus';\nimport { legacyTax } from '../legacy/tax';\nexport const createOrder = () => { db; publish; legacyTax; };\n`);
write('src/db/client.ts', `import { Pool } from 'pg';\nexport const db = new Pool();\n`);
write('src/events/bus.ts', `import { Kafka } from 'kafkajs';\nexport const publish = () => new Kafka({ brokers: [] });\n`);
write('src/legacy/tax.ts', `export const legacyTax = 0.21;\n`);
git('add', '-A'); git('commit', '-q', '-m', 'v1');
// ---- commit 2: nuevo módulo de pagos con Stripe; se elimina legacy; routes usa payments
write('src/payments/stripe.ts', `import Stripe from 'stripe';\nimport { db } from '../db/client';\nimport { publish } from '../events/bus';\nexport const charge = () => { new Stripe(''); db; publish; };\n`);
write('src/api/routes.ts', `import { createOrder } from '../orders/service';\nimport { auth } from '../auth/jwt';\nimport { charge } from '../payments/stripe';\nexport const routes = [createOrder, auth, charge];\n`);
write('src/orders/service.ts', `import { db } from '../db/client';\nimport { publish } from '../events/bus';\nexport const createOrder = () => { db; publish; };\n`);
fs.rmSync(path.join(repo, 'src/legacy'), { recursive: true });
git('add', '-A'); git('commit', '-q', '-m', 'v2');

// ---- extractor determinista: módulos = carpetas bajo src/, dependencias = imports relativos; paquetes conocidos => sistemas
const KNOWN: Record<string, [string, string, string]> = { pg: ['postgres', 'db', 'PostgreSQL'], kafkajs: ['kafka', 'topic', 'Kafka'], stripe: ['stripe', 'external', 'Stripe API'], jsonwebtoken: ['', '', ''] };
function extract(ref: string): P.Diagram {
  const files = git('ls-tree', '-r', '--name-only', ref).split('\n').filter((f) => /^src\/[^/]+\/.+\.ts$/.test(f));
  const d = P.emptyDiagram('component');
  d.title = 'Order API — module dependencies (from code)';
  const mods = new Set<string>(), edges = new Set<string>();
  for (const f of files) {
    const mod = f.split('/')[1];
    mods.add(mod);
    const src = git('show', `${ref}:${f}`);
    for (const m of src.matchAll(/from ['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (spec.startsWith('.')) { const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec)).split('/')[1]; if (target && target !== mod) edges.add(`${mod}>${target}>uses`); }
      else if (KNOWN[spec]?.[0]) edges.add(`${mod}>${KNOWN[spec][0]}>${spec}`);
    }
  }
  d.nodes.push({ id: 'app', kind: 'boundary', label: 'order-api', group: true, tags: ['code'] });
  for (const m of [...mods].sort()) d.nodes.push({ id: m, kind: 'module', label: m, in: 'app', tags: ['code'] });
  for (const [id, kind, label] of Object.values(KNOWN)) if (id && [...edges].some((e) => e.split('>')[1] === id)) d.nodes.push({ id, kind, label, tags: ['code'] });
  for (const e of [...edges].sort()) { const [from, to, via] = e.split('>'); d.edges.push({ id: `${from}>${to}`, from, to, label: via === 'uses' ? 'uses' : `via ${via}`, ext: { src: 'code' } }); }
  return d;
}

const v1 = extract('HEAD~1');
// curación humana sobre la versión 1 (lo que un arquitecto haría a mano)
const curation = ['~node orders label="Order Management" desc="Owns the order lifecycle"', '+node client person "API Client"', '+edge client>api "Calls" tech=HTTPS'];
const curated = P.applyOps(v1, curation).diagram;
const L1 = await P.buildLayout(curated);
// commit 2 => operaciones de sincronización
const v2 = extract('HEAD');
const ops = P.syncOps(curated, v2);
const synced = P.applyOps(curated, ops);
const after = synced.diagram;
const check = await P.check(after);
const stable = await P.stableLayout(after, L1);
const fresh = await P.buildLayout(after);
const preserved = after.nodes.find((n) => n.id === 'orders')?.label === 'Order Management' && after.nodes.some((n) => n.id === 'client') && after.edges.some((e) => e.id === 'client>api');
const regenerated = extract('HEAD');
const regenLosesCuration = !(regenerated.nodes.find((n) => n.id === 'orders')?.label === 'Order Management');
fs.writeFileSync(path.join(root, 'bench', 'results', '09-v1-curated.plano'), P.serialize(curated));
fs.writeFileSync(path.join(root, 'bench', 'results', '09-v2-synced.plano'), P.serialize(after));
fs.writeFileSync(path.join(root, 'bench', 'results', '09-v1.svg'), P.renderSvg(L1));
fs.writeFileSync(path.join(root, 'bench', 'results', '09-v2-stable.svg'), P.renderSvg(stable.layout));
fs.writeFileSync(path.join(root, 'bench', 'results', '09-v2-fresh.svg'), P.renderSvg(fresh));
const res = {
  ops, changes: synced.changes, introducedErrors: synced.introduced.length,
  check: { errors: check.metrics.errors, warnings: check.metrics.warnings, crossings: check.metrics.crossings },
  curationPreserved: preserved, regenerationWouldLoseCuration: regenLosesCuration,
  tokens: { syncOps: tk(ops.join('\n')), fullRegeneratedFile: tk(P.serialize(after)) },
  stability: { stableMode: stable.mode, stable: P.stability(L1, stable.layout), fresh: P.stability(L1, fresh), stableErrors: validateLayout(stable.layout).metrics.errors, stableCrossings: validateLayout(stable.layout).metrics.crossings, freshCrossings: validateLayout(fresh).metrics.crossings },
};
fs.writeFileSync(path.join(root, 'bench', 'results', 'case9.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
