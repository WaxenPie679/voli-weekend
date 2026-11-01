import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { CONSTRAINTS, layoverMinutes } from './filter.js';
import { ZONE } from './weekends.js';
import { sendTelegram } from './telegram.js';

export { sendTelegram };

/** Avvisa solo per itinerari nuovi sotto soglia o scesi di prezzo rispetto all'ultimo stato. */
export function selectAlerts(itineraries, state, { threshold = CONSTRAINTS.alertThreshold, now }) {
  const today = now.setZone(ZONE).toISODate();
  const nextState = {};
  for (const [id, entry] of Object.entries(state)) {
    const sunday = DateTime.fromISO(entry.weekend).plus({ days: 2 }).toISODate();
    if (sunday >= today) nextState[id] = entry;
  }
  const toSend = [];
  const groups = new Set();
  for (const it of [...itineraries].sort((a, b) => a.price - b.price)) {
    if (!(it.price < threshold)) continue;
    // Una sola voce per aeroporto + destinazione + weekend: la più economica
    const group = `${it.origin}|${it.destination.code}|${it.weekend}`;
    if (groups.has(group)) continue;
    groups.add(group);
    const prev = nextState[it.id];
    if (!prev || it.price < prev.price) {
      toSend.push(it);
      nextState[it.id] = { price: it.price, alertedAt: now.toUTC().toISO(), weekend: it.weekend };
    } else if (it.price > prev.price) {
      // Risalito: si aggiorna lo stato così una nuova discesa verrà notificata
      nextState[it.id] = { ...prev, price: it.price };
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

/** Legge lo stato, invia gli avvisi e salva lo stato aggiornato in `<dataDir>/alerts_state.json`. */
export async function processAlerts(dataDir, itineraries, env, now, { fetchImpl = fetch, log = console.log } = {}) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = env;
  if (!token || !chatId) {
    // Senza credenziali non si tocca lo stato: gli avvisi partiranno quando il bot sarà configurato
    log('avvisi: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID mancanti, nessun invio');
    return 0;
  }
  const path = join(dataDir, 'alerts_state.json');
  const state = JSON.parse(await readFile(path, 'utf8').catch(() => '{}'));
  const { toSend, nextState } = selectAlerts(itineraries, state, { now });
  let sent = 0;
  if (toSend.length) {
    try {
      await sendTelegram(formatDigest(toSend), { token, chatId, fetchImpl });
      sent = toSend.length;
    } catch (err) {
      // Invio fallito: si ripristina lo stato precedente così si riprova al prossimo giro
      for (const it of toSend) if (state[it.id]) nextState[it.id] = state[it.id]; else delete nextState[it.id];
      log(`avvisi: invio fallito: ${err.message}`);
    }
  }
  await writeFile(path, JSON.stringify(nextState, null, 1));
  log(`avvisi: ${sent} inviati`);
  return sent;
}
