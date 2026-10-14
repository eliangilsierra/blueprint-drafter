// Genera las entradas Mermaid (desde el mismo modelo semántico) para la línea base en navegador.
import fs from 'node:fs';
import * as P from '../../src/index.ts';
const cases = ['01-flow', '02-c4-container', '03-components', '04-distributed', '06-long-labels', '07-groups', '10-complex'];
const out: Record<string, string> = {};
for (const c of cases) out[c] = P.toMermaid(P.parse(fs.readFileSync(`bench/cases/${c}.plano`, 'utf8')));
fs.writeFileSync('bench/mermaid/inputs.json', JSON.stringify(out, null, 1));
console.log(Object.keys(out).join(' '));
