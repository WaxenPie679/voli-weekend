// Logica pura della pagina «Tratte seguite»: nessun accesso al DOM, importabile da browser e da Node.
import { parseTracking, formatBody, describeTracking } from './tracking-spec.js';
import { riseText } from './storico-view.js';

export const REPO_ISSUES = 'https://github.com/WaxenPie679/voli-weekend/issues/new';
export const AIRLINES = { ryanair: 'Ryanair', wizz: 'Wizz Air' };
const STALE_HOURS = 6;
const DAY_MS = 86400000;
const NO_HISTORY = 'Storico in costruzione da quando l\'hai aggiunta.';
const ESTIMATE = ' (stima: ancora nessuna estate raccolta)';
const NO_PRICE = 'Nessun prezzo disponibile ora: la tratta potrebbe non essere ancora in vendita.';

const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const romeFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
const legFmt = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short' });

export const fmtPrice = (n) => `${n.toLocaleString('it-IT', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
const round2 = (n) => Math.round(n * 100) / 100;

/** Giorno di calendario a Roma, AAAA-MM-GG. */
export function romeToday(now = new Date()) {
  return romeFmt.format(now);
}

/** Link alla nuova issue su GitHub con titolo e corpo già compilati. */
export function newIssueUrl(t, names = {}) {
  const title = `Segui: ${describeTracking(t, names)}`;
  return `${REPO_ISSUES}?labels=tracking&title=${encodeURIComponent(title)}&body=${encodeURIComponent(formatBody(t))}`;
}

/** Prezzo per persona, totale del gruppo (solo se più persone) e ribasso dall'ultimo avviso; null senza prezzo. */
export function priceLine(item) {
  const { best, tracking, alertRef } = item ?? {};
  if (!best) return null;
  const people = tracking?.people ?? 1;
  const total = people > 1 ? `${fmtPrice(round2(best.price * people))} in ${people}` : null;
  const diff = alertRef == null ? 0 : round2(alertRef - best.price);
  return { perPerson: fmtPrice(best.price), total, drop: diff >= 0.01 ? `↓ ${fmtPrice(diff)} dall'ultimo avviso` : null };
}

/** Età dei dati: «aggiornato 40 min fa», «mai controllato». */
export function ageText(checkedAt, now) {
  if (!checkedAt) return 'mai controllato';
  const min = Math.max(0, Math.floor((now - new Date(checkedAt)) / 60000));
  if (min < 1) return 'aggiornato ora';
  if (min < 60) return `aggiornato ${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `aggiornato ${h} ${h === 1 ? 'ora' : 'ore'} fa`;
  const d = Math.floor(h / 24);
  return `aggiornato ${d} ${d === 1 ? 'giorno' : 'giorni'} fa`;
}

/** Ora dell'elenco: «elenco aggiornato alle 10:20», con il giorno se non è di oggi (Roma); null senza data. */
export function updatedText(generatedAt, now) {
  if (!generatedAt) return null;
  const d = new Date(generatedAt);
  const giorno = romeToday(d) === romeToday(now) ? '' : `il ${dayFmt.format(d).replace('.', '')} `;
  return `elenco aggiornato ${giorno}alle ${timeFmt.format(d)}`;
}

/**
 * Note sotto il prezzo. Senza prezzo e con la fonte in errore si dice solo che il controllo non è riuscito:
 * non si sa se la tratta è in vendita e non c'è un prezzo precedente da mostrare.
 */
export function priceNotes(item) {
  const errors = item?.sourceErrors ?? [];
  const elenco = errors.join('; ');
  if (item?.best) {
    return { noPrice: null, sourceError: errors.length ? `Ultimo controllo non riuscito (${elenco}): il prezzo mostrato è del controllo precedente.` : null };
  }
  return errors.length ? { noPrice: null, sourceError: `Ultimo controllo non riuscito (${elenco}).` } : { noPrice: NO_PRICE, sourceError: null };
}

/** Dati vecchi: mai controllati o più di 6 ore fa (il giro gira ogni 2 ore). */
export function isStale(checkedAt, now) {
  if (!checkedAt) return true;
  return now - new Date(checkedAt) > STALE_HOURS * 3600000;
}

function daysText(n) {
  if (n <= 0) return 'Si parte oggi.';
  return n === 1 ? 'Manca 1 giorno.' : `Mancano ${n} giorni.`;
}

/** Consiglio «quando comprare» dal riepilogo dello storico della direzione di andata. */
export function buyAdvice(item, summaryOut, today) {
  const best = item?.best ?? null;
  const parts = [];
  if (best) parts.push(daysText(Math.round((dayMs(best.out.date) - dayMs(today)) / DAY_MS)));
  if (!summaryOut) {
    parts.push(NO_HISTORY);
    return parts.join(' ');
  }
  const airlines = summaryOut.airlines ?? {};
  const own = best ? airlines[best.out.airline]?.rise : null;
  const rise = own ?? Object.values(airlines).find((a) => a?.rise != null)?.rise ?? null;
  const reliability = summaryOut.reliability;
  let text = riseText(rise, reliability);
  // La nota di stima vale per una salita indicata; con «prima» riseText dice già che i dati sono pochi
  if (reliability !== 'affidabile' && reliability !== 'prima') text = text.replace(/\.$/, `${ESTIMATE}.`);
  parts.push(text);
  return parts.join(' ');
}

/** Ora di partenza solo se sicura: Ryanair «HH:MM-HH:MM», Wizz solo con una sola partenza. */
export function departTime(day) {
  const t = day?.time ?? '';
  if (day?.airline === 'ryanair') return /^\d{2}:\d{2}-/.test(t) ? t.slice(0, 5) : '';
  const ore = t.match(/\d{2}:\d{2}/g) ?? [];
  return ore.length === 1 ? ore[0] : '';
}

export const legDate = (date) => legFmt.format(new Date(dayMs(date))).replace(/\./g, '');
const legText = (label, day) => [label, legDate(day.date), departTime(day)].filter(Boolean).join(' ');
const airlineName = (a) => AIRLINES[a] ?? a;

/** «Andata gio 8 lug 06:25 · Ritorno gio 15 lug 21:10 · Ryanair». */
export function comboText(combo) {
  const { out, back } = combo;
  if (!back) return `${legText('Andata', out)} · ${airlineName(out.airline)}`;
  if (out.airline === back.airline) return `${legText('Andata', out)} · ${legText('Ritorno', back)} · ${airlineName(out.airline)}`;
  return `${legText('Andata', out)} · ${airlineName(out.airline)} · ${legText('Ritorno', back)} · ${airlineName(back.airline)}`;
}

/** Codice → città, per describeTracking. */
export function namesMap(airports) {
  return Object.fromEntries((airports ?? []).map((a) => [a.code, a.city]));
}

/** Testo del campo aeroporto → codice: «Dubrovnik (DBV)», «dbv» o il nome della città; altrimenti il testo com'è. */
export function airportCode(text, airports = []) {
  const v = String(text ?? '').trim();
  const inParens = v.match(/\(([A-Za-z]{3})\)\s*$/);
  if (inParens) return inParens[1].toUpperCase();
  if (/^[A-Za-z]{3}$/.test(v)) return v.toUpperCase();
  const key = v.toLocaleLowerCase('it');
  const hits = airports.filter((a) => a.city.toLocaleLowerCase('it') === key);
  return hits.length === 1 ? hits[0].code : v;
}

/** I prossimi n mesi a partire da quello di oggi: { value: '2026-11', label: 'nov 2026' }. */
export function nextMonths(today, n = 12) {
  const y = +today.slice(0, 4);
  const m = +today.slice(5, 7) - 1;
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    return { value: d.toISOString().slice(0, 7), label: monthFmt.format(d).replace('.', '') };
  });
}

/** Nome sicuro per il corpo della issue: una riga sola e nessun « #» (il lettore lo prende per un commento). */
function cleanName(name) {
  return String(name ?? '').replace(/[\r\n]+/g, ' ').replace(/(^|\s)#/g, '$1n.').replace(/\s+/g, ' ').trim();
}

const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
const str = (v) => String(v ?? '').trim();

/**
 * Campi del modulo → tracking: si scrive il corpo con formatBody e lo si rilegge con parseTracking,
 * così il modulo accetta esattamente ciò che accetta il giro su GitHub.
 */
export function formToTracking(fields, { today = romeToday(), airports = [] } = {}) {
  const f = fields ?? {};
  const draft = {
    from: airportCode(f.da, airports),
    to: airportCode(f.a, airports),
    roundTrip: f.tipo !== 'solo',
    mode: f.date === 'precise' ? 'precise' : 'finestra',
    out: str(f.andata),
    back: str(f.ritorno),
    months: list(f.mesi).map(str).filter(Boolean),
    weekdays: list(f.giorni).map(Number).filter((d) => d >= 1 && d <= 7),
    nights: [str(f.nottiMin), str(f.nottiMax || f.nottiMin)],
    people: str(f.persone) || 1,
    name: cleanName(f.nome),
  };
  return parseTracking(formatBody(draft), { today });
}
