import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectRyanair, collectWizz, fetchRetry } from '../src/history/collect.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const status = (s) => ({ ok: false, status: s, json: async () => ({}), text: async () => '' });
const route = (code) => ({ connectingAirport: null, arrivalAirport: { code, city: { name: code }, country: { name: 'Italia' } } });
const fares = (day) => ({ outbound: { fares: [{ day, price: { value: 40 }, soldOut: false, unavailable: false }] } });

/** Finto Ryanair: elenco tratte da BRI (BDS vuoto), un giorno a 40 per mese; `override(url)` può sostituire la risposta. */
function ryanairFake(dests, override = () => null) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const o = override(url);
    if (o) return o;
    if (url.includes('/airport/BRI')) return json(dests.map(route));
    if (url.includes('/airport/BDS')) return json([]);
    const month = /outboundMonthOfDate=(\d{4}-\d{2})/.exec(url)[1];
    return json(fares(`${month}-20`));
  };
  return { fetchImpl, calls };
}

test('collectRyanair: entrambe le direzioni, 12 mesi, copertura per mese riuscito', async () => {
  const { fetchImpl, calls } = ryanairFake(['TRN']);
  const r = await collectRyanair('2026-11-12', { fetchImpl, pauseMs: false, log: () => {} });
  assert.equal(calls.filter((u) => u.includes('cheapestPerDay')).length, 24);
  assert.ok(calls.some((u) => u.includes('/BRI/TRN/') && u.includes('2026-11-01')));
  assert.ok(calls.some((u) => u.includes('/TRN/BRI/') && u.includes('2027-10-01')));
  assert.deepEqual(r.coverage.find((c) => c.origin === 'TRN' && c.from === '2026-11-12'), { airline: 'ryanair', origin: 'TRN', dest: 'BRI', from: '2026-11-12', to: '2026-11-30' });
  assert.deepEqual([r.meta.routesExpected, r.meta.routesOk, r.meta.requestsFailed], [1, 1, 0]);
  assert.deepEqual(r.routes, [{ airline: 'ryanair', origin: 'BRI', code: 'TRN', city: 'TRN', country: 'Italia' }]);
  assert.equal(r.observations.length, 24);
});

test('collectRyanair: un mese in errore → niente copertura per quel mese, tratta non ok', async () => {
  const { fetchImpl } = ryanairFake(['TRN'], (u) => (u.includes('/BRI/TRN/') && u.includes('outboundMonthOfDate=2027-02-01') ? status(500) : null));
  const r = await collectRyanair('2026-11-12', { fetchImpl, pauseMs: false, log: () => {} });
  assert.ok(!r.coverage.some((c) => c.origin === 'BRI' && c.from.startsWith('2027-02')));
  assert.deepEqual(r.meta.missing, ['BRI-TRN 2027-02']);
  assert.deepEqual([r.meta.routesOk, r.meta.requestsFailed], [0, 1]);
  assert.equal(r.meta.stoppedReason, null);
});

test('collectRyanair: una risposta non interpretabile conta come richiesta fallita', async () => {
  const { fetchImpl } = ryanairFake(['TRN'], (u) => (u.includes('/TRN/BRI/') && u.includes('2026-12-01') ? json(null) : null));
  const r = await collectRyanair('2026-11-12', { fetchImpl, pauseMs: false, log: () => {} });
  assert.deepEqual(r.meta.missing, ['TRN-BRI 2026-12']);
  assert.deepEqual([r.meta.routesOk, r.meta.requestsFailed, r.meta.requestsOk], [0, 1, 23]);
});

test('collectRyanair: 429 continui → stop della compagnia, tratte restanti in missing', async () => {
  const { fetchImpl } = ryanairFake(['TRN', 'MXP'], (u) => (u.includes('cheapestPerDay') ? status(429) : null));
  const r = await collectRyanair('2026-11-12', { fetchImpl, pauseMs: false, retryBaseMs: 0, log: () => {} });
  assert.equal(r.meta.stoppedReason, '429');
  assert.ok(r.meta.missing.includes('BRI-MXP'));
  assert.equal(r.meta.routesOk, 0);
});

test('collectRyanair: elenco tratte non scaricabile → routesExpected 0 e motivo', async () => {
  const { fetchImpl } = ryanairFake(['TRN'], (u) => (u.includes('/airport/') ? status(500) : null));
  const r = await collectRyanair('2026-11-12', { fetchImpl, pauseMs: false, log: () => {} });
  assert.equal(r.meta.routesExpected, 0);
  assert.match(r.meta.stoppedReason, /elenco tratte/);
});

const wizzMap = { cities: [
  { iata: 'BRI', shortName: 'Bari', countryName: 'Italia', countryCode: 'IT', latitude: 41.1, longitude: 16.8, connections: [{ iata: 'BUD' }] },
  { iata: 'BUD', shortName: 'Budapest', countryName: 'Ungheria', countryCode: 'HU', latitude: 47.4, longitude: 19.2, connections: [] },
] };
const wDay = (date) => ({ departureDate: `${date}T00:00:00`, price: { amount: 30 }, departureDates: [`${date}T10:00:00`] });

function wizzFake(override = () => null) {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    const o = override(url, init);
    if (o) return o;
    if (url === 'https://wizzair.com/') return json('<script src="https://be.wizzair.com/29.24.0/Api"></script>');
    if (url.includes('asset/map')) return json(wizzMap);
    if (url.includes('search/timetable')) {
      const body = JSON.parse(init.body);
      bodies.push(body);
      const [out, back] = body.flightList;
      return json({ outboundFlights: [wDay(out.from)], returnFlights: [wDay(back.from)] });
    }
    return status(404);
  };
  return { fetchImpl, bodies };
}

test('collectWizz: finestre di 30 giorni fino a oggi+365, andata e ritorno nella stessa richiesta', async () => {
  const { fetchImpl, bodies: sent } = wizzFake();
  const r = await collectWizz('2026-11-12', { fetchImpl, pauseMs: false, log: () => {} });
  const bodies = sent.map((b) => b.flightList);
  assert.equal(bodies.length, 13);
  assert.deepEqual(bodies[0].map((f) => [f.departureStation, f.arrivalStation, f.from, f.to]),
    [['BRI', 'BUD', '2026-11-12', '2026-12-11'], ['BUD', 'BRI', '2026-11-12', '2026-12-11']]);
  assert.ok(bodies.at(-1)[0].to <= '2027-11-12');
  assert.equal(r.coverage.length, 26);
  assert.equal(r.observations.length, 26);
  assert.deepEqual([r.meta.routesExpected, r.meta.routesOk], [1, 1]);
  assert.deepEqual(r.routes, [{ airline: 'wizz', origin: 'BRI', code: 'BUD', city: 'Budapest', country: 'Ungheria' }]);
});

test('collectWizz: finestra in errore → una voce missing per direzione, nessuna copertura', async () => {
  const { fetchImpl } = wizzFake((url, init) => (init?.body?.includes('"from":"2026-12-12"') ? status(500) : null));
  const r = await collectWizz('2026-11-12', { fetchImpl, pauseMs: false, log: () => {} });
  assert.deepEqual(r.meta.missing, ['BRI-BUD 2026-12-12', 'BUD-BRI 2026-12-12']);
  assert.equal(r.coverage.length, 24);
  assert.deepEqual([r.meta.routesOk, r.meta.requestsFailed], [0, 1]);
});

test('collectWizz: 429 continui → stop con motivo 429', async () => {
  const { fetchImpl } = wizzFake((url) => (url.includes('search/timetable') ? status(429) : null));
  const r = await collectWizz('2026-11-12', { fetchImpl, pauseMs: false, retryBaseMs: 0, log: () => {} });
  assert.equal(r.meta.stoppedReason, '429');
  assert.equal(r.meta.routesOk, 0);
  assert.equal(r.meta.missing.length, 26);
});

test('fetchRetry: 429 poi 200 → risultato; 404 → errore subito', async () => {
  let n = 0;
  const flaky = async () => (++n < 2 ? status(429) : json({ ok: 1 }));
  assert.deepEqual(await fetchRetry(flaky, 'https://x/y', undefined, { baseMs: 0 }), { ok: 1 });
  assert.equal(n, 2);
  let m = 0;
  await assert.rejects(fetchRetry(async () => { m++; return status(404); }, 'https://x/y', undefined, { baseMs: 0 }), /HTTP 404/);
  assert.equal(m, 1);
  await assert.rejects(fetchRetry(async () => status(429), 'https://x/y', undefined, { baseMs: 0 }), (e) => e.rateLimited === true);
});

test('collectRyanair: risposta 200 con forma inattesa ({}) → richiesta fallita, nessuna copertura', async () => {
  const { fetchImpl } = ryanairFake(['TRN'], (u) => (u.includes('/BRI/TRN/') && u.includes('2026-12-01') ? json({}) : null));
  const r = await collectRyanair('2026-11-12', { fetchImpl, pauseMs: false, log: () => {} });
  assert.deepEqual(r.meta.missing, ['BRI-TRN 2026-12']);
  assert.ok(!r.coverage.some((c) => c.origin === 'BRI' && c.from.startsWith('2026-12')));
  assert.deepEqual([r.meta.routesOk, r.meta.requestsFailed, r.meta.requestsOk], [0, 1, 23]);
});

test('collectWizz: risposta 200 senza elenchi voli ({}) → finestra fallita, nessuna copertura', async () => {
  const { fetchImpl } = wizzFake((url, init) => (init?.body?.includes('"from":"2026-12-12"') ? json({}) : null));
  const r = await collectWizz('2026-11-12', { fetchImpl, pauseMs: false, log: () => {} });
  assert.deepEqual(r.meta.missing, ['BRI-BUD 2026-12-12', 'BUD-BRI 2026-12-12']);
  assert.equal(r.coverage.length, 24);
  assert.equal(r.meta.requestsFailed, 1);
});

test('collectRyanair: elenco BRI ok ma BDS in errore → routesExpected 0 e routes vuoto', async () => {
  const { fetchImpl } = ryanairFake(['TRN'], (u) => (u.includes('/airport/BDS') ? status(500) : null));
  const r = await collectRyanair('2026-11-12', { fetchImpl, pauseMs: false, log: () => {} });
  assert.equal(r.meta.routesExpected, 0);
  assert.deepEqual(r.routes, []);
  assert.match(r.meta.stoppedReason, /elenco tratte/);
});

test('collectRyanair: maxRoutes limita tratte e routesExpected', async () => {
  const { fetchImpl, calls } = ryanairFake(['TRN', 'MXP']);
  const r = await collectRyanair('2026-11-12', { fetchImpl, pauseMs: false, maxRoutes: 1, log: () => {} });
  assert.equal(r.meta.routesExpected, 1);
  assert.equal(r.routes.length, 1);
  assert.equal(calls.filter((u) => u.includes('cheapestPerDay')).length, 24);
});
