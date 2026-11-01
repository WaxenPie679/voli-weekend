import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { mergeSource } from '../src/store.js';
import { itineraryId } from '../src/model.js';

const NOW = DateTime.fromISO('2026-11-02T10:00:00Z');
const EARLIER = '2026-11-02T09:00:00.000Z';

function it(source, dest, price, dep = '2026-11-06T19:00') {
  const outbound = { segments: [{ from: 'BRI', to: dest, dep, arr: '2026-11-06T21:00', flight: `${source}1`, airline: source }], selfTransfer: false };
  const inbound = { segments: [{ from: dest, to: 'BRI', dep: '2026-11-08T18:00', arr: '2026-11-08T20:00', flight: `${source}2`, airline: source }], selfTransfer: false };
  return { id: itineraryId('BRI', outbound, inbound), source, origin: 'BRI', destination: { code: dest, city: dest, country: 'X' },
    outbound, inbound, price, currency: 'EUR', bookingUrl: 'https://example.test', weekend: '2026-11-06', seenAt: EARLIER };
}

test('fonte in errore: restano i suoi itinerari precedenti, con stato errore e lastSuccessAt invariato', () => {
  const prev = {
    generatedAt: EARLIER,
    sources: { ryanair: { status: 'ok', error: null, lastSuccessAt: EARLIER }, wizz: { status: 'ok', error: null, lastSuccessAt: EARLIER } },
    itineraries: [it('ryanair', 'BLQ', 90), it('wizz', 'BUD', 70)],
  };
  let f = mergeSource(prev, 'ryanair', { ok: true, itineraries: [it('ryanair', 'STN', 60)] }, NOW);
  f = mergeSource(f, 'wizz', { ok: false, error: 'HTTP 403' }, NOW);
  assert.equal(f.sources.ryanair.status, 'ok');
  assert.equal(f.sources.ryanair.lastSuccessAt, NOW.toUTC().toISO());
  assert.deepEqual(f.sources.wizz, { status: 'error', error: 'HTTP 403', lastSuccessAt: EARLIER });
  assert.deepEqual(f.itineraries.map((i) => i.destination.code), ['STN', 'BUD']);
  assert.equal(f.generatedAt, NOW.toUTC().toISO());
});

test('duplicati per id: vince il prezzo più basso', () => {
  const f = mergeSource(null, 'ryanair', { ok: true, itineraries: [it('ryanair', 'BLQ', 90), it('ryanair', 'BLQ', 85)] }, NOW);
  assert.equal(f.itineraries.length, 1);
  assert.equal(f.itineraries[0].price, 85);
});

test('itinerari già partiti o non validi vengono rimossi', () => {
  const later = DateTime.fromISO('2026-11-06T19:30', { zone: 'Europe/Rome' });
  const prev = mergeSource(null, 'ryanair', { ok: true, itineraries: [it('ryanair', 'BLQ', 90), it('ryanair', 'STN', 90, '2026-11-07T09:00')] }, NOW);
  const f = mergeSource(prev, 'wizz', { ok: true, itineraries: [] }, later);
  assert.deepEqual(f.itineraries.map((i) => i.destination.code), ['STN']);
  assert.equal(mergeSource(null, 'ryanair', { ok: true, itineraries: [it('ryanair', 'BLQ', 250)] }, NOW).itineraries.length, 0);
});

test('primo giro con fonte in errore: nessun itinerario e lastSuccessAt null', () => {
  const f = mergeSource(null, 'google', { ok: false, error: 'google-blocked' }, NOW);
  assert.deepEqual(f.itineraries, []);
  assert.deepEqual(f.sources.google, { status: 'error', error: 'google-blocked', lastSuccessAt: null });
});
