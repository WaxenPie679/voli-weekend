import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { CONSTRAINTS, layoverMinutes } from './filter.js';
import { ZONE } from './weekends.js';
import { sendTelegram } from './telegram.js';
import { sendPush } from './push.js';

export { sendTelegram };

export const alertGroup = (it) => `${it.origin}|${it.destination.code}|${it.weekend}`;

/**
 * Una voce per aeroporto + destinazione + weekend (la più economica). Si avvisa se il gruppo è nuovo
 * o se il prezzo scende sotto quello dell'ultimo avviso; il riferimento non risale mai.
 */
export function selectAlerts(itineraries, state, { threshold = CONSTRAINTS.alertThreshold, now }) {
  const today = now.setZone(ZONE).toISODate();
  const nextState = {};
  for (const [key, entry] of Object.entries(state)) {
    const sunday = DateTime.fromISO(entry.weekend).plus({ days: 2 }).toISODate();
    if (sunday >= today) nextState[key] = entry;
  }
  const toSend = [];
  const groups = new Set();
  for (const it of [...itineraries].sort((a, b) => a.price - b.price)) {
    if (!(it.price < threshold)) continue;
    const group = alertGroup(it);
    if (groups.has(group)) continue;
    groups.add(group);
    const prev = nextState[group];
    if (!prev || it.price < prev.price) {
      toSend.push(it);
      nextState[group] = { price: it.price, alertedAt: now.toUTC().toISO(), weekend: it.weekend };
    }
  }
  return { toSend, nextState };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDay = (iso) => DateTime.fromISO(iso).setLocale('it').toFormat('ccc d LLL');
const fmtDur = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

function legLine(name, leg) {
  const first = leg.segments[0];
  const last = leg.segments.at(-1);
  const hubs = leg.segments.slice(0, -1).map((s) => s.to);
  const stops = hubs.length === 0
    ? 'diretto'
    : `1 scalo (via ${hubs.map(esc).join(', ')}, ${layoverMinutes(leg).map(fmtDur).join(', ')})`;
  return `${name} ${fmtDay(first.dep)} ${first.dep.slice(11)} → ${last.arr.slice(11)} · ${esc(first.airline)} · ${stops}`;
}

export function formatAlert(it) {
  const origin = it.origin === 'BRI' ? 'Bari' : 'Brindisi';
  return [
    `✈️ <b>${esc(it.destination.city)}</b> (${esc(it.destination.country)}) — <b>${it.price.toFixed(2).replace('.', ',').replace(',00', '')} €</b> A/R`,
    `Da ${origin} · weekend del ${fmtDay(it.weekend)}`,
    legLine('Andata', it.outbound),
    legLine('Ritorno', it.inbound),
    `<a href="${esc(it.bookingUrl)}">Vedi e prenota</a>`,
  ].join('\n');
}

export const WEBAPP_URL = 'https://waxenpie679.github.io/voli-weekend/';
const DIGEST_MAX = 8;

/** Un solo messaggio per giro: i migliori DIGEST_MAX, poi il conteggio degli altri. */
export function formatDigest(items, threshold = CONSTRAINTS.alertThreshold) {
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const head = sorted.length === 1 ? '🔔 Nuovo volo' : `🔔 ${sorted.length} nuovi voli`;
  const parts = [`<b>${head} sotto ${threshold} €</b>`, ...sorted.slice(0, DIGEST_MAX).map(formatAlert)];
  const rest = sorted.length - DIGEST_MAX;
  if (rest > 0) parts.push(`…e altri ${rest} nella <a href="${WEBAPP_URL}">webapp</a>`);
  return parts.join('\n\n');
}

const euro = (n) => `${n.toFixed(2).replace('.', ',').replace(',00', '')} €`;
const origin = (it) => (it.origin === 'BRI' ? 'Bari' : 'Brindisi');

/** Notifica dell'app: iOS ne mostra titolo e una riga, quindi solo il volo migliore. */
export function formatPush(items, threshold = CONSTRAINTS.alertThreshold) {
  const [best] = [...items].sort((a, b) => a.price - b.price);
  const line = `weekend del ${fmtDay(best.weekend)} · da ${origin(best)}`;
  return items.length === 1
    ? { title: `${best.destination.city} a ${euro(best.price)}`, body: `${line[0].toUpperCase()}${line.slice(1)}`, url: WEBAPP_URL }
    : { title: `${items.length} nuovi voli sotto ${threshold} €`, body: `Il migliore: ${best.destination.city} a ${euro(best.price)}, ${line}`, url: WEBAPP_URL };
}

/**
 * Legge lo stato, invia gli avvisi (Telegram e/o notifica dell'app) e salva lo stato in `<dataDir>/<stateFile>`.
 * Ogni ricerca ha il suo file di stato: i due workflow pubblicano in momenti diversi e non devono sovrascriversi.
 * Un avviso conta come inviato se almeno un canale lo consegna.
 */
export async function processAlerts(dataDir, itineraries, env, now, { fetchImpl = fetch, pushImpl = sendPush, log = console.log, stateFile = 'alerts_state.json' } = {}) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, PUSH_SUBSCRIPTION: subscription, VAPID_PRIVATE_KEY: vapidKey } = env;
  const channels = [];
  if (token && chatId) channels.push(['Telegram', (items) => sendTelegram(formatDigest(items), { token, chatId, fetchImpl })]);
  if (subscription && vapidKey) channels.push(['app', (items) => pushImpl(formatPush(items), { subscription, vapidKey })]);
  if (!channels.length) {
    // Senza canali configurati non si tocca lo stato: gli avvisi partiranno quando ce ne sarà uno
    log('avvisi: nessun canale configurato (Telegram o notifica app), nessun invio');
    return 0;
  }
  const path = join(dataDir, stateFile);
  const state = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
  const { toSend, nextState } = selectAlerts(itineraries, state, { now });
  let sent = 0;
  if (toSend.length) {
    let delivered = false;
    for (const [name, send] of channels) {
      try {
        await send(toSend);
        delivered = true;
      } catch (err) {
        log(`avvisi: invio ${name} fallito: ${err.message}`);
      }
    }
    if (delivered) sent = toSend.length;
    // Nessun canale riuscito: si ripristina lo stato precedente così si riprova al prossimo giro
    else for (const it of toSend) { const g = alertGroup(it); if (state[g]) nextState[g] = state[g]; else delete nextState[g]; }
  }
  await writeFile(path, JSON.stringify(nextState, null, 1));
  log(`avvisi: ${sent} inviati`);
  return sent;
}
