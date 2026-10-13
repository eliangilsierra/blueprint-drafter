// Sistema visual: el agente elige *roles semánticos* (kind), nunca colores ni tamaños.
// Cada kind se asigna a un rol; cada rol tiene tokens por tema. Los contrastes se validan.

export type Role = 'actor' | 'internal' | 'data' | 'messaging' | 'external' | 'flow' | 'decision' | 'terminal' | 'neutral';
export type Shape = 'rect' | 'pill' | 'diamond' | 'cylinder' | 'pipe' | 'person' | 'parallelogram' | 'hexagon';

export const KIND_STYLE: Record<string, { role: Role; shape: Shape; caption?: string }> = {
  start: { role: 'terminal', shape: 'pill' },
  end: { role: 'terminal', shape: 'pill' },
  process: { role: 'flow', shape: 'rect' },
  subprocess: { role: 'flow', shape: 'rect', caption: 'subprocess' },
  io: { role: 'flow', shape: 'parallelogram' },
  decision: { role: 'decision', shape: 'diamond' },
  person: { role: 'actor', shape: 'person', caption: 'Person' },
  actor: { role: 'actor', shape: 'person' },
  participant: { role: 'internal', shape: 'rect' },
  system: { role: 'internal', shape: 'rect', caption: 'Software System' },
  external: { role: 'external', shape: 'rect', caption: 'External System' },
  container: { role: 'internal', shape: 'rect', caption: 'Container' },
  service: { role: 'internal', shape: 'rect', caption: 'Service' },
  component: { role: 'internal', shape: 'rect', caption: 'Component' },
  module: { role: 'internal', shape: 'rect', caption: 'Module' },
  webapp: { role: 'internal', shape: 'rect', caption: 'Web App' },
  mobile: { role: 'internal', shape: 'rect', caption: 'Mobile App' },
  gateway: { role: 'internal', shape: 'hexagon', caption: 'Gateway' },
  function: { role: 'internal', shape: 'rect', caption: 'Function' },
  db: { role: 'data', shape: 'cylinder', caption: 'Database' },
  cache: { role: 'data', shape: 'cylinder', caption: 'Cache' },
  storage: { role: 'data', shape: 'cylinder', caption: 'Storage' },
  queue: { role: 'messaging', shape: 'pipe', caption: 'Queue' },
  topic: { role: 'messaging', shape: 'pipe', caption: 'Topic' },
};
export const styleOf = (kind: string) => KIND_STYLE[kind] ?? { role: 'neutral' as Role, shape: 'rect' as Shape };

type RoleTokens = { fill: string; stroke: string; text: string; sub: string };
export type Theme = {
  name: string;
  canvas: string;
  text: string;
  textMuted: string;
  edge: string;
  edgeLabelBg: string;
  groupFill: Record<string, string>;
  groupStroke: string;
  groupText: string;
  roles: Record<Role, RoleTokens>;
};

export const THEMES: Record<string, Theme> = {
  light: {
    name: 'light',
    canvas: '#FFFFFF',
    text: '#17202B',
    textMuted: '#556070',
    edge: '#5A6576',
    edgeLabelBg: '#FFFFFF',
    groupFill: { boundary: '#F7F8FA', zone: '#F2F5F8', cluster: '#F4F6F9', layer: '#F7F8FA', group: '#F7F8FA' },
    groupStroke: '#A9B2BF',
    groupText: '#3B4552',
    roles: {
      actor: { fill: '#EEF0FB', stroke: '#4152B0', text: '#17202B', sub: '#4A5363' },
      internal: { fill: '#EAF2FC', stroke: '#2763B0', text: '#14202E', sub: '#4A5667' },
      data: { fill: '#E6F4EF', stroke: '#1C7A5F', text: '#13241E', sub: '#45584F' },
      messaging: { fill: '#FCF2E1', stroke: '#A3670A', text: '#2A1E0B', sub: '#5C4E3A' },
      external: { fill: '#F3F4F6', stroke: '#6B7584', text: '#1F2630', sub: '#535C69' },
      flow: { fill: '#EAF2FC', stroke: '#2763B0', text: '#14202E', sub: '#4A5667' },
      decision: { fill: '#FCF2E1', stroke: '#A3670A', text: '#2A1E0B', sub: '#5C4E3A' },
      terminal: { fill: '#26303D', stroke: '#26303D', text: '#FFFFFF', sub: '#D5DAE1' },
      neutral: { fill: '#FFFFFF', stroke: '#7B8594', text: '#17202B', sub: '#556070' },
    },
  },
  dark: {
    name: 'dark',
    canvas: '#0F141A',
    text: '#E7EBF0',
    textMuted: '#A3ADBA',
    edge: '#8E99A8',
    edgeLabelBg: '#0F141A',
    groupFill: { boundary: '#151C24', zone: '#141B22', cluster: '#151C24', layer: '#151C24', group: '#151C24' },
    groupStroke: '#4A5564',
    groupText: '#C3CBD5',
    roles: {
      actor: { fill: '#1C2142', stroke: '#8794E8', text: '#EEF0FB', sub: '#B9C0E6' },
      internal: { fill: '#14263D', stroke: '#6AA3EE', text: '#EAF2FC', sub: '#AFC3DA' },
      data: { fill: '#11291F', stroke: '#4CC29A', text: '#E6F4EF', sub: '#A7CFC0' },
      messaging: { fill: '#2B2111', stroke: '#E0A646', text: '#FCF2E1', sub: '#D9C7A4' },
      external: { fill: '#1B2129', stroke: '#8F99A7', text: '#E3E7EC', sub: '#AEB6C1' },
      flow: { fill: '#14263D', stroke: '#6AA3EE', text: '#EAF2FC', sub: '#AFC3DA' },
      decision: { fill: '#2B2111', stroke: '#E0A646', text: '#FCF2E1', sub: '#D9C7A4' },
      terminal: { fill: '#D5DCE5', stroke: '#D5DCE5', text: '#0F141A', sub: '#2F3946' },
      neutral: { fill: '#161D25', stroke: '#8E99A8', text: '#E7EBF0', sub: '#A3ADBA' },
    },
  },
};

// Tipografía y espaciado: presets cerrados. El agente solo elige 'density'.
export const TYPE = {
  label: { size: 14, weight: 600 as const, lineHeight: 18 },
  caption: { size: 10.5, weight: 400 as const, lineHeight: 14 },
  desc: { size: 11.5, weight: 400 as const, lineHeight: 15 },
  edge: { size: 11, weight: 400 as const, lineHeight: 14 },
  group: { size: 12, weight: 600 as const, lineHeight: 16 },
};

export const DENSITY = {
  compact: { nodeNode: 32, between: 56, edgeNode: 18, edgeEdge: 12, maxTextW: 180 },
  normal: { nodeNode: 44, between: 72, edgeNode: 22, edgeEdge: 14, maxTextW: 200 },
  airy: { nodeNode: 60, between: 96, edgeNode: 28, edgeEdge: 18, maxTextW: 220 },
};

// WCAG 2.x contraste relativo
function lum(hex: string) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
