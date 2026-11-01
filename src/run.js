import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { CONSTRAINTS } from './filter.js';
import { upcomingWeekends } from './weekends.js';
import { mergeSource } from './store.js';
import { processAlerts } from './alerts.js';
import { fetchRyanair } from './sources/ryanair.js';
import { fetchWizz } from './sources/wizz.js';
import { fetchGoogle } from './sources/google.js';

export const MODES = {
  direct: { file: 'direct.json', stateFile: 'alerts_state_direct.json', sources: { ryanair: fetchRyanair, wizz: fetchWizz } },
  connections: { file: 'connections.json', stateFile: 'alerts_state_connections.json', sources: { google: fetchGoogle } },
};

/** Esegue le fonti di una modalità, aggiorna il file dati e invia gli avvisi. Restituisce il codice d'uscita. */
export async function runMode(mode, dataDir, { sources, now = DateTime.now(), env = process.env, log = console.log } = {}) {
  const cfg = MODES[mode];
  if (!cfg) throw new Error(`modalità sconosciuta: ${mode} (usa direct o connections)`);
  await mkdir(dataDir, { recursive: true });
  const path = join(dataDir, cfg.file);
  let file = JSON.parse(await readFile(path, 'utf8').catch(() => 'null'));
  const weekends = upcomingWeekends(now, CONSTRAINTS.weekends);
  let failures = 0;
  const active = sources ?? cfg.sources;
  for (const [name, fetchSource] of Object.entries(active)) {
    const started = Date.now();
    try {
      const itineraries = await fetchSource(weekends, { log });
      file = mergeSource(file, name, { ok: true, itineraries }, now);
      log(`${name}: ${itineraries.length} trovati in ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (err) {
      failures++;
      // Qualsiasi cosa venga lanciata (anche senza message), i dati si salvano comunque con lo stato d'errore
      const message = String(err?.message ?? err ?? '').split('\n')[0] || 'errore sconosciuto';
      file = mergeSource(file, name, { ok: false, error: message }, now);
      log(`${name}: ERRORE ${message}`);
    }
  }
  await writeFile(path, JSON.stringify(file, null, 1));
  log(`${cfg.file}: ${file.itineraries.length} itinerari validi`);
  await processAlerts(dataDir, file.itineraries, env, now, { log, stateFile: cfg.stateFile });
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
