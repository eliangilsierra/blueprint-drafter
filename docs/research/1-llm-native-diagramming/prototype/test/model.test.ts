import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from '../src/index.ts';

const cases = fs.readdirSync('bench/cases').filter((f) => f.endsWith('.plano'));

test('serialización canónica: parse ∘ serialize es idempotente en todos los casos', () => {
  for (const f of cases) {
    const once = P.serialize(P.parse(fs.readFileSync('bench/cases/' + f, 'utf8')));
    assert.equal(P.serialize(P.parse(once)), once, f);
  }
});
test('atributos desconocidos se preservan (política de extensiones)', () => {
  const d = P.parse('plano 1 type=architecture dir=LR\nnode a service "A" owner=team-x\nedge a>a "self" sla=99.9\n');
  const s = P.serialize(d);
  assert.match(s, /owner=team-x/);
  assert.match(s, /sla=99.9/);
});
test('un lote inválido es atómico: no modifica el diagrama', () => {
  const d = P.parse(fs.readFileSync('bench/cases/04-distributed.plano', 'utf8'));
  const before = P.serialize(d);
  assert.throws(() => P.applyOps(d, ['+node x service "X"', '-node nope']), (e: any) => e.code === 'E_UNKNOWN_ID');
  assert.equal(P.serialize(d), before);
  const r = P.applyOps(d, ['+edge trips>ghost']);
  assert.equal(r.introduced[0].code, 'E_DANGLING_EDGE');
});
test('sugerencias "did you mean" en ids mal escritos', () => {
  const d = P.parse(fs.readFileSync('bench/cases/04-distributed.plano', 'utf8'));
  assert.throws(() => P.applyOps(d, ['-node triips']), (e: any) => /trips/.test(e.fix));
});
test('reconexión: id automático se regenera, explícito se conserva', () => {
  const d = P.parse('plano 1 type=architecture dir=LR\nnode a service "A"\nnode b service "B"\nnode c service "C"\nedge a>b "x"\nedge a>c "y" id=keep\n');
  const r = P.applyOps(d, ['~edge a>b to=c', '~edge keep to=b']);
  const ids = r.diagram.edges.map((e) => e.id).sort();
  assert.deepEqual(ids, ['a>c', 'keep']);
});
test('restricciones incompatibles producen diagnóstico claro', () => {
  const d = P.parse('plano 1 type=flow\nnode a process "A"\nnode b process "B"\nfirst a\nlast a\n');
  assert.ok(P.semanticCheck(d).some((x) => x.code === 'E_CONSTRAINT_CONFLICT'));
});
test('determinismo: misma entrada, mismo SVG', async () => {
  const d = P.parse(fs.readFileSync('bench/cases/02-c4-container.plano', 'utf8'));
  const a = P.renderSvg(await P.buildLayout(d), { embedFont: false });
  const b = P.renderSvg(await P.buildLayout(d), { embedFont: false });
  assert.equal(a, b);
});
test('todos los casos del benchmark: 0 errores con el motor completo', async () => {
  for (const f of cases) {
    const { metrics } = await P.check(P.parse(fs.readFileSync('bench/cases/' + f, 'utf8')));
    assert.equal(metrics.errors, 0, f);
  }
});
