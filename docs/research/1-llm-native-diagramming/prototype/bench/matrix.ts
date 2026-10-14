// Matriz ponderada de arquitecturas candidatas + análisis de sensibilidad. `node bench/matrix.ts`
// Puntuaciones 1–5; la justificación de cada una está en 02-matriz-evaluacion.md.
const CRIT = ['calidad', 'validación', 'tokens', 'incremental', 'portabilidad', 'coste', 'instalación', 'interop', 'comercial', 'riesgo'] as const;
type C = (typeof CRIT)[number];
const PROFILES: Record<string, Record<C, number>> = {
  'Base (equilibrado)': { calidad: 15, validación: 15, tokens: 12, incremental: 10, portabilidad: 10, coste: 10, instalación: 8, interop: 8, comercial: 6, riesgo: 6 },
  'Prioridad coste/riesgo': { calidad: 12, validación: 12, tokens: 8, incremental: 5, portabilidad: 8, coste: 25, instalación: 8, interop: 7, comercial: 0, riesgo: 15 },
  'Prioridad producto comercial': { calidad: 15, validación: 12, tokens: 8, incremental: 12, portabilidad: 8, coste: 5, instalación: 8, interop: 8, comercial: 18, riesgo: 6 },
  'Prioridad agentes/tokens': { calidad: 12, validación: 18, tokens: 20, incremental: 12, portabilidad: 12, coste: 8, instalación: 6, interop: 6, comercial: 2, riesgo: 4 },
  'Prioridad calidad visual': { calidad: 30, validación: 15, tokens: 8, incremental: 10, portabilidad: 8, coste: 8, instalación: 5, interop: 6, comercial: 5, riesgo: 5 },
};
const ALT: Record<string, Record<C, number>> = {
  'A · Skill sobre Mermaid 12': { calidad: 4, validación: 2, tokens: 4, incremental: 2, portabilidad: 5, coste: 5, instalación: 3, interop: 4, comercial: 1, riesgo: 5 },
  "A' · Skill + linter geométrico sobre Mermaid": { calidad: 4, validación: 4, tokens: 4, incremental: 2, portabilidad: 5, coste: 4, instalación: 3, interop: 4, comercial: 3, riesgo: 4 },
  'B · CLI semántica (núcleo + CLI)': { calidad: 4, validación: 5, tokens: 5, incremental: 3, portabilidad: 4, coste: 4, instalación: 4, interop: 4, comercial: 3, riesgo: 4 },
  'C · Solo servidor MCP': { calidad: 4, validación: 5, tokens: 4, incremental: 3, portabilidad: 3, coste: 4, instalación: 4, interop: 4, comercial: 3, riesgo: 4 },
  'D · Motor de layout propio desde cero': { calidad: 3, validación: 5, tokens: 5, incremental: 4, portabilidad: 4, coste: 1, instalación: 4, interop: 4, comercial: 4, riesgo: 1 },
  'E · Aplicación visual primero': { calidad: 4, validación: 3, tokens: 2, incremental: 4, portabilidad: 2, coste: 2, instalación: 2, interop: 3, comercial: 4, riesgo: 2 },
  'F · Híbrido (núcleo + CLI + MCP fino + Skill + CI)': { calidad: 4, validación: 5, tokens: 5, incremental: 3, portabilidad: 5, coste: 3, instalación: 4, interop: 5, comercial: 4, riesgo: 3 },
  'G1 · Extender LikeC4 (upstream)': { calidad: 4, validación: 4, tokens: 4, incremental: 3, portabilidad: 4, coste: 4, instalación: 4, interop: 4, comercial: 2, riesgo: 3 },
  'G2 · draw.io MCP/Skill oficial (ELK+libavoid)': { calidad: 4, validación: 2, tokens: 1, incremental: 3, portabilidad: 4, coste: 5, instalación: 3, interop: 4, comercial: 1, riesgo: 4 },
};
const out: string[] = [];
const score = (a: Record<C, number>, w: Record<C, number>) => CRIT.reduce((s, c) => s + a[c] * w[c], 0) / CRIT.reduce((s, c) => s + w[c], 0) * 20;
out.push('| alternativa | ' + Object.keys(PROFILES).join(' | ') + ' |', '|---|' + Object.keys(PROFILES).map(() => '---').join('|') + '|');
for (const [name, a] of Object.entries(ALT)) out.push(`| ${name} | ` + Object.values(PROFILES).map((w) => score(a, w).toFixed(1)).join(' | ') + ' |');
out.push('', 'Ganador por perfil:');
for (const [p, w] of Object.entries(PROFILES)) {
  const ranked = Object.entries(ALT).map(([n, a]) => [n, score(a, w)] as const).sort((x, y) => y[1] - x[1]);
  out.push(`- ${p}: ${ranked[0][0]} (${ranked[0][1].toFixed(1)}), 2º ${ranked[1][0]} (${ranked[1][1].toFixed(1)}), 3º ${ranked[2][0]} (${ranked[2][1].toFixed(1)})`);
}
console.log(out.join('\n'));
