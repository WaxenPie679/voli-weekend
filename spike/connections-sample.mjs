// Genera data/connections.json reale ma ridotto (2 weekend, 3 destinazioni per Esplora) per la webapp di prova.
import { DateTime } from 'luxon';
import { runMode } from '../src/run.js';
import { fetchGoogle } from '../src/sources/google.js';
const code = await runMode('connections', './data', {
  env: {},
  sources: { google: (w, o) => fetchGoogle(w.slice(0, 2), { ...o, perExplore: 3, pauseMs: 2500 }) },
});
console.log('exit', code, DateTime.now().toISO());
