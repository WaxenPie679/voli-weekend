// Giro delle tratte seguite: issue GitHub → prezzi → tracking.json, airports.json, avvisi, commenti.
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { ZONE } from '../weekends.js';
import { parseTracking, describeTracking, trackingHash, bodyHash } from './spec.js';
import { neededDays, neededMonths, cheapestByDay, bestCombos, addSeriesPoint, isExpired } from './combos.js';
import { bookingLinks, sendTrackingAlerts } from './alerts.js';
import { createSources } from './fetch.js';
import { createGitHub } from './github.js';

export const PAGINA = 'https://waxenpie679.github.io/voli-weekend/seguite.html';
export const NON_SERVITA = 'Nessun volo diretto Ryanair o Wizz su questa tratta';
const NOMI = { ryanair: 'Ryanair', wizz: 'Wizz Air' };
/** Data minima per rileggere un corpo ignorando le date passate (serve a riconoscere una tratta scaduta). */
const SEMPRE = '0000-01-01';

const euro = (n) => `${n.toFixed(2).replace('.', ',').replace(',00', '')} €`;
const dataLunga = (iso) => DateTime.fromISO(iso).setLocale('it').toFormat('d LLL yyyy');

/** Legge il JSON di un file, o `fallback` se manca o è illeggibile. */
async function readJson(path, fallback, log) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') log(`tracking: ${path} illeggibile (${err.message}), riparto da zero`);
    return fallback;
  }
}

/** Scrittura atomica: `<file>.tmp` accanto alla destinazione, poi `rename`. */
async function writeAtomic(path, data) {
  const tmp = `${path}.tmp`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, path);
  } finally {
    await rm(tmp, { force: true });
  }
}

/**
 * Rifà `airports.json` se manca o non è di oggi (data di Roma); se la fonte fallisce tiene il vecchio.
 * @returns {Promise<Record<string,string>>} codice → città
 */
async function updateAirports(dataDir, sources, now, today, log) {
  const path = join(dataDir, 'airports.json');
  let file = await readJson(path, null, log);
  const giorno = file?.generatedAt ? DateTime.fromISO(file.generatedAt).setZone(ZONE).toISODate() : null;
  if (giorno !== today) {
    try {
      file = { generatedAt: now.toUTC().toISO(), airports: await sources.airports() };
      await writeAtomic(path, JSON.stringify(file));
      log(`aeroporti: ${file.airports.length} scritti`);
    } catch (err) {
      log(`aeroporti: elenco non aggiornato, tengo il precedente: ${err.message}`);
    }
  }
  const list = Array.isArray(file) ? file : (file?.airports ?? []);
  return Object.fromEntries(list.map((a) => [a.code, a.city]));
}

const testoErrori = (errors) => ['Non riesco a seguire questa tratta:', '', ...errors.map((e) => `- ${e}`), '', 'Modifica la issue per correggerla.'].join('\n');

function testoConferma(t, best, names) {
  const prezzo = best
    ? `Prezzo di oggi: ${euro(best.price)} a persona${t.people > 1 ? ` · ${euro(best.price * t.people)} in ${t.people}` : ''}`
    : 'Nessun prezzo disponibile ora: la tratta potrebbe non essere ancora in vendita.';
  return [`✅ Ora seguo: ${describeTracking(t, names)}`, '', prezzo, '', `Pagina: ${PAGINA}`].join('\n');
}

/** Commento finale: prezzo più basso della serie (il primo giorno in cui è stato visto). */
function testoChiusura(series = []) {
  if (!series.length) return 'Date passate: smetto di seguire.';
  const [giorno, prezzo] = series.reduce((min, p) => (p[1] < min[1] ? p : min));
  return `Date passate: smetto di seguire. Prezzo più basso visto: ${euro(prezzo)} il ${dataLunga(giorno)}.`;
}

/** Voce di tracking.json con le chiavi sempre nello stesso ordine. */
function voce(issue, f) {
  return {
    id: issue.number, url: issue.html_url, title: issue.title,
    tracking: f.tracking ?? null, hash: f.hash ?? null, status: f.status, errors: f.errors ?? [],
    airlines: f.airlines ?? [], best: f.best ?? null, top: f.top ?? [], checkedAt: f.checkedAt ?? null,
    sourceErrors: f.sourceErrors ?? [], series: f.series ?? [], links: f.links ?? [], commentedFor: f.commentedFor ?? null,
  };
}

/**
 * Una issue: lettura del corpo, eventuale chiusura, prezzi, commento.
 * @returns {Promise<{item:object|null, checked:boolean}>} `checked` vero se i prezzi di questo giro sono validi (avvisi ammessi)
 */
async function processIssue(issue, prev, { now, today, github, sources, names, log }) {
  const n = issue.number;
  const body = issue.body ?? '';
  const commenta = async (text) => {
    try { await github.comment(n, text); return true; } catch (err) { log(`issue #${n}: commento non riuscito: ${err.message}`); return false; }
  };
  const chiudi = async () => {
    try {
      await github.close(n, testoChiusura(prev?.series));
      log(`issue #${n}: date passate, chiusa`);
      return { item: null, checked: false };
    } catch (err) {
      log(`issue #${n}: chiusura non riuscita, riprovo al prossimo giro: ${err.message}`);
      return { item: prev ?? null, checked: false };
    }
  };

  const { tracking: t, errors } = parseTracking(body, { today });
  if (!t) {
    // Una tratta già seguita le cui date sono passate non è un errore: si chiude
    const senzaDate = parseTracking(body, { today: SEMPRE }).tracking;
    if (senzaDate && prev?.hash === trackingHash(senzaDate) && isExpired(senzaDate, today)) return chiudi();
    const item = voce(issue, { status: 'errore', errors, series: prev?.series, commentedFor: prev?.commentedFor });
    const bh = bodyHash(body);
    if (item.commentedFor !== bh && await commenta(testoErrori(errors))) item.commentedFor = bh;
    log(`issue #${n}: corpo con ${errors.length} errori`);
    return { item, checked: false };
  }
  if (isExpired(t, today)) return chiudi();

  const hash = trackingHash(t);
  // Se il corpo è cambiato, i prezzi vecchi non valgono più; la serie invece resta
  const stessa = prev?.hash === hash;
  const item = voce(issue, {
    tracking: t, hash, status: 'attivo', airlines: prev?.airlines,
    ...(stessa ? { best: prev.best, top: prev.top, checkedAt: prev.checkedAt, links: prev.links } : {}),
    series: prev?.series, commentedFor: prev?.commentedFor,
  });

  let airlines;
  try {
    airlines = await sources.airlinesFor(t.from, t.to);
  } catch (err) {
    log(`issue #${n}: elenco tratte non scaricabile: ${err.message}`);
    item.sourceErrors = ['Elenco delle tratte non scaricabile ora'];
    return { item, checked: false };
  }
  if (!airlines.length) {
    Object.assign(item, { status: 'errore', errors: [NON_SERVITA], airlines: [], best: null, top: [], links: [], checkedAt: null });
    const key = `nonservita:${hash}`;
    if (item.commentedFor !== key && await commenta(testoErrori([NON_SERVITA]))) item.commentedFor = key;
    log(`issue #${n}: tratta non servita`);
    return { item, checked: false };
  }
  item.airlines = airlines;

  const days = neededDays(t, today);
  const obs = [];
  const sourceErrors = [];
  for (const airline of airlines) {
    try {
      obs.push(...await sources.dayPrices(airline, t.from, t.to, neededMonths(days.out), today));
      if (t.roundTrip) obs.push(...await sources.dayPrices(airline, t.to, t.from, neededMonths(days.back), today));
    } catch (err) {
      log(`issue #${n}: ${airline} prezzi non scaricabili: ${err.message}`);
      sourceErrors.push(`${NOMI[airline] ?? airline}: prezzi non scaricabili ora`);
    }
  }
  if (sourceErrors.length) {
    item.sourceErrors = sourceErrors;
    return { item, checked: false };
  }

  const top = bestCombos(t, cheapestByDay(obs, t.from, t.to), cheapestByDay(obs, t.to, t.from), today);
  const best = top[0] ?? null;
  Object.assign(item, {
    best, top, checkedAt: now.toUTC().toISO(),
    links: best ? bookingLinks(best, t.from, t.to, t.people) : [],
    series: best ? addSeriesPoint(item.series, today, best.price) : item.series,
  });
  if (item.commentedFor !== hash && await commenta(testoConferma(t, best, names))) item.commentedFor = hash;
  log(`issue #${n}: ${best ? euro(best.price) : 'nessun prezzo'}`);
  return { item, checked: true };
}

/**
 * Giro completo. Esce con 1 solo se l'elenco delle issue non è scaricabile (e allora non scrive nulla).
 * @param {string} dataDir
 * @param {{now?:DateTime, github:object, sources:object, env?:object, log?:(s:string)=>void, owner?:string,
 *   alertDeps?:{fetchImpl?:typeof fetch, pushImpl?:Function}}} opts
 * @returns {Promise<number>}
 */
export async function runTracking(dataDir, { now = DateTime.now(), github, sources, env = {}, log = console.log, owner = 'WaxenPie679', alertDeps = {} } = {}) {
  let issues;
  try {
    issues = await github.listTrackingIssues();
  } catch (err) {
    log(`tracking: elenco issue non scaricabile: ${err.message}`);
    return 1;
  }
  await mkdir(dataDir, { recursive: true });
  try { await github.ensureLabel(); } catch (err) { log(`tracking: etichetta non creata: ${err.message}`); }

  const today = now.setZone(ZONE).toISODate();
  const names = await updateAirports(dataDir, sources, now, today, log);
  const prevFile = await readJson(join(dataDir, 'tracking.json'), {}, log);
  const prevById = new Map((prevFile.items ?? []).map((i) => [i.id, i]));
  const ctx = { now, today, github, sources, names, log };

  const items = [];
  const checked = new Set();
  for (const issue of issues) {
    if (issue.user?.login !== owner) continue;
    const prev = prevById.get(issue.number);
    try {
      const r = await processIssue(issue, prev, ctx);
      if (r.item) items.push(r.item);
      if (r.checked) checked.add(issue.number);
    } catch (err) {
      log(`issue #${issue.number}: errore inatteso, tengo la voce precedente: ${err.message}`);
      if (prev) items.push(prev);
    }
  }

  // Tutte le voci passano agli avvisi (così il loro riferimento resta), ma solo quelle
  // controllate in questo giro portano un prezzo: le altre non possono far partire avvisi.
  const alertItems = items.map((it) => ({ id: it.id, tracking: it.tracking, best: checked.has(it.id) ? it.best : null, names }));
  try {
    await sendTrackingAlerts(dataDir, alertItems, env, now, { log, ...alertDeps });
  } catch (err) {
    log(`avvisi tratte: errore: ${err.message}`);
  }
  const state = await readJson(join(dataDir, 'alerts_state_tracking.json'), {}, log);
  for (const it of items) it.alertRef = state[String(it.id)]?.ref ?? null;

  await writeAtomic(join(dataDir, 'tracking.json'), JSON.stringify({ generatedAt: now.toUTC().toISO(), items }, null, 1));
  log(`tracking: ${items.length} tratte`);
  return 0;
}

/** Issue finta per provare in locale: commenti e chiusure stampati invece che inviati. */
function fakeGitHubFromFile(body) {
  return {
    async listTrackingIssues() {
      return [{ number: 1, title: 'Prova locale', body, user: { login: 'WaxenPie679' }, html_url: 'https://github.com/WaxenPie679/voli-weekend/issues/1' }];
    },
    async comment(n, text) { console.log(`--- commento sulla issue #${n} ---\n${text}\n---`); },
    async close(n, text) { console.log(`--- chiusura della issue #${n} ---\n${text}\n---`); },
    async ensureLabel() {},
  };
}

if (process.argv[1]?.endsWith('tracking/run.js')) {
  process.on('unhandledRejection', (err) => console.error('errore asincrono non gestito:', err?.message ?? err));
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const issueFile = arg('--issue-file');
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  let github = null;
  if (issueFile) github = fakeGitHubFromFile(await readFile(issueFile, 'utf8'));
  else if (token && repo) github = createGitHub({ repo, token });
  if (!github) {
    console.error('Mancano GITHUB_TOKEN o GITHUB_REPOSITORY (oppure usa --issue-file <file.md>)');
    process.exitCode = 1;
  } else {
    process.exitCode = await runTracking(arg('--data') ?? './data', { github, sources: createSources(), env: process.env });
  }
}
