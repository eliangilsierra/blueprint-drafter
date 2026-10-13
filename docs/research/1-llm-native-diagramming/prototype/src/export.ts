// Exportadores: el motor actúa como "compilador de layout" para herramientas existentes.
// Excalidraw y draw.io reciben geometría ya validada, con flechas realmente enlazadas.
import { createRequire } from 'node:module';
import type { Diagram } from './model.ts';
import type { Layout, LNode } from './layout.ts';
import { THEMES } from './theme.ts';
import { ttfPaths, FONT_FAMILY } from './fonts.ts';

const require = createRequire(import.meta.url);

// ------------------------------------------------------------------ Mermaid
export function toMermaid(d: Diagram): string {
  const qm = (s: string) => '"' + s.replace(/"/g, '#quot;') + '"';
  if (d.type === 'sequence') {
    const out = ['sequenceDiagram'];
    if (d.title) out.push(`  title ${d.title}`);
    for (const n of d.nodes) out.push(`  ${n.kind === 'actor' || n.kind === 'person' ? 'actor' : 'participant'} ${n.id} as ${n.label}`);
    for (const e of d.edges) out.push(`  ${e.from}${e.style === 'reply' ? '-->>' : e.style === 'async' ? '-)' : '->>'}${e.to}: ${e.label ?? ''}`);
    return out.join('\n') + '\n';
  }
  const out = [`flowchart ${d.dir}`];
  const shape = (n: Diagram['nodes'][number]) => {
    const lbl = n.label + (n.tech ? `<br/><small>[${n.tech}]</small>` : '') + (n.desc ? `<br/><small>${n.desc}</small>` : '');
    const L = qm(lbl);
    switch (n.kind) {
      case 'decision': return `{${L}}`;
      case 'start': case 'end': return `([${L}])`;
      case 'db': case 'cache': case 'storage': return `[(${L})]`;
      case 'queue': case 'topic': return `[[${L}]]`;
      case 'io': return `[/${L}/]`;
      case 'person': case 'actor': return `((${L}))`;
      case 'gateway': return `{{${L}}}`;
      default: return `[${L}]`;
    }
  };
  const emit = (parent: string | undefined, indent: string) => {
    for (const n of d.nodes.filter((x) => x.in === parent || (!parent && !x.in))) {
      if (n.group) { out.push(`${indent}subgraph ${n.id}[${qm(n.label)}]`); emit(n.id, indent + '  '); out.push(`${indent}end`); }
      else out.push(`${indent}${n.id}${shape(n)}`);
    }
  };
  emit(undefined, '  ');
  for (const e of d.edges) {
    const arrow = e.style === 'async' || e.style === 'dep' || e.style === 'reply' ? '-.->' : '-->';
    const lbl = e.label ? `|${qm(e.label + (e.tech ? ` [${e.tech}]` : ''))}|` : '';
    out.push(`  ${e.from} ${arrow}${lbl} ${e.to}`);
  }
  return out.join('\n') + '\n';
}

// ------------------------------------------------------------------ Excalidraw
let seed = 1;
const base = (id: string, type: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}) => ({
  id, type, x, y, width: w, height: h, angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid',
  roughness: 0, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: seed++, version: 1, versionNonce: seed * 7919, isDeleted: false,
  boundElements: [] as { id: string; type: string }[], updated: 1, link: null, locked: false, ...extra,
});

export function toExcalidraw(L: Layout): string {
  seed = 1;
  const th = THEMES[L.theme] ?? THEMES.light;
  const els: any[] = [];
  const byId = new Map<string, any>();
  const text = (id: string, s: string, x: number, y: number, w: number, h: number, size: number, container: string | null, align = 'center') =>
    base(id, 'text', x, y, w, h, { text: s, originalText: s, fontSize: size, fontFamily: 2, textAlign: align, verticalAlign: container ? 'middle' : 'top', containerId: container, autoResize: true, lineHeight: 1.25, strokeColor: th.text });
  for (const g of L.nodes.filter((n) => n.group).sort((a, b) => a.depth - b.depth)) {
    const r = base('g_' + g.id, 'rectangle', g.x, g.y, g.w, g.h, { strokeStyle: 'dashed', strokeColor: th.groupStroke, backgroundColor: th.groupFill[g.kind] ?? th.groupFill.group, roundness: { type: 3 } });
    els.push(r);
    els.push(text('gt_' + g.id, g.blocks[0].lines.join(' '), g.x + 12, g.y + 8, g.content.w, 16, 14, null, 'left'));
  }
  for (const n of L.nodes.filter((x) => !x.group)) {
    const role = th.roles[n.role];
    const type = n.shape === 'diamond' ? 'diamond' : 'rectangle';
    const r = base('n_' + n.id, type, n.x, n.y, n.w, n.h, { strokeColor: role.stroke, backgroundColor: role.fill, roundness: type === 'rectangle' ? { type: 3 } : null, strokeStyle: n.kind === 'external' ? 'dashed' : 'solid' });
    const s = n.blocks.map((b) => b.lines.join('\n')).join('\n');
    const t = text('t_' + n.id, s, n.x + n.content.x, n.y + n.content.y, n.content.w, n.content.h, 14, r.id);
    r.boundElements.push({ id: t.id, type: 'text' });
    els.push(r, t);
    byId.set(n.id, r);
  }
  for (const e of L.edges) {
    const [x0, y0] = e.points[0];
    const xs = e.points.map((p) => p[0]), ys = e.points.map((p) => p[1]);
    const a = base('e_' + e.id, 'arrow', x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), {
      points: e.points.map(([x, y]) => [x - x0, y - y0]), strokeColor: th.edge, strokeStyle: e.style === 'async' || e.style === 'reply' ? 'dashed' : 'solid',
      startArrowhead: e.dir === 'both' ? 'arrow' : null, endArrowhead: e.dir === 'none' ? null : 'arrow', lastCommittedPoint: null, elbowed: false,
      startBinding: byId.has(e.from) ? { elementId: 'n_' + e.from, focus: 0, gap: 1 } : null,
      endBinding: byId.has(e.to) ? { elementId: 'n_' + e.to, focus: 0, gap: 1 } : null,
    });
    // vínculo bidireccional: la forma también debe listar la flecha (si no, la flecha "flota")
    byId.get(e.from)?.boundElements.push({ id: a.id, type: 'arrow' });
    byId.get(e.to)?.boundElements.push({ id: a.id, type: 'arrow' });
    els.push(a);
    if (e.label) {
      const t = text('l_' + e.id, e.label.lines.join('\n'), e.label.x, e.label.y, e.label.w, e.label.h, 12, a.id);
      a.boundElements.push({ id: t.id, type: 'text' });
      els.push(t);
    }
  }
  return JSON.stringify({ type: 'excalidraw', version: 2, source: 'plano', elements: els, appState: { viewBackgroundColor: th.canvas, gridSize: null }, files: {} }, null, 1);
}

// ------------------------------------------------------------------ draw.io
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function toDrawio(L: Layout): string {
  const th = THEMES[L.theme] ?? THEMES.light;
  const cells: string[] = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const shapeStyle = (n: LNode) => {
    switch (n.shape) {
      case 'diamond': return 'rhombus;';
      case 'pill': return 'rounded=1;arcSize=50;';
      case 'cylinder': return 'shape=cylinder3;boundedLbl=1;size=7;';
      case 'hexagon': return 'shape=hexagon;perimeter=hexagonPerimeter2;size=14;fixedSize=1;';
      case 'parallelogram': return 'shape=parallelogram;perimeter=parallelogramPerimeter;size=12;fixedSize=1;';
      default: return 'rounded=1;arcSize=12;absoluteArcSize=1;';
    }
  };
  for (const g of L.nodes.filter((n) => n.group).sort((a, b) => a.depth - b.depth))
    cells.push(`<mxCell id="${xmlEsc(g.id)}" value="${xmlEsc(g.blocks[0].lines.join(' '))}" style="rounded=1;arcSize=10;absoluteArcSize=1;dashed=1;fillColor=${th.groupFill[g.kind] ?? th.groupFill.group};strokeColor=${th.groupStroke};fontColor=${th.groupText};fontStyle=1;align=left;verticalAlign=top;spacingLeft=10;spacingTop=4;fontFamily=${FONT_FAMILY};container=0;" vertex="1" parent="1"><mxGeometry x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" as="geometry"/></mxCell>`);
  for (const n of L.nodes.filter((x) => !x.group)) {
    const r = th.roles[n.role];
    const html = n.blocks.map((b, i) => (i === 0 ? `<b>${xmlEsc(b.lines.join(' '))}</b>` : `<font style="font-size:${b.style.size}px" color="${r.sub}">${xmlEsc(b.lines.join(' '))}</font>`)).join('<br>');
    cells.push(`<mxCell id="${xmlEsc(n.id)}" value="${xmlEsc(html)}" style="${shapeStyle(n)}whiteSpace=wrap;html=1;fillColor=${r.fill};strokeColor=${r.stroke};fontColor=${r.text};fontFamily=${FONT_FAMILY};${n.kind === 'external' ? 'dashed=1;' : ''}" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`);
  }
  const byId = new Map(L.nodes.map((n) => [n.id, n]));
  for (const e of L.edges) {
    const s = byId.get(e.from)!, t = byId.get(e.to)!;
    const p0 = e.points[0], p1 = e.points[e.points.length - 1];
    const rel = (n: LNode, p: number[]) => `${((p[0] - n.x) / n.w).toFixed(3)}`;
    const relY = (n: LNode, p: number[]) => `${((p[1] - n.y) / n.h).toFixed(3)}`;
    const way = e.points.slice(1, -1).map(([x, y]) => `<mxPoint x="${x}" y="${y}"/>`).join('');
    const dash = e.style === 'async' || e.style === 'reply' || e.style === 'dep' ? 'dashed=1;' : '';
    cells.push(`<mxCell id="${xmlEsc('e:' + e.id)}" value="${xmlEsc(e.label?.lines.join(' ') ?? '')}" style="edgeStyle=none;rounded=1;html=1;endArrow=block;endFill=1;${dash}strokeColor=${th.edge};fontColor=${th.textMuted};fontSize=11;fontFamily=${FONT_FAMILY};labelBackgroundColor=${th.edgeLabelBg};exitX=${rel(s, p0)};exitY=${relY(s, p0)};entryX=${rel(t, p1)};entryY=${relY(t, p1)};exitPerimeter=0;entryPerimeter=0;" edge="1" parent="1" source="${xmlEsc(e.from)}" target="${xmlEsc(e.to)}"><mxGeometry relative="1" as="geometry">${way ? `<Array as="points">${way}</Array>` : ''}</mxGeometry></mxCell>`);
  }
  return `<mxfile host="plano"><diagram name="${xmlEsc(L.title ?? 'Diagram')}"><mxGraphModel grid="0" page="0" background="${th.canvas}"><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>\n`;
}

// ------------------------------------------------------------------ PNG
export function toPng(svg: string, scale = 2): Buffer {
  const { Resvg } = require('@resvg/resvg-js');
  const r = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { fontFiles: ttfPaths(), loadSystemFonts: false, defaultFontFamily: FONT_FAMILY } });
  return r.render().asPng();
}
