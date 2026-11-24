import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekendSaturdays, weekendDays, fridayEvening, bestTrip } from '../web/weekend-trips.js';

test('fridayEvening: Wizz vale solo se tutte le partenze del giorno sono serali', () => {
  assert.equal(fridayEvening('wizz', '06:10 19:20'), false);
  assert.equal(fridayEvening('wizz', '18:05 21:30'), true);
  assert.equal(fridayEvening('ryanair', '18:00-20:10'), true);
  assert.equal(fridayEvening('ryanair', '17:59-19:40'), false);
  assert.equal(fridayEvening('wizz', ''), false);
});

test('weekendSaturdays e weekendDays come nella pagina dello storico', () => {
  assert.equal(weekendSaturdays('2026-11-25').length, 53);
  assert.equal(weekendSaturdays('2026-11-25')[0], '2026-11-28');
  assert.deepEqual(weekendDays('2027-04-03', 'lungo'), { out: ['2027-04-01', '2027-04-02', '2027-04-03'], back: ['2027-04-04', '2027-04-05'] });
});

const leg = (date, price, airline = 'ryanair', time = '10:00-12:00', extra = {}) => ({ date, airline, time, price, ...extra });
const byDate = (...legs) => {
  const m = new Map();
  for (const l of legs) { if (!m.has(l.date)) m.set(l.date, []); m.get(l.date).push(l); }
  return m;
};

test('bestTrip: nel lungo sceglie il giovedì a 20 € invece del sabato a 30 €', () => {
  const out = byDate(leg('2027-04-01', 20), leg('2027-04-03', 30));
  const back = byDate(leg('2027-04-04', 15));
  const t = bestTrip(out, back, '2027-04-03', 'lungo');
  assert.equal(t.out.date, '2027-04-01');
  assert.equal(t.total, 35);
});

test('bestTrip: nel weekend ignora il giovedì', () => {
  const out = byDate(leg('2027-04-01', 20), leg('2027-04-03', 30));
  const back = byDate(leg('2027-04-04', 15));
  const t = bestTrip(out, back, '2027-04-03', 'weekend');
  assert.equal(t.out.date, '2027-04-03');
  assert.equal(t.total, 45);
});

test('bestTrip: parità di prezzo → data più vicina, poi Ryanair; i campi extra restano', () => {
  const out = byDate(leg('2027-04-03', 30, 'wizz', '09:00'), leg('2027-04-03', 30, 'ryanair', '09:00-11:00', { seenOn: '2026-11-25' }), leg('2027-04-02', 30, 'wizz', '19:00'));
  const back = byDate(leg('2027-04-04', 10));
  const t = bestTrip(out, back, '2027-04-03', 'weekend');
  assert.equal(t.out.date, '2027-04-02');
  const t2 = bestTrip(byDate(leg('2027-04-03', 30, 'wizz', '09:00'), leg('2027-04-03', 30, 'ryanair', '09:00-11:00', { seenOn: '2026-11-25' })), back, '2027-04-03', 'weekend');
  assert.equal(t2.out.airline, 'ryanair');
  assert.equal(t2.out.seenOn, '2026-11-25');
});

test('bestTrip: senza ritorno → tutto null', () => {
  assert.deepEqual(bestTrip(byDate(leg('2027-04-03', 30)), new Map(), '2027-04-03', 'weekend'), { saturday: '2027-04-03', out: null, back: null, total: null });
});
