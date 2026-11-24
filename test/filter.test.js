import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { isValid, layoverMinutes } from '../src/filter.js';
import { itineraryId } from '../src/model.js';

const NOW = DateTime.fromISO('2026-11-02T10:00Z');
const seg = (from, to, dep, arr, flight = 'FR1') => ({ from, to, dep, arr, flight, airline: 'Ryanair' });

function mk({ out, inn, price = 99, origin = 'BRI', selfTransfer = false } = {}) {
  const outbound = { segments: out ?? [seg(origin, 'BUD', '2026-11-06T18:00', '2026-11-06T19:40')], selfTransfer };
  const inbound = { segments: inn ?? [seg('BUD', origin, '2026-11-08T20:00', '2026-11-08T21:40', 'FR2')], selfTransfer: false };
  return {
    id: itineraryId(origin, outbound, inbound), source: 'ryanair', origin,
    destination: { code: 'BUD', city: 'Budapest', country: 'Ungheria' },
    outbound, inbound, price, currency: 'EUR', bookingUrl: 'https://example.test', weekend: '2026-11-06', seenAt: '2026-11-02T10:00:00Z',
  };
}

test('andata venerdì 18:00 valida', () => assert.equal(isValid(mk(), NOW), true));
test('andata venerdì 17:59 non valida', () =>
  assert.equal(isValid(mk({ out: [seg('BRI', 'BUD', '2026-11-06T17:59', '2026-11-06T19:40')] }), NOW), false));
test('andata sabato 06:00 valida', () =>
  assert.equal(isValid(mk({ out: [seg('BRI', 'BUD', '2026-11-07T06:00', '2026-11-07T07:40')] }), NOW), true));
test('andata giovedì non valida', () =>
  assert.equal(isValid(mk({ out: [seg('BRI', 'BUD', '2026-11-05T20:00', '2026-11-05T21:40')] }), NOW), false));
test('ritorno domenica con arrivo 23:59 valido', () =>
  assert.equal(isValid(mk({ inn: [seg('BUD', 'BRI', '2026-11-08T22:19', '2026-11-08T23:59')] }), NOW), true));
test('ritorno domenica con arrivo lunedì 00:40 non valido', () =>
  assert.equal(isValid(mk({ inn: [seg('BUD', 'BRI', '2026-11-08T23:10', '2026-11-09T00:40')] }), NOW), false));
test('ritorno di sabato non valido', () =>
  assert.equal(isValid(mk({ inn: [seg('BUD', 'BRI', '2026-11-07T20:00', '2026-11-07T21:40')] }), NOW), false));
test('ritorno la domenica del weekend dopo non valido', () =>
  assert.equal(isValid(mk({ inn: [seg('BUD', 'BRI', '2026-11-15T20:00', '2026-11-15T21:40')] }), NOW), false));
test('prezzo 200 valido, 200.01 no', () => {
  assert.equal(isValid(mk({ price: 200 }), NOW), true);
  assert.equal(isValid(mk({ price: 200.01 }), NOW), false);
});
test('origine NAP non valida', () =>
  assert.equal(isValid(mk({ origin: 'NAP' }), NOW), false));
test('due scali in una tratta non validi', () =>
  assert.equal(isValid(mk({ out: [
    seg('BRI', 'FCO', '2026-11-06T18:00', '2026-11-06T19:00'),
    seg('FCO', 'MUC', '2026-11-06T20:00', '2026-11-06T21:30'),
    seg('MUC', 'BUD', '2026-11-06T22:00', '2026-11-06T23:00'),
  ] }), NOW), false));
test('scalo di 180 minuti valido, 181 no', () => {
  const via = (arrHub, depHub) => [seg('BRI', 'FCO', '2026-11-06T18:00', arrHub), seg('FCO', 'BUD', depHub, '2026-11-06T23:30')];
  assert.equal(isValid(mk({ out: via('2026-11-06T19:00', '2026-11-06T22:00') }), NOW), true);
  assert.equal(isValid(mk({ out: via('2026-11-06T19:00', '2026-11-06T22:01') }), NOW), false);
});
test('self-transfer non valido', () => assert.equal(isValid(mk({ selfTransfer: true }), NOW), false));
test('andata già partita non valida', () =>
  assert.equal(isValid(mk(), DateTime.fromISO('2026-11-06T18:30', { zone: 'Europe/Rome' })), false));
test('layoverMinutes calcola le attese tra segmenti', () =>
  assert.deepEqual(layoverMinutes({ segments: [seg('BRI', 'FCO', '2026-11-06T18:00', '2026-11-06T19:00'), seg('FCO', 'BUD', '2026-11-06T20:40', '2026-11-06T23:00')] }), [100]));
test('itineraryId unisce origine, destinazione, partenze e voli', () =>
  assert.equal(mk().id, 'BRI|BUD|2026-11-06T18:00|2026-11-08T20:00|FR1+FR2'));
