// Hook genérico (Claude Code PostToolUse / Gemini AfterTool / Codex PostToolUse):
// lee el JSON del evento por stdin, localiza el .plano afectado y, si 'plano check' encuentra errores,
// devuelve exit 2 con los diagnósticos por stderr para que el agente los corrija en el siguiente paso.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let event = {};
try { event = JSON.parse(input || '{}'); } catch { process.exit(0); }
const ti = event.tool_input ?? event.toolInput ?? {};
const file = ti.file_path ?? ti.file ?? ti.path;
if (typeof file !== 'string' || !file.endsWith('.plano')) process.exit(0);

const cli = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..', 'src', 'cli.ts');
try {
  execFileSync(process.execPath, [cli, 'check', file, '--max', '10'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.exit(0); // sin errores: no interrumpir
} catch (e) {
  // exit 1 de plano = errores de validación → exit 2 del hook = feedback al agente
  process.stderr.write(`plano check found problems in ${file}:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
  process.exit(e.status === 1 ? 2 : 0);
}
