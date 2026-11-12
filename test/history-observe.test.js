import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRyanairRoutes, parseRyanairDays, parseWizzDays } from '../src/history/observe.js';

test('parseRyanairDays: prezzo, esaurito, nessun volo; salta i giorni passati', () => {
  const json = { outbound: { fares: [
    { day: '2026-11-11', price: { value: 20 }, soldOut: false, unavailable: false },
    { day: '2026-11-12', price: { value: 35.51 }, soldOut: false, unavailable: false },
    { day: '2026-11-13', price: { value: 50 }, soldOut: true, unavailable: false },
    { day: '2026-11-14', price: null, soldOut: false, unavailable: true },
    { day: '2026-11-15', price: null, soldOut: false, unavailable: false },
  ] } };
  assert.deepEqual(parseRyanairDays(json, 'BDS', 'TRN', '2026-11-12'), [
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-12', state: 'prezzo', price: 35.51 },
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-13', state: 'esaurito', price: null },
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-14', state: 'nessun_volo', price: null },
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-15', state: 'nessun_volo', price: null },
  ]);
});

test('parseWizzDays: prezzo, da verificare con prezzo indicativo, zero senza voli', () => {
  const day = (d, amount, priceType, original, deps) => ({ departureDate: `${d}T00:00:00`, price: { amount }, priceType,
    originalPrice: original == null ? null : { amount: original }, departureDates: deps });
  const list = [day('2026-11-12', 29.99, 'price', 29.99, ['2026-11-12T15:20:00']),
    day('2026-11-13', 0, 'checkPrice', 105.99, ['2026-11-13T15:35:00']),
    day('2026-11-14', 0, 'checkPrice', null, ['2026-11-14T15:35:00']),
    day('2026-11-15', 0, 'price', null, [])];
  assert.deepEqual(parseWizzDays(list, 'BRI', 'BUD', '2026-11-12').map((o) => [o.date, o.state, o.price]), [
    ['2026-11-12', 'prezzo', 29.99], ['2026-11-13', 'da_verificare', 105.99],
    ['2026-11-14', 'da_verificare', null], ['2026-11-15', 'nessun_volo', null]]);
});

test('parseWizzDays sul fixture reale: BRI→BUD 2026-11-08 è da verificare a 105.99', () => {
  const tt = JSON.parse(readFileSync(new URL('./fixtures/wizz-timetable.json', import.meta.url)));
  const o = parseWizzDays(tt.outboundFlights, 'BRI', 'BUD', '2026-11-01').find((x) => x.date === '2026-11-08');
  assert.deepEqual([o.state, o.price], ['da_verificare', 105.99]);
});

test('parseRyanairRoutes esclude le tratte con scalo', () => {
  const r = (code, connectingAirport = null) => ({ arrivalAirport: { code, city: { name: code + ' città' }, country: { name: 'Italia' } }, connectingAirport });
  assert.deepEqual(parseRyanairRoutes([r('TRN'), r('XXX', { code: 'BGY' })], 'BDS'),
    [{ airline: 'ryanair', origin: 'BDS', code: 'TRN', city: 'TRN città', country: 'Italia' }]);
});
