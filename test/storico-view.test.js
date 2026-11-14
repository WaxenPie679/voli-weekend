import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELIABILITY_LABEL, isReadyIndex, statusLine, riseText, scale, priceDomain, curvePaths, stepPoints, upcomingDepartures, routeLabel, weekRange, weekFlights, timeText, searchUrl, weekendSaturdays, fridayEvening, weekendDays, roundTrips, cheapestTrip } from '../web/storico-view.js';

test('RELIABILITY_LABEL', () => {
  assert.deepEqual(RELIABILITY_LABEL, { prima: 'prima stima', crescita: 'in crescita', affidabile: 'affidabile' });
});

test('statusLine con data italiana, ora di Roma e plurale', () => {
  const idx = { firstDay: '2026-11-12', daysCollected: 2, reliability: 'prima', generatedAt: '2026-11-13T05:05:00Z' };
  assert.equal(statusLine(idx), 'Storico dal 12 nov · 2 giorni · prima stima · aggiornato alle 06:05');
});

test('statusLine: 1 giorno al singolare, ora legale', () => {
  const idx = { firstDay: '2026-07-01', daysCollected: 1, reliability: 'prima', generatedAt: '2026-07-02T04:05:00Z' };
  assert.equal(statusLine(idx), 'Storico dal 1 lug · 1 giorno · prima stima · aggiornato alle 06:05');
});

test('riseText', () => {
  assert.equal(riseText(null, 'prima'), 'Ancora pochi dati per dire quando sale: servono circa 4 settimane.');
  assert.equal(riseText(6, 'crescita'), 'Di solito il prezzo inizia a salire circa 6 settimane prima della partenza.');
  assert.equal(riseText(1, 'affidabile'), 'Di solito il prezzo inizia a salire circa 1 settimana prima della partenza.');
  assert.equal(riseText(null, 'affidabile'), 'Nessuna salita chiara finora.');
});

test('scale lineare', () => {
  const s = scale(0, 10, 100, 200);
  assert.equal(s(0), 100);
  assert.equal(s(5), 150);
  assert.equal(s(10), 200);
  assert.equal(scale(0, 10, 200, 100)(2), 180);
});

test('scale con dominio di un solo valore → metà del range, mai NaN', () => {
  const s = scale(5, 5, 100, 200);
  assert.equal(s(5), 150);
  assert.equal(s(7), 150);
});

test('priceDomain', () => {
  assert.deepEqual(priceDomain([32, 61]), [30, 70]);
  assert.deepEqual(priceDomain([50]), [40, 60]);
  assert.deepEqual(priceDomain([3, 8]), [0, 20]);
  assert.deepEqual(priceDomain([]), [0, 20]);
});

test('curvePaths', () => {
  assert.deepEqual(curvePaths([], (x) => x, (y) => y), { line: '', band: '' });
  const curve = [[0, 50, 40, 60, 9], [1, 55, 45, 70, 9]];
  const r = curvePaths(curve, (x) => x * 10, (y) => y);
  assert.equal(r.line, 'M0,50L10,55');
  assert.equal(r.band, 'M0,60L10,70L10,45L0,40Z');
});

test('stepPoints', () => {
  assert.deepEqual(stepPoints([['2026-11-12', 'prezzo', 30]], '2026-11-12'), [['2026-11-12', 30]]);
  assert.deepEqual(
    stepPoints([['2026-11-12', 'prezzo', 30], ['2026-11-14', 'esaurito', null]], '2026-11-15'),
    [['2026-11-12', 30], ['2026-11-13', 30], ['2026-11-14', null], ['2026-11-15', null]],
  );
  assert.deepEqual(stepPoints([], '2026-11-15'), []);
});

test('upcomingDepartures', () => {
  const flights = [
    ['2026-11-10', [['2026-11-01', 'prezzo', 20]]],
    ['2026-11-20', [['2026-11-12', 'esaurito', null]]],
    ['2026-11-18', [['2026-11-12', 'prezzo', 30]]],
    ['2026-11-12', [['2026-11-12', 'prezzo', 25]]],
  ];
  assert.deepEqual(upcomingDepartures(flights, '2026-11-12'), ['2026-11-12', '2026-11-18']);
});

test('routeLabel', () => {
  assert.equal(routeLabel({ from: 'BDS', to: 'TRN', city: 'Torino' }), 'Brindisi → Torino');
  assert.equal(routeLabel({ from: 'TRN', to: 'BDS', city: 'Torino' }), 'Torino → Brindisi');
  assert.equal(routeLabel({ from: 'BRI', to: 'BGY', city: 'Milano' }), 'Bari → Milano');
});

test('isReadyIndex: serve un giorno di partenza e almeno una tratta', () => {
  const ok = { firstDay: '2026-11-12', daysCollected: 2, routes: [{ from: 'BRI', to: 'BUD' }] };
  assert.equal(isReadyIndex(ok), true);
  assert.equal(isReadyIndex({ firstDay: null, daysCollected: 0, routes: [] }), false);
  assert.equal(isReadyIndex({ ...ok, firstDay: null }), false);
  assert.equal(isReadyIndex({ ...ok, routes: [] }), false);
  assert.equal(isReadyIndex({ ...ok, routes: undefined }), false);
  assert.equal(isReadyIndex(null), false);
  assert.equal(isReadyIndex([]), false);
});

test('weekRange: settimana N = da lastDay+7N a lastDay+7N+6', () => {
  assert.deepEqual(weekRange('2026-11-13', 0), ['2026-11-13', '2026-11-19']);
  assert.deepEqual(weekRange('2026-11-13', 6), ['2026-12-25', '2026-12-31']);
  assert.deepEqual(weekRange('2026-12-28', 1), ['2027-01-04', '2027-01-10']);
});

test('weekFlights: righe della settimana con il prezzo attuale, esauriti solo contati', () => {
  const file = {
    airlines: {
      wizz: {
        flights: [
          ['2026-12-26', [['2026-11-12', 'prezzo', 60], ['2026-11-13', 'prezzo', 49.99]], '15:20 21:40'],
          ['2026-12-25', [['2026-11-12', 'prezzo', 30]], ''],
          ['2026-12-28', [['2026-11-12', 'prezzo', 30], ['2026-11-13', 'esaurito', null]], ''],
          ['2027-01-01', [['2026-11-12', 'prezzo', 10]], ''], // fuori settimana
        ],
      },
      ryanair: {
        flights: [
          ['2026-12-25', [['2026-11-13', 'prezzo', 42.96]], '10:05-11:55'],
          ['2026-12-24', [['2026-11-13', 'prezzo', 20]], ''], // fuori settimana
          ['2026-12-31', [['2026-11-13', 'da_verificare', null]], ''],
          ['2026-12-30', [['2026-11-13', 'prezzo', 55]]], // senza orario (formato vecchio)
        ],
      },
    },
  };
  assert.deepEqual(weekFlights(file, '2026-11-13', 6), {
    rows: [
      { date: '2026-12-25', airline: 'ryanair', time: '10:05-11:55', price: 42.96 },
      { date: '2026-12-25', airline: 'wizz', time: '', price: 30 },
      { date: '2026-12-26', airline: 'wizz', time: '15:20 21:40', price: 49.99 },
      { date: '2026-12-30', airline: 'ryanair', time: '', price: 55 },
    ],
    unavailable: 2,
  });
});

test('weekFlights: settimana vuota e compagnie assenti', () => {
  const file = { airlines: { ryanair: { flights: [['2026-11-14', [['2026-11-13', 'prezzo', 20]], '']] } } };
  assert.deepEqual(weekFlights(file, '2026-11-13', 10), { rows: [], unavailable: 0 });
  assert.deepEqual(weekFlights({ airlines: {} }, '2026-11-13', 0), { rows: [], unavailable: 0 });
  assert.deepEqual(weekFlights(file, '2026-11-13', 0).rows.length, 1);
});

test('timeText', () => {
  assert.equal(timeText('10:05-11:55'), '10:05 → 11:55');
  assert.equal(timeText('15:20 21:40'), '15:20 · 21:40');
  assert.equal(timeText(''), '');
  assert.equal(timeText(undefined), '');
});

test('searchUrl: Ryanair sola andata e Wizz selezione volo', () => {
  assert.equal(
    searchUrl('ryanair', 'BRI', 'BUD', '2026-12-25'),
    'https://www.ryanair.com/it/it/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=2026-12-25&isReturn=false&originIata=BRI&destinationIata=BUD',
  );
  assert.equal(
    searchUrl('wizz', 'BUD', 'BRI', '2026-12-26'),
    'https://wizzair.com/it-it/booking/select-flight/BUD/BRI/2026-12-26/null/1/0/0/null',
  );
});

// ---- Quando partire: combinazioni andata e ritorno ----
const fl = (date, price, time = '10:00-11:00', state = 'prezzo') => [date, [['2026-11-14', state, price]], time];
const mk = (ryanair = [], wizz = []) => ({ airlines: { ryanair: { flights: ryanair }, wizz: { flights: wizz } } });

test('weekendSaturdays: 53 sabati, weekend in corso se domenica', () => {
  const s = weekendSaturdays('2026-11-14');
  assert.equal(s.length, 53);
  assert.equal(s[0], '2026-11-14');
  assert.equal(s[1], '2026-11-21');
  assert.equal(s[52], '2027-11-13');
  assert.equal(weekendSaturdays('2026-11-15')[0], '2026-11-14');
  assert.equal(weekendSaturdays('2026-11-16')[0], '2026-11-21');
});

test('fridayEvening', () => {
  assert.equal(fridayEvening('ryanair', '19:05-21:00'), true);
  assert.equal(fridayEvening('ryanair', '17:55-19:40'), false);
  assert.equal(fridayEvening('wizz', '06:10 18:30'), true);
  assert.equal(fridayEvening('wizz', '06:10 12:00'), false);
  assert.equal(fridayEvening('ryanair', ''), false);
});

test('weekendDays', () => {
  assert.deepEqual(weekendDays('2026-12-12', 'weekend'), { out: ['2026-12-11', '2026-12-12'], back: ['2026-12-13'] });
  assert.deepEqual(weekendDays('2026-12-12', 'lungo'), { out: ['2026-12-10', '2026-12-11', '2026-12-12'], back: ['2026-12-13', '2026-12-14'] });
});

const base = () => ({
  out: mk([fl('2026-12-11', 20, '07:00-08:50')], [fl('2026-12-12', 35, '09:00 10:00')]),
  back: mk([fl('2026-12-13', 25), fl('2026-12-14', 10)]),
});
const find = (trips, sat) => trips.find((t) => t.saturday === sat);

test('roundTrips: vista weekend scarta il venerdì mattina', () => {
  const { out, back } = base();
  const t = find(roundTrips(out, back, '2026-11-14', 'weekend'), '2026-12-12');
  assert.equal(t.total, 60);
  assert.equal(t.out.airline, 'wizz');
  assert.equal(t.back.airline, 'ryanair');
  assert.equal(t.back.date, '2026-12-13');
});

test('roundTrips: vista lungo usa venerdì e lunedì', () => {
  const { out, back } = base();
  const t = find(roundTrips(out, back, '2026-11-14', 'lungo'), '2026-12-12');
  assert.equal(t.out.date, '2026-12-11');
  assert.equal(t.back.date, '2026-12-14');
  assert.equal(t.total, 30);
});

test('roundTrips: venerdì sera valido nel weekend', () => {
  const out = mk([fl('2026-12-11', 20, '19:00-20:50')]);
  const t = find(roundTrips(out, base().back, '2026-11-14', 'weekend'), '2026-12-12');
  assert.equal(t.total, 45);
});

test('roundTrips: ultimo cambio esaurito -> ignorata; senza ritorno tutto null', () => {
  const out = mk([['2026-12-12', [['2026-11-14', 'prezzo', 30], ['2026-11-15', 'esaurito', null]], '10:00-11:00']]);
  const t = find(roundTrips(out, base().back, '2026-11-14', 'weekend'), '2026-12-12');
  assert.deepEqual([t.out, t.back, t.total], [null, null, null]);
  const t2 = find(roundTrips(mk([fl('2026-12-12', 30)]), mk(), '2026-11-14', 'weekend'), '2026-12-12');
  assert.deepEqual([t2.out, t2.back, t2.total], [null, null, null]);
});

test('roundTrips: partenze prima di lastDay ignorate', () => {
  const out = mk([fl('2026-11-14', 30)]);
  const back = mk([fl('2026-11-15', 20)]);
  const t = roundTrips(out, back, '2026-11-15', 'weekend')[0];
  assert.equal(t.saturday, '2026-11-14');
  assert.equal(t.total, null);
  assert.equal(t.out, null);
});

test('roundTrips: parità di prezzo -> data più vicina, poi ryanair', () => {
  const out = mk([fl('2026-12-12', 30), fl('2026-12-11', 30, '19:00-20:00')], [fl('2026-12-11', 30, '19:00 20:00')]);
  const t = find(roundTrips(out, base().back, '2026-11-14', 'weekend'), '2026-12-12');
  assert.equal(t.out.date, '2026-12-11');
  assert.equal(t.out.airline, 'ryanair');
});

test('roundTrips: file del ritorno assente', () => {
  const trips = roundTrips(base().out, null, '2026-11-14', 'weekend');
  assert.equal(trips.length, 53);
  assert.ok(trips.every((t) => t.total === null && t.out === null && t.back === null));
});

test('cheapestTrip', () => {
  const trips = [
    { saturday: '2026-11-14', out: null, back: null, total: null },
    { saturday: '2026-11-21', out: {}, back: {}, total: 50 },
    { saturday: '2026-11-28', out: {}, back: {}, total: 40 },
    { saturday: '2026-12-05', out: {}, back: {}, total: 40 },
  ];
  assert.equal(cheapestTrip(trips).saturday, '2026-11-28');
  assert.equal(cheapestTrip([trips[0]]), null);
  assert.equal(cheapestTrip([]), null);
});
