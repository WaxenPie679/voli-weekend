import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fintoD1 } from './finto-d1.js';
import { onRequestPost } from '../../functions/api/conta.js';
import { giornoRoma } from '../../functions/_lib/regole.js';

function richiesta({ host = 'dovaivoli.it', origin = 'https://dovaivoli.it', corpo = '{"e":"kiwi","p":"/roma/"}', tipo = 'text/plain;charset=UTF-8', extra = {} } = {}, db) {
  const headers = { 'content-type': tipo, 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'Prova/1.0 iPhone', ...extra };
  if (origin) headers.origin = origin;
  return { request: new Request(`https://${host}/api/conta`, { method: 'POST', headers, body: corpo }), env: db ? { DB: db } : {} };
}

test('un clic Kiwi da dovaivoli.it diventa una riga «vero»', async () => {
  const db = fintoD1();
  const r = await onRequestPost(richiesta({}, db));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual([...db.righe.values()], [{ giorno: giornoRoma(new Date()), ambiente: 'vero', evento: 'kiwi', pagina: '/roma/', n: 1 }]);
});

test('due clic uguali sommano n', async () => {
  const db = fintoD1();
  await onRequestPost(richiesta({}, db));
  await onRequestPost(richiesta({}, db));
  assert.equal([...db.righe.values()][0].n, 2);
});

test("dall'anteprima conta come «prova»", async () => {
  const db = fintoD1();
  await onRequestPost(richiesta({ host: 'prova.dovai.pages.dev', origin: 'https://prova.dovai.pages.dev' }, db));
  assert.equal([...db.righe.values()][0].ambiente, 'prova');
});

test('origine estranea, nessuna origine o evento non valido: 204 e nessuna riga', async () => {
  const db = fintoD1();
  for (const r of [
    richiesta({ origin: 'https://altro.it' }, db),
    richiesta({ origin: null }, db),
    richiesta({ corpo: '{"e":"hack","p":"/"}' }, db),
    richiesta({ tipo: 'multipart/form-data' }, db),
  ]) assert.equal((await onRequestPost(r)).status, 204);
  assert.equal(db.righe.size, 0);
});

test('senza Origin ma con Referer del sito conta', async () => {
  const db = fintoD1();
  await onRequestPost(richiesta({ origin: null, extra: { referer: 'https://dovaivoli.it/roma/' } }, db));
  assert.equal(db.righe.size, 1);
});

test('senza collegamento DB: 204, nessun errore', async () => {
  assert.equal((await onRequestPost(richiesta({}))).status, 204);
});

test('se la tabella manca la crea e non perde il clic', async () => {
  const db = fintoD1({ senzaTabella: true });
  await onRequestPost(richiesta({}, db));
  assert.equal([...db.righe.values()][0].n, 1);
});

test('non salva IP né user agent', async () => {
  const db = fintoD1();
  await onRequestPost(richiesta({}, db));
  const tutto = JSON.stringify([...db.righe.values()]) + db.istruzioni.join(' ');
  assert.doesNotMatch(tutto, /203\.0\.113\.7|iPhone|Prova\/1\.0/);
});
