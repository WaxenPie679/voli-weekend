import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { neededDays, neededMonths, cheapestByDay, bestCombos, addSeriesPoint, isExpired } from '../src/tracking/combos.js';

const OGGI = '2026-11-15';
const T_LUGLIO = { from: 'BRI', to: 'DBV', roundTrip: true, mode: 'finestra', months: ['2027-07'], weekdays: [4, 5], nights: [5, 7], people: 1, name: '' };
const dp = (airline, date, price) => ({ airline, date, price, time: '' });
const mappa = (...righe) => new Map(righe.map((r) => [r.date, r]));

test('neededDays finestra luglio gio/ven 5–7 notti include i ritorni di agosto', () => {
  const d = neededDays(T_LUGLIO, OGGI);
  assert.equal(d.out[0], '2027-07-01');
  assert.ok(d.out.every((x) => [4, 5].includes(DateTime.fromISO(x).weekday)));
  assert.ok(d.back.includes('2027-08-06')); // ven 30 lug 2027 + 7 notti
  assert.deepEqual(neededMonths(d.back), ['2027-07', '2027-08']);
});

test('finestra dicembre→gennaio attraversa l’anno', () => {
  const t = { ...T_LUGLIO, months: ['2026-12'], weekdays: [4], nights: [3, 5] };
  const d = neededDays(t, OGGI);
  assert.ok(d.out.includes('2026-12-31')); // giovedì
  assert.ok(d.back.includes('2027-01-05')); // 31 dic + 5 notti
  assert.deepEqual(neededMonths(d.back), ['2026-12', '2027-01']);
});

test('neededDays salta le date già passate nel mese corrente', () => {
  const t = { ...T_LUGLIO, months: ['2026-11'], weekdays: [1, 2, 3, 4, 5, 6, 7], nights: [2, 2] };
  const d = neededDays(t, '2026-11-20');
  assert.equal(d.out[0], '2026-11-20');
  assert.ok(d.out.every((x) => x >= '2026-11-20'));
  assert.ok(d.back.every((x) => x >= '2026-11-20'));
  assert.equal(d.back[0], '2026-11-22');
});

test('neededDays date precise e solo andata', () => {
  const p = { from: 'BRI', to: 'DBV', roundTrip: true, mode: 'precise', out: '2027-03-05', back: '2027-03-09', people: 1, name: '' };
  assert.deepEqual(neededDays(p, OGGI), { out: ['2027-03-05'], back: ['2027-03-09'] });
  assert.deepEqual(neededDays({ ...p, roundTrip: false, back: undefined }, OGGI), { out: ['2027-03-05'], back: [] });
  const f = { ...T_LUGLIO, roundTrip: false, nights: undefined };
  assert.deepEqual(neededDays(f, OGGI).back, []);
});

test('neededMonths distinti e ordinati', () => {
  assert.deepEqual(neededMonths(['2027-08-02', '2027-07-30', '2027-08-09']), ['2027-07', '2027-08']);
});

test('cheapestByDay ignora esaurito/da_verificare e sceglie la compagnia più economica', () => {
  const o = (airline, date, state, price, time = '') => ({ airline, origin: 'BRI', dest: 'DBV', date, state, price, time });
  const obs = [
    o('ryanair', '2027-07-01', 'prezzo', 30, '06:00-07:00'),
    o('wizz', '2027-07-01', 'prezzo', 25, '07:00 09:00'),
    o('wizz', '2027-07-02', 'esaurito', null),
    o('ryanair', '2027-07-02', 'da_verificare', null),
    o('ryanair', '2027-07-03', 'prezzo', 40),
    { ...o('wizz', '2027-07-03', 'prezzo', 10), dest: 'ZAG' }, // altra rotta
  ];
  const m = cheapestByDay(obs, 'BRI', 'DBV');
  assert.deepEqual([...m.keys()].sort(), ['2027-07-01', '2027-07-03']);
  assert.deepEqual(m.get('2027-07-01'), { airline: 'wizz', date: '2027-07-01', price: 25, time: '07:00 09:00' });
  assert.equal(m.get('2027-07-03').price, 40);
});

test('bestCombos mescola compagnie e rispetta le notti', () => {
  const outMap = mappa(dp('ryanair', '2027-07-01', 20.99), dp('wizz', '2027-07-02', 30));
  const backMap = mappa(
    dp('wizz', '2027-07-07', 30.99), // 6 notti da 1 lug
    dp('wizz', '2027-07-04', 5), // 3 notti: fuori range
    dp('ryanair', '2027-07-09', 40), // 7 notti da 2 lug
  );
  const r = bestCombos(T_LUGLIO, outMap, backMap, OGGI);
  const [c] = r;
  assert.equal(c.price, 51.98);
  assert.equal(c.out.airline, 'ryanair');
  assert.equal(c.back.airline, 'wizz');
  assert.equal(c.nights, 6);
  assert.equal(r.length, 3); // coppie valide: 1→7, 2→7, 2→9
});

test('bestCombos ordina per prezzo poi andata, rispetta limit, ignora giorni fuori finestra', () => {
  const outMap = mappa(dp('ryanair', '2027-07-01', 10), dp('ryanair', '2027-07-02', 10), dp('ryanair', '2027-07-03', 1)); // 3 lug è sabato
  const backMap = mappa(dp('wizz', '2027-07-07', 10), dp('wizz', '2027-07-08', 10), dp('wizz', '2027-07-09', 10));
  const r = bestCombos(T_LUGLIO, outMap, backMap, OGGI, 2);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((c) => c.out.date), ['2027-07-01', '2027-07-01']);
  assert.ok(r.every((c) => c.price === 20));
  assert.ok(!bestCombos(T_LUGLIO, outMap, backMap, OGGI, 99).some((c) => c.out.date === '2027-07-03'));
});

test('bestCombos senza prezzi restituisce []', () => {
  assert.deepEqual(bestCombos(T_LUGLIO, new Map(), new Map(), OGGI), []);
  assert.deepEqual(bestCombos(T_LUGLIO, mappa(dp('wizz', '2027-07-01', 20)), new Map(), OGGI), []);
});

test('bestCombos date precise: una sola combinazione o nessuna', () => {
  const p = { from: 'BRI', to: 'DBV', roundTrip: true, mode: 'precise', out: '2027-03-05', back: '2027-03-09', people: 1, name: '' };
  const r = bestCombos(p, mappa(dp('wizz', '2027-03-05', 20.1), dp('wizz', '2027-03-06', 1)), mappa(dp('ryanair', '2027-03-09', 33.3), dp('ryanair', '2027-03-10', 1)), OGGI);
  assert.equal(r.length, 1);
  assert.equal(r[0].price, 53.4);
  assert.equal(r[0].nights, 4);
  assert.deepEqual(bestCombos(p, mappa(dp('wizz', '2027-03-05', 20)), new Map(), OGGI), []);
});

test('bestCombos solo andata: back e nights null', () => {
  const t = { ...T_LUGLIO, roundTrip: false, nights: undefined };
  const r = bestCombos(t, mappa(dp('wizz', '2027-07-02', 22), dp('wizz', '2027-07-01', 22), dp('wizz', '2027-07-03', 5)), new Map(), OGGI);
  assert.equal(r.length, 2);
  assert.equal(r[0].out.date, '2027-07-01');
  assert.equal(r[0].back, null);
  assert.equal(r[0].nights, null);
  assert.equal(r[0].price, 22);
});

test('addSeriesPoint tiene il minimo del giorno e aggiunge il giorno nuovo', () => {
  assert.deepEqual(addSeriesPoint([['2026-11-15', 60]], '2026-11-15', 55), [['2026-11-15', 55]]);
  assert.deepEqual(addSeriesPoint([['2026-11-15', 55]], '2026-11-15', 60), [['2026-11-15', 55]]);
  assert.deepEqual(addSeriesPoint([['2026-11-15', 55]], '2026-11-16', 58), [['2026-11-15', 55], ['2026-11-16', 58]]);
  assert.deepEqual(addSeriesPoint([], '2026-11-15', 58), [['2026-11-15', 58]]);
});

test('isExpired', () => {
  const p = { from: 'BRI', to: 'DBV', roundTrip: true, mode: 'precise', out: '2026-11-15', back: '2026-11-18', people: 1, name: '' };
  assert.equal(isExpired(p, '2026-11-15'), false);
  assert.equal(isExpired(p, '2026-11-16'), true);
  const f = { ...T_LUGLIO, months: ['2026-11'], weekdays: [1], nights: [1, 2] }; // lunedì di novembre 2026: ultimo 30
  assert.equal(isExpired(f, '2026-11-30'), false);
  assert.equal(isExpired(f, '2026-12-01'), true);
  assert.equal(isExpired(T_LUGLIO, OGGI), false);
});
