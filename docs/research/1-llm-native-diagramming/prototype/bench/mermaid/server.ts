// Servidor local mínimo: sirve el arnés y recibe la geometría extraída (POST /results/<name>).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8765);
http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'POST' && url.pathname.startsWith('/results/')) {
    const name = path.basename(url.pathname).replace(/[^\w.-]/g, '');
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { fs.mkdirSync(path.join(dir, 'results'), { recursive: true }); fs.writeFileSync(path.join(dir, 'results', name), body); res.end('ok'); });
    return;
  }
  const f = path.join(dir, path.normalize(url.pathname === '/' ? 'harness.html' : url.pathname).replace(/^([/\\])+/, ''));
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', f.endsWith('.html') ? 'text/html' : f.endsWith('.json') ? 'application/json' : 'text/plain');
  res.end(fs.readFileSync(f));
}).listen(port, () => console.log(`listening on ${port}`));
