import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { runHistory } from '../src/history/run.js';
import { decodeCsv, obsKey } from '../src/history/store.js';

const NOW = DateTime.fromISO('2026-11-12T04:00:00Z');
const obsA = { airline: 'ryanair', origin: 'BRI', dest: 'TRN', date: '2026-12-05', state: 'prezzo', price: 40 };
const obsB = { airline: 'ryanair', origin: 'BRI', dest: 'TRN', date: '2026-12-06', state: 'prezzo', price: 50 };
assert.ok(obsKey(obsA) < obsKey(obsB));

const okMeta = { routesExpected: 1, routesOk: 1, requestsOk: 24, requestsFailed: 0, missing: [], stoppedReason: null };
const routeTrn = { airline: 'ryanair', origin: 'BRI', code: 'TRN', city: 'Torino', country: 'Italia' };

/** Collettori finti: Ryanair restituisce le osservazioni date (con copertura vuota), Wizz niente. */
function fakeCollectors(obs, { routes = [routeTrn], meta = okMeta } = {}) {
  return {
    ryanair: async () => ({ observations: obs, coverage: [], routes, meta }),
    wizz: async () => ({ observations: [], coverage: [], routes: [], meta: { ...okMeta, routesExpected: 0, routesOk: 0, requestsOk: 0 } }),
  };
}

let dir;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'storico-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const rd = (p) => readFile(join(dir, p));
const rows = async (p) => decodeCsv(await rd(p));
const json = async (p) => JSON.parse(await rd(p));

test('runHistory primo giro: scrive tutte le osservazioni, meta e tratte', async () => {
  const code = await runHistory(dir, { now: NOW, collectors: fakeCollectors([obsA, obsB]), log: () => {} });
  assert.equal(code, 0);
  assert.deepEqual(await rows('2026/11/2026-11-12.csv.gz'), [obsA, obsB]);
  const meta = await json('2026/11/2026-11-12.meta.json');
  assert.equal(meta.day, '2026-11-12');
  assert.equal(meta.rowsWritten, 2);
  assert.ok(meta.airlines.ryanair && meta.airlines.wizz);
  assert.deepEqual(meta.airlines.ryanair.notListed, []);
  assert.equal((await json('routes.json'))['ryanair|BRI|TRN'].firstSeen, '2026-11-12');
});

test('runHistory giorno dopo: solo i cambiamenti, i file del giorno prima non cambiano', async () => {
  await runHistory(dir, { now: NOW, collectors: fakeCollectors([obsA]), log: () => {} });
  const before = await rd('2026/11/2026-11-12.csv.gz');
  await runHistory(dir, { now: NOW.plus({ days: 1 }), collectors: fakeCollectors([{ ...obsA, price: 45 }]), log: () => {} });
  assert.deepEqual(await rd('2026/11/2026-11-12.csv.gz'), before);
  assert.deepEqual((await rows('2026/11/2026-11-13.csv.gz')).map((r) => r.price), [45]);
  const routes = await json('routes.json');
  assert.equal(routes['ryanair|BRI|TRN'].firstSeen, '2026-11-12');
  assert.equal(routes['ryanair|BRI|TRN'].lastSeen, '2026-11-13');
});

test('runHistory secondo giro nello stesso giorno: conserva le righe del primo e aggiunge solo le nuove', async () => {
  await runHistory(dir, { now: NOW, collectors: fakeCollectors([obsA]), log: () => {} });
  await runHistory(dir, { now: NOW.plus({ hours: 2 }), collectors: fakeCollectors([obsA, obsB]), log: () => {} });
  assert.deepEqual(await rows('2026/11/2026-11-12.csv.gz'), [obsA, obsB]);
  assert.equal((await json('2026/11/2026-11-12.meta.json')).rowsWritten, 2);
});

test('runHistory: nessuna compagnia riuscita → codice 1, meta scritto comunque, nessun file vuoto', async () => {
  const dead = { routesExpected: 0, routesOk: 0, requestsOk: 0, requestsFailed: 0, missing: [], stoppedReason: 'elenco tratte non scaricabile: HTTP 500' };
  const collectors = {
    ryanair: async () => ({ observations: [], coverage: [], routes: [], meta: dead }),
    wizz: async () => { throw new Error('rete assente'); },
  };
  const code = await runHistory(dir, { now: NOW, collectors, log: () => {} });
  assert.equal(code, 1);
  const meta = await json('2026/11/2026-11-12.meta.json');
  assert.equal(meta.rowsWritten, 0);
  assert.equal(meta.airlines.wizz.routesExpected, 0);
  assert.equal(meta.airlines.wizz.stoppedReason, 'rete assente');
  assert.deepEqual(meta.airlines.wizz.notListed, []);
  assert.equal(existsSync(join(dir, '2026/11/2026-11-12.csv.gz')), false);
});

test('runHistory: tratta sparita dall’elenco → in notListed, nessuna riga, lastSeen invariato', async () => {
  await runHistory(dir, { now: NOW, collectors: fakeCollectors([obsA]), log: () => {} });
  await runHistory(dir, { now: NOW.plus({ days: 1 }), collectors: fakeCollectors([], { routes: [{ ...routeTrn, code: 'NAP', city: 'Napoli' }] }), log: () => {} });
  const meta = await json('2026/11/2026-11-13.meta.json');
  assert.deepEqual(meta.airlines.ryanair.notListed, ['BRI-TRN']);
  assert.equal(existsSync(join(dir, '2026/11/2026-11-13.csv.gz')), false);
  const routes = await json('routes.json');
  assert.equal(routes['ryanair|BRI|TRN'].lastSeen, '2026-11-12');
  assert.equal(routes['ryanair|BRI|NAP'].firstSeen, '2026-11-13');
});

test('runHistory: elenco non scaricato → notListed vuoto, tratte note intatte', async () => {
  await runHistory(dir, { now: NOW, collectors: fakeCollectors([obsA]), log: () => {} });
  const dead = { routesExpected: 0, routesOk: 0, requestsOk: 0, requestsFailed: 0, missing: [], stoppedReason: 'elenco tratte non scaricabile: HTTP 500' };
  await runHistory(dir, { now: NOW.plus({ days: 1 }), collectors: fakeCollectors([], { routes: [], meta: dead }), log: () => {} });
  assert.deepEqual((await json('2026/11/2026-11-13.meta.json')).airlines.ryanair.notListed, []);
  assert.equal((await json('routes.json'))['ryanair|BRI|TRN'].lastSeen, '2026-11-12');
});

test('runHistory stesso giorno, stesso volo con prezzo nuovo → nel file solo l’ultimo prezzo', async () => {
  await runHistory(dir, { now: NOW, collectors: fakeCollectors([obsA]), log: () => {} });
  await runHistory(dir, { now: NOW.plus({ hours: 2 }), collectors: fakeCollectors([{ ...obsA, price: 45 }]), log: () => {} });
  assert.deepEqual(await rows('2026/11/2026-11-12.csv.gz'), [{ ...obsA, price: 45 }]);
  assert.equal((await json('2026/11/2026-11-12.meta.json')).rowsWritten, 1);
});

test('runHistory: file del giorno troncato → errore che ne riporta il nome', async () => {
  await runHistory(dir, { now: NOW, collectors: fakeCollectors([obsA, obsB]), log: () => {} });
  const buf = await rd('2026/11/2026-11-12.csv.gz');
  await writeFile(join(dir, '2026/11/2026-11-12.csv.gz'), buf.subarray(0, buf.length - 10));
  await assert.rejects(
    runHistory(dir, { now: NOW.plus({ days: 1 }), collectors: fakeCollectors([obsA]), log: () => {} }),
    /2026-11-12\.csv\.gz/,
  );
});

test('runHistory: nessun file .tmp lasciato nella cartella', async () => {
  await runHistory(dir, { now: NOW, collectors: fakeCollectors([obsA]), log: () => {} });
  const all = await readdir(dir, { recursive: true });
  assert.deepEqual(all.filter((f) => f.endsWith('.tmp')), []);
  assert.ok(all.some((f) => f.endsWith('2026-11-12.csv.gz')));
});

test('runHistory: compagnie in parallelo con la stessa scadenza; l’errore di una non perde l’altra', async () => {
  const started = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const collectors = {
    // Ryanair attende che Wizz sia partita: in sequenza resterebbe bloccata
    ryanair: async (today, opts) => { started.push(['ryanair', opts.deadline]); await gate; return { observations: [obsA], coverage: [], routes: [routeTrn], meta: okMeta }; },
    wizz: async (today, opts) => { started.push(['wizz', opts.deadline]); release(); throw new Error('rete assente'); },
  };
  const code = await runHistory(dir, { now: NOW, collectors, log: () => {}, deadline: 12345 });
  assert.equal(code, 0);
  assert.deepEqual(started.map(([, d]) => d), [12345, 12345]);
  assert.deepEqual(await rows('2026/11/2026-11-12.csv.gz'), [obsA]);
  assert.equal((await json('2026/11/2026-11-12.meta.json')).airlines.wizz.stoppedReason, 'rete assente');
});

test('runHistory: scadenza predefinita a 55 minuti dall’avvio', async () => {
  let got;
  const t0 = Date.now();
  const collectors = { ...fakeCollectors([obsA]), ryanair: async (today, opts) => { got = opts.deadline; return { observations: [], coverage: [], routes: [], meta: okMeta }; } };
  await runHistory(dir, { now: NOW, collectors, log: () => {} });
  assert.ok(got >= t0 + 55 * 60000 && got <= Date.now() + 55 * 60000);
});

test('runHistory: i voli già partiti restano fuori dal confronto', async () => {
  const past = { ...obsA, date: '2026-11-13' };
  await runHistory(dir, { now: NOW, collectors: fakeCollectors([past, obsB]), log: () => {} });
  // Il 14 il volo del 13 è passato: non torna come «nessun_volo» anche se l'intervallo è coperto
  const cov = { airline: 'ryanair', origin: 'BRI', dest: 'TRN', from: '2026-11-01', to: '2026-12-31' };
  const collectors = { ...fakeCollectors([]), ryanair: async () => ({ observations: [obsB], coverage: [cov], routes: [routeTrn], meta: okMeta }) };
  await runHistory(dir, { now: NOW.plus({ days: 2 }), collectors, log: () => {} });
  assert.equal(existsSync(join(dir, '2026/11/2026-11-14.csv.gz')), false);
});
