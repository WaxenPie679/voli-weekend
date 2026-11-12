import { DateTime } from 'luxon';
import { CONSTRAINTS } from './filter.js';
import { upcomingWeekends, todayRome } from './weekends.js';
import { fetchJson } from './util.js';
import { buildRyanairQueries, parseRyanair } from './sources/ryanair.js';
import { wizzVersion, parseWizzRoutes, timetableWindows } from './sources/wizz.js';
import { sendTelegram } from './telegram.js';

export const WEBAPP_URL = 'https://waxenpie679.github.io/voli-weekend/';
export const DATA_URL = 'https://raw.githubusercontent.com/WaxenPie679/voli-weekend/data/';
export const HISTORY_URL = 'https://raw.githubusercontent.com/WaxenPie679/voli-weekend/history/';
const WEBAPP_FILES = ['', 'app.js', 'view.js', 'config.js', 'notify.js', 'style.css', 'sw.js', 'manifest.webmanifest'];

// Soglie per modalità: i diretti girano ogni 15 minuti, gli scali ogni 4 ore (e una ricerca Google dura a lungo).
const LIMITS = {
  direct: { file: 'direct.json', workflow: 'direct.yml', sources: ['ryanair', 'wizz'], maxAgeHours: 2, maxSourceAgeHours: 6, failStreak: 2, minFailures: 3 },
  connections: { file: 'connections.json', workflow: 'connections.yml', sources: ['google'], maxAgeHours: 9, maxSourceAgeHours: 13, failStreak: 1, minFailures: 2 },
};

const hoursSince = (iso, now) => now.diff(DateTime.fromISO(iso), 'hours').hours;
const fmtHours = (h) => (h >= 48 ? `${Math.round(h / 24)} giorni` : `${Math.round(h)} ore`);

/** Problemi di un file dati pubblicato: aggiornamento, stato delle singole fonti, presenza di voli. */
export function checkData(file, mode, now) {
  const lim = LIMITS[mode];
  if (!file?.generatedAt) return [`dati ${lim.file} non trovati o illeggibili`];
  const problems = [];
  const age = hoursSince(file.generatedAt, now);
  if (age > lim.maxAgeHours) problems.push(`dati fermi da ${fmtHours(age)} (ultimo aggiornamento ${file.generatedAt.slice(0, 16)} UTC)`);
  for (const name of lim.sources) {
    const s = file.sources?.[name];
    if (!s) { problems.push(`${name}: nessuno stato nei dati`); continue; }
    const okAge = s.lastSuccessAt ? hoursSince(s.lastSuccessAt, now) : Infinity;
    // Un errore isolato capita: conta solo se la fonte non funziona da troppo tempo
    if (okAge > lim.maxSourceAgeHours) {
      const since = s.lastSuccessAt ? `da ${fmtHours(okAge)}` : 'mai';
      problems.push(`${name}: nessuna ricerca riuscita ${since}${s.error ? ` (ultimo errore: ${s.error})` : ''}`);
    }
  }
  const counts = Object.fromEntries(lim.sources.map((n) => [n, 0]));
  for (const it of file.itineraries ?? []) if (it.source in counts) counts[it.source]++;
  if (!file.itineraries?.length) problems.push('nessun volo nei dati');
  else for (const [n, c] of Object.entries(counts)) if (!c) problems.push(`${n}: nessun volo nei dati (formato delle risposte cambiato?)`);
  return problems;
}

const HISTORY_MAX_AGE_HOURS = 30;
const HISTORY_MIN_COVERAGE = 0.5;
const HISTORY_AIRLINES = ['ryanair', 'wizz'];

// Sotto la metà delle tratte attese; una compagnia assente nel meta o senza elenco tratte vale 0
const lowCoverage = (meta, airline) => {
  const a = meta.airlines?.[airline];
  return !a?.routesExpected || a.routesOk / a.routesExpected < HISTORY_MIN_COVERAGE;
};

/** Problemi della raccolta storica: `metas` dal più recente, solo quelli trovati. */
export function checkHistory(metas, now) {
  if (!metas.length) return ['nessuna raccolta trovata negli ultimi giorni'];
  const problems = [];
  const age = hoursSince(metas[0].finishedAt, now);
  if (age > HISTORY_MAX_AGE_HOURS) problems.push(`storico fermo da ${fmtHours(age)} (ultima raccolta ${metas[0].finishedAt.slice(0, 16)} UTC)`);
  const [last, prev] = metas;
  const consecutive = prev && Math.round(DateTime.fromISO(last.day).diff(DateTime.fromISO(prev.day), 'days').days) === 1;
  if (consecutive) {
    for (const name of HISTORY_AIRLINES) {
      if (lowCoverage(last, name) && lowCoverage(prev, name)) problems.push(`${name}: meno di metà delle tratte raccolte per due giorni di fila (${prev.day}, ${last.day})`);
    }
  }
  return problems;
}

/** Problemi delle esecuzioni di un workflow nelle ultime 24 ore. */
export function checkRuns(workflow, runs, mode, now) {
  const lim = LIMITS[mode];
  const problems = [];
  if (workflow.state !== 'active') problems.push(`il workflow è disattivato (${workflow.state}): le ricerche non partono più`);
  // Annullate e in corso non dicono niente sulla salute delle ricerche
  const done = runs.filter((r) => r.status === 'completed' && ['success', 'failure', 'timed_out'].includes(r.conclusion))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  let streak = 0;
  while (streak < done.length && done[streak].conclusion !== 'success') streak++;
  if (streak >= lim.failStreak) problems.push(streak === 1 ? "l'ultima esecuzione è fallita" : `le ultime ${streak} esecuzioni sono fallite`);
  const recent = done.filter((r) => hoursSince(r.created_at, now) <= 24);
  const failed = recent.filter((r) => r.conclusion !== 'success').length;
  if (failed >= lim.minFailures && failed / recent.length >= 0.25) problems.push(`${failed} esecuzioni fallite nelle ultime 24 ore su ${recent.length}`);
  return problems;
}

/** La webapp e i file che servono all'app su iPhone rispondono. */
export async function checkWebapp(baseUrl = WEBAPP_URL, { fetchImpl = fetch } = {}) {
  const problems = [];
  for (const f of WEBAPP_FILES) {
    const res = await fetchImpl(baseUrl + f, { cache: 'no-store' }).catch((err) => ({ ok: false, status: err.message }));
    if (!res.ok) problems.push(`${f || 'pagina principale'}: HTTP ${res.status}`);
  }
  return problems;
}

/** Una ricerca vera su Ryanair: l'API risponde e i risultati si leggono ancora. */
async function probeRyanair(now, fetchImpl) {
  const weekends = upcomingWeekends(now, CONSTRAINTS.weekends);
  // Il secondo weekend: per quello corrente i voli potrebbero essere già finiti
  const q = buildRyanairQueries(weekends, todayRome(now)).find((x) => x.weekend === weekends[1].friday);
  const json = await fetchJson(fetchImpl, q.url, { headers: { Accept: 'application/json' } });
  if (!Array.isArray(json.fares)) return ['la risposta non contiene più l\'elenco delle tariffe'];
  parseRyanair(json, q.origin, q.weekend, now.toISO());
  return [];
}

/** Una ricerca vera su Wizz: versione dell'API, elenco delle rotte e orari di una rotta. */
async function probeWizz(now, fetchImpl) {
  const base = `https://be.wizzair.com/${await wizzVersion({ fetchImpl })}/Api`;
  const routes = parseWizzRoutes(await fetchJson(fetchImpl, `${base}/asset/map?languageCode=it-it`), CONSTRAINTS.origins);
  if (!routes.length) return ['nessuna rotta da Bari o Brindisi nella mappa Wizz'];
  const [win] = timetableWindows(upcomingWeekends(now, CONSTRAINTS.weekends), todayRome(now));
  const r = routes[0];
  const tt = await fetchJson(fetchImpl, `${base}/search/timetable`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flightList: [{ departureStation: r.origin, arrivalStation: r.code, from: win.from, to: win.to },
        { departureStation: r.code, arrivalStation: r.origin, from: win.from, to: win.to }],
      priceType: 'regular', adultCount: 1, childCount: 0, infantCount: 0,
    }),
  });
  if (!Array.isArray(tt.outboundFlights)) return [`gli orari ${r.origin}→${r.code} non hanno più il formato atteso`];
  return [];
}

async function github(path, env, fetchImpl) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'voli-weekend-health' };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return fetchJson(fetchImpl, `https://api.github.com/repos/${env.GITHUB_REPOSITORY || 'WaxenPie679/voli-weekend'}${path}`, { headers });
}

async function workflowProblems(mode, now, env, fetchImpl) {
  const wf = LIMITS[mode].workflow;
  const since = now.minus({ hours: 24 }).toUTC().toISO({ suppressMilliseconds: true });
  const [workflow, { workflow_runs: runs }] = await Promise.all([
    github(`/actions/workflows/${wf}`, env, fetchImpl),
    github(`/actions/workflows/${wf}/runs?per_page=100&created=>=${since}`, env, fetchImpl),
  ]);
  return checkRuns(workflow, runs, mode, now);
}

async function dataProblems(mode, now, fetchImpl) {
  const res = await fetchImpl(DATA_URL + LIMITS[mode].file, { cache: 'no-store' });
  if (!res.ok) return [`dati ${LIMITS[mode].file} non raggiungibili: HTTP ${res.status}`];
  return checkData(await res.json(), mode, now);
}

/** Scarica i meta di oggi, ieri e l'altro ieri (data di Roma); 404 = giorno senza raccolta. */
async function historyProblems(now, fetchImpl) {
  const metas = [];
  for (let i = 0; i < 3; i++) {
    const day = DateTime.fromISO(todayRome(now)).minus({ days: i }).toISODate();
    const res = await fetchImpl(`${HISTORY_URL}${day.slice(0, 4)}/${day}.meta.json`, { cache: 'no-store' });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`meta ${day} non raggiungibile: HTTP ${res.status}`);
    metas.push(await res.json());
  }
  return checkHistory(metas, now);
}

async function telegramProblems(env, fetchImpl) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return ['mancano TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID'];
  const res = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
  return res.ok ? [] : [`il bot non risponde (HTTP ${res.status}): gli avvisi non arrivano`];
}

/** Elenco dei controlli del check-up, ognuno restituisce i problemi trovati. */
export function allChecks({ now = DateTime.now(), env = process.env, fetchImpl = fetch } = {}) {
  return {
    'Webapp online': () => checkWebapp(WEBAPP_URL, { fetchImpl }),
    'Dati voli diretti': () => dataProblems('direct', now, fetchImpl),
    'Dati voli con scalo': () => dataProblems('connections', now, fetchImpl),
    'Ricerche diretti (GitHub)': () => workflowProblems('direct', now, env, fetchImpl),
    'Ricerche scali (GitHub)': () => workflowProblems('connections', now, env, fetchImpl),
    'Ryanair risponde': () => probeRyanair(now, fetchImpl),
    'Wizz risponde': () => probeWizz(now, fetchImpl),
    'Storico prezzi': () => historyProblems(now, fetchImpl),
    'Bot Telegram': () => telegramProblems(env, fetchImpl),
  };
}

/** Esegue i controlli uno alla volta; un controllo che si rompe è esso stesso un problema. */
export async function runChecks(checks) {
  const results = [];
  for (const [name, check] of Object.entries(checks)) {
    try {
      results.push({ name, problems: await check() });
    } catch (err) {
      results.push({ name, problems: [`controllo non riuscito: ${String(err?.message ?? err).split('\n')[0]}`] });
    }
  }
  return results;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function formatReport(results) {
  const bad = results.filter((r) => r.problems.length);
  const head = bad.length ? `<b>Voli Weekend: check-up, ${bad.length === 1 ? '1 problema' : `${bad.length} problemi`}</b>` : '<b>Voli Weekend: check-up, tutto OK</b>';
  const lines = results.map((r) => (r.problems.length
    ? `❌ ${esc(r.name)}\n${r.problems.map((p) => `   • ${esc(p)}`).join('\n')}`
    : `✅ ${esc(r.name)}`));
  return [head, '', ...lines, '', WEBAPP_URL].join('\n');
}

// `node src/health.js`: invia il resoconto su Telegram solo se c'è un problema (HEALTH_ALWAYS=1 per riceverlo sempre)
if (process.argv[1]?.endsWith('health.js')) {
  const env = process.env;
  const results = await runChecks(allChecks({ env }));
  const text = formatReport(results);
  console.log(text.replace(/<\/?b>/g, ''));
  const failing = results.some((r) => r.problems.length);
  if ((failing || env.HEALTH_ALWAYS === '1') && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await sendTelegram(text, { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID });
    console.log('Resoconto inviato su Telegram');
  }
  // Workflow rosso su GitHub se qualcosa non va: arriva anche l'email di GitHub se Telegram è giù
  process.exitCode = failing ? 1 : 0;
}
