import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { upcomingWeekends } from '../src/weekends.js';
import { buildRyanairQueries, parseRyanair, fetchRyanair } from '../src/sources/ryanair.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ryanair-roundtrip.json', import.meta.url)));
const weekends = upcomingWeekends(DateTime.fromISO('2026-11-02T10:00Z'));

test('32 query: 2 aeroporti × 8 weekend × venerdì/sabato', () => {
  const q = buildRyanairQueries(weekends);
  assert.equal(q.length, 32);
  const u = new URL(q[0].url);
  assert.equal(u.searchParams.get('departureAirportIataCode'), 'BRI');
  assert.equal(u.searchParams.get('outboundDepartureDateFrom'), '2026-11-06');
  assert.equal(u.searchParams.get('outboundDepartureTimeFrom'), '18:00');
  assert.equal(u.searchParams.get('inboundDepartureDateFrom'), '2026-11-08');
  assert.equal(u.searchParams.get('priceValueTo'), '200');
  assert.equal(u.searchParams.get('currency'), 'EUR');
  assert.equal(q[0].origin, 'BRI');
  assert.equal(q[0].weekend, '2026-11-06');
  assert.ok(q.some((x) => new URL(x.url).searchParams.get('outboundDepartureDateFrom') === '2026-11-07'));
  assert.ok(q.some((x) => x.origin === 'BDS'));
});

test('parseRyanair converte le tariffe in itinerari', () => {
  const its = parseRyanair(fixture, 'BRI', '2026-11-06', '2026-11-02T10:00:00Z');
  assert.equal(its.length, fixture.fares.length);
  const first = its[0];
  const f = fixture.fares[0];
  assert.equal(first.source, 'ryanair');
  assert.equal(first.price, f.summary.price.value);
  assert.equal(first.destination.code, f.outbound.arrivalAirport.iataCode);
  assert.equal(first.destination.city, f.outbound.arrivalAirport.city.name);
  assert.equal(first.outbound.segments[0].dep, f.outbound.departureDate.slice(0, 16));
  assert.equal(first.inbound.segments[0].arr, f.inbound.arrivalDate.slice(0, 16));
  assert.equal(first.outbound.segments[0].flight, f.outbound.flightNumber);
  assert.equal(first.outbound.selfTransfer, false);
  assert.match(first.bookingUrl, /ryanair\.com.*originIata=BRI.*destinationIata=BLQ/);
});

test('fetchRyanair rifiuta su HTTP 500', async () => {
  const fetchImpl = async () => new Response('x', { status: 500 });
  await assert.rejects(fetchRyanair(weekends.slice(0, 1), { fetchImpl, pauseMs: 0 }));
});

test('fetchRyanair unisce i risultati di tutte le query', async () => {
  const fetchImpl = async () => new Response(JSON.stringify(fixture), { status: 200 });
  const its = await fetchRyanair(weekends.slice(0, 1), { fetchImpl, pauseMs: 0 });
  assert.equal(its.length, fixture.fares.length * 4);
});
