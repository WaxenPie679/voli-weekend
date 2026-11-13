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
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-12', state: 'prezzo', price: 35.51, time: '' },
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-13', state: 'esaurito', price: null, time: '' },
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-14', state: 'nessun_volo', price: null, time: '' },
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-15', state: 'nessun_volo', price: null, time: '' },
  ]);
});

test('parseRyanairDays: orario partenza-arrivo del volo, anche se esaurito; senza date', () => {
  const f = (day, extra) => ({ day, price: { value: 42.96 }, soldOut: false, unavailable: false, ...extra });
  const json = { outbound: { fares: [
    f('2026-12-01', { departureDate: '2026-12-01T10:05:00', arrivalDate: '2026-12-01T11:55:00' }),
    f('2026-12-02', { soldOut: true, departureDate: '2026-12-02T06:00:00', arrivalDate: '2026-12-02T07:45:00' }),
    f('2026-12-03', {}),
    f('2026-12-04', { soldOut: true }),
  ] } };
  assert.deepEqual(parseRyanairDays(json, 'BDS', 'TRN', '2026-12-01').map((o) => [o.date, o.state, o.time]), [
    ['2026-12-01', 'prezzo', '10:05-11:55'], ['2026-12-02', 'esaurito', '06:00-07:45'],
    ['2026-12-03', 'prezzo', ''], ['2026-12-04', 'esaurito', '']]);
});

test('parseWizzDays: orari di partenza ordinati e separati da spazio; vuoti se nessuna partenza', () => {
  const day = (d, deps) => ({ departureDate: `${d}T00:00:00`, price: { amount: 50 }, departureDates: deps });
  const list = [day('2026-11-06', ['2026-11-06T21:40:00', '2026-11-06T15:20:00']), day('2026-11-07', []), day('2026-11-08', undefined)];
  assert.deepEqual(parseWizzDays(list, 'BRI', 'BUD', '2026-11-01').map((o) => o.time), ['15:20 21:40', '', '']);
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
