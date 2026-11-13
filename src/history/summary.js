import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { obsKey } from './store.js';
import { listDayFiles, readDayFile } from './run.js';

/** @typedef {import('./observe.js').Obs} Obs */
/** [settimana, mediana, p25, p75, n] */
/** @typedef {[number, number, number, number, number]} CurveRow */

const MAX_WEEK = 52;
const MIN_POINTS_WEEK = 5;
const MIN_USABLE_WEEKS = 8;
const RISE_THRESHOLD = 1.10;
const KEEP_FLIGHTS_DAYS = 30;

const round2 = (x) => Math.round(x * 100) / 100;

/** Quantile (interpolazione lineare tipo 7, come PERCENTILE.INC) da un istogramma prezzo→conteggio. */
export function quantile(hist, q) {
  const entries = [...hist].sort((a, b) => a[0] - b[0]);
  let total = 0;
  for (const [, c] of entries) total += c;
  const h = (total - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  // valore di posto k (0-based) nell'elenco ordinato espanso
  const at = (k) => {
    let acc = 0;
    for (const [price, c] of entries) {
      acc += c;
      if (k < acc) return price;
    }
    return entries[entries.length - 1][0];
  };
  const a = at(lo);
  const b = lo === hi ? a : at(hi);
  return round2(a + (b - a) * (h - lo));
}

/** Affidabilità dei dati in base ai giorni raccolti. */
export function reliability(daysCollected) {
  if (daysCollected >= 90) return 'affidabile';
  if (daysCollected >= 28) return 'crescita';
  return 'prima';
}

/** Settimana (prima di partenza) oltre cui conviene comprare: la più lontana da cui, scendendo
 * fino a 0, la mediana resta sopra il minimo +10%. null se non c'è un segnale chiaro. */
export function risePoint(curve, rel) {
  if (rel === 'prima') return null;
  const usable = curve.filter((r) => r[4] >= MIN_POINTS_WEEK).sort((a, b) => a[0] - b[0]);
  if (usable.length < MIN_USABLE_WEEKS) return null;
  let min = Infinity;
  let minWeek = -1;
  for (const r of usable) {
    if (r[1] <= min) { min = r[1]; minWeek = r[0]; } // a parità vince la più lontana
  }
  if (minWeek === 0) return null;
  const limit = min * RISE_THRESHOLD;
  let s = null;
  for (const r of usable) {
    if (r[0] >= minWeek || r[1] < limit) break;
    s = r[0];
  }
  return s;
}

/** Giorni dall'epoca per una data AAAA-MM-GG (con cache: poche date distinte). */
function dayNumberFactory() {
  const cache = new Map();
  return (d) => {
    let n = cache.get(d);
    if (n === undefined) {
      n = Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000);
      cache.set(d, n);
    }
    return n;
  };
}

/**
 * Riepilogo per tratta dallo storico a variazioni.
 * @param {{day:string, rows:Obs[]}[]} days giorni (ordinati o no) con le sole righe cambiate
 * @param {object} routes tabella `compagnia|origine|destinazione` → {city, country, ...}
 * @param {{generatedAt:string}} opts
 */
export function buildSummary(days, routes, { generatedAt }) {
  const sorted = [...days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const dayNum = dayNumberFactory();
  const state = new Map(); // obsKey -> Obs, aggiornato giorno per giorno
  const hists = new Map(); // tratta -> compagnia -> settimana -> Map(prezzo -> conteggio)
  const flights = new Map(); // tratta -> compagnia -> Map(data -> [[giorno, stato, prezzo]])
  const airlinesOf = new Map(); // tratta -> Set compagnie

  for (const { day, rows } of sorted) {
    const g = dayNum(day);
    for (const r of rows) {
      state.set(obsKey(r), r);
      const rk = `${r.origin}-${r.dest}`;
      if (!airlinesOf.has(rk)) airlinesOf.set(rk, new Set());
      airlinesOf.get(rk).add(r.airline);
      if (!flights.has(rk)) flights.set(rk, new Map());
      const fa = flights.get(rk);
      if (!fa.has(r.airline)) fa.set(r.airline, new Map());
      const fd = fa.get(r.airline);
      if (!fd.has(r.date)) fd.set(r.date, []);
      fd.get(r.date).push([day, r.state, r.price ?? null]);
    }
    for (const r of state.values()) {
      if (r.state !== 'prezzo' || r.date < day) continue;
      const week = Math.min(MAX_WEEK, Math.floor((dayNum(r.date) - g) / 7));
      const rk = `${r.origin}-${r.dest}`;
      let byAirline = hists.get(rk);
      if (!byAirline) hists.set(rk, (byAirline = new Map()));
      let byWeek = byAirline.get(r.airline);
      if (!byWeek) byAirline.set(r.airline, (byWeek = new Map()));
      let h = byWeek.get(week);
      if (!h) byWeek.set(week, (h = new Map()));
      h.set(r.price, (h.get(r.price) ?? 0) + 1);
    }
  }

  const firstDay = sorted.length ? sorted[0].day : null;
  const lastDay = sorted.length ? sorted[sorted.length - 1].day : null;
  const daysCollected = sorted.length;
  const rel = reliability(daysCollected);
  const cutoff = lastDay
    ? DateTime.fromISO(lastDay, { zone: 'utc' }).minus({ days: KEEP_FLIGHTS_DAYS }).toISODate()
    : null;

  const indexRoutes = [];
  const files = new Map();
  for (const [rk, airSet] of airlinesOf) {
    const [from, to] = rk.split('-');
    const airlines = [...airSet].sort();
    let info = null;
    for (const a of airlines) {
      info = routes[`${a}|${from}|${to}`] ?? routes[`${a}|${to}|${from}`];
      if (info) break;
    }
    // senza dati sulla tratta: codice dell'aeroporto estero (le basi di casa sono BRI e BDS)
    const city = info?.city ?? (to === 'BRI' || to === 'BDS' ? from : to);
    const country = info?.country ?? '';
    const perAirline = {};
    for (const a of airlines) {
      const curve = [];
      const byWeek = hists.get(rk)?.get(a);
      if (byWeek) {
        for (const w of [...byWeek.keys()].sort((x, y) => x - y)) {
          const h = byWeek.get(w);
          let n = 0;
          for (const c of h.values()) n += c;
          curve.push([w, quantile(h, 0.5), quantile(h, 0.25), quantile(h, 0.75), n]);
        }
      }
      const fl = [...(flights.get(rk)?.get(a) ?? [])]
        .filter(([date]) => date >= cutoff)
        .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
      perAirline[a] = { curve, rise: risePoint(curve, rel), flights: fl };
    }
    indexRoutes.push({ from, to, city, country, airlines });
    files.set(rk, { from, to, city, country, lastDay, daysCollected, reliability: rel, airlines: perAirline });
  }
  indexRoutes.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1
    : a.city < b.city ? -1 : a.city > b.city ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0));

  return { index: { generatedAt, firstDay, lastDay, daysCollected, reliability: rel, routes: indexRoutes }, files };
}

/**
 * Legge lo storico in `dir` e riscrive la cartella `out` (index.json + un file per tratta).
 * Si scrive prima in `<out>.tmp/` e solo a lavoro finito si sostituisce `out`: in caso di
 * errore il riepilogo precedente resta intatto.
 * @returns {Promise<{routes:number, bytes:number}>}
 */
export async function writeSummary(dir, { out, now = DateTime.now(), log = console.log } = {}) {
  if (!out) throw new Error('writeSummary: manca la cartella di destinazione (out)');
  const tmp = `${out}.tmp`;
  const final = out;
  try {
    const days = [];
    for (const f of await listDayFiles(dir)) days.push({ day: f.name.slice(0, 10), rows: await readDayFile(dir, f.path) });
    let routes = {};
    try { routes = JSON.parse(await readFile(join(dir, 'routes.json'), 'utf8')); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    const { index, files } = buildSummary(days, routes, { generatedAt: now.toUTC().toISO() });
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    let bytes = 0;
    const put = async (name, obj) => {
      const data = JSON.stringify(obj);
      bytes += Buffer.byteLength(data);
      await writeFile(join(tmp, name), data);
    };
    await put('index.json', index);
    for (const [key, file] of files) await put(`${key}.json`, file);
    await rm(final, { recursive: true, force: true });
    await rename(tmp, final);
    log(`riepilogo: ${files.size} tratte, ${Math.round(bytes / 1024)} KB`);
    return { routes: files.size, bytes };
  } catch (err) {
    await rm(tmp, { recursive: true, force: true });
    throw err;
  }
}

if (process.argv[1]?.endsWith('history/summary.js')) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  try {
    await writeSummary(arg('--dir') ?? './history', { out: arg('--out') });
  } catch (err) {
    console.error(`riepilogo fallito: ${err.message}`);
    process.exitCode = 1;
  }
}
