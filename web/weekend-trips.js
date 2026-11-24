// Regole di Weekend e Weekend lungo, condivise dalla pagina dello storico e dal calcolo Premium notturno.
// Logica pura: nessun accesso al DOM, importabile da browser e da Node. Date AAAA-MM-GG.

const DAY_MS = 86400000;
const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const dow = (d) => new Date(dayMs(d)).getUTCDay(); // 0 domenica … 6 sabato
const AIRLINE_ORDER = ['ryanair', 'wizz'];
const rankAirline = (a) => (AIRLINE_ORDER.includes(a) ? AIRLINE_ORDER.indexOf(a) : AIRLINE_ORDER.length);

/** 53 sabati crescenti: il primo è il primo sabato s con s + 1 giorno ≥ lastDay (weekend in corso incluso). */
export function weekendSaturdays(lastDay) {
  let t = dayMs(lastDay) - DAY_MS;
  while (new Date(t).getUTCDay() !== 6) t += DAY_MS;
  return Array.from({ length: 53 }, (_, i) => isoDay(t + 7 * i * DAY_MS));
}

/**
 * Partenza di venerdì sera. Ryanair: la partenza è ≥ 18:00. Wizz: lo storico ha il prezzo più basso del
 * giorno senza dire di quale volo, quindi vale solo se tutte le partenze sono ≥ 18:00. Orario vuoto → no.
 */
export function fridayEvening(airline, time) {
  if (!time) return false;
  const deps = airline === 'ryanair' ? [time.split('-')[0]] : time.split(' ').filter(Boolean);
  return deps.length > 0 && deps.every((h) => h >= '18:00');
}

/** Giorni utili di un weekend (identificato dal sabato): andata e ritorno. */
export function weekendDays(saturday, mode) {
  const at = (n) => isoDay(dayMs(saturday) + n * DAY_MS);
  return mode === 'lungo'
    ? { out: [at(-2), at(-1), at(0)], back: [at(1), at(2)] }
    : { out: [at(-1), at(0)], back: [at(1)] };
}

/** Gamba più economica tra i giorni dati; parità: data più vicina, poi Ryanair prima di Wizz. */
function cheapestLeg(map, days, accept) {
  let best = null;
  for (const day of days) {
    for (const leg of map.get(day) ?? []) {
      if (!accept(leg)) continue;
      if (!best || leg.price < best.price || (leg.price === best.price && (leg.date < best.date || (leg.date === best.date && rankAirline(leg.airline) < rankAirline(best.airline))))) best = leg;
    }
  }
  return best;
}

/**
 * Andata e ritorno più economici (indipendenti, anche di compagnie diverse) per il weekend del sabato dato.
 * @param {Map<string, {date:string, airline:string, time:string, price:number}[]>} outMap gambe di andata per data
 * @param {Map<string, {date:string, airline:string, time:string, price:number}[]>} backMap gambe di ritorno per data
 */
export function bestTrip(outMap, backMap, saturday, mode) {
  const days = weekendDays(saturday, mode);
  // Nel weekend breve il venerdì vale solo di sera.
  const okOut = (leg) => mode === 'lungo' || dow(leg.date) !== 5 || fridayEvening(leg.airline, leg.time);
  const out = cheapestLeg(outMap, days.out, okOut);
  const back = cheapestLeg(backMap, days.back, () => true);
  if (!out || !back) return { saturday, out: null, back: null, total: null };
  return { saturday, out, back, total: Math.round((out.price + back.price) * 100) / 100 };
}
