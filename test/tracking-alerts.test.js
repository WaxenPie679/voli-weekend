import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WEBAPP_URL } from '../src/alerts.js';
import {
  DROP_EUR, selectTrackingAlerts, formatTrackingPush, bookingLinks, sendTrackingAlerts,
} from '../src/tracking/alerts.js';

const NOW = DateTime.fromISO('2026-11-15T10:00:00Z');

const combo = (price, extra = {}) => ({
  out: { airline: 'ryanair', date: '2026-07-08', price: price / 2, time: '06:25-08:00' },
  back: { airline: 'ryanair', date: '2026-07-15', price: price / 2, time: '21:10-22:40' },
  price, nights: 7, ...extra,
});
const tracking = (extra = {}) => ({
  name: 'Dubrovnik con gli amici', from: 'BRI', to: 'DBV', roundTrip: true, mode: 'precise',
  out: '2026-07-08', back: '2026-07-15', people: 6, ...extra,
});
const item = (id, price, extra = {}) => ({ id, tracking: tracking(), names: { DBV: 'Dubrovnik' }, best: price == null ? null : combo(price), ...extra });

test('primo giro con prezzo → inizio, riferimento = prezzo', () => {
  const r = selectTrackingAlerts([item(7, 56)], {}, NOW);
  assert.equal(DROP_EUR, 3);
  assert.equal(r.toSend.length, 1);
  assert.equal(r.toSend[0].kind, 'inizio');
  assert.equal(r.toSend[0].drop, 0);
  assert.equal(r.nextState['7'].ref, 56);
  assert.equal(r.nextState['7'].alertedAt, NOW.toUTC().toISO());
});

test('ribasso di 3 € esatti avvisa, di 2,99 no', () => {
  const state = { 7: { ref: 59.1, alertedAt: 'x' } };
  const si = selectTrackingAlerts([item(7, 56.1)], state, NOW);
  assert.equal(si.toSend.length, 1);
  assert.equal(si.toSend[0].kind, 'ribasso');
  assert.equal(si.toSend[0].drop, 3);
  assert.equal(si.nextState['7'].ref, 56.1);
  const no = selectTrackingAlerts([item(7, 56.11)], state, NOW);
  assert.equal(no.toSend.length, 0);
  assert.deepEqual(no.nextState['7'], state['7']);
});

test('il riferimento non risale quando il prezzo sale', () => {
  let state = { 7: { ref: 60, alertedAt: 'x' } };
  const r1 = selectTrackingAlerts([item(7, 70)], state, NOW);
  assert.equal(r1.toSend.length, 0);
  assert.equal(r1.nextState['7'].ref, 60);
  const r2 = selectTrackingAlerts([item(7, 57)], r1.nextState, NOW);
  assert.equal(r2.toSend[0].drop, 3);
  assert.equal(r2.nextState['7'].ref, 57);
});

test('best null → nessun avviso, stato invariato', () => {
  const state = { 7: { ref: 60, alertedAt: 'x' } };
  const r = selectTrackingAlerts([item(7, null), item(8, null)], state, NOW);
  assert.deepEqual(r.toSend, []);
  assert.deepEqual(r.nextState, state);
});

test('issue chiusa → chiave tolta dallo stato', () => {
  const state = { 7: { ref: 60, alertedAt: 'x' }, 9: { ref: 40, alertedAt: 'y' } };
  const r = selectTrackingAlerts([item(7, 60)], state, NOW);
  assert.deepEqual(Object.keys(r.nextState), ['7']);
});

test('bookingLinks: stessa compagnia un link, compagnie diverse due, adults=6', () => {
  const ry = bookingLinks(combo(56), 'BRI', 'DBV', 6);
  assert.equal(ry.length, 1);
  assert.equal(ry[0].url, 'https://www.ryanair.com/it/it/trip/flights/select?adults=6&teens=0&children=0&infants=0&dateOut=2026-07-08&isReturn=true&originIata=BRI&destinationIata=DBV&dateIn=2026-07-15');
  const wz = combo(56, { out: { airline: 'wizz', date: '2026-07-08', price: 20, time: '' }, back: { airline: 'wizz', date: '2026-07-15', price: 36, time: '' } });
  const wl = bookingLinks(wz, 'BRI', 'DBV', 6);
  assert.equal(wl.length, 1);
  assert.equal(wl[0].url, 'https://wizzair.com/it-it/booking/select-flight/BRI/DBV/2026-07-08/2026-07-15/6/0/0/null');
  const mix = combo(56, { back: { airline: 'wizz', date: '2026-07-15', price: 30, time: '' } });
  const ml = bookingLinks(mix, 'BRI', 'DBV', 6);
  assert.equal(ml.length, 2);
  assert.match(ml[0].url, /ryanair\.com.*adults=6.*dateOut=2026-07-08&isReturn=false&originIata=BRI&destinationIata=DBV$/);
  assert.equal(ml[1].url, 'https://wizzair.com/it-it/booking/select-flight/DBV/BRI/2026-07-15/null/6/0/0/null');
  const solo = bookingLinks(combo(30, { back: null }), 'BRI', 'DBV', 1);
  assert.match(solo[0].url, /isReturn=false/);
  assert.doesNotMatch(solo[0].url, /dateIn/);
});

test('formatTrackingPush: il ribasso maggiore, altrimenti il primo', () => {
  const a = { item: item(1, 56), kind: 'inizio', drop: 0 };
  const b = { item: item(2, 40, { tracking: tracking({ name: 'Praga' }) }), kind: 'ribasso', drop: 5 };
  const c = { item: item(3, 30, { tracking: tracking({ name: 'Riga' }) }), kind: 'ribasso', drop: 9 };
  const p = formatTrackingPush([a, b, c]);
  assert.equal(p.title, 'Riga a 30 €');
  assert.match(p.body, /−9 €/);
  assert.match(p.body, /mer 8 lug/);
  assert.equal(p.url, `${WEBAPP_URL}seguite.html`);
  const q = formatTrackingPush([a]);
  assert.equal(q.title, 'Dubrovnik con gli amici a 56 €');
  assert.doesNotMatch(q.body, /−/);
});

async function setup(state) {
  const dir = await mkdtemp(join(tmpdir(), 'trk-'));
  if (state) await writeFile(join(dir, 'alerts_state_tracking.json'), JSON.stringify(state));
  return dir;
}
const ENV = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c', PUSH_SUBSCRIPTION: '{}', VAPID_PRIVATE_KEY: 'k' };
const quiet = () => {};

test('sendTrackingAlerts: tutti i canali falliti → stato non avanza', async () => {
  const old = { 7: { ref: 70, alertedAt: 'x' } };
  const dir = await setup(old);
  const pushImpl = async () => { throw new Error('410'); };
  const n = await sendTrackingAlerts(dir, [item(7, 60), item(8, 50)], ENV, NOW, { pushImpl, log: quiet });
  assert.equal(n, 0);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'alerts_state_tracking.json'), 'utf8')), old);
});

test('sendTrackingAlerts: nessun canale → stato non toccato', async () => {
  const dir = await setup(null);
  let chiamate = 0;
  const n = await sendTrackingAlerts(dir, [item(7, 60)], {}, NOW, { fetchImpl: async () => { chiamate++; }, log: quiet });
  assert.equal(n, 0);
  assert.equal(chiamate, 0);
  await assert.rejects(readFile(join(dir, 'alerts_state_tracking.json'), 'utf8'));
});

test('sendTrackingAlerts: consegna → una notifica nell\'app, nessun Telegram, stato avanzato', async () => {
  const dir = await setup({ 9: { ref: 1, alertedAt: 'x' } });
  const urls = [];
  const fetchImpl = async (u) => { urls.push(u); return { ok: true, status: 200 }; };
  const pushes = [];
  const n = await sendTrackingAlerts(dir, [item(7, 60), item(8, 50)], ENV, NOW, { fetchImpl, pushImpl: async (p) => { pushes.push(p); }, log: quiet });
  assert.equal(n, 2);
  assert.deepEqual(urls, []);
  assert.equal(pushes.length, 1);
  const st = JSON.parse(await readFile(join(dir, 'alerts_state_tracking.json'), 'utf8'));
  assert.deepEqual(Object.keys(st).sort(), ['7', '8']);
  assert.equal(st['8'].ref, 50);
});

test('sendTrackingAlerts: con solo Telegram configurato non invia niente', async () => {
  const dir = await setup(null);
  const urls = [];
  const n = await sendTrackingAlerts(dir, [item(7, 60)], { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' }, NOW, { fetchImpl: async (u) => { urls.push(u); return { ok: true }; }, log: quiet });
  assert.equal(n, 0);
  assert.deepEqual(urls, []);
});
