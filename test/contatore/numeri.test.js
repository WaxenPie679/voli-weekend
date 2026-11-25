import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fintoD1 } from './finto-d1.js';
import { riepilogo } from '../../functions/_lib/numeri.js';
import { chiaveGiusta, IMPRONTA } from '../../functions/_lib/chiave.js';
import { registra } from '../../functions/_lib/deposito.js';
import { onRequestGet as numeriJson } from '../../functions/api/numeri.js';
import { onRequestGet as numeriPagina } from '../../functions/numeri/index.js';
import { giornoRoma } from '../../functions/_lib/regole.js';

const CHIAVE = 'segreta-di-prova';
const IMPRONTA_PROVA = createHash('sha256').update(CHIAVE).digest('hex');
const OGGI = giornoRoma(new Date());
const riga = (evento, n, giorno = OGGI, pagina = '/') => ({ giorno, ambiente: 'vero', evento, pagina, n });

async function dbCon(righe) {
  const db = fintoD1();
  for (const r of righe) for (let i = 0; i < r.n; i++) await registra(db, r);
  return db;
}
const env = db => ({ DB: db, NUMERI_IMPRONTA: IMPRONTA_PROVA });

test('riepilogo: soglia Premium = (passa+lucchetto+menu) / ingressi', () => {
  const r = riepilogo([riga('ingresso', 1000), riga('premium-passa', 20), riga('premium-lucchetto', 8), riga('premium-menu', 2), riga('premium-mensile', 5)], { oggi: OGGI });
  assert.deepEqual(r.premium, { totale: 30, passa: 20, lucchetto: 8, menu: 2 });
  assert.equal(r.soglia.percentuale, 3);
  assert.equal(r.soglia.valida, true);
  assert.equal(r.mensile, 5);
});

test('riepilogo: sotto 800 ingressi la soglia non è valida; con 0 ingressi percentuale null', () => {
  assert.equal(riepilogo([riga('ingresso', 799), riga('premium-passa', 30)], { oggi: OGGI }).soglia.valida, false);
  assert.equal(riepilogo([], { oggi: OGGI }).soglia.percentuale, null);
});

test('riepilogo: ultimi 7 giorni, per giorno e per pagina', () => {
  const r = riepilogo([
    riga('ingresso', 3, '2026-11-26'), riga('ingresso', 4, '2026-11-19'), riga('ingresso', 2, '2026-11-20'),
    riga('pagina', 5, '2026-11-26', '/roma/'), riga('pagina', 1, '2026-11-26', '/'),
  ], { oggi: '2026-11-26' });
  assert.equal(r.ingressi, 9);
  assert.equal(r.ultimi7.ingresso, 5);
  assert.deepEqual(r.perPagina[0], { pagina: '/roma/', pagine: 5 });
  assert.equal(r.perGiorno[0].giorno, '2026-11-26');
});

test('chiaveGiusta: giusta sì, sbagliata/vuota/null no', async () => {
  assert.equal(await chiaveGiusta(CHIAVE, IMPRONTA_PROVA), true);
  assert.equal(await chiaveGiusta('altra', IMPRONTA_PROVA), false);
  assert.equal(await chiaveGiusta('', IMPRONTA_PROVA), false);
  assert.equal(await chiaveGiusta(null, IMPRONTA_PROVA), false);
  assert.match(IMPRONTA, /^[0-9a-f]{64}$/);
});

const pagina = (q, db) => numeriPagina({ request: new Request(`https://dovaivoli.it/numeri/${q}`), env: env(db) });

test('/numeri/ senza chiave o con chiave sbagliata: 404 senza numeri', async () => {
  const db = await dbCon([riga('ingresso', 10)]);
  for (const q of ['', '?k=', '?k=sbagliata']) {
    const r = await pagina(q, db);
    assert.equal(r.status, 404);
    assert.doesNotMatch(await r.text(), /ingress|Premium/i);
  }
});

test('/numeri/ con chiave: 200, no-store, noindex, no-referrer, mostra la percentuale', async () => {
  const db = await dbCon([riga('ingresso', 1000), riga('premium-passa', 30), riga('premium-mensile', 3), riga('premium-annuale', 1)]);
  const r = await pagina(`?k=${CHIAVE}`, db);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  const html = await r.text();
  assert.match(html, /3,0\s?%/);
  assert.match(html, /vale da 800 visite/);
  assert.match(html, /data-ingressi="1000">1000</); // in italiano le cifre si raggruppano da 10.000
  assert.doesNotMatch(html, /href="https?:\/\/(?!dovaivoli\.it)/);
});

test('/numeri/?ambiente=prova legge solo le righe prova', async () => {
  const db = fintoD1();
  await registra(db, { giorno: OGGI, ambiente: 'prova', evento: 'kiwi', pagina: '/', n: 1 });
  const vero = await (await pagina(`?k=${CHIAVE}`, db)).text();
  const prova = await (await pagina(`?k=${CHIAVE}&ambiente=prova`, db)).text();
  assert.match(prova, /data-kiwi="1"/);
  assert.match(vero, /data-kiwi="0"/);
});

test('/api/numeri con Bearer giusto: JSON con soglia; senza: 404', async () => {
  const db = await dbCon([riga('ingresso', 100), riga('premium-passa', 5)]);
  const giusta = await numeriJson({ request: new Request('https://dovaivoli.it/api/numeri', { headers: { authorization: `Bearer ${CHIAVE}` } }), env: env(db) });
  assert.equal(giusta.status, 200);
  const dati = await giusta.json();
  assert.equal(dati.soglia.percentuale, 5);
  assert.equal(dati.ambiente, 'vero');
  const senza = await numeriJson({ request: new Request('https://dovaivoli.it/api/numeri'), env: env(db) });
  assert.equal(senza.status, 404);
});

test('valori dal database escapati nella pagina', async () => {
  const db = fintoD1();
  await registra(db, { giorno: OGGI, ambiente: 'vero', evento: 'pagina', pagina: '<script>x</script>' });
  const html = await (await pagina(`?k=${CHIAVE}`, db)).text();
  assert.doesNotMatch(html, /<script>x/);
});
