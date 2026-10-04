/* Local stand-in for Vercel: serves the static site, routes /api/* to the function
   handlers with Vercel's res helpers, applies vercel.json rewrites, and loads
   .env.local. `npm run dev` then open http://localhost:8741 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8741);

for (const line of (fs.existsSync(path.join(ROOT, '.env.local')) ? fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8') : '').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const rewrites = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites ?? [];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.pdf': 'application/pdf', '.glb': 'model/gltf-binary', '.txt': 'text/plain' };

function vercelRes(res) {
  res.status = c => ((res.statusCode = c), res);
  res.json = o => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = b => (res.end(b), res);
  return res;
}

http.createServer(async (req, res) => {
  let { pathname } = new URL(req.url, 'http://x');
  const rw = rewrites.find(r => r.source === pathname);
  if (rw) pathname = rw.destination;
  try {
    if (pathname.startsWith('/api/')) {
      const file = path.join(ROOT, `${pathname}.js`);
      if (!fs.existsSync(file) || path.basename(file).startsWith('_')) return res.writeHead(404).end();
      const mod = await import(`${pathToFileURL(file).href}?t=${fs.statSync(file).mtimeMs}`);
      return await mod.default(req, vercelRes(res));
    }
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500).end('dev server error');
  }
}).listen(PORT, () => console.log(`portfolio dev on http://localhost:${PORT}  (key ${process.env.PORTFOLIO_ANTHROPIC_KEY ? 'loaded' : 'missing: FIXER runs offline'})`));
