import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELIABILITY_LABEL, isReadyIndex, statusLine, riseText, scale, priceDomain, curvePaths, stepPoints, upcomingDepartures, routeLabel, weekRange, weekFlights, timeText, searchUrl } from '../web/storico-view.js';

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
