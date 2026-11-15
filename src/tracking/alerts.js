// Avvisi delle tratte seguite: primo messaggio, poi ribassi di almeno DROP_EUR.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { sendTelegram } from '../telegram.js';
import { sendPush } from '../push.js';
import { WEBAPP_URL } from '../alerts.js';
import { describeTracking } from './spec.js';

export const DROP_EUR = 3;

/** @typedef {Record<string, {ref:number, alertedAt:string}>} AlertState */
/** @typedef {{id:number, tracking:object, best:object|null, names?:Record<string,string>}} TrackItem */

const cent = (n) => Math.round(n * 100);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const euro = (n) => `${n.toFixed(2).replace('.', ',').replace(',00', '')} €`;
const fmtDay = (iso) => DateTime.fromISO(iso).setLocale('it').toFormat('ccc d LLL');
const PAGINA = `${WEBAPP_URL}seguite.html`;
const NOMI = { ryanair: 'Ryanair', wizz: 'Wizz Air' };

/**
 * Decide chi avvisare. Il riferimento è il prezzo dell'ultimo avviso e non risale mai;
 * chi non ha prezzo (best null) conserva lo stato; le issue non più presenti vengono tolte.
 */
export function selectTrackingAlerts(items, state, now) {
  const nextState = {};
  const toSend = [];
  for (const it of items) {
    const key = String(it.id);
    const prev = state[key];
    if (prev) nextState[key] = prev;
    if (!it.best) continue;
    const price = it.best.price;
    if (!prev) {
      toSend.push({ item: it, kind: 'inizio', drop: 0 });
      nextState[key] = { ref: price, alertedAt: now.toUTC().toISO() };
    } else if (cent(price) <= cent(prev.ref) - cent(DROP_EUR)) {
      toSend.push({ item: it, kind: 'ribasso', drop: (cent(prev.ref) - cent(price)) / 100 });
      nextState[key] = { ref: price, alertedAt: now.toUTC().toISO() };
    }
  }
  return { toSend, nextState };
}

/** Link di prenotazione: uno se andata e ritorno sono della stessa compagnia, altrimenti uno per tratto. */
export function bookingLinks(combo, from, to, people) {
  const { out, back } = combo;
  const ryanair = (a, b, dateOut, dateIn) => `https://www.ryanair.com/it/it/trip/flights/select?adults=${people}&teens=0&children=0&infants=0&dateOut=${dateOut}&isReturn=${dateIn ? 'true' : 'false'}&originIata=${a}&destinationIata=${b}${dateIn ? `&dateIn=${dateIn}` : ''}`;
  const wizz = (a, b, dateOut, dateIn) => `https://wizzair.com/it-it/booking/select-flight/${a}/${b}/${dateOut}/${dateIn ?? 'null'}/${people}/0/0/null`;
  const url = { ryanair, wizz };
  if (!back) return [{ label: NOMI[out.airline], url: url[out.airline](from, to, out.date, null) }];
  if (out.airline === back.airline) return [{ label: NOMI[out.airline], url: url[out.airline](from, to, out.date, back.date) }];
  return [
    { label: `${NOMI[out.airline]} andata`, url: url[out.airline](from, to, out.date, null) },
    { label: `${NOMI[back.airline]} ritorno`, url: url[back.airline](to, from, back.date, null) },
  ];
}

/** Ora di partenza solo se sicura: Ryanair «HH:MM-HH:MM», Wizz solo con una sola partenza. */
function oraPartenza(day) {
  const t = day.time ?? '';
  if (day.airline === 'ryanair') return /^\d{2}:\d{2}-/.test(t) ? t.slice(0, 5) : '';
  const ore = t.match(/\d{2}:\d{2}/g) ?? [];
  return ore.length === 1 ? ore[0] : '';
}

const giorno = (etichetta, day) => [etichetta, fmtDay(day.date), oraPartenza(day)].filter(Boolean).join(' ');
const titolo = (it) => it.tracking.name || describeTracking(it.tracking, it.names ?? {});

export function formatTrackingTelegram({ item: it, kind, drop }) {
  const { tracking: t, best } = it;
  const persone = t.people ?? 1;
  const prezzo = `<b>${euro(best.price)}</b> a persona`;
  const testa = kind === 'ribasso'
    ? `📉 <b>${esc(titolo(it))}</b> — ${prezzo} (−${euro(drop)})`
    : `👀 Ora seguo <b>${esc(titolo(it))}</b> — ${prezzo}`;
  const rotta = describeTracking(t, it.names ?? {}).split(' · ')[0];
  const compagnie = [...new Set([best.out.airline, best.back?.airline].filter(Boolean))].map((a) => NOMI[a]).join(' + ');
  const tratti = [giorno('Andata', best.out), best.back && giorno('Ritorno', best.back), compagnie].filter(Boolean).join(' · ');
  const [prenota] = bookingLinks(best, t.from, t.to, persone);
  return [
    testa,
    persone > 1 ? `${esc(rotta)} · ${persone} persone · ${euro(best.price * persone)} in tutto` : esc(rotta),
    tratti,
    persone > 1 && 'Per un gruppo il prezzo può essere più alto, soprattutto vicino alla partenza.',
    `<a href="${esc(PAGINA)}">Apri</a> · <a href="${esc(prenota.url)}">Prenota</a>`,
  ].filter(Boolean).join('\n');
}

/** Notifica dell'app: il ribasso maggiore, altrimenti la prima voce. */
export function formatTrackingPush(entries) {
  const scelta = entries.filter((e) => e.kind === 'ribasso').sort((a, b) => b.drop - a.drop)[0] ?? entries[0];
  const { item: it, kind, drop } = scelta;
  const date = it.best.back ? `${fmtDay(it.best.out.date)} → ${fmtDay(it.best.back.date)}` : fmtDay(it.best.out.date);
  return {
    title: `${titolo(it)} a ${euro(it.best.price)}`,
    body: kind === 'ribasso' ? `−${euro(drop)} · ${date}` : `Ora la seguo · ${date}`,
    url: PAGINA,
  };
}

/**
 * Invia gli avvisi (un messaggio Telegram per giro, una notifica app) e salva lo stato.
 * Senza canali lo stato non si tocca; se nessun canale consegna, si ripristina il precedente.
 */
export async function sendTrackingAlerts(dataDir, items, env, now, { fetchImpl = fetch, pushImpl = sendPush, log = console.log } = {}) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, PUSH_SUBSCRIPTION: subscription, VAPID_PRIVATE_KEY: vapidKey } = env;
  const channels = [];
  if (token && chatId) channels.push(['Telegram', (e) => sendTelegram(e.map(formatTrackingTelegram).join('\n\n'), { token, chatId, fetchImpl })]);
  if (subscription && vapidKey) channels.push(['app', (e) => pushImpl(formatTrackingPush(e), { subscription, vapidKey })]);
  if (!channels.length) {
    log('avvisi tratte: nessun canale configurato (Telegram o notifica app), nessun invio');
    return 0;
  }
  const path = join(dataDir, 'alerts_state_tracking.json');
  const state = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
  const { toSend, nextState } = selectTrackingAlerts(items, state, now);
  let sent = 0;
  if (toSend.length) {
    let delivered = false;
    for (const [name, send] of channels) {
      try {
        await send(toSend);
        delivered = true;
      } catch (err) {
        log(`avvisi tratte: invio ${name} fallito: ${err.message}`);
      }
    }
    if (delivered) sent = toSend.length;
    else for (const { item: it } of toSend) { const k = String(it.id); if (state[k]) nextState[k] = state[k]; else delete nextState[k]; }
  }
  await writeFile(path, JSON.stringify(nextState, null, 1));
  log(`avvisi tratte: ${sent} inviati`);
  return sent;
}
