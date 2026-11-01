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
