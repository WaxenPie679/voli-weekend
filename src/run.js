import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { CONSTRAINTS } from './filter.js';
import { upcomingWeekends } from './weekends.js';
import { GRUPPI, GRUPPO, dataFile } from './gruppi.js';
import { mergeSource } from './store.js';
import { processAlerts } from './alerts.js';
import { fetchRyanair } from './sources/ryanair.js';
import { fetchWizz } from './sources/wizz.js';

export const MODES = {
  direct: { file: 'direct.json', stateFile: 'alerts_state_direct.json', sources: { ryanair: fetchRyanair, wizz: fetchWizz } },
};

/** Esegue le fonti di una modalità, aggiorna il file dati e invia gli avvisi. Restituisce il codice d'uscita. */
export async function runMode(mode, dataDir, { sources, now = DateTime.now(), env = process.env, log = console.log, gruppo = GRUPPO } = {}) {
  const cfg = MODES[mode];
  if (!cfg) throw new Error(`modalità sconosciuta: ${mode} (usa direct)`);
  await mkdir(dataDir, { recursive: true });
  // Il file dati dipende dal gruppo; gli aeroporti validi sono quelli del gruppo (non del processo)
  const fileName = dataFile(mode, gruppo);
  const origins = GRUPPI[gruppo].aeroporti;
  const path = join(dataDir, fileName);
  let file = JSON.parse(await readFile(path, 'utf8').catch(() => 'null'));
  const weekends = upcomingWeekends(now, CONSTRAINTS.weekends);
  let failures = 0;
  const active = sources ?? cfg.sources;
  // Le fonti partono insieme (Ryanair e Wizz sono siti diversi); i risultati si uniscono poi nell'ordine originale
  const outcomes = await Promise.all(Object.entries(active).map(async ([name, fetchSource]) => {
    const started = Date.now();
    try {
      const itineraries = await fetchSource(weekends, { log });
      log(`${name}: ${itineraries.length} trovati in ${Math.round((Date.now() - started) / 1000)} s`);
      return { name, result: { ok: true, itineraries } };
    } catch (err) {
      // Qualsiasi cosa venga lanciata (anche senza message), i dati si salvano comunque con lo stato d'errore
      const message = String(err?.message ?? err ?? '').split('\n')[0] || 'errore sconosciuto';
      log(`${name}: ERRORE ${message}`);
      return { name, result: { ok: false, error: message } };
    }
  }));
  for (const { name, result } of outcomes) {
    if (!result.ok) failures++;
    file = mergeSource(file, name, result, now, origins);
  }
  await writeFile(path, JSON.stringify(file, null, 1));
  log(`${fileName}: ${file.itineraries.length} itinerari validi`);
  // Gli avvisi partono solo dalla Puglia: gli altri gruppi raccolgono soltanto prezzi
  if (gruppo === 'puglia') await processAlerts(dataDir, file.itineraries, env, now, { log, stateFile: cfg.stateFile });
  return failures === Object.keys(active).length ? 1 : 0;
}

if (process.argv[1]?.endsWith('run.js')) {
  // Un errore asincrono sfuggito (es. dal browser) viene registrato invece di terminare la ricerca senza salvare
  process.on('unhandledRejection', (err) => console.error('errore asincrono non gestito:', err?.message ?? err));
  const [mode] = process.argv.slice(2);
  const i = process.argv.indexOf('--data');
  const dataDir = i > 0 ? process.argv[i + 1] : './data';
  process.exitCode = await runMode(mode, dataDir);
}
