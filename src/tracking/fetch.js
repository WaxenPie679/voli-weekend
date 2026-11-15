// Prezzi giornalieri dalle compagnie (Ryanair, Wizz) ed elenco aeroporti per l'autocomplete.
// Un'istanza di `createSources` vale per un giro: elenchi tratte e versione Wizz si scaricano una volta sola.
import { DateTime } from 'luxon';
import { jitter } from '../util.js';
import { fetchRetry } from '../history/collect.js';
import { parseRyanairRoutes, parseRyanairDays, parseWizzDays } from '../history/observe.js';
import { wizzVersion, parseWizzRoutes } from '../sources/wizz.js';

/** @typedef {import('../history/observe.js').Obs} Obs */

const RYANAIR = 'https://www.ryanair.com/api';
const RYANAIR_AIRPORTS = `${RYANAIR}/views/locate/5/airports/it/active`;
const WIZZ_WINDOW_DAYS = 30;
const FETCH_TIMEOUT_MS = 20000;

/** Finestre consecutive di al massimo 30 giorni da max(primo giorno del primo mese, today) a fine dell'ultimo mese. */
function wizzWindows(months, today) {
  const sorted = [...months].sort();
  const first = `${sorted[0]}-01`;
  const start = DateTime.fromISO(first < today ? today : first, { zone: 'utc' });
  const end = DateTime.fromISO(`${sorted.at(-1)}-01`, { zone: 'utc' }).endOf('month');
  const out = [];
  for (let from = start; from <= end; from = from.plus({ days: WIZZ_WINDOW_DAYS })) {
    const to = from.plus({ days: WIZZ_WINDOW_DAYS - 1 });
    out.push({ from: from.toISODate(), to: (to > end ? end : to).toISODate() });
  }
  return out;
}

/**
 * @param {{fetchImpl?:typeof fetch, pauseMs?:boolean|number, retryBaseMs?:number, log?:(s:string)=>void}} [opts]
 */
export function createSources({ fetchImpl = fetch, pauseMs = true, retryBaseMs = 30000, log = console.log } = {}) {
  const get = (url, init) => fetchRetry(fetchImpl, url, init, { baseMs: retryBaseMs, timeoutMs: FETCH_TIMEOUT_MS });
  const pause = (min, max) => (pauseMs ? jitter(min, max) : undefined);
  const cache = new Map();
  /** Esegue `fn` una sola volta per chiave (si memorizza la promessa, anche se fallisce). */
  const once = (key, fn) => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  };

  const ryanairRoutes = (from) => once(`ry:${from}`, async () =>
    parseRyanairRoutes(await get(`${RYANAIR}/views/locate/searchWidget/routes/it/airport/${from}`), from));
  const wizzBase = () => once('wizz:base', async () => `https://be.wizzair.com/${await wizzVersion({ fetchImpl })}/Api`);
  const wizzMap = () => once('wizz:map', async () => get(`${await wizzBase()}/asset/map?languageCode=it-it`));

  return {
    /**
     * Compagnie che servono la tratta from→to, nell'ordine ['ryanair','wizz'].
     * Lancia se anche un solo elenco non è scaricabile: un risultato parziale non dice che la tratta non è servita.
     */
    async airlinesFor(from, to) {
      const [ry, wz] = await Promise.allSettled([
        ryanairRoutes(from).then((rs) => rs.some((r) => r.code === to)),
        wizzMap().then((map) => parseWizzRoutes(map, [from]).some((r) => r.code === to)),
      ]);
      const falliti = [['ryanair', ry], ['wizz', wz]].filter(([, r]) => r.status === 'rejected').map(([nome, r]) => `${nome} ${from}: ${r.reason.message}`);
      if (falliti.length) throw new Error(`elenco tratte non scaricabile: ${falliti.join('; ')}`);
      const out = [];
      if (ry.value) out.push('ryanair');
      if (wz.value) out.push('wizz');
      return out;
    },

    /**
     * Prezzi giornalieri from→to per i mesi 'YYYY-MM' richiesti, solo da `today` in poi.
     * Lancia se una richiesta fallisce: il chiamante decide.
     * @returns {Promise<Obs[]>}
     */
    async dayPrices(airline, from, to, months, today) {
      const sorted = [...new Set(months)].sort();
      if (sorted.length === 0) return [];
      const obs = [];
      if (airline === 'ryanair') {
        for (const month of sorted) {
          const json = await get(`${RYANAIR}/farfnd/v4/oneWayFares/${from}/${to}/cheapestPerDay?outboundMonthOfDate=${month}-01&currency=EUR`);
          if (!Array.isArray(json?.outbound?.fares)) throw new Error('risposta non valida');
          obs.push(...parseRyanairDays(json, from, to, today));
          await pause(500, 1000);
        }
      } else if (airline === 'wizz') {
        const base = await wizzBase();
        for (const win of wizzWindows(sorted, today)) {
          const body = {
            flightList: [
              { departureStation: from, arrivalStation: to, from: win.from, to: win.to },
              { departureStation: to, arrivalStation: from, from: win.from, to: win.to },
            ],
            priceType: 'regular', adultCount: 1, childCount: 0, infantCount: 0,
          };
          const tt = await get(`${base}/search/timetable`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          if (!Array.isArray(tt?.outboundFlights)) throw new Error('risposta non valida');
          obs.push(...parseWizzDays(tt.outboundFlights, from, to, today));
          await pause(2500, 3500);
        }
      } else {
        throw new Error(`compagnia sconosciuta: ${airline}`);
      }
      return obs;
    },

    /** Aeroporti `{code, city, country}` di Ryanair e Wizz, senza doppioni (vince Ryanair), ordinati per città. Lancia se falliscono entrambe. */
    async airports() {
      const [ry, wz] = await Promise.allSettled([
        once('ry:airports', () => get(RYANAIR_AIRPORTS)),
        wizzMap(),
      ]);
      if (ry.status === 'rejected' && wz.status === 'rejected') throw new Error(`elenco aeroporti non scaricabile: ${ry.reason.message}; ${wz.reason.message}`);
      const byCode = new Map();
      if (ry.status === 'fulfilled') {
        for (const a of ry.value) byCode.set(a.code, { code: a.code, city: a.city?.name ?? a.code, country: a.country?.name ?? '' });
      } else log(`ryanair: elenco aeroporti non scaricabile: ${ry.reason.message}`);
      if (wz.status === 'fulfilled') {
        for (const c of wz.value.cities ?? []) {
          if (c.iata && !byCode.has(c.iata)) byCode.set(c.iata, { code: c.iata, city: (c.shortName ?? c.iata).trim(), country: c.countryName ?? '' });
        }
      } else log(`wizz: elenco aeroporti non scaricabile: ${wz.reason.message}`);
      return [...byCode.values()].sort((a, b) => a.city.localeCompare(b.city, 'it'));
    },
  };
}
