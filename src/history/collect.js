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
/** Status che significano «rallenta»: si riprova dopo una pausa invece di contare un errore. */
const THROTTLE_STATUS = new Set([429, 503]);
const FETCH_TIMEOUT_MS = 20000;
/** Richieste fallite di fila dopo cui la compagnia si ferma (blocco prolungato). */
const MAX_CONSECUTIVE_FAILURES = 10;

/** `fetchImpl` con un tempo massimo per ogni chiamata (risposta e corpo compresi). */
const withTimeout = (fetchImpl, timeoutMs) => (url, init) => fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });

/**
 * Scarica un JSON; su HTTP 429 o 503 (Wizz blocca per circa un minuto con 503 se si va troppo veloci)
 * attende baseMs × 2^tentativo e riprova.
 * Esauriti i tentativi lancia un errore con `rateLimited = true`; gli altri status non ok lanciano subito.
 * Ogni chiamata ha un tempo massimo di `timeoutMs`: scaduto, lancia (conta come richiesta fallita).
 */
export async function fetchRetry(fetchImpl, url, init, { retries = 3, baseMs = 30000, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const timed = withTimeout(fetchImpl, timeoutMs);
  for (let attempt = 0; ; attempt++) {
    const res = await timed(url, init);
    if (res.ok) return res.json();
    if (!THROTTLE_STATUS.has(res.status)) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
    if (attempt >= retries) {
      const err = new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
      err.rateLimited = true;
      throw err;
    }
    await sleep(baseMs * 2 ** attempt);
  }
}

const emptyMeta = () => ({ routesExpected: 0, routesOk: 0, requestsOk: 0, requestsFailed: 0, missing: [], stoppedReason: null });

/** Pausa tra richieste: nessuna se `pauseMs` è falso. */
const pause = (pauseMs, min, max) => (pauseMs ? jitter(min, max) : undefined);

/**
 * Tiene il conto degli errori di fila e del tempo: `check()` ferma la compagnia (stoppedReason) se il
 * tempo è finito; `failed()` la ferma dopo MAX_CONSECUTIVE_FAILURES errori di fila; `ok()` azzera il conto.
 */
function stopper(meta, deadline) {
  let streak = 0;
  return {
    check() {
      if (!meta.stoppedReason && deadline != null && Date.now() >= deadline) meta.stoppedReason = 'tempo';
      return meta.stoppedReason;
    },
    ok() { streak = 0; meta.requestsOk++; },
    failed(err) {
      meta.requestsFailed++;
      if (err.rateLimited) meta.stoppedReason = '429';
      else if (++streak >= MAX_CONSECUTIVE_FAILURES) meta.stoppedReason = 'troppi errori consecutivi';
    },
  };
}

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
export async function collectRyanair(today, { fetchImpl = fetch, pauseMs = true, log = console.log, maxRoutes = Infinity, retryBaseMs = 30000, deadline = null } = {}) {
  const observations = [];
  const coverage = [];
  const meta = emptyMeta();
  const stop = stopper(meta, deadline);
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
    if (stop.check()) { meta.missing.push(`${route.origin}-${route.code}`); continue; }
    let routeOk = true;
    const legs = [[route.origin, route.code], [route.code, route.origin]];
    for (const [from, to] of legs) {
      for (const m of months) {
        if (stop.check()) { routeOk = false; meta.missing.push(`${from}-${to} ${m.month}`); continue; }
        try {
          const json = await fetchRetry(fetchImpl,
            `https://www.ryanair.com/api/farfnd/v4/oneWayFares/${from}/${to}/cheapestPerDay?outboundMonthOfDate=${m.param}&currency=EUR`,
            undefined, { baseMs: retryBaseMs });
          if (!Array.isArray(json?.outbound?.fares)) throw new Error('risposta non valida');
          // Mese senza voli (tratte stagionali): richiesta riuscita, ma nessuna copertura
          if (json.outbound.fares.length > 0) {
            observations.push(...parseRyanairDays(json, from, to, today));
            coverage.push({ airline: 'ryanair', origin: from, dest: to, from: m.from, to: m.to });
          }
          stop.ok();
        } catch (err) {
          routeOk = false;
          meta.missing.push(`${from}-${to} ${m.month}`);
          log(`ryanair ${from}→${to} ${m.month}: ${err.message}`);
          stop.failed(err);
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
export async function collectWizz(today, { fetchImpl = fetch, pauseMs = true, log = console.log, maxRoutes = Infinity, retryBaseMs = 30000, deadline = null } = {}) {
  const observations = [];
  const coverage = [];
  const meta = emptyMeta();
  const stop = stopper(meta, deadline);
  let base;
  let routes;
  try {
    base = `https://be.wizzair.com/${await wizzVersion({ fetchImpl: withTimeout(fetchImpl, FETCH_TIMEOUT_MS) })}/Api`;
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
    if (stop.check()) { meta.missing.push(`${route.origin}-${route.code}`); continue; }
    let routeOk = true;
    for (const win of windows) {
      const lost = () => {
        routeOk = false;
        meta.missing.push(`${route.origin}-${route.code} ${win.from}`, `${route.code}-${route.origin} ${win.from}`);
      };
      if (stop.check()) { lost(); continue; }
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
        const directions = [[tt.outboundFlights, route.origin, route.code], [tt.returnFlights, route.code, route.origin]];
        const parsed = directions.map(([list, from, to]) => parseWizzDays(list, from, to, today));
        // Direzione con elenco vuoto: nessuna copertura per quella direzione, ma non è un errore
        directions.forEach(([list, from, to], i) => {
          observations.push(...parsed[i]);
          if (list.length > 0) coverage.push({ airline: 'wizz', origin: from, dest: to, from: win.from, to: win.to });
        });
        stop.ok();
      } catch (err) {
        lost();
        log(`wizz ${route.origin}↔${route.code} ${win.from}: ${err.message}`);
        stop.failed(err);
      }
      // Wizz blocca oltre ~45 richieste al minuto: una ogni 2,5–3,5 s (~20 al minuto) resta sotto il limite
      if (!meta.stoppedReason) await pause(pauseMs, 2500, 3500);
    }
    if (routeOk) meta.routesOk++;
  }
  summary('wizz', meta, log);
  return { observations, coverage, routes: chosen, meta };
}
