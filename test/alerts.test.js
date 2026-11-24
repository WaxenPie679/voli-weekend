import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { selectAlerts, processAlerts, formatPush, WEBAPP_URL } from '../src/alerts.js';
import { sendTelegram } from '../src/telegram.js';

const NOW = DateTime.fromISO('2026-11-02T10:00:00Z');

const it = (price, extra = {}) => ({
  id: 'BRI|BUD|2026-11-06T19:00|2026-11-08T18:00|W1+W2', source: 'wizz', origin: 'BRI',
  destination: { code: 'BUD', city: 'Budapest', country: 'Ungheria' },
  outbound: { segments: [{ from: 'BRI', to: 'BUD', dep: '2026-11-06T19:00', arr: '2026-11-06T20:40', flight: 'W1', airline: 'Wizz Air' }], selfTransfer: false },
  inbound: { segments: [{ from: 'BUD', to: 'BRI', dep: '2026-11-08T18:00', arr: '2026-11-08T19:40', flight: 'W2', airline: 'Wizz Air' }], selfTransfer: false },
  price, currency: 'EUR', bookingUrl: 'https://wizzair.com/x', weekend: '2026-11-06', seenAt: '', ...extra,
});

const GROUP = 'BRI|BUD|2026-11-06';

test('sequenza: si avvisa solo sotto il prezzo dell\'ultimo avviso, che non risale mai', () => {
  let state = {};
  const step = (price) => {
    const r = selectAlerts([it(price)], state, { now: NOW });
    state = r.nextState;
    return r.toSend.length;
  };
  assert.equal(step(79), 1, 'nuovo a 79 → inviato');
  assert.equal(step(79), 0, 'stesso prezzo → no');
  assert.equal(step(70), 1, 'sceso a 70 → inviato');
  assert.equal(step(75), 0, 'risalito a 75 → no');
  assert.equal(state[GROUP].price, 70, 'il riferimento resta l\'ultimo avviso');
  assert.equal(step(72), 0, 'risceso a 72, ma sopra 70 → no');
  assert.equal(step(69), 1, 'sotto l\'ultimo avviso → inviato');
  assert.equal(selectAlerts([it(80, { id: 'altro' })], {}, { now: NOW }).toSend.length, 0, '80 esatti → no');
});

test('stessa destinazione e weekend: un altro itinerario più caro dell\'ultimo avviso non riavvisa', () => {
  const a = selectAlerts([it(60, { id: 'A' })], {}, { now: NOW });
  const b = selectAlerts([it(65, { id: 'A' }), it(62, { id: 'B' })], a.nextState, { now: NOW });
  assert.equal(b.toSend.length, 0);
});

test('le voci di weekend passati vengono rimosse dallo stato', () => {
  const { nextState } = selectAlerts([], { vecchio: { price: 50, alertedAt: '', weekend: '2026-10-30' }, attuale: { price: 50, alertedAt: '', weekend: '2026-11-06' } }, { now: NOW });
  assert.deepEqual(Object.keys(nextState), ['attuale']);
});

test('sendTelegram chiama sendMessage con chat e testo', async () => {
  let call;
  const fetchImpl = async (url, init) => { call = { url, body: JSON.parse(init.body) }; return new Response('{"ok":true}'); };
  await sendTelegram('ciao', { token: 'T', chatId: '42', fetchImpl });
  assert.equal(call.url, 'https://api.telegram.org/botT/sendMessage');
  assert.equal(call.body.chat_id, '42');
  assert.equal(call.body.text, 'ciao');
  assert.equal(call.body.parse_mode, 'HTML');
});

test('sendTelegram lancia errore se Telegram risponde con errore', async () => {
  const fetchImpl = async () => new Response('{"ok":false}', { status: 401 });
  await assert.rejects(sendTelegram('x', { token: 'T', chatId: '1', fetchImpl }));
});

test('processAlerts: senza credenziali non invia e non crea lo stato', async () => {
  const { mkdtemp, readdir } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  assert.equal(await processAlerts(dir, [it(50)], {}, NOW, { log: () => {} }), 0);
  assert.deepEqual(await readdir(dir), []);
});

test('selectAlerts: stessa destinazione e weekend da più itinerari → una sola voce, la più economica', () => {
  const a = it(70, { id: 'a' });
  const b = it(60, { id: 'b' });
  const { toSend } = selectAlerts([a, b], {}, { now: NOW });
  assert.deepEqual(toSend.map((x) => x.id), ['b']);
});

test('formatPush: un volo → titolo con città e prezzo; più voli → conteggio e il migliore', () => {
  const one = formatPush([it(46)]);
  assert.equal(one.title, 'Budapest a 46 €');
  assert.match(one.body, /^Weekend del ven 6 nov/);
  assert.match(one.body, /da Bari/);
  assert.equal(one.url, WEBAPP_URL);
  const many = formatPush([it(70, { id: 'x' }), it(46.5, { id: 'y', destination: { code: 'TIA', city: 'Tirana', country: 'Albania' } })]);
  assert.equal(many.title, '2 nuovi voli sotto 80 €');
  assert.match(many.body, /^Il migliore: Tirana a 46,50 €/);
});

test('processAlerts: con solo la notifica push configurata invia e registra lo stato', async () => {
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  const sent = [];
  const pushImpl = async (payload) => { sent.push(payload); };
  const env = { PUSH_SUBSCRIPTION: '{"endpoint":"https://push.test/x","keys":{}}', VAPID_PRIVATE_KEY: 'k' };
  assert.equal(await processAlerts(dir, [it(50)], env, NOW, { pushImpl, stateFile: 's.json', log: () => {} }), 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, 'Budapest a 50 €');
  assert.ok(JSON.parse(await readFile(join(dir, 's.json'), 'utf8'))['BRI|BUD|2026-11-06']);
});

test('processAlerts: con Telegram e push configurati scrive solo nella notifica dell\'app', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  const env = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1', PUSH_SUBSCRIPTION: '{}', VAPID_PRIVATE_KEY: 'k' };
  const urls = [];
  const pushes = [];
  const fetchImpl = async (url) => { urls.push(url); return new Response('{"ok":true}'); };
  assert.equal(await processAlerts(dir, [it(50)], env, NOW, { fetchImpl, pushImpl: async (p) => { pushes.push(p); }, stateFile: 's.json', log: () => {} }), 1);
  assert.deepEqual(urls, []);
  assert.equal(pushes.length, 1);
});

test('processAlerts: con solo Telegram configurato non invia niente e non crea lo stato', async () => {
  const { mkdtemp, readdir } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  const urls = [];
  const env = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1' };
  assert.equal(await processAlerts(dir, [it(50)], env, NOW, { fetchImpl: async (url) => { urls.push(url); return new Response('{"ok":true}'); }, log: () => {} }), 0);
  assert.deepEqual(urls, []);
  assert.deepEqual(await readdir(dir), []);
});

test('processAlerts: push fallita → avviso non registrato', async () => {
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  const env = { PUSH_SUBSCRIPTION: '{}', VAPID_PRIVATE_KEY: 'k' };
  await processAlerts(dir, [it(50)], env, NOW, { pushImpl: async () => { throw new Error('410'); }, stateFile: 's.json', log: () => {} });
  assert.deepEqual(JSON.parse(await readFile(join(dir, 's.json'), 'utf8')), {});
});
