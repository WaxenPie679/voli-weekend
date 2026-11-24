import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { checkData, checkRuns, checkWebapp, checkHistory, checkTracking, allChecks, HISTORY_URL, DATA_URL, runChecks, formatReport } from '../src/health.js';

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
  const f = file(0.2, { ryanair: ok(0.2), wizz: { status: 'error', error: 'timeout', lastSuccessAt: ago(0.4) } });
  assert.deepEqual(checkData(f, 'direct', NOW), []);
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
test('checkHistory: raccolta fermata per tempo → problema; stoppedReason null → nessuno', () => {
  const m = (reason, missing = []) => { const x = meta('2026-11-02', 4); x.airlines.wizz = { ...x.airlines.wizz, stoppedReason: reason, missing }; return x; };
  const p = checkHistory([m('tempo', ['a', 'b', 'c'])], NOW);
  assert.equal(p.length, 1);
  assert.match(p[0], /wizz: raccolta interrotta per tempo il 2026-11-02 \(3 voci mancanti\)/);
  assert.deepEqual(checkHistory([m(null)], NOW), []);
});
test('checkHistory: elenco tratte vuoto (routesExpected 0) conta come sotto la metà', () => {
  assert.match(checkHistory([meta('2026-11-02', 4, [0, 0]), meta('2026-11-01', 28, [0, 0])], NOW).join('\n'), /ryanair/);
});
test('checkHistory: compagnia assente nel meta conta come 0 tratte; giorni non consecutivi non contano', () => {
  const noWizz = (day, h) => ({ day, finishedAt: ago(h), airlines: { ryanair: { routesExpected: 10, routesOk: 10 } } });
  assert.match(checkHistory([noWizz('2026-11-02', 4), noWizz('2026-11-01', 28)], NOW).join('\n'), /wizz/);
  assert.deepEqual(checkHistory([meta('2026-11-02', 4, [10, 1]), meta('2026-10-31', 52, [10, 1])], NOW), []);
});

test('checkHistory: routesOk non numerico → copertura bassa; meta senza finishedAt → problema chiaro', () => {
  const bad = (day) => ({ day, finishedAt: ago(4), airlines: { ryanair: { routesExpected: 10 }, wizz: { routesExpected: 5, routesOk: 5 } } });
  assert.match(checkHistory([bad('2026-11-02'), bad('2026-11-01')], NOW).join('\n'), /ryanair/);
  assert.match(checkHistory([{ day: '2026-11-02', airlines: {} }], NOW)[0], /non ha l'ora di fine/);
});

test("allChecks 'Storico prezzi': scarica i meta in YYYY/MM/ e salta i 404", async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    if (url === `${HISTORY_URL}2026/11/2026-11-02.meta.json`) return { ok: true, status: 200, json: async () => meta('2026-11-02', 4) };
    return { ok: false, status: 404 };
  };
  assert.deepEqual(await allChecks({ now: NOW, env: {}, fetchImpl })['Storico prezzi'](), []);
  assert.deepEqual(asked, ['2026/11/2026-11-02', '2026/11/2026-11-01', '2026/10/2026-10-31'].map((d) => `${HISTORY_URL}${d.slice(0, 8)}${d.slice(8)}.meta.json`));
});

test('checkTracking: file assente o senza voci → nessun problema, anche se vecchio', () => {
  assert.deepEqual(checkTracking(null, NOW), []);
  assert.deepEqual(checkTracking({ generatedAt: ago(100), items: [] }, NOW), []);
});

test('checkTracking: 1 ora → ok; 7 ore con voci → un problema in italiano', () => {
  assert.deepEqual(checkTracking({ generatedAt: ago(1), items: [{}] }, NOW), []);
  const p = checkTracking({ generatedAt: ago(7), items: [{}] }, NOW);
  assert.equal(p.length, 1);
  assert.match(p[0], /^tratte seguite ferme da 7 ore \(ultimo controllo /);
});

test("allChecks 'Tratte seguite': 404 = assente, altri errori = problema, file vecchio = problema", async () => {
  const run = (res) => allChecks({ now: NOW, env: {}, fetchImpl: async (url) => { assert.equal(url, `${DATA_URL}tracking.json`); return res; } })['Tratte seguite']();
  assert.deepEqual(await run({ ok: false, status: 404 }), []);
  assert.match((await run({ ok: false, status: 500 }))[0], /HTTP 500/);
  assert.equal((await run({ ok: true, status: 200, json: async () => ({ generatedAt: ago(8), items: [{}] }) })).length, 1);
});

test('allChecks: aggiunge i controlli di Milano, Bergamo e Roma e tiene quelli della Puglia', () => {
  const keys = Object.keys(allChecks({ now: NOW, env: {}, fetchImpl: async () => ({ ok: false, status: 404 }) }));
  for (const k of ['Dati voli diretti', 'Storico prezzi', 'Dati voli diretti · Milano', 'Dati voli diretti · Roma', 'Storico prezzi · Bergamo']) assert.ok(keys.includes(k), k);
  assert.ok(!keys.some((k) => k.includes('Puglia')));
  assert.ok(!keys.some((k) => /scal/i.test(k)), 'nessun controllo dei voli con scalo');
});

test("allChecks 'Storico prezzi · Roma': legge il ramo history-roma", async () => {
  const asked = [];
  const fetchImpl = async (url) => { asked.push(url); return { ok: false, status: 404 }; };
  await allChecks({ now: NOW, env: {}, fetchImpl })['Storico prezzi · Roma']();
  assert.equal(asked.length, 3);
  assert.ok(asked.every((u) => u.includes('/voli-weekend/history-roma/2026/')));
  assert.ok(asked[0].includes('/voli-weekend/history-roma/2026/11/'));
});

test("allChecks 'Dati voli diretti · Milano': 404 → problema col nome del file del gruppo", async () => {
  const fetchImpl = async (url) => { assert.equal(url, `${DATA_URL}direct-milano.json`); return { ok: false, status: 404 }; };
  const problems = await allChecks({ now: NOW, env: {}, fetchImpl })['Dati voli diretti · Milano']();
  assert.equal(problems.length, 1);
  assert.match(problems[0], /direct-milano\.json/);
  assert.match(checkData(null, 'direct', NOW, 'direct-milano.json')[0], /direct-milano\.json non trovati/);
});
