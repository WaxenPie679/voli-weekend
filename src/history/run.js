import { readdir, readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { todayRome } from '../weekends.js';
import { collectRyanair, collectWizz } from './collect.js';
import { encodeCsv, decodeCsv, replayState, diffState, obsKey } from './store.js';

const AIRLINES = ['ryanair', 'wizz'];
/** Tempo concesso alla raccolta: il passo del workflow ha 65 minuti, il resto serve a scrivere. */
const COLLECT_MINUTES = 55;
const byKey = (a, b) => (obsKey(a) < obsKey(b) ? -1 : obsKey(a) > obsKey(b) ? 1 : 0);

/** Percorsi (relativi alla cartella) dei file giornalieri, ordinati per data. */
export async function listDayFiles(dir) {
  const out = [];
  for (const year of await readdir(dir).catch(() => [])) {
    if (!/^\d{4}$/.test(year)) continue;
    for (const month of await readdir(join(dir, year))) {
      for (const f of await readdir(join(dir, year, month))) if (f.endsWith('.csv.gz')) out.push({ name: f, path: join(year, month, f) });
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Legge il JSON di un file, o `fallback` se non esiste. */
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (err) { if (err.code === 'ENOENT') return fallback; throw err; }
}

/**
 * Scrive un file in modo atomico: prima `<file>.tmp` accanto alla destinazione, poi `rename`.
 * Se la scrittura fallisce il `.tmp` viene rimosso; se il processo viene ucciso a metà, lo
 * rimuove publish-history.sh prima del commit.
 */
async function writeAtomic(path, data) {
  const tmp = `${path}.tmp`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, path);
  } finally {
    await rm(tmp, { force: true });
  }
}

/** Legge un file giornaliero; se è illeggibile lancia un errore che ne riporta il percorso. */
export async function readDayFile(dir, rel) {
  try {
    return decodeCsv(await readFile(join(dir, rel)));
  } catch (err) {
    throw new Error(`file dello storico illeggibile: ${rel} (${err.message})`);
  }
}

/**
 * Tratte in routes.json per la compagnia ma assenti dall'elenco di oggi ("BRI-TRN").
 * Vuoto se l'elenco di oggi non è stato scaricato.
 */
function notListedOf(airline, known, listed, meta) {
  if (meta.routesExpected === 0 && meta.stoppedReason) return [];
  const today = new Set(listed.map((r) => `${r.origin}-${r.code}`));
  return Object.values(known).filter((r) => r.airline === airline).map((r) => `${r.origin}-${r.code}`).filter((k) => !today.has(k)).sort();
}

/**
 * Giro giornaliero: raccoglie i prezzi, scrive nel file del giorno solo i cambiamenti rispetto allo
 * stato ricostruito dai file precedenti, poi riepilogo (meta) e archivio delle tratte.
 * @returns {Promise<number>} 1 se nessuna compagnia ha completato almeno una tratta, altrimenti 0.
 */
export async function runHistory(dir, { now = DateTime.now(), collectors = { ryanair: collectRyanair, wizz: collectWizz }, collectOpts = {}, log = console.log, deadline = Date.now() + COLLECT_MINUTES * 60000 } = {}) {
  const startedAt = new Date().toISOString();
  const today = todayRome(now);
  const [year, month] = today.split('-');
  const dayRel = join(year, month, `${today}.csv.gz`);
  const metaRel = join(year, month, `${today}.meta.json`);

  const state = new Map();
  let todayRows = [];
  for (const f of await listDayFiles(dir)) {
    const rows = await readDayFile(dir, f.path);
    if (f.name === `${today}.csv.gz`) todayRows = rows;
    // Le date già passate non servono al confronto (diffState le ignora): fuori dallo stato
    for (const [k, r] of replayState(rows)) {
      if (r.date < today) state.delete(k); else state.set(k, r);
    }
  }

  // Le due compagnie in parallelo: l'errore di una non fa perdere i dati dell'altra
  const results = {};
  await Promise.all(AIRLINES.map(async (airline) => {
    try {
      results[airline] = await collectors[airline](today, { deadline, ...collectOpts, log });
    } catch (err) {
      const message = String(err?.message ?? err ?? '').split('\n')[0] || 'errore sconosciuto';
      log(`${airline}: ERRORE ${message}`);
      results[airline] = { observations: [], coverage: [], routes: [], meta: { routesExpected: 0, routesOk: 0, requestsOk: 0, requestsFailed: 0, missing: [], stoppedReason: message } };
    }
  }));
  const observations = AIRLINES.flatMap((a) => results[a].observations);
  const coverage = AIRLINES.flatMap((a) => results[a].coverage);

  const fresh = diffState(state, observations, coverage, today);
  // Nello stesso giorno il file si riscrive: righe già presenti + nuove, una sola per chiave
  const merged = new Map(todayRows.map((r) => [obsKey(r), r]));
  for (const r of fresh) merged.set(obsKey(r), r);
  const dayRows = [...merged.values()].sort(byKey);
  if (fresh.length > 0) {
    const buf = encodeCsv(dayRows);
    // Verifica prima di scrivere: il file deve rileggersi con lo stesso numero di righe
    if (decodeCsv(buf).length !== dayRows.length) throw new Error(`verifica del file ${dayRel} fallita: righe diverse dopo la rilettura`);
    await mkdir(join(dir, year, month), { recursive: true });
    await writeAtomic(join(dir, dayRel), buf);
  }

  const routesPath = join(dir, 'routes.json');
  const known = await readJson(routesPath, {});
  const airlines = {};
  for (const airline of AIRLINES) {
    const { routes, meta } = results[airline];
    airlines[airline] = { ...meta, notListed: notListedOf(airline, known, routes, meta) };
  }
  const updated = { ...known };
  for (const airline of AIRLINES) {
    for (const r of results[airline].routes) {
      const key = `${airline}|${r.origin}|${r.code}`;
      updated[key] = { airline, origin: r.origin, code: r.code, city: r.city, country: r.country, firstSeen: known[key]?.firstSeen ?? today, lastSeen: today };
    }
  }
  if (JSON.stringify(updated) !== JSON.stringify(known)) await writeAtomic(routesPath, JSON.stringify(updated, null, 1));

  await mkdir(join(dir, year, month), { recursive: true });
  const meta = { day: today, startedAt, finishedAt: new Date().toISOString(), rowsWritten: dayRows.length, airlines };
  await writeAtomic(join(dir, metaRel), JSON.stringify(meta, null, 1));
  log(`storico ${today}: ${fresh.length} righe nuove, ${dayRows.length} nel file del giorno`);
  return AIRLINES.some((a) => airlines[a].routesOk > 0) ? 0 : 1;
}

if (process.argv[1]?.endsWith('history/run.js')) {
  process.on('unhandledRejection', (err) => console.error('errore asincrono non gestito:', err?.message ?? err));
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const maxRoutes = arg('--max-routes');
  process.exitCode = await runHistory(arg('--dir') ?? './history', { collectOpts: maxRoutes ? { maxRoutes: Number(maxRoutes) } : {} });
}
