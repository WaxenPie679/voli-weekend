import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSources } from '../src/tracking/fetch.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const status = (s) => ({ ok: false, status: s, json: async () => ({}), text: async () => '' });
const rRoute = (code, extra = {}) => ({ connectingAirport: null, arrivalAirport: { code, city: { name: code }, country: { name: 'Italia' } }, ...extra });
const wCity = (iata, name, connections = []) => ({ iata, shortName: name, countryName: 'Italia', countryCode: 'IT', latitude: 40, longitude: 16, connections: connections.map((c) => ({ iata: c })) });
const WIZZ_MAP = { cities: [wCity('BRI', 'Bari', ['TIA']), wCity('TIA', 'Tirana ', ['BRI']), wCity('DBV', 'Dubrovnik')] };
const wizzDay = (date, amount) => ({ departureDate: `${date}T00:00:00`, price: { amount }, originalPrice: { amount }, departureDates: [`${date}T10:00:00`] });
const HOME = '<script src="https://be.wizzair.com/28.4.0/static.js"></script>';

/** Finto per Ryanair e Wizz; `handlers` può sostituire una risposta (primo che restituisce non-null). */
function fake({ ryanair = {}, map = WIZZ_MAP, handlers = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    for (const h of handlers) { const r = h(url, init); if (r) return r; }
    if (url === 'https://wizzair.com/') return json(HOME);
    if (url.includes('/Api/asset/map')) return json(map);
    if (url.includes('/Api/search/timetable')) return json({ outboundFlights: [], returnFlights: [] });
    const m = /searchWidget\/routes\/it\/airport\/([A-Z]+)/.exec(url);
    if (m) return json(ryanair[m[1]] ?? []);
    if (url.includes('cheapestPerDay')) return json({ outbound: { fares: [] } });
    throw new Error(`url inattesa ${url}`);
  };
  return { fetchImpl, calls };
}
const mk = (f) => createSources({ fetchImpl: f.fetchImpl, pauseMs: false, retryBaseMs: 0, log: () => {} });

test('airlinesFor: Ryanair sì, Wizz no per BRI→DBV', async () => {
  const f = fake({ ryanair: { BRI: [rRoute('DBV')] } });
  assert.deepEqual(await mk(f).airlinesFor('BRI', 'DBV'), ['ryanair']);
});

test('airlinesFor: entrambe in ordine, solo Wizz, e scalo Ryanair escluso', async () => {
  const f = fake({ ryanair: { BRI: [rRoute('TIA'), rRoute('DBV', { connectingAirport: 'FCO' })] } });
  const s = mk(f);
  assert.deepEqual(await s.airlinesFor('BRI', 'TIA'), ['ryanair', 'wizz']);
  assert.deepEqual(await s.airlinesFor('BRI', 'DBV'), []);
  const g = fake({ ryanair: { BRI: [] } });
  assert.deepEqual(await mk(g).airlinesFor('BRI', 'TIA'), ['wizz']);
});

test('airlinesFor: un elenco non scaricabile basta per l\'errore (risultato parziale ≠ tratta non servita)', async () => {
  const ryDown = fake({ handlers: [(u) => (u.includes('searchWidget') ? status(500) : null)] });
  await assert.rejects(() => mk(ryDown).airlinesFor('BRI', 'TIA'), /ryanair/);
  const wzDown = fake({ ryanair: { BRI: [rRoute('DBV')] }, handlers: [(u) => (u.includes('asset/map') ? status(500) : null)] });
  await assert.rejects(() => mk(wzDown).airlinesFor('BRI', 'DBV'), /wizz/);
  const both = fake({ handlers: [(u) => (u.includes('searchWidget') || u.includes('asset/map') ? status(500) : null)] });
  await assert.rejects(() => mk(both).airlinesFor('BRI', 'TIA'));
});

test('elenchi tratte scaricati una sola volta per aeroporto nello stesso giro', async () => {
  const f = fake({ ryanair: { BRI: [rRoute('TIA')], BDS: [rRoute('TIA')] } });
  const s = mk(f);
  await s.airlinesFor('BRI', 'TIA');
  await s.airlinesFor('BRI', 'DBV');
  await s.airlinesFor('BDS', 'TIA');
  await s.airlinesFor('BDS', 'TIA');
  const n = (p) => f.calls.filter((c) => c.url.includes(p)).length;
  assert.equal(n('airport/BRI'), 1);
  assert.equal(n('airport/BDS'), 1);
  assert.equal(n('asset/map'), 1);
  assert.equal(n('https://wizzair.com/'), 1);
});

test('dayPrices Ryanair: una richiesta per mese, osservazioni con stato', async () => {
  const f = fake({
    handlers: [(u) => {
      const m = /outboundMonthOfDate=(\d{4}-\d{2}-\d{2})/.exec(u);
      if (!m) return null;
      const mese = m[1].slice(0, 7);
      return json({ outbound: { fares: [
        { day: `${mese}-10`, price: { value: 42 }, soldOut: false, unavailable: false },
        { day: `${mese}-11`, price: null, soldOut: true, unavailable: false },
      ] } });
    }],
  });
  const obs = await mk(f).dayPrices('ryanair', 'BRI', 'TIA', ['2026-12', '2027-01'], '2026-11-15');
  const urls = f.calls.map((c) => c.url);
  assert.equal(urls.length, 2);
  assert.ok(urls[0].includes('/BRI/TIA/cheapestPerDay?outboundMonthOfDate=2026-12-01'));
  assert.ok(urls[1].includes('outboundMonthOfDate=2027-01-01'));
  assert.equal(obs.length, 4);
  assert.deepEqual(obs.map((o) => [o.date, o.state, o.price, o.origin, o.dest]), [
    ['2026-12-10', 'prezzo', 42, 'BRI', 'TIA'], ['2026-12-11', 'esaurito', null, 'BRI', 'TIA'],
    ['2027-01-10', 'prezzo', 42, 'BRI', 'TIA'], ['2027-01-11', 'esaurito', null, 'BRI', 'TIA'],
  ]);
});

test('dayPrices Ryanair: scarta i giorni prima di oggi', async () => {
  const f = fake({ handlers: [(u) => (u.includes('cheapestPerDay') ? json({ outbound: { fares: [
    { day: '2026-11-10', price: { value: 30 } }, { day: '2026-11-20', price: { value: 31 } }] } }) : null)] });
  const obs = await mk(f).dayPrices('ryanair', 'BRI', 'TIA', ['2026-11'], '2026-11-15');
  assert.deepEqual(obs.map((o) => o.date), ['2026-11-20']);
});

test('dayPrices lancia se un mese fallisce o la risposta non è valida', async () => {
  const f = fake({ handlers: [(u) => (u.includes('2027-01-01') ? status(500) : null)] });
  await assert.rejects(() => mk(f).dayPrices('ryanair', 'BRI', 'TIA', ['2026-12', '2027-01'], '2026-11-15'), /HTTP 500/);
  const g = fake({ handlers: [(u) => (u.includes('cheapestPerDay') ? json({ outbound: {} }) : null)] });
  await assert.rejects(() => mk(g).dayPrices('ryanair', 'BRI', 'TIA', ['2026-12'], '2026-11-15'), /risposta non valida/);
});

test('dayPrices Wizz: finestre ≤30 giorni su luglio-agosto, adultCount 1, solo outboundFlights', async () => {
  const f = fake({
    handlers: [(u, init) => {
      if (!u.includes('timetable')) return null;
      const b = JSON.parse(init.body);
      const from = b.flightList[0].from.slice(0, 10);
      return json({ outboundFlights: [wizzDay(from, 50)], returnFlights: [{ ...wizzDay(from, 9), departureStation: 'TIA' }] });
    }],
  });
  const obs = await mk(f).dayPrices('wizz', 'BRI', 'TIA', ['2027-07', '2027-08'], '2026-11-15');
  const posts = f.calls.filter((c) => c.url.includes('timetable'));
  assert.ok(posts[0].url.startsWith('https://be.wizzair.com/28.4.0/Api/'));
  const wins = posts.map((c) => JSON.parse(c.init.body));
  assert.equal(wins[0].flightList[0].from, '2027-07-01');
  assert.equal(wins.at(-1).flightList[0].to, '2027-08-31');
  for (const b of wins) {
    assert.equal(b.adultCount, 1);
    assert.deepEqual([b.flightList[0].departureStation, b.flightList[0].arrivalStation], ['BRI', 'TIA']);
    assert.deepEqual([b.flightList[1].departureStation, b.flightList[1].arrivalStation], ['TIA', 'BRI']);
    assert.deepEqual([b.flightList[1].from, b.flightList[1].to], [b.flightList[0].from, b.flightList[0].to]);
    const days = (Date.parse(b.flightList[0].to) - Date.parse(b.flightList[0].from)) / 864e5 + 1;
    assert.ok(days <= 30, `finestra di ${days} giorni`);
  }
  for (let i = 1; i < wins.length; i++) {
    assert.equal(Date.parse(wins[i].flightList[0].from) - Date.parse(wins[i - 1].flightList[0].to), 864e5);
  }
  assert.equal(wins.length, 3);
  assert.equal(obs.length, 3);
  assert.ok(obs.every((o) => o.price === 50 && o.origin === 'BRI' && o.dest === 'TIA'));
});

test('dayPrices Wizz: la finestra parte da oggi se il mese è già iniziato', async () => {
  const f = fake();
  await mk(f).dayPrices('wizz', 'BRI', 'TIA', ['2026-11'], '2026-11-15');
  const b = JSON.parse(f.calls.find((c) => c.url.includes('timetable')).init.body);
  assert.deepEqual([b.flightList[0].from, b.flightList[0].to], ['2026-11-15', '2026-11-30']);
});

test('dayPrices Wizz: richiesta in errore → lancia', async () => {
  const f = fake({ handlers: [(u) => (u.includes('timetable') ? status(500) : null)] });
  await assert.rejects(() => mk(f).dayPrices('wizz', 'BRI', 'TIA', ['2026-12'], '2026-11-15'), /HTTP 500/);
});

test('airports unisce le due fonti senza doppioni e sopravvive a una fonte in errore', async () => {
  const ryAirports = [
    { code: 'TIA', city: { name: 'Tirana' }, country: { name: 'Albania' } },
    { code: 'BRI', city: { name: 'Bari' }, country: { name: 'Italia' } },
  ];
  const f = fake({ handlers: [(u) => (u.includes('airports/it/active') ? json(ryAirports) : null)] });
  const all = await mk(f).airports();
  assert.deepEqual(all.map((a) => a.code), ['BRI', 'DBV', 'TIA']);
  assert.deepEqual(all.find((a) => a.code === 'TIA'), { code: 'TIA', city: 'Tirana', country: 'Albania', group: 'TIA' });
  assert.equal(all.find((a) => a.code === 'DBV').city, 'Dubrovnik');

  const ryDown = fake({ handlers: [(u) => (u.includes('airports/it/active') ? status(500) : null)] });
  assert.deepEqual((await mk(ryDown).airports()).map((a) => a.code), ['BRI', 'DBV', 'TIA']);
  const wDown = fake({ handlers: [(u) => (u.includes('airports/it/active') ? json(ryAirports) : u.includes('asset/map') ? status(500) : null)] });
  assert.deepEqual((await mk(wDown).airports()).map((a) => a.code), ['BRI', 'TIA']);
  const none = fake({ handlers: [(u) => (u.includes('airports/it/active') || u.includes('asset/map') ? status(500) : null)] });
  await assert.rejects(() => mk(none).airports());
});

test('airports: nome completo Ryanair, gruppo città, niente voci «tutti gli aeroporti» di Wizz', async () => {
  const ryAirports = [
    { code: 'FCO', name: 'Roma (Fiumicino)', city: { name: 'Roma', macCode: 'ROM' }, country: { name: 'Italia' } },
    { code: 'CIA', name: 'Roma (Ciampino)', city: { name: 'Roma', macCode: 'ROM' }, country: { name: 'Italia' } },
  ];
  const map = { cities: [...WIZZ_MAP.cities, { ...wCity('ROM', 'Roma (tutti gli aeroporti)'), mac: 'ROM', isFakeStation: true }, { ...wCity('BUD', 'Budapest'), mac: 'BUD' }] };
  const f = fake({ map, handlers: [(u) => (u.includes('airports/it/active') ? json(ryAirports) : null)] });
  const all = await mk(f).airports();
  assert.deepEqual(all.find((a) => a.code === 'FCO'), { code: 'FCO', city: 'Roma (Fiumicino)', country: 'Italia', group: 'ROM' });
  assert.equal(all.some((a) => a.code === 'ROM'), false);
  assert.equal(all.find((a) => a.code === 'BUD').group, 'BUD');
});

test('servedFrom: destinazioni dirette Ryanair e Wizz da un aeroporto; una fonte in errore non blocca', async () => {
  const routes = [{ arrivalAirport: { code: 'FCO', city: { name: 'Roma' }, country: { name: 'Italia' } } }];
  const f = fake({ handlers: [(u) => (u.includes('routes/it/airport/BRI') ? json(routes) : null)] });
  const codes = await mk(f).servedFrom('BRI');
  assert.ok(codes.includes('FCO'));
  assert.ok(codes.includes('DBV') || codes.length > 1, 'include anche le destinazioni Wizz');
  assert.equal(new Set(codes).size, codes.length);
  const down = fake({ handlers: [(u) => (u.includes('asset/map') ? status(500) : u.includes('routes/it/airport/BRI') ? json(routes) : null)] });
  assert.deepEqual(await mk(down).servedFrom('BRI'), ['FCO']);
});
