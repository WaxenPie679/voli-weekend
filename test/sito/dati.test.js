import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { riduci, scaricaDati } from '../../sito/dati.js';

const mini = JSON.parse(readFileSync(new URL('./fixtures/direct-mini.json', import.meta.url), 'utf8'));
const ADESSO = new Date(mini.generatedAt);
const OTTO_ORE = 8 * 3600e3;

const itinerario = (origin, citta, price, extra = {}) => ({
  id: `${origin}|${citta}|${price}`, source: 'ryanair', origin,
  destination: { code: citta.slice(0, 3).toUpperCase(), city: citta, country: 'Italia' },
  outbound: { segments: [{ from: origin, to: 'XXX', dep: '2027-01-16T06:45', arr: '2027-01-16T07:40', flight: 'FR1', airline: 'Ryanair' }], selfTransfer: false },
  inbound: { segments: [{ from: 'XXX', to: origin, dep: '2027-01-17T13:40', arr: '2027-01-17T14:35', flight: 'FR2', airline: 'Ryanair' }], selfTransfer: false },
  price, currency: 'EUR', bookingUrl: 'https://example.test/' + citta, weekend: '2027-01-15',
  seenAt: '2026-11-24T23:52:59.054Z', ...extra,
});
const file = (itineraries, generatedAt = mini.generatedAt) => ({ generatedAt, itineraries });

test('riduci tiene per origine+destinazione+weekend al più un volo per fascia di permanenza', () => {
  const { voli } = riduci({ 'direct.json': mini }, { adesso: ADESSO });
  const tirana = voli.filter(v => v.d === 'TIA');
  assert.equal(tirana.length, 4);
  const fasce = tirana.map(v => Math.min(3, Math.floor(v.resta / 1440))).sort();
  assert.deepEqual(fasce, [0, 1, 2, 3]);
  assert.ok(tirana.some(v => v.resta < 1440 && v.p === 46));
  assert.ok(tirana.some(v => v.resta >= 1440 && v.resta < 2880 && v.p === 40));
  assert.ok(tirana.some(v => v.resta >= 2880 && v.resta < 4320 && v.p === 53));
  assert.ok(!tirana.some(v => v.p === 61), 'il volo da 50h più caro sparisce');
});

test('riduci scarta LIN e i prezzi oltre 400', () => {
  const { voli } = riduci({ 'direct.json': mini }, { adesso: ADESSO });
  assert.ok(!voli.some(v => v.o === 'LIN'));
  assert.ok(!voli.some(v => v.p > 400));
  assert.ok(!voli.some(v => v.d === 'PSA' && v.p === 401));
});

test('riduci ordina dal più economico e arrotonda per eccesso', () => {
  const { voli } = riduci({ 'direct.json': mini }, { adesso: ADESSO });
  const prezzi = voli.map(v => v.p);
  assert.deepEqual(prezzi, [...prezzi].sort((a, b) => a - b));
  const pisa = voli.find(v => v.d === 'PSA');
  assert.equal(pisa.p, 31);
});

test('riduci produce il volo con tutti i campi', () => {
  const { voli } = riduci({ 'direct.json': mini }, { adesso: ADESSO });
  const v = voli.find(x => x.d === 'PSA');
  assert.equal(v.k, 'bds-psa-2026-12-12-2220');
  assert.equal(v.o, 'BDS');
  assert.equal(v.citta, 'Pisa');
  assert.equal(v.paese, 'Italia');
  assert.deepEqual(v.va, ['2026-12-12T22:20', '2026-12-12T23:45']);
  assert.deepEqual(v.ri, ['2026-12-13T06:20', '2026-12-13T07:45']);
  assert.equal(v.cia, 'Ryanair');
  assert.equal(v.w, '2026-12-11');
  assert.equal(v.resta, 395);
  assert.match(v.url, /^https:\/\/www\.ryanair\.com/);
  assert.match(v.visto, /^2026-11-24T/);
});

test('bacino senza file → pronto false', () => {
  const { bacini } = riduci({ 'direct.json': mini }, { adesso: ADESSO });
  assert.equal(bacini.roma.pronto, false);
  assert.equal(bacini.roma.aggiornato, null);
  assert.equal(bacini.roma.numero, 0);
  assert.equal(bacini.roma.piuBasso, null);
  assert.deepEqual(bacini.roma.mete, []);
  // file presente ma null (mancante/illeggibile) vale come assente
  const { bacini: b2 } = riduci({ 'direct.json': mini, 'direct-roma.json': null }, { adesso: ADESSO });
  assert.equal(b2.roma.pronto, false);
});

test('bacino con generatedAt di 25 ore prima di adesso → pronto false', () => {
  const vecchio = file([itinerario('FCO', 'Parigi', 50)], new Date(ADESSO.getTime() - 25 * 3600e3).toISOString());
  const { bacini } = riduci({ 'direct-roma.json': vecchio }, { adesso: ADESSO });
  assert.equal(bacini.roma.pronto, false);
  assert.equal(bacini.roma.aggiornato, null);
  assert.equal(bacini.roma.numero, 0);
});

test('un file vecchio non contribuisce ai voli', () => {
  const vecchio = file([itinerario('FCO', 'Parigi', 50)], new Date(ADESSO.getTime() - 25 * 3600e3).toISOString());
  const { voli } = riduci({ 'direct.json': mini, 'direct-roma.json': vecchio }, { adesso: ADESSO });
  assert.ok(!voli.some(v => v.o === 'FCO'));
  assert.ok(voli.some(v => v.o === 'BDS'), 'i file freschi restano');
});

test('bacino aggiornato → numero e piuBasso corretti', () => {
  const recente = file([
    itinerario('FCO', 'Parigi', 150),
    itinerario('FCO', 'Londra', 100),
    itinerario('CIA', 'Madrid', 62.3),
    itinerario('FCO', 'Berlino', 100.4),
  ], new Date(ADESSO.getTime() - OTTO_ORE).toISOString());
  const { bacini } = riduci({ 'direct-roma.json': recente }, { adesso: ADESSO });
  const roma = bacini.roma;
  assert.equal(roma.pronto, true);
  assert.equal(roma.aggiornato, recente.generatedAt);
  assert.equal(roma.numero, 2, 'Madrid 63 e Londra 100; Berlino 101 resta fuori');
  assert.equal(roma.piuBasso.citta, 'Madrid');
  assert.equal(roma.piuBasso.p, 63);
});

test('bacino con due file: basta un file valido, voli solo da quello presente', () => {
  const a = file([itinerario('MXP', 'Parigi', 80), itinerario('BGY', 'Fantasma', 10)], new Date(ADESSO.getTime() - OTTO_ORE).toISOString());
  const { voli, bacini } = riduci({ 'direct-milano.json': a }, { adesso: ADESSO });
  const mb = bacini['milano-bergamo'];
  assert.equal(mb.pronto, true);
  assert.equal(mb.aggiornato, a.generatedAt);
  assert.ok(voli.some(v => v.o === 'MXP'));
  // il file mancante non inventa nulla: qui BGY compare solo perché è dentro il file presente
  const b = file([itinerario('BGY', 'Londra', 40)], new Date(ADESSO.getTime() - 2 * OTTO_ORE).toISOString());
  const due = riduci({ 'direct-milano.json': a, 'direct-bergamo.json': b }, { adesso: ADESSO }).bacini['milano-bergamo'];
  assert.equal(due.aggiornato, a.generatedAt, 'aggiornato è il più recente tra i file validi');
  assert.equal(due.piuBasso.citta, 'Fantasma');
});

test('bacino con un file valido e uno vecchio: i voli del vecchio non compaiono', () => {
  const fresco = file([itinerario('MXP', 'Parigi', 80)], new Date(ADESSO.getTime() - OTTO_ORE).toISOString());
  const vecchio = file([itinerario('BGY', 'Londra', 40)], new Date(ADESSO.getTime() - 30 * 3600e3).toISOString());
  const { voli, bacini } = riduci({ 'direct-milano.json': fresco, 'direct-bergamo.json': vecchio }, { adesso: ADESSO });
  const mb = bacini['milano-bergamo'];
  assert.equal(mb.pronto, true);
  assert.equal(mb.aggiornato, fresco.generatedAt);
  assert.ok(!voli.some(v => v.citta === 'Londra'));
  assert.equal(mb.piuBasso.citta, 'Parigi');
});

test('mete: una sola volta per città, max 8, dalla più economica', () => {
  const citta = ['Parigi', 'Londra', 'Madrid', 'Berlino', 'Vienna', 'Praga', 'Atene', 'Dublino', 'Oslo', 'Riga'];
  const voli = citta.map((c, i) => itinerario('FCO', c, 40 + i * 10));
  // Parigi di nuovo, più cara e con un altro weekend: non deve ripetersi
  voli.push(itinerario('CIA', 'Parigi', 33, { weekend: '2027-01-22' }));
  const { bacini } = riduci({ 'direct-roma.json': file(voli) }, { adesso: ADESSO });
  const mete = bacini.roma.mete;
  assert.equal(mete.length, 8);
  assert.deepEqual(mete.map(m => m.citta), ['Parigi', 'Londra', 'Madrid', 'Berlino', 'Vienna', 'Praga', 'Atene', 'Dublino']);
  assert.equal(mete[0].p, 33, 'per ogni città vale il prezzo più basso');
  assert.deepEqual(Object.keys(mete[0]).sort(), ['citta', 'd', 'p']);
});

test('riduci non muta gli ingressi e accetta file assenti', () => {
  const copia = structuredClone(mini);
  riduci({ 'direct.json': mini }, { adesso: ADESSO });
  assert.deepEqual(mini, copia);
  const { voli, bacini } = riduci({}, { adesso: ADESSO });
  assert.deepEqual(voli, []);
  assert.equal(bacini.puglia.pronto, false);
});

test('scaricaDati legge da una cartella locale e mette null i file mancanti o illeggibili', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'sito-dati-'));
  writeFileSync(join(cartella, 'direct.json'), JSON.stringify(mini));
  writeFileSync(join(cartella, 'direct-roma.json'), '{ non json');
  const dati = await scaricaDati({ cartella });
  assert.deepEqual(dati['direct.json'], mini);
  assert.equal(dati['direct-roma.json'], null);
  assert.equal(dati['direct-milano.json'], null);
  assert.equal(dati['direct-bergamo.json'], null);
});
