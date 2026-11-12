import { DateTime } from 'luxon';
import { CONSTRAINTS } from '../filter.js';
import { jitter, sleep } from '../util.js';
import { wizzVersion, parseWizzRoutes } from '../sources/wizz.js';
import { parseRyanairRoutes, parseRyanairDays, parseWizzDays } from './observe.js';

/** @typedef {import('./observe.js').Obs} Obs */
/** @typedef {import('./store.js').Coverage} Coverage */
/** @typedef {{routesExpected:number, routesOk:number, requestsOk:number, requestsFailed:number, missing:string[], stoppedReason:string|null}} AirlineMeta */
/** @typedef {{airline:string, origin:string, code:string, city:string, country:string}} RouteInfo */

const MONTHS = 12;
const WIZZ_WINDOW_DAYS = 30;
const WIZZ_HORIZON_DAYS = 365;

/**
 * Scarica un JSON; su HTTP 429 attende baseMs × 2^tentativo e riprova.
 * Esauriti i tentativi lancia un errore con `rateLimited = true`; gli altri status non ok lanciano subito.
 */
export async function fetchRetry(fetchImpl, url, init, { retries = 3, baseMs = 30000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, init);
    if (res.ok) return res.json();
    if (res.status !== 429) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
    if (attempt >= retries) {
      const err = new Error(`HTTP 429 ${url.split('?')[0]}`);
      err.rateLimited = true;
      throw err;
    }
    await sleep(baseMs * 2 ** attempt);
  }
}

const emptyMeta = () => ({ routesExpected: 0, routesOk: 0, requestsOk: 0, requestsFailed: 0, missing: [], stoppedReason: null });

/** Pausa tra richieste: nessuna se `pauseMs` è falso. */
const pause = (pauseMs, min, max) => (pauseMs ? jitter(min, max) : undefined);

const summary = (name, meta, log) =>
  log(`storico ${name}: ${meta.routesOk}/${meta.routesExpected} tratte complete, richieste ok ${meta.requestsOk}, fallite ${meta.requestsFailed}` +
    (meta.stoppedReason ? `, fermata: ${meta.stoppedReason}` : ''));

/** Primi giorni dei 12 mesi di calendario a partire dal mese di `today`. */
function ryanairMonths(today) {
  const first = DateTime.fromISO(today).startOf('month');
  return Array.from({ length: MONTHS }, (_, i) => {
    const start = first.plus({ months: i });
    const from = start.toISODate();
    return { month: from.slice(0, 7), param: from, from: from < today ? today : from, to: start.endOf('month').toISODate() };
  });
}

/**
 * Raccoglie i prezzi giornalieri Ryanair (andata e ritorno di ogni tratta diretta da BRI/BDS), 12 mesi.
 * @returns {Promise<{observations:Obs[], coverage:Coverage[], routes:RouteInfo[], meta:AirlineMeta}>}
 */
export async function collectRyanair(today, { fetchImpl = fetch, pauseMs = true, log = console.log, maxRoutes = Infinity, retryBaseMs = 30000 } = {}) {
  const observations = [];
  const coverage = [];
  const meta = emptyMeta();
  const routes = [];
  try {
    for (const origin of CONSTRAINTS.origins) {
      const json = await fetchRetry(fetchImpl, `https://www.ryanair.com/api/views/locate/searchWidget/routes/it/airport/${origin}`, undefined, { baseMs: retryBaseMs });
      routes.push(...parseRyanairRoutes(json, origin));
    }
  } catch (err) {
    meta.stoppedReason = `elenco tratte non scaricabile: ${err.message}`;
    summary('ryanair', meta, log);
    return { observations, coverage, routes: [], meta };
  }
  const chosen = routes.slice(0, maxRoutes);
  meta.routesExpected = chosen.length;
  const months = ryanairMonths(today);

  for (const route of chosen) {
    if (meta.stoppedReason) { meta.missing.push(`${route.origin}-${route.code}`); continue; }
    let routeOk = true;
    const legs = [[route.origin, route.code], [route.code, route.origin]];
    for (const [from, to] of legs) {
      for (const m of months) {
        if (meta.stoppedReason) { routeOk = false; meta.missing.push(`${from}-${to} ${m.month}`); continue; }
        try {
          const json = await fetchRetry(fetchImpl,
            `https://www.ryanair.com/api/farfnd/v4/oneWayFares/${from}/${to}/cheapestPerDay?outboundMonthOfDate=${m.param}&currency=EUR`,
            undefined, { baseMs: retryBaseMs });
          observations.push(...parseRyanairDays(json, from, to, today));
          coverage.push({ airline: 'ryanair', origin: from, dest: to, from: m.from, to: m.to });
          meta.requestsOk++;
        } catch (err) {
          routeOk = false;
          meta.requestsFailed++;
          meta.missing.push(`${from}-${to} ${m.month}`);
          log(`ryanair ${from}→${to} ${m.month}: ${err.message}`);
          if (err.rateLimited) meta.stoppedReason = '429';
        }
        if (!meta.stoppedReason) await pause(pauseMs, 500, 1000);
      }
    }
    if (routeOk) meta.routesOk++;
  }
  summary('ryanair', meta, log);
  return { observations, coverage, routes: chosen, meta };
}

/** Finestre consecutive di 30 giorni da `today`, l'ultima tagliata a oggi+365. */
function wizzWindows(today) {
  const start = DateTime.fromISO(today);
  const end = start.plus({ days: WIZZ_HORIZON_DAYS }).toISODate();
  const out = [];
  for (let from = start; from.toISODate() <= end; from = from.plus({ days: WIZZ_WINDOW_DAYS })) {
    const to = from.plus({ days: WIZZ_WINDOW_DAYS - 1 }).toISODate();
    out.push({ from: from.toISODate(), to: to > end ? end : to });
  }
  return out;
}

/**
 * Raccoglie i prezzi giornalieri Wizz: una richiesta per tratta e finestra, andata e ritorno insieme.
 * @returns {Promise<{observations:Obs[], coverage:Coverage[], routes:RouteInfo[], meta:AirlineMeta}>}
 */
export async function collectWizz(today, { fetchImpl = fetch, pauseMs = true, log = console.log, maxRoutes = Infinity, retryBaseMs = 30000 } = {}) {
  const observations = [];
  const coverage = [];
  const meta = emptyMeta();
  let base;
  let routes;
  try {
    base = `https://be.wizzair.com/${await wizzVersion({ fetchImpl })}/Api`;
    const map = await fetchRetry(fetchImpl, `${base}/asset/map?languageCode=it-it`, undefined, { baseMs: retryBaseMs });
    routes = parseWizzRoutes(map, CONSTRAINTS.origins).map((r) => ({ airline: 'wizz', origin: r.origin, code: r.code, city: r.city, country: r.country }));
  } catch (err) {
    meta.stoppedReason = `elenco tratte non scaricabile: ${err.message}`;
    summary('wizz', meta, log);
    return { observations, coverage, routes: [], meta };
  }
  const chosen = routes.slice(0, maxRoutes);
  meta.routesExpected = chosen.length;
  const windows = wizzWindows(today);

  for (const route of chosen) {
    if (meta.stoppedReason) { meta.missing.push(`${route.origin}-${route.code}`); continue; }
    let routeOk = true;
    for (const win of windows) {
      const lost = () => {
        routeOk = false;
        meta.missing.push(`${route.origin}-${route.code} ${win.from}`, `${route.code}-${route.origin} ${win.from}`);
      };
      if (meta.stoppedReason) { lost(); continue; }
      try {
        const body = {
          flightList: [
            { departureStation: route.origin, arrivalStation: route.code, from: win.from, to: win.to },
            { departureStation: route.code, arrivalStation: route.origin, from: win.from, to: win.to },
          ],
          priceType: 'regular', adultCount: 1, childCount: 0, infantCount: 0,
        };
        const tt = await fetchRetry(fetchImpl, `${base}/search/timetable`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }, { baseMs: retryBaseMs });
        const out = parseWizzDays(tt.outboundFlights, route.origin, route.code, today);
        const back = parseWizzDays(tt.returnFlights, route.code, route.origin, today);
        observations.push(...out, ...back);
        coverage.push(
          { airline: 'wizz', origin: route.origin, dest: route.code, from: win.from, to: win.to },
          { airline: 'wizz', origin: route.code, dest: route.origin, from: win.from, to: win.to },
        );
        meta.requestsOk++;
      } catch (err) {
        meta.requestsFailed++;
        lost();
        log(`wizz ${route.origin}↔${route.code} ${win.from}: ${err.message}`);
        if (err.rateLimited) meta.stoppedReason = '429';
      }
      if (!meta.stoppedReason) await pause(pauseMs, 500, 1500);
    }
    if (routeOk) meta.routesOk++;
  }
  summary('wizz', meta, log);
  return { observations, coverage, routes: chosen, meta };
}
