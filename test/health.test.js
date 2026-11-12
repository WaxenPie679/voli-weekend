import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { checkData, checkRuns, checkWebapp, checkHistory, runChecks, formatReport } from '../src/health.js';

const NOW = DateTime.fromISO('2026-11-02T08:00:00Z');
const ago = (h) => NOW.minus({ hours: h }).toUTC().toISO();
const file = (h, sources, n = 5) => ({ generatedAt: ago(h), sources, itineraries: Object.keys(sources).flatMap((source) => Array(n).fill({ source })) });
const ok = (h) => ({ status: 'ok', error: null, lastSuccessAt: ago(h) });

test('checkData: dati freschi e fonti ok → nessun problema', () => {
  assert.deepEqual(checkData(file(0.3, { ryanair: ok(0.3), wizz: ok(0.3) }), 'direct', NOW), []);
});

test('checkData: dati vecchi, fonte in errore da tempo e nessun volo', () => {
  const problems = checkData(file(3, { ryanair: ok(3), wizz: { status: 'error', error: 'HTTP 403', lastSuccessAt: ago(30) } }, 0), 'direct', NOW);
  assert.equal(problems.length, 3);
  assert.match(problems.join('\n'), /3 ore/);
  assert.match(problems.join('\n'), /wizz.*HTTP 403/);
  assert.match(problems.join('\n'), /nessun volo/);
});

test('checkData: un errore isolato di una fonte non è un problema se ha funzionato da poco', () => {
  const f = file(0.2, { google: { status: 'error', error: 'timeout', lastSuccessAt: ago(4) } });
  assert.deepEqual(checkData(f, 'connections', NOW), []);
});

test('checkData: file mancante', () => {
  assert.match(checkData(null, 'direct', NOW)[0], /non trovati/);
});

const run = (h, conclusion) => ({ created_at: ago(h), status: 'completed', conclusion });

test('checkRuns: qualche errore sparso tra molte riuscite → ok', () => {
  const runs = [run(0.2, 'success'), run(1, 'failure'), run(2, 'success'), run(5, 'failure')];
  assert.deepEqual(checkRuns({ state: 'active' }, runs, 'direct', NOW), []);
});

test('checkRuns: workflow disattivato, ultima esecuzione fallita e troppi errori', () => {
  const runs = [run(0.2, 'failure'), run(1, 'failure'), run(2, 'failure'), run(30, 'failure')];
  const problems = checkRuns({ state: 'disabled_inactivity' }, runs, 'direct', NOW);
  assert.match(problems.join('\n'), /disattivat/);
  assert.match(problems.join('\n'), /le ultime 4 esecuzioni sono fallite/);
  assert.match(problems.join('\n'), /3 esecuzioni fallite nelle ultime 24 ore/);
});

test('checkRuns: le esecuzioni annullate o ancora in corso non contano', () => {
  const runs = [{ created_at: ago(0.1), status: 'in_progress', conclusion: null }, run(0.3, 'cancelled'), run(1, 'success')];
  assert.deepEqual(checkRuns({ state: 'active' }, runs, 'direct', NOW), []);
});

test('checkWebapp: segnala le pagine che non rispondono', async () => {
  const fetchImpl = async (url) => ({ ok: !url.endsWith('sw.js'), status: url.endsWith('sw.js') ? 404 : 200 });
  const problems = await checkWebapp('https://x.test/', { fetchImpl });
  assert.deepEqual(problems, ['sw.js: HTTP 404']);
});

test('runChecks: un controllo che lancia errore diventa un problema, gli altri proseguono', async () => {
  const results = await runChecks({ a: async () => [], b: async () => { throw new Error('rete giù'); }, c: async () => ['x'] });
  assert.deepEqual(results, [
    { name: 'a', problems: [] },
    { name: 'b', problems: ['controllo non riuscito: rete giù'] },
    { name: 'c', problems: ['x'] },
  ]);
});

test('formatReport: elenca i controlli con ✅ e ❌ e i dettagli dei problemi', () => {
  const text = formatReport([{ name: 'Webapp', problems: [] }, { name: 'Wizz', problems: ['HTTP <403>'] }]);
  assert.match(text, /✅ Webapp/);
  assert.match(text, /❌ Wizz/);
  assert.match(text, /HTTP &lt;403&gt;/);
});

const meta = (day, finishedH, r = [10, 10], w = [5, 5]) => ({ day, finishedAt: ago(finishedH),
  airlines: { ryanair: { routesExpected: r[0], routesOk: r[1] }, wizz: { routesExpected: w[0], routesOk: w[1] } } });

test('checkHistory: raccolta recente e completa → nessun problema', () => {
  assert.deepEqual(checkHistory([meta('2026-11-02', 4)], NOW), []);
});
test('checkHistory: nessuna raccolta da più di 30 ore', () => {
  assert.match(checkHistory([meta('2026-11-01', 31)], NOW)[0], /storico.*31 ore/i);
  assert.match(checkHistory([], NOW)[0], /nessuna raccolta/i);
});
test('checkHistory: meno di metà tratte per 2 giorni di fila → problema; per 1 giorno → no', () => {
  assert.match(checkHistory([meta('2026-11-02', 4, [10, 4]), meta('2026-11-01', 28, [10, 3])], NOW).join('\n'), /ryanair/);
  assert.deepEqual(checkHistory([meta('2026-11-02', 4, [10, 4]), meta('2026-11-01', 28)], NOW), []);
});
test('checkHistory: elenco tratte vuoto (routesExpected 0) conta come sotto la metà', () => {
  assert.match(checkHistory([meta('2026-11-02', 4, [0, 0]), meta('2026-11-01', 28, [0, 0])], NOW).join('\n'), /ryanair/);
});
test('checkHistory: compagnia assente nel meta conta come 0 tratte; giorni non consecutivi non contano', () => {
  const noWizz = (day, h) => ({ day, finishedAt: ago(h), airlines: { ryanair: { routesExpected: 10, routesOk: 10 } } });
  assert.match(checkHistory([noWizz('2026-11-02', 4), noWizz('2026-11-01', 28)], NOW).join('\n'), /wizz/);
  assert.deepEqual(checkHistory([meta('2026-11-02', 4, [10, 1]), meta('2026-10-31', 52, [10, 1])], NOW), []);
});
