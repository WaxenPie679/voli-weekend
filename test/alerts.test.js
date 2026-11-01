import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { selectAlerts, formatAlert, sendTelegram, processAlerts } from '../src/alerts.js';

const NOW = DateTime.fromISO('2026-11-02T10:00:00Z');

const it = (price, extra = {}) => ({
  id: 'BRI|BUD|2026-11-06T19:00|2026-11-08T18:00|W1+W2', source: 'wizz', origin: 'BRI',
  destination: { code: 'BUD', city: 'Budapest', country: 'Ungheria' },
  outbound: { segments: [{ from: 'BRI', to: 'BUD', dep: '2026-11-06T19:00', arr: '2026-11-06T20:40', flight: 'W1', airline: 'Wizz Air' }], selfTransfer: false },
  inbound: { segments: [{ from: 'BUD', to: 'BRI', dep: '2026-11-08T18:00', arr: '2026-11-08T19:40', flight: 'W2', airline: 'Wizz Air' }], selfTransfer: false },
  price, currency: 'EUR', bookingUrl: 'https://wizzair.com/x', weekend: '2026-11-06', seenAt: '', ...extra,
});

test('sequenza: nuovo, uguale, sceso, risalito, risceso, soglia esatta', () => {
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
  assert.equal(state[it(75).id].price, 75);
  assert.equal(step(72), 1, 'risceso a 72 → inviato');
  assert.equal(selectAlerts([it(80, { id: 'altro' })], {}, { now: NOW }).toSend.length, 0, '80 esatti → no');
});

test('le voci di weekend passati vengono rimosse dallo stato', () => {
  const { nextState } = selectAlerts([], { vecchio: { price: 50, alertedAt: '', weekend: '2026-10-30' }, attuale: { price: 50, alertedAt: '', weekend: '2026-11-06' } }, { now: NOW });
  assert.deepEqual(Object.keys(nextState), ['attuale']);
});

test('formatAlert con scalo mostra "1 scalo" e l\'aeroporto di scalo', () => {
  const x = it(75, {
    outbound: { segments: [
      { from: 'BRI', to: 'FCO', dep: '2026-11-06T19:00', arr: null, flight: 'a', airline: 'ITA' },
      { from: 'FCO', to: 'BUD', dep: null, arr: '2026-11-06T23:00', flight: 'b', airline: 'ITA' },
    ], selfTransfer: false, layovers: [100] },
  });
  const msg = formatAlert(x);
  assert.match(msg, /1 scalo/);
  assert.match(msg, /FCO/);
  assert.match(msg, /1h40/);
  assert.match(msg, /Budapest/);
  assert.match(msg, /75 €/);
  assert.match(msg, /href="https:\/\/wizzair\.com\/x"/);
});

test('formatAlert diretto e con caratteri HTML nel nome città', () => {
  const msg = formatAlert(it(60, { destination: { code: 'XXX', city: 'A<B', country: 'C&D' } }));
  assert.match(msg, /diretto/);
  assert.match(msg, /A&lt;B/);
  assert.match(msg, /C&amp;D/);
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

test('processAlerts: invio fallito non registra l\'itinerario, invio riuscito sì', async () => {
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  const env = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1' };
  const fail = async () => new Response('', { status: 500 });
  assert.equal(await processAlerts(dir, [it(50)], env, NOW, { fetchImpl: fail, log: () => {} }), 0);
  assert.deepEqual(JSON.parse(await readFile(join(dir, 'alerts_state.json'), 'utf8')), {});
  const ok = async () => new Response('{"ok":true}');
  assert.equal(await processAlerts(dir, [it(50)], env, NOW, { fetchImpl: ok, log: () => {} }), 1);
  assert.equal(JSON.parse(await readFile(join(dir, 'alerts_state.json'), 'utf8'))[it(50).id].price, 50);
});

test('processAlerts: tanti voli nuovi → un solo messaggio riepilogativo con gli 8 migliori, sotto i 4096 caratteri', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  const many = Array.from({ length: 25 }, (_, n) => it(40 + n, {
    id: `id${n}`, destination: { code: `D${String(n).padStart(2, '0')}`, city: `Città${n}`, country: 'X' },
  }));
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push(JSON.parse(init.body).text); return new Response('{"ok":true}'); };
  const env = { TELEGRAM_BOT_TOKEN: 'T', TELEGRAM_CHAT_ID: '1' };
  assert.equal(await processAlerts(dir, many, env, NOW, { fetchImpl, log: () => {} }), 25);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Città0\b/);
  assert.match(sent[0], /Città7\b/);
  assert.doesNotMatch(sent[0], /Città8\b/);
  assert.ok(sent[0].length < 4096);
  assert.match(sent[0], /altri 17/);
});

test('selectAlerts: stessa destinazione e weekend da più itinerari → una sola voce, la più economica', () => {
  const a = it(70, { id: 'a' });
  const b = it(60, { id: 'b' });
  const { toSend } = selectAlerts([a, b], {}, { now: NOW });
  assert.deepEqual(toSend.map((x) => x.id), ['b']);
});
