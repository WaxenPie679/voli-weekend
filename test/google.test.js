import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { isValid } from '../src/filter.js';
import { encodeTfs, encodeExploreTfs, googleQueryDays, parseExplore, parseLegs, buildGoogleItinerary, exploreCandidates } from '../src/sources/google.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const explore = fx('google-explore.txt');
const outbound = JSON.parse(fx('google-outbound.json'));
const ret = JSON.parse(fx('google-return.json'));

test('encodeTfs produce lo stesso tfs verificato nello spike', () => {
  assert.equal(
    encodeTfs([{ date: '2026-11-07', from: 'BRI', to: 'AMS' }, { date: '2026-11-08', from: 'AMS', to: 'BRI' }]),
    'GhwSCjIwMjYtMTEtMDcoAWoFEgNCUklyBRIDQU1TGhwSCjIwMjYtMTEtMDgoAWoFEgNBTVNyBRIDQlJJQAFIAZgBAQ',
  );
});

test('parseExplore estrae destinazioni con codice, città, prezzo e scali, senza duplicati', () => {
  const d = parseExplore(explore);
  assert.ok(d.length > 20);
  const codes = d.map((x) => x.code);
  assert.equal(new Set(codes).size, codes.length);
  const ams = d.find((x) => x.code === 'AMS');
  assert.deepEqual({ price: ams.price, stops: ams.stops, airline: ams.airline }, { price: 317, stops: 1, airline: 'AZ' });
  assert.equal(ams.city, 'Amsterdam');
  assert.equal(ams.country, 'Paesi Bassi');
  for (const x of d) assert.match(x.code, /^[A-Z]{3}$/);
});

test('exploreCandidates: max 200 €, escluse le tratte dirette Ryanair/Wizz, ordinate per prezzo', () => {
  const c = exploreCandidates(parseExplore(explore), 8);
  assert.ok(c.length <= 8);
  assert.ok(c.every((x) => x.price <= 200));
  assert.ok(!c.some((x) => x.stops === 0 && ['FR', 'W6', 'W4', 'W9'].includes(x.airline)));
  assert.ok(c.some((x) => x.code === 'CTA'));
  assert.ok(!c.some((x) => x.code === 'ZRH')); // 235 €
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].price <= c[i].price);
});

test('parseLegs legge orari, scalo e prezzo dalle andate, senza duplicati', () => {
  const legs = parseLegs(outbound, '2026-11-06');
  assert.equal(legs.length, 11);
  const lh = legs.find((l) => l.leg.segments[0].dep === '2026-11-07T18:15');
  assert.equal(lh.price, 437);
  assert.equal(lh.leg.segments.at(-1).arr, '2026-11-07T22:55');
  assert.deepEqual(lh.leg.layovers, [80]);
  assert.equal(lh.leg.segments[0].to, 'MUC');
  assert.equal(lh.leg.segments.length, 2);
  assert.equal(lh.leg.selfTransfer, false);
  assert.equal(lh.airline, 'Air Dolomiti e Lufthansa');
  const overnight = legs.find((l) => l.leg.segments[0].dep === '2026-11-07T15:15');
  assert.equal(overnight.leg.segments.at(-1).arr, '2026-11-08T11:15');
});

test('itinerario Google completo: andata Lufthansa + ritorno, prezzo del ritorno, valido', () => {
  const out = parseLegs(outbound, '2026-11-06').find((l) => l.leg.segments[0].dep === '2026-11-07T18:15');
  const back = parseLegs(ret, '2026-11-06')[0];
  assert.equal(back.leg.segments[0].dep, '2026-11-08T13:40');
  const it = buildGoogleItinerary({
    origin: 'BRI', destination: { code: 'AMS', city: 'Amsterdam', country: 'Paesi Bassi' },
    out, back, weekend: '2026-11-06', seenAt: '2026-11-02T10:00:00Z', bookingUrl: 'https://www.google.com/travel/flights/search?tfs=x',
  });
  assert.equal(it.price, 437);
  assert.equal(it.source, 'google');
  assert.equal(it.inbound.segments.at(-1).arr, '2026-11-08T17:35');
  assert.equal(isValid({ ...it, price: 150 }, DateTime.fromISO('2026-11-02T10:00Z')), true);
});

test('scalo con trasferimento autonomo marcato selfTransfer', () => {
  const fake = [{ label: 'A partire dal prezzo totale per andata e ritorno di 120 euro. Viaggio in aereo con 1 scalo con Ryanair. Partenza da X alle ore 18:30 il giorno venerdì, novembre 6 e arrivo a Y alle ore 23:00 il giorno venerdì, novembre 6. Durata totale 4 h 30 min. Scalo (1 di 1) di 1 h presso Z. Trasferimento autonomo. Seleziona volo', text: '18:30 – 23:00 Ryanair 4 h 30 min BRI–AMS 1 scalo 1 h BGY 120 €' }];
  assert.equal(parseLegs(fake, '2026-11-06')[0].leg.selfTransfer, true);
});

test('encodeExploreTfs replica il tfs che Google genera con le date specifiche', () => {
  assert.equal(
    encodeExploreTfs('BRI', '2026-11-13', '2026-11-15'),
    'CBwQAxoXEgoyMDI2LTExLTEzKAFqBwgBEgNCUkkaFxIKMjAyNi0xMS0xNSgBcgcIARIDQlJJQAFIAXABggELCP___________wGYAQE',
  );
});

test('googleQueryDays: venerdì e sabato di ogni weekend, saltando i giorni passati', () => {
  const w = [{ friday: '2026-11-06', saturday: '2026-11-07', sunday: '2026-11-08' }, { friday: '2026-11-13', saturday: '2026-11-14', sunday: '2026-11-15' }];
  assert.deepEqual(googleQueryDays(w, '2026-11-07').map((x) => x.depDate), ['2026-11-07', '2026-11-13', '2026-11-14']);
  assert.equal(googleQueryDays(w, '2026-11-07')[0].w.sunday, '2026-11-08');
});
