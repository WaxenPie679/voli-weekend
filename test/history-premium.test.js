import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { buildPremium, oneWayUrl } from '../src/history/premium.js';
import { obsKey } from '../src/history/store.js';

const TODAY = '2026-11-25';
const NOW = DateTime.fromISO('2026-11-25T04:00:00Z');
const ROUTES = { 'ryanair|BRI|BUD': { airline: 'ryanair', origin: 'BRI', code: 'BUD', city: 'Budapest', country: 'Ungheria' } };

/** Stato e date di conferma da un elenco di osservazioni [compagnia, origine, destinazione, data, prezzo, orario, visto il, stato]. */
function mk(rows) {
  const state = new Map();
  const seen = new Map();
  for (const [airline, origin, dest, date, price, time = '10:00-12:00', seenOn = TODAY, st = 'prezzo'] of rows) {
    const o = { airline, origin, dest, date, state: st, price: st === 'prezzo' ? price : null, time };
    state.set(obsKey(o), o);
    seen.set(obsKey(o), seenOn);
  }
  return { state, seen };
}
const build = (rows) => buildPremium({ ...mk(rows), today: TODAY, origins: ['BRI', 'BDS'], routes: ROUTES, now: NOW, generatedAt: '2026-11-25T04:00:00.000Z' });
const of = (file, kind, saturday) => file.entries.filter((e) => e.kind === kind && e.saturday === saturday);

test('aprile: andata sabato 30 € + ritorno domenica 40 € → Weekend da 70 €', () => {
  const f = build([['ryanair', 'BRI', 'BUD', '2027-04-03', 30], ['ryanair', 'BUD', 'BRI', '2027-04-04', 40]]);
  const [e] = of(f, 'weekend', '2027-04-03');
  assert.equal(e.price, 70);
  assert.equal(e.weekend, '2027-04-02');
  assert.equal(e.origin, 'BRI');
  assert.deepEqual(e.destination, { code: 'BUD', city: 'Budapest', country: 'Ungheria' });
  assert.equal(e.out.date, '2027-04-03');
  assert.equal(e.back.date, '2027-04-04');
  assert.equal(e.id, 'storico|weekend|BRI|BUD|2027-04-03');
  assert.equal(f.day, TODAY);
});

test('gennaio (dentro i 3 mesi gratis): nessun Weekend, ma sì il Weekend lungo', () => {
  const f = build([['ryanair', 'BRI', 'BUD', '2027-01-09', 30], ['ryanair', 'BUD', 'BRI', '2027-01-10', 40]]);
  assert.equal(of(f, 'weekend', '2027-01-09').length, 0);
  assert.equal(of(f, 'lungo', '2027-01-09').length, 1);
});

test('il confine è il 13° weekend della ricerca: quello dopo è Premium', () => {
  // 13 weekend da venerdì 27/11/2026: l'ultimo è venerdì 19/02/2027
  const f = build([
    ['ryanair', 'BRI', 'BUD', '2027-02-20', 30], ['ryanair', 'BUD', 'BRI', '2027-02-21', 40],
    ['ryanair', 'BRI', 'BUD', '2027-02-27', 30], ['ryanair', 'BUD', 'BRI', '2027-02-28', 40],
  ]);
  assert.equal(of(f, 'weekend', '2027-02-20').length, 0);
  assert.equal(of(f, 'weekend', '2027-02-27').length, 1);
});

test('andata giovedì a 10 € → solo nel Weekend lungo', () => {
  const f = build([['ryanair', 'BRI', 'BUD', '2027-04-01', 10], ['ryanair', 'BRI', 'BUD', '2027-04-03', 30], ['ryanair', 'BUD', 'BRI', '2027-04-04', 40]]);
  assert.equal(of(f, 'lungo', '2027-04-03')[0].out.date, '2027-04-01');
  assert.equal(of(f, 'weekend', '2027-04-03')[0].out.date, '2027-04-03');
});

test('totale sopra 400 € → nessuna voce; 400 € esatti sì', () => {
  assert.equal(build([['ryanair', 'BRI', 'BUD', '2027-04-03', 201], ['ryanair', 'BUD', 'BRI', '2027-04-04', 200]]).entries.length, 0);
  assert.ok(build([['ryanair', 'BRI', 'BUD', '2027-04-03', 200], ['ryanair', 'BUD', 'BRI', '2027-04-04', 200]]).entries.length > 0);
});

test('andata esaurita o senza ritorno → nessuna voce', () => {
  assert.equal(build([['ryanair', 'BRI', 'BUD', '2027-04-03', 30, '', TODAY, 'esaurito'], ['ryanair', 'BUD', 'BRI', '2027-04-04', 40]]).entries.length, 0);
  assert.equal(build([['ryanair', 'BRI', 'BUD', '2027-04-03', 30]]).entries.length, 0);
});

test('prezzo visto più di 7 giorni fa → non si usa; 3 giorni fa → voce con la sua data', () => {
  const old = build([['ryanair', 'BRI', 'BUD', '2027-04-03', 30, '10:00-12:00', '2026-11-10'], ['ryanair', 'BUD', 'BRI', '2027-04-04', 40]]);
  assert.equal(old.entries.length, 0);
  const recent = build([['ryanair', 'BRI', 'BUD', '2027-04-03', 30, '10:00-12:00', '2026-11-22'], ['ryanair', 'BUD', 'BRI', '2027-04-04', 40]]);
  assert.equal(of(recent, 'weekend', '2027-04-03')[0].out.seenOn, '2026-11-22');
  assert.equal(of(recent, 'weekend', '2027-04-03')[0].back.seenOn, TODAY);
});

test('compagnie diverse: link di sola andata per ciascuna gamba', () => {
  const f = build([['wizz', 'BRI', 'BUD', '2027-04-03', 30, '09:00'], ['ryanair', 'BUD', 'BRI', '2027-04-04', 40]]);
  const [e] = of(f, 'weekend', '2027-04-03');
  assert.equal(e.out.bookingUrl, 'https://wizzair.com/it-it/booking/select-flight/BRI/BUD/2027-04-03/null/1/0/0/null');
  assert.match(e.back.bookingUrl, /originIata=BUD&destinationIata=BRI/);
});

test('stato vuoto → elenco vuoto', () => {
  assert.deepEqual(build([]).entries, []);
});

test('oneWayUrl', () => {
  const r = oneWayUrl('ryanair', 'BRI', 'BUD', '2027-04-03');
  assert.match(r, /isReturn=false/);
  assert.match(r, /dateOut=2027-04-03/);
  assert.equal(oneWayUrl('wizz', 'BRI', 'BUD', '2027-04-03'), 'https://wizzair.com/it-it/booking/select-flight/BRI/BUD/2027-04-03/null/1/0/0/null');
});

test('voci ordinate per prezzo', () => {
  const f = build([['ryanair', 'BRI', 'BUD', '2027-04-03', 30], ['ryanair', 'BUD', 'BRI', '2027-04-04', 40], ['ryanair', 'BRI', 'BUD', '2027-05-01', 10], ['ryanair', 'BUD', 'BRI', '2027-05-02', 10]]);
  const prices = f.entries.map((e) => e.price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
});

import { confirmedOn } from '../src/history/premium.js';

const meta = (airline, extra = {}) => ({ day: '2026-11-24', airlines: { [airline]: { routesExpected: 2, routesOk: 2, requestsOk: 10, requestsFailed: 0, missing: [], stoppedReason: null, notListed: [], ...extra } } });
const o = (airline, origin, dest, date) => ({ airline, origin, dest, date });

test('confirmedOn: tratta riletta per intero → confermata', () => {
  assert.equal(confirmedOn(meta('ryanair'), o('ryanair', 'BRI', 'BUD', '2027-04-03')), true);
});

test('confirmedOn: tratta saltata (in missing, anche al contrario) o sparita (notListed) → no', () => {
  assert.equal(confirmedOn(meta('ryanair', { missing: ['BRI-BUD'] }), o('ryanair', 'BUD', 'BRI', '2027-04-04')), false);
  assert.equal(confirmedOn(meta('wizz', { notListed: ['BRI-BUD'] }), o('wizz', 'BRI', 'BUD', '2027-04-03')), false);
});

test('confirmedOn: mese Ryanair mancante → no solo per quel mese e quella direzione', () => {
  const m = meta('ryanair', { missing: ['BRI-BUD 2027-04'] });
  assert.equal(confirmedOn(m, o('ryanair', 'BRI', 'BUD', '2027-04-03')), false);
  assert.equal(confirmedOn(m, o('ryanair', 'BRI', 'BUD', '2027-05-01')), true);
  assert.equal(confirmedOn(m, o('ryanair', 'BUD', 'BRI', '2027-04-04')), true);
});

test('confirmedOn: finestra Wizz mancante (30 giorni dalla data) → no dentro la finestra', () => {
  const m = meta('wizz', { missing: ['BRI-BUD 2027-04-01'] });
  assert.equal(confirmedOn(m, o('wizz', 'BRI', 'BUD', '2027-04-03')), false);
  assert.equal(confirmedOn(m, o('wizz', 'BRI', 'BUD', '2027-04-30')), false);
  assert.equal(confirmedOn(m, o('wizz', 'BRI', 'BUD', '2027-05-01')), true);
});

test('confirmedOn: compagnia senza resoconto o senza tratte quel giorno → no', () => {
  assert.equal(confirmedOn(meta('wizz'), o('ryanair', 'BRI', 'BUD', '2027-04-03')), false);
  assert.equal(confirmedOn(meta('ryanair', { routesExpected: 0, routesOk: 0, stoppedReason: '429' }), o('ryanair', 'BRI', 'BUD', '2027-04-03')), false);
  assert.equal(confirmedOn(null, o('ryanair', 'BRI', 'BUD', '2027-04-03')), false);
});

test('confirmedOn: mese o finestra senza voli (empty) → il prezzo vecchio non conta come confermato', () => {
  const ry = meta('ryanair', { empty: ['BRI-BUD 2027-04'] });
  assert.equal(confirmedOn(ry, o('ryanair', 'BRI', 'BUD', '2027-04-03')), false);
  assert.equal(confirmedOn(ry, o('ryanair', 'BRI', 'BUD', '2027-05-01')), true);
  const wz = meta('wizz', { empty: ['BUD-BRI 2027-04-01'] });
  assert.equal(confirmedOn(wz, o('wizz', 'BUD', 'BRI', '2027-04-04')), false);
  assert.equal(confirmedOn(wz, o('wizz', 'BRI', 'BUD', '2027-04-03')), true);
});
