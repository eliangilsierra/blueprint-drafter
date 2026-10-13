// Coste de inspección visual de un render (fórmula documentada por Anthropic, consulta 2026-10-13):
// tokens = ceil(w/28)*ceil(h/28); nivel alta resolución: lado largo ≤2576 px y ≤4784 tokens (se reescala).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const enc = require('js-tiktoken').getEncoding('o200k_base');
const r = JSON.parse(fs.readFileSync('bench/results/results.json', 'utf8'));
function visual(w: number, h: number, maxEdge = 2576, maxTok = 4784) {
  let s = Math.min(1, maxEdge / Math.max(w, h));
  while (Math.ceil((w * s) / 28) * Math.ceil((h * s) / 28) > maxTok) s *= 0.99;
  return { tokens: Math.ceil((w * s) / 28) * Math.ceil((h * s) / 28), scale: s };
}
const rows = [];
for (const q of r.quality.filter((x: any) => x.variant === 'plano')) {
  for (const zoom of [1, 2]) {
    const v = visual(q.width * zoom, q.height * zoom);
    rows.push({ case: q.case, png: `${q.width * zoom}x${q.height * zoom}`, visualTokens: v.tokens, effectiveScaleVs1x: +(v.scale * zoom).toFixed(2) });
  }
  const diag = fs.readFileSync(`bench/results/${q.case}.diagnostics.txt`, 'utf8');
  rows.push({ case: q.case, png: 'diagnósticos de texto', visualTokens: enc.encode(diag).length, effectiveScaleVs1x: null });
}
fs.writeFileSync('bench/results/vision-cost.json', JSON.stringify(rows, null, 1));
console.table(rows);
