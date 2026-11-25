import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../scripts/serve.js';

const server = createServer({ port: 0 });
await once(server.listen(0, '127.0.0.1'), 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

test('serve index.html sulla radice', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Voli Weekend/);
});

test('manifest con il content-type giusto', async () => {
  const res = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(res.headers.get('content-type'), 'application/manifest+json');
});

test('blocca i path traversal', async () => {
  const res = await fetch(`${base}/..%2fpackage.json`);
  assert.ok([403, 404].includes(res.status));
});

test('file inesistente → 404', async () => {
  assert.equal((await fetch(`${base}/nope.js`)).status, 404);
});

test('la porta 5180 di SMOT è rifiutata', () => {
  assert.throws(() => createServer({ port: 5180 }), /5180/);
});

test('serve la pagina Storico prezzi', async () => {
  const res = await fetch(`${base}/storico.html`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /Storico prezzi/);
});

test('serve con root personalizzata: cartella come index.html e traversal 403', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'serve-'));
  mkdirSync(join(root, 'x'));
  writeFileSync(join(root, 'x', 'index.html'), '<p>ciao</p>');
  writeFileSync(join(root, 'a.woff2'), 'f');
  const s = createServer({ root, port: 0 });
  await once(s.listen(0, '127.0.0.1'), 'listening');
  const b = `http://127.0.0.1:${s.address().port}`;
  try {
    const r = await fetch(`${b}/x/`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), '<p>ciao</p>');
    assert.equal((await fetch(`${b}/a.woff2`)).headers.get('content-type'), 'font/woff2');
    const { request } = await import('node:http');
    const stato = await new Promise(ok => request({ host: '127.0.0.1', port: s.address().port, path: '/..%2f..%2fetc/passwd' }, res => { res.resume(); ok(res.statusCode); }).end());
    assert.equal(stato, 403);
  } finally { s.close(); }
});
