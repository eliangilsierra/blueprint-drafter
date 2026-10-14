// Pruebas del validador con defectos sintéticos conocidos: cada defecto debe detectarse (exhaustividad)
// y cada situación legítima NO debe producir errores (precisión). Evita validadores ingenuos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout } from '../src/validate.ts';
import type { Layout, LNode, LEdge } from '../src/layout.ts';

const node = (id: string, x: number, y: number, w = 120, h = 50, extra: Partial<LNode> = {}): LNode => ({
  id, kind: 'service', group: false, depth: 0, x, y, w, h, shape: 'rect', role: 'internal',
  blocks: [{ lines: [id], widths: [40], style: { size: 14, weight: 600, lineHeight: 18 }, color: 'text', y: 0 }],
  content: { x: 40, y: 16, w: 40, h: 18 }, truncated: false, ...extra,
});
const group = (id: string, x: number, y: number, w: number, h: number): LNode => ({ ...node(id, x, y, w, h), group: true, kind: 'boundary', shape: 'rect', role: 'neutral', blocks: [], content: { x: 12, y: 10, w: 60, h: 16 } });
const edge = (id: string, from: string, to: string, points: [number, number][], extra: Partial<LEdge> = {}): LEdge => ({ id, from, to, points, ...extra });
const L = (nodes: LNode[], edges: LEdge[] = []): Layout => ({ width: 1000, height: 800, nodes, edges, engine: 'test', ms: 0, theme: 'light', type: 'architecture' });
const codes = (l: Layout) => validateLayout(l).diags.map((d) => d.code);
const errors = (l: Layout) => validateLayout(l).diags.filter((d) => d.sev === 'error').map((d) => d.code);

test('detecta solape entre nodos', () => assert.ok(codes(L([node('a', 0, 0), node('b', 60, 20)])).includes('E_NODE_OVERLAP')));
test('no confunde contención padre/hijo con solape', () => {
  const g = group('g', 0, 0, 300, 200), a = node('a', 40, 60, 120, 50, { parent: 'g' });
  assert.deepEqual(errors(L([g, a])), []);
});
test('detecta hijo fuera de su grupo', () => assert.ok(codes(L([group('g', 0, 0, 100, 100), node('a', 50, 50, 120, 50, { parent: 'g' })])).includes('E_OUTSIDE_PARENT')));
test('detecta texto desbordado', () => {
  const a = node('a', 0, 0, 120, 50, { blocks: [{ lines: ['x'], widths: [180], style: { size: 14, weight: 600, lineHeight: 18 }, color: 'text', y: 0 }] });
  assert.ok(codes(L([a])).includes('E_TEXT_OVERFLOW'));
});
test('detecta conector que atraviesa un nodo ajeno', () => {
  const l = L([node('a', 0, 0), node('m', 200, 0), node('b', 400, 0)], [edge('a>b', 'a', 'b', [[120, 25], [400, 25]])]);
  assert.ok(codes(l).includes('E_EDGE_THROUGH_NODE'));
});
test('un cruce legítimo entre conectores no es un error', () => {
  const l = L([node('a', 0, 200), node('b', 400, 200), node('c', 200, 0), node('d', 200, 400)],
    [edge('a>b', 'a', 'b', [[120, 225], [400, 225]]), edge('c>d', 'c', 'd', [[260, 50], [260, 400]])]);
  const v = validateLayout(l);
  assert.equal(v.metrics.crossings, 1);
  assert.deepEqual(v.diags.filter((d) => d.sev === 'error'), []);
});
test('entrar en el propio grupo no es "atravesar grupo"', () => {
  const l = L([node('a', 0, 100), group('g', 200, 0, 300, 300), node('b', 300, 120, 120, 50, { parent: 'g' })], [edge('a>b', 'a', 'b', [[120, 125], [300, 125]])]);
  assert.ok(!codes(l).includes('W_EDGE_THROUGH_GROUP'));
});
test('atravesar un grupo ajeno sí se advierte', () => {
  const l = L([node('a', 0, 100), group('g', 200, 0, 150, 300), node('b', 450, 100)], [edge('a>b', 'a', 'b', [[120, 125], [450, 125]])]);
  assert.ok(codes(l).includes('W_EDGE_THROUGH_GROUP'));
});
test('tramos superpuestos: legítimo si comparten extremo, ambiguo si no', () => {
  const shared = L([node('a', 0, 0), node('b', 300, 0), node('c', 300, 200)], [edge('a>b', 'a', 'b', [[120, 25], [200, 25], [300, 25]]), edge('a>c', 'a', 'c', [[120, 25], [200, 25], [200, 225], [300, 225]])]);
  assert.ok(!codes(shared).includes('W_EDGE_OVERLAP'));
  const unrelated = L([node('a', 0, 0), node('b', 500, 0), node('c', 0, 100), node('d', 500, 100)], [edge('a>b', 'a', 'b', [[120, 25], [250, 25], [250, 80], [500, 80], [500, 25]]), edge('c>d', 'c', 'd', [[120, 125], [200, 125], [200, 80], [450, 80], [450, 100]])]);
  assert.ok(codes(unrelated).includes('W_EDGE_OVERLAP'));
});
test('detecta flechas que no llegan a su destino', () => {
  const l = L([node('a', 0, 0), node('b', 300, 0)], [edge('a>b', 'a', 'b', [[120, 25], [290, 25]])]);
  assert.ok(codes(l).includes('E_EDGE_ENDPOINT_GAP'));
});
test('rombo: el extremo debe tocar el contorno real, no la caja', () => {
  const d = node('d', 300, 0, 120, 60, { shape: 'diamond', content: { x: 40, y: 21, w: 40, h: 18 } });
  const bad = L([node('a', 0, 0), d], [edge('a>d', 'a', 'd', [[120, 5], [300, 5]])]); // esquina de la caja: fuera del rombo
  assert.ok(codes(bad).includes('E_EDGE_ENDPOINT_GAP'));
  const good = L([node('a', 0, 5), d], [edge('a>d', 'a', 'd', [[120, 30], [300, 30]])]); // vértice izquierdo
  assert.ok(!codes(good).includes('E_EDGE_ENDPOINT_GAP'));
});
test('detecta etiqueta sobre un nodo', () => {
  const l = L([node('a', 0, 0), node('b', 300, 0), node('c', 150, 100)], [edge('a>b', 'a', 'b', [[120, 25], [300, 25]], { label: { x: 150, y: 90, w: 80, h: 20, lines: ['x'] } })]);
  assert.ok(codes(l).includes('E_LABEL_OVERLAPS_NODE'));
});
test('detecta etiqueta ambigua entre dos conectores paralelos', () => {
  const l = L([node('a', 0, 0), node('b', 0, 300), node('c', 100, 0), node('d', 100, 300)],
    [edge('a>b', 'a', 'b', [[60, 50], [60, 300]], { label: { x: 70, y: 150, w: 20, h: 14, lines: ['no'] } }), edge('c>d', 'c', 'd', [[100, 50], [100, 300]])]);
  assert.ok(codes(l).includes('W_LABEL_AMBIGUOUS'));
});
