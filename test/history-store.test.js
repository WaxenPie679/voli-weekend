import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync, gzipSync } from 'node:zlib';
import { encodeCsv, decodeCsv, replayState, diffState } from '../src/history/store.js';

const o = (date, state, price = null, dest = 'TRN', time = '') => ({ airline: 'ryanair', origin: 'BDS', dest, date, state, price, time });
const cov = (from, to, dest = 'TRN') => ({ airline: 'ryanair', origin: 'BDS', dest, from, to });

test('encodeCsv/decodeCsv: andata e ritorno identici, intestazione esatta', () => {
  const rows = [o('2026-12-01', 'prezzo', 35.51), o('2026-12-02', 'esaurito')];
  const buf = encodeCsv(rows);
  assert.equal(gunzipSync(buf).toString().split('\n')[0], 'compagnia,origine,destinazione,data_partenza,stato,prezzo,orario');
  assert.deepEqual(decodeCsv(buf), rows);
});

test('encodeCsv/decodeCsv: nessuna riga → solo intestazione, ritorna []', () => {
  assert.deepEqual(decodeCsv(encodeCsv([])), []);
});

test('replayState: vince l’ultima riga per chiave', () => {
  const s = replayState([o('2026-12-01', 'prezzo', 30), o('2026-12-01', 'prezzo', 40)]);
  assert.equal(s.get('ryanair|BDS|TRN|2026-12-01').price, 40);
});

test('diffState: scrive solo nuovi e cambiati', () => {
  const state = replayState([o('2026-12-01', 'prezzo', 30), o('2026-12-02', 'prezzo', 30)]);
  const rows = diffState(state, [o('2026-12-01', 'prezzo', 30), o('2026-12-02', 'prezzo', 45), o('2026-12-03', 'esaurito')], [cov('2026-12-01', '2026-12-31')], '2026-11-12');
  assert.deepEqual(rows.map((r) => [r.date, r.state, r.price]), [['2026-12-02', 'prezzo', 45], ['2026-12-03', 'esaurito', null]]);
});

test('diffState: data sparita in un intervallo coperto → nessun_volo; fuori copertura → niente', () => {
  const state = replayState([o('2026-12-05', 'prezzo', 30), o('2027-01-05', 'prezzo', 30)]);
  const rows = diffState(state, [], [cov('2026-12-01', '2026-12-31')], '2026-11-12');
  assert.deepEqual(rows.map((r) => [r.date, r.state, r.price]), [['2026-12-05', 'nessun_volo', null]]);
});

test('diffState: già nessun_volo non si riscrive; date passate ignorate', () => {
  const state = replayState([o('2026-12-05', 'nessun_volo'), o('2026-11-10', 'prezzo', 30)]);
  assert.deepEqual(diffState(state, [], [cov('2026-11-01', '2026-12-31')], '2026-11-12'), []);
});

test('diffState: una tratta non osservata oggi non genera righe', () => {
  const state = replayState([o('2026-12-05', 'prezzo', 30, 'MXP')]);
  assert.deepEqual(diffState(state, [], [cov('2026-12-01', '2026-12-31', 'TRN')], '2026-11-12'), []);
});

test('encodeCsv/decodeCsv: l’orario fa il giro completo (Ryanair e Wizz)', () => {
  const rows = [o('2026-12-01', 'prezzo', 35.51, 'TRN', '10:05-11:55'), { ...o('2026-12-02', 'prezzo', 20, 'BUD', '15:20 21:40'), airline: 'wizz' }];
  assert.deepEqual(decodeCsv(encodeCsv(rows)), rows);
});

test('decodeCsv: file vecchio a 6 colonne → orario vuoto', () => {
  const old = gzipSync('compagnia,origine,destinazione,data_partenza,stato,prezzo\nryanair,BDS,TRN,2026-12-01,prezzo,30\nryanair,BDS,TRN,2026-12-02,esaurito,\n');
  assert.deepEqual(decodeCsv(old), [o('2026-12-01', 'prezzo', 30), o('2026-12-02', 'esaurito')]);
});

test('diffState: solo l’orario cambiato è un cambiamento', () => {
  const state = replayState([o('2026-12-01', 'prezzo', 30, 'TRN', '10:05-11:55')]);
  const cv = [cov('2026-12-01', '2026-12-31')];
  assert.deepEqual(diffState(state, [o('2026-12-01', 'prezzo', 30, 'TRN', '10:05-11:55')], cv, '2026-11-12'), []);
  assert.deepEqual(diffState(state, [o('2026-12-01', 'prezzo', 30, 'TRN', '06:00-07:45')], cv, '2026-11-12').map((r) => r.time), ['06:00-07:45']);
});
