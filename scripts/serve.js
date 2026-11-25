// Server statico locale della webapp: http://127.0.0.1:5190 (mai 5180, riservata al gestionale SMOT).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PORT = 5190;
const RESERVED = 5180;

// Porta da usare: env PORT se è un intero valido, altrimenti la predefinita.
export function portaDa(env = process.env) {
  const n = Number(env.PORT);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : PORT;
}
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon',
};
const ROOT = fileURLToPath(new URL('../web', import.meta.url));

export function createServer({ root = ROOT, port = PORT } = {}) {
  if (port === RESERVED) throw new Error(`porta ${RESERVED} riservata a SMOT`);
  const base = resolve(root);
  return http.createServer(async (req, res) => {
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = normalize(join(base, path.endsWith('/') ? `${path}index.html` : path));
    if (file !== base && !file.startsWith(base + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Non trovato');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Cartella da servire: primo argomento (es. sito/dist); senza, la webapp in web/.
  const radice = process.argv[2] ? resolve(process.argv[2]) : undefined;
  const porta = portaDa();
  const server = createServer({ root: radice, port: porta });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error(`La porta ${porta} è già occupata: il server è forse già aperto su http://127.0.0.1:${porta}`);
    else console.error(err.message);
    process.exit(1);
  });
  server.listen(porta, '127.0.0.1', () => console.log(`Voli Weekend: http://127.0.0.1:${porta}`));
}
