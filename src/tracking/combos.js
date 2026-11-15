// Combinazioni migliori e serie giornaliera di una tratta seguita.
// Solo calcolo sulle date e sui prezzi: nessuna rete.
import { DateTime } from 'luxon';

/** @typedef {{airline:'ryanair'|'wizz', date:string, price:number, time:string}} DayPrice */
/** @typedef {{out:DayPrice, back:DayPrice|null, price:number, nights:number|null}} Combo */

const iso = (d) => d.toISODate();
const piu = (data, n) => iso(DateTime.fromISO(data, { zone: 'utc' }).plus({ days: n }));
const notti = (a, b) => Math.round(DateTime.fromISO(b, { zone: 'utc' }).diff(DateTime.fromISO(a, { zone: 'utc' }), 'days').days);

/** Intervalli di notti ammessi (vuoto se non è un andata e ritorno a finestra). */
function nottiAmmesse(t) {
  if (!t.roundTrip || !t.nights) return [];
  const [min, max] = t.nights;
  const r = [];
  for (let n = min; n <= max; n++) r.push(n);
  return r;
}

/** Giorni di andata della finestra (ordinati, mai prima di today). */
function andateFinestra(t, today) {
  const giorni = [];
  for (const mese of [...t.months].sort()) {
    let d = DateTime.fromISO(`${mese}-01`, { zone: 'utc' });
    const fine = d.endOf('month');
    for (; d <= fine; d = d.plus({ days: 1 })) {
      if ((t.weekdays ?? []).includes(d.weekday) && iso(d) >= today) giorni.push(iso(d));
    }
  }
  return [...new Set(giorni)].sort();
}

/** Date ISO di andata e di ritorno da controllare, mai prima di `today`. */
export function neededDays(t, today) {
  if (t.mode === 'precise') {
    return {
      out: t.out && t.out >= today ? [t.out] : [],
      back: t.roundTrip && t.back && t.back >= today ? [t.back] : [],
    };
  }
  const out = andateFinestra(t, today);
  const back = [...new Set(out.flatMap((o) => nottiAmmesse(t).map((n) => piu(o, n))))].sort();
  return { out, back };
}

/** Mesi 'YYYY-MM' distinti e ordinati. */
export function neededMonths(days) {
  return [...new Set(days.map((d) => d.slice(0, 7)))].sort();
}

/** Prezzo più basso tra le compagnie per ogni giorno della rotta from→to (solo stato `prezzo`). */
export function cheapestByDay(obs, from, to) {
  const m = new Map();
  for (const o of obs) {
    if (o.origin !== from || o.dest !== to || o.state !== 'prezzo' || typeof o.price !== 'number') continue;
    const cur = m.get(o.date);
    if (!cur || o.price < cur.price) m.set(o.date, { airline: o.airline, date: o.date, price: o.price, time: o.time ?? '' });
  }
  return m;
}

const arrotonda = (x) => Math.round(x * 100) / 100;

/** Le combinazioni più economiche (per persona), ordinate per prezzo e poi data di andata. */
export function bestCombos(t, outDays, backDays, today, limit = 5) {
  const { out } = neededDays(t, today);
  /** @type {Combo[]} */
  const combos = [];
  for (const data of out) {
    const o = outDays.get(data);
    if (!o) continue;
    if (!t.roundTrip) {
      combos.push({ out: o, back: null, price: arrotonda(o.price), nights: null });
    } else if (t.mode === 'precise') {
      const b = backDays.get(t.back);
      if (b) combos.push({ out: o, back: b, price: arrotonda(o.price + b.price), nights: notti(data, t.back) });
    } else {
      for (const n of nottiAmmesse(t)) {
        const b = backDays.get(piu(data, n));
        if (b) combos.push({ out: o, back: b, price: arrotonda(o.price + b.price), nights: n });
      }
    }
  }
  combos.sort((a, b) => a.price - b.price || (a.out.date < b.out.date ? -1 : a.out.date > b.out.date ? 1 : 0) || (a.nights ?? 0) - (b.nights ?? 0));
  return combos.slice(0, limit);
}

/** Un punto per giorno: se l'ultimo è dello stesso giorno tiene il minimo. */
export function addSeriesPoint(series, day, price) {
  const ultimo = series[series.length - 1];
  if (ultimo && ultimo[0] === day) return [...series.slice(0, -1), [day, Math.min(ultimo[1], price)]];
  return [...series, [day, price]];
}

/** Vero se non resta nessuna data di andata possibile da oggi in poi. */
export function isExpired(t, today) {
  return neededDays(t, today).out.length === 0;
}
