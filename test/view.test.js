import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combine, groupByWeekend, applyFilters, freshness, bestPerDestination, stayHours, airlinesOf, legTimes, stayWindow, notDeparted, romeNow } from '../web/view.js';

const leg = (from, to, dep, arr, airline = 'Ryanair', hubs = []) => ({
  segments: hubs.length
    ? [{ from, to: hubs[0], dep, arr: null, flight: 'a', airline }, { from: hubs[0], to, dep: null, arr, flight: 'b', airline }]
    : [{ from, to, dep, arr, flight: 'x', airline }],
  selfTransfer: false, ...(hubs.length ? { layovers: [60] } : {}),
});
const it = (id, { origin = 'BRI', dest = 'BUD', price = 90, weekend = '2026-11-06', airline = 'Ryanair', hubs = [], source = 'ryanair', out = '2026-11-06T19:00', arr = '2026-11-06T20:40', back = '2026-11-08T18:00' } = {}) => ({
  id, source, origin, destination: { code: dest, city: dest, country: 'X' }, price, weekend,
  outbound: leg(origin, dest, out, arr, airline, hubs), inbound: leg(dest, origin, back, '2026-11-08T19:40', airline),
});
const file = (sources, itineraries) => ({ generatedAt: '', sources, itineraries });
const ok = (min) => ({ status: 'ok', error: null, lastSuccessAt: new Date(Date.parse('2026-11-02T10:00:00Z') - min * 60000).toISOString() });
const NOW = new Date('2026-11-02T10:00:00Z');

test('combine unisce i due file, deduplica per id tenendo il prezzo più basso, ordina per prezzo', () => {
  const r = combine(file({}, [it('a', { price: 90 }), it('b', { price: 50 })]), file({}, [it('a', { price: 80 })]));
  assert.deepEqual(r.map((x) => [x.id, x.price]), [['b', 50], ['a', 80]]);
});

test('combine tollera un file mancante', () => {
  assert.equal(combine(null, file({}, [it('a')])).length, 1);
});

test('groupByWeekend ordina i weekend per data e le offerte per prezzo', () => {
  const g = groupByWeekend([it('a', { weekend: '2026-11-13', price: 40 }), it('b', { price: 70 }), it('c', { price: 60 })]);
  assert.deepEqual(g.map((x) => x.weekend), ['2026-11-06', '2026-11-13']);
  assert.deepEqual(g[0].items.map((x) => x.id), ['c', 'b']);
});

test('applyFilters: aeroporto, solo diretti, prezzo massimo, compagnia, weekend', () => {
  const its = [it('a'), it('b', { origin: 'BDS' }), it('c', { hubs: ['FCO'], airline: 'ITA', source: 'google' }), it('d', { price: 150 }), it('e', { weekend: '2026-11-13' })];
  assert.deepEqual(applyFilters(its, { origin: 'BDS' }).map((x) => x.id), ['b']);
  assert.ok(!applyFilters(its, { directOnly: true }).some((x) => x.id === 'c'));
  assert.deepEqual(applyFilters(its, { stopsOnly: true }).map((x) => x.id), ['c']);
  assert.ok(!applyFilters(its, { maxPrice: 100 }).some((x) => x.id === 'd'));
  assert.deepEqual(applyFilters(its, { airline: 'ITA' }).map((x) => x.id), ['c']);
  assert.deepEqual(applyFilters(its, { weekend: '2026-11-13' }).map((x) => x.id), ['e']);
  assert.equal(applyFilters(its, {}).length, 5);
});

test('bestPerDestination tiene la più economica per destinazione, in ordine di prezzo', () => {
  const r = bestPerDestination([it('a', { price: 90 }), it('b', { price: 60, weekend: '2026-11-13' }), it('c', { dest: 'TIA', price: 30 })]);
  assert.deepEqual(r.map((x) => x.id), ['c', 'b']);
});

test('stayHours: ore tra arrivo a destinazione e ripartenza', () => {
  assert.equal(stayHours(it('a')), 45.3);
});

test('airlinesOf elenca le compagnie dell\'andata senza duplicati, in ordine alfabetico', () => {
  assert.deepEqual(airlinesOf([it('a'), it('b', { airline: 'ITA' }), it('c')]), ['ITA', 'Ryanair']);
});

test('freshness: diretti vecchi più di 45 min sono "stale", scali dopo 9 ore, errori sempre', () => {
  assert.deepEqual(freshness('ryanair', ok(10), NOW), { label: 'aggiornato 10 min fa', stale: false });
  assert.equal(freshness('ryanair', ok(50), NOW).stale, true);
  assert.equal(freshness('google', ok(200), NOW).stale, false);
  assert.equal(freshness('google', ok(200), NOW).label, 'aggiornato 3 h fa');
  assert.equal(freshness('google', ok(600), NOW).stale, true);
  assert.equal(freshness('wizz', { status: 'error', error: 'HTTP 403', lastSuccessAt: null }, NOW).label, 'mai aggiornato');
  assert.equal(freshness('wizz', { status: 'error', error: 'x', lastSuccessAt: ok(5).lastSuccessAt }, NOW).stale, true);
  assert.deepEqual(freshness('wizz', undefined, NOW), { label: 'nessun dato', stale: true });
});

test('legTimes segna +1 quando l\'arrivo è il giorno dopo e ~ quando è stimato', () => {
  assert.equal(legTimes(leg('BRI', 'BGY', '2026-11-14T23:25', '2026-11-15T00:55')), '23:25 → 00:55 +1');
  assert.equal(legTimes(leg('BRI', 'BUD', '2026-11-06T19:00', '2026-11-06T20:40')), '19:00 → 20:40');
  assert.equal(legTimes({ ...leg('BRI', 'OTP', '2026-12-12T14:55', '2026-12-12T17:33'), arrivalEstimated: true }), '14:55 → ~17:33');
});

test('stayWindow: posizione e durata del soggiorno su un asse ven 00:00 → lun 00:00', () => {
  const w = stayWindow(it('a'));
  // arrivo ven 20:40 (20,67 h dall'inizio), ripartenza dom 18:00 (66 h) su 72 h
  assert.equal(Math.round(w.start * 1000), 287);
  assert.equal(Math.round(w.width * 1000), 630);
});

test('notDeparted toglie i voli con andata già partita rispetto all\'ora di Roma', () => {
  const its = [it('a', { out: '2026-11-06T19:00' }), it('b', { out: '2026-11-07T09:00' })];
  assert.deepEqual(notDeparted(its, '2026-11-06T19:30').map((x) => x.id), ['b']);
  assert.equal(notDeparted(its, '2026-11-06T18:59').length, 2);
});

test('romeNow formatta l\'ora di Roma come stringa locale', () => {
  assert.equal(romeNow(new Date('2026-11-06T18:30:00Z')), '2026-11-06T19:30');
  assert.equal(romeNow(new Date('2026-07-03T16:05:00Z')), '2026-07-03T18:05');
});
