import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { upcomingWeekends } from '../src/weekends.js';
import { fetchWizz, parseWizzVersion, wizzVersion, parseWizzRoutes, pairWizzFares, estimateMinutes, timetableWindows } from '../src/sources/wizz.js';

const map = JSON.parse(readFileSync(new URL('./fixtures/wizz-map.json', import.meta.url)));
const tt = JSON.parse(readFileSync(new URL('./fixtures/wizz-timetable.json', import.meta.url)));
const weekends = upcomingWeekends(DateTime.fromISO('2026-11-02T10:00Z'));
const SEEN = '2026-11-02T10:00:00Z';

test('parseWizzVersion legge la versione dalla home', () => {
  assert.equal(parseWizzVersion('<script src="https://be.wizzair.com/29.23.1/Api/x">'), '29.23.1');
  assert.throws(() => parseWizzVersion('<html></html>'));
});

test('parseWizzRoutes elenca le rotte da BRI e BDS senza duplicati', () => {
  const r = parseWizzRoutes(map, ['BRI', 'BDS']);
  assert.ok(r.length > 0);
  const keys = r.map((x) => `${x.origin}-${x.code}`);
  assert.equal(new Set(keys).size, keys.length);
  const bud = r.find((x) => x.origin === 'BRI' && x.code === 'BUD');
  assert.equal(bud.city, 'Budapest');
  assert.equal(bud.country, 'Ungheria');
  assert.ok(bud.km > 600 && bud.km < 900);
});

test('timetableWindows copre gli 8 weekend in finestre di massimo 30 giorni', () => {
  const w = timetableWindows(weekends);
  assert.equal(w[0].from, '2026-11-06');
  assert.equal(w.at(-1).to, '2026-12-27');
  for (const x of w) assert.ok(DateTime.fromISO(x.to).diff(DateTime.fromISO(x.from), 'days').days <= 29);
});

test('timetableWindows: ogni weekend sta tutto dentro una finestra', () => {
  const w = timetableWindows(weekends);
  for (const wk of weekends) assert.ok(w.some((x) => x.from <= wk.friday && wk.sunday <= x.to), wk.friday);
});

test('pairWizzFares abbina andata ven/sab e ritorno domenica dello stesso weekend', () => {
  const route = parseWizzRoutes(map, ['BRI']).find((x) => x.code === 'BUD');
  const its = pairWizzFares(tt, route, weekends, SEEN);
  const sat = its.find((i) => i.outbound.segments[0].dep === '2026-11-07T15:20');
  assert.equal(sat.price, 101.98);
  assert.equal(sat.inbound.segments[0].dep, '2026-11-08T13:30');
  assert.equal(sat.weekend, '2026-11-06');
  assert.equal(sat.source, 'wizz');
  assert.equal(sat.inbound.arrivalEstimated, true);
  assert.match(sat.bookingUrl, /wizzair\.com.*BRI\/BUD\/2026-11-07\/2026-11-08/);
  // weekend del 20: ritorno domenica senza prezzo (0) → nessuna coppia
  assert.equal(its.filter((i) => i.weekend === '2026-11-20').length, 0);
  for (const i of its) {
    const o = DateTime.fromISO(i.outbound.segments[0].dep);
    const r = DateTime.fromISO(i.inbound.segments[0].dep);
    assert.ok([5, 6].includes(o.weekday));
    assert.equal(r.weekday, 7);
    assert.ok(r.diff(o, 'days').days < 3);
  }
});

test('estimateMinutes: 760 km ≈ 1h30', () => {
  const m = estimateMinutes(760);
  assert.ok(m >= 80 && m <= 100);
});

test('wizzVersion: se la home risponde 405 a fetch, usa curl', async () => {
  const fetchImpl = async () => new Response('', { status: 405 });
  const curlImpl = async (url) => { assert.equal(url, 'https://wizzair.com/'); return '<a href="https://be.wizzair.com/29.23.1/Api">'; };
  assert.equal(await wizzVersion({ fetchImpl, curlImpl }), '29.23.1');
});

test('wizzVersion: con fetch riuscito non chiama curl', async () => {
  const fetchImpl = async () => new Response('be.wizzair.com/30.1.0/Api', { status: 200 });
  const curlImpl = async () => { throw new Error('non doveva essere chiamato'); };
  assert.equal(await wizzVersion({ fetchImpl, curlImpl }), '30.1.0');
});

test('timetableWindows non parte da un giorno già passato', () => {
  const sat = upcomingWeekends(DateTime.fromISO('2026-11-07T08:00Z'));
  assert.equal(timetableWindows(sat, '2026-11-07')[0].from, '2026-11-07');
});

test('fetchWizz: un 429 su una rotta non fa fallire la fonte; fallisce solo se cade più di metà delle rotte', async () => {
  const smallMap = { cities: [
    { iata: 'BRI', shortName: 'Bari', countryName: 'Italia', countryCode: 'IT', latitude: 41.1, longitude: 16.8, connections: [{ iata: 'BUD' }, { iata: 'TIA' }, { iata: 'OTP' }] },
    { iata: 'BUD', shortName: 'Budapest', countryName: 'Ungheria', countryCode: 'HU', latitude: 47.4, longitude: 19.2, connections: [] },
    { iata: 'TIA', shortName: 'Tirana', countryName: 'Albania', countryCode: 'AL', latitude: 41.4, longitude: 19.7, connections: [] },
    { iata: 'OTP', shortName: 'Bucarest', countryName: 'Romania', countryCode: 'RO', latitude: 44.6, longitude: 26.1, connections: [] },
  ] };
  const fake = (failing) => async (url, init) => {
    if (url === 'https://wizzair.com/') return new Response('be.wizzair.com/29.23.1/Api');
    if (url.includes('/asset/map')) return new Response(JSON.stringify(smallMap));
    const body = JSON.parse(init.body);
    if (failing.includes(body.flightList[0].arrivalStation)) return new Response('', { status: 429 });
    return new Response(JSON.stringify({ outboundFlights: [], returnFlights: [] }));
  };
  const log = () => {};
  await fetchWizz(weekends.slice(0, 1), { fetchImpl: fake(['TIA']), pauseMs: 0, log });
  await assert.rejects(fetchWizz(weekends.slice(0, 1), { fetchImpl: fake(['TIA', 'OTP']), pauseMs: 0, log }));
});

test('wizzVersion: se fetch lancia un errore di rete usa curl', async () => {
  const fetchImpl = async () => { throw new Error('ECONNRESET'); };
  assert.equal(await wizzVersion({ fetchImpl, curlImpl: async () => 'be.wizzair.com/29.23.1/' }), '29.23.1');
});
