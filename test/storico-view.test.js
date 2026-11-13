import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELIABILITY_LABEL, statusLine, riseText, scale, priceDomain, curvePaths, stepPoints, upcomingDepartures, routeLabel } from '../web/storico-view.js';

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
