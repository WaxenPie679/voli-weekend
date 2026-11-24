// File Premium: Weekend dei mesi 4–12 e Weekend lunghi dei mesi 1–12, calcolati ogni notte dallo storico.
import { DateTime } from 'luxon';
import { weekendSaturdays, bestTrip } from '../../web/weekend-trips.js';
import { upcomingWeekends } from '../weekends.js';
import { CONSTRAINTS } from '../filter.js';

/** Un prezzo visto più di tanti giorni fa non si usa. */
const MAX_AGE_DAYS = 7;

/** Link di sola andata per 1 adulto (stessi formati delle tratte seguite). */
export function oneWayUrl(airline, from, to, date) {
  return airline === 'ryanair'
    ? `https://www.ryanair.com/it/it/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=${date}&isReturn=false&originIata=${from}&destinationIata=${to}`
    : `https://wizzair.com/it-it/booking/select-flight/${from}/${to}/${date}/null/1/0/0/null`;
}

/** Giorni di una finestra Wizz (vedi collect.js): una voce «A-B AAAA-MM-GG» in missing copre 30 giorni. */
const WIZZ_WINDOW_DAYS = 30;

/**
 * Vero se il resoconto (meta) di una notte dice che il prezzo di `o` è stato riletto quella notte. Lo storico
 * salva solo i cambi: senza questo controllo un prezzo rimasto uguale sembrerebbe vecchio.
 * In `missing` ci sono le tratte saltate («BRI-BUD», entrambe le direzioni), i mesi Ryanair («BRI-BUD 2027-04»)
 * e le finestre Wizz («BRI-BUD 2027-04-01») non riletti; in `notListed` le tratte sparite dall'elenco.
 */
export function confirmedOn(meta, o) {
  const m = meta?.airlines?.[o.airline];
  if (!m || !m.routesExpected) return false;
  const pair = `${o.origin}-${o.dest}`;
  const reverse = `${o.dest}-${o.origin}`;
  if ((m.notListed ?? []).some((r) => r === pair || r === reverse)) return false;
  for (const miss of m.missing ?? []) {
    const [route, tag] = miss.split(' ');
    if (!tag) { if (route === pair || route === reverse) return false; continue; }
    if (route !== pair) continue;
    if (tag.length === 7 ? o.date.startsWith(tag) : (o.date >= tag && daysBetween(tag, o.date) < WIZZ_WINDOW_DAYS)) return false;
  }
  return true;
}

const daysBetween = (a, b) => DateTime.fromISO(b).diff(DateTime.fromISO(a), 'days').days;
const friday = (saturday) => DateTime.fromISO(saturday).minus({ days: 1 }).toISODate();

/** Aggiunge una gamba alla mappa coppia → data → gambe. */
function put(pairs, pair, leg) {
  if (!pairs.has(pair)) pairs.set(pair, new Map());
  const byDate = pairs.get(pair);
  if (!byDate.has(leg.date)) byDate.set(leg.date, []);
  byDate.get(leg.date).push(leg);
}

/**
 * @param {object} p
 * @param {Map<string, import('./observe.js').Obs>} p.state stato corrente dello storico (ultima riga per chiave)
 * @param {Map<string, string>} p.seen chiave → giorno in cui il prezzo è stato confermato l'ultima volta
 * @param {string} p.today giorno della raccolta (AAAA-MM-GG, Roma)
 * @param {string[]} p.origins aeroporti di casa del gruppo
 * @param {object} p.routes contenuto di routes.json
 * @param {DateTime} p.now istante della raccolta (per il confine con i 3 mesi gratis)
 * @param {string} p.generatedAt
 */
export function buildPremium({ state, seen, today, origins, routes, now, generatedAt }) {
  const outPairs = new Map();
  const backPairs = new Map();
  for (const [key, o] of state) {
    if (o.state !== 'prezzo' || o.price == null || o.date < today) continue;
    const seenOn = seen.get(key);
    if (!seenOn || daysBetween(seenOn, today) > MAX_AGE_DAYS) continue;
    const leg = { date: o.date, airline: o.airline, time: o.time ?? '', price: o.price, seenOn, bookingUrl: oneWayUrl(o.airline, o.origin, o.dest, o.date) };
    if (origins.includes(o.origin)) put(outPairs, `${o.origin}|${o.dest}`, leg);
    else if (origins.includes(o.dest)) put(backPairs, `${o.dest}|${o.origin}`, leg);
  }

  const lastFreeFriday = upcomingWeekends(now, CONSTRAINTS.weekends).at(-1).friday;
  const saturdays = weekendSaturdays(today);
  const entries = [];
  for (const [pair, outMap] of outPairs) {
    const backMap = backPairs.get(pair);
    if (!backMap) continue;
    const [origin, code] = pair.split('|');
    const info = routes[`ryanair|${origin}|${code}`] ?? routes[`wizz|${origin}|${code}`];
    const destination = { code, city: info?.city ?? code, country: info?.country ?? '' };
    for (const saturday of saturdays) {
      for (const kind of ['weekend', 'lungo']) {
        if (kind === 'weekend' && friday(saturday) <= lastFreeFriday) continue;
        const t = bestTrip(outMap, backMap, saturday, kind);
        if (t.total == null || t.total > CONSTRAINTS.maxPrice) continue;
        entries.push({
          id: `storico|${kind}|${origin}|${code}|${saturday}`, kind, origin, destination,
          saturday, weekend: friday(saturday), price: t.total, out: t.out, back: t.back,
        });
      }
    }
  }
  entries.sort((a, b) => a.price - b.price || (a.saturday < b.saturday ? -1 : a.saturday > b.saturday ? 1 : 0));
  return { generatedAt, day: today, entries };
}
