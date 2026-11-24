import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DateTime } from 'luxon';
import { runMode, MODES } from '../src/run.js';
import { itineraryId } from '../src/model.js';

const NOW = DateTime.fromISO('2026-11-02T10:00:00Z');
const outbound = { segments: [{ from: 'BRI', to: 'BLQ', dep: '2026-11-06T22:00', arr: '2026-11-06T23:20', flight: 'FR548', airline: 'Ryanair' }], selfTransfer: false };
const inbound = { segments: [{ from: 'BLQ', to: 'BRI', dep: '2026-11-08T20:00', arr: '2026-11-08T21:20', flight: 'FR549', airline: 'Ryanair' }], selfTransfer: false };
const fare = { id: itineraryId('BRI', outbound, inbound), source: 'ryanair', origin: 'BRI', destination: { code: 'BLQ', city: 'Bologna', country: 'Italia' },
  outbound, inbound, price: 60, currency: 'EUR', bookingUrl: 'https://x.test', weekend: '2026-11-06', seenAt: '' };
const quiet = { log: () => {}, env: {}, now: NOW };

test('direct: una fonte in errore non blocca le altre, codice 0', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  const code = await runMode('direct', dir, { ...quiet, sources: { ryanair: async () => [fare], wizz: async () => { throw new Error('HTTP 403'); } } });
  assert.equal(code, 0);
  const file = JSON.parse(await readFile(join(dir, 'direct.json'), 'utf8'));
  assert.equal(file.itineraries.length, 1);
  assert.equal(file.sources.ryanair.status, 'ok');
  assert.equal(file.sources.wizz.status, 'error');
  assert.equal(file.sources.wizz.error, 'HTTP 403');
});

test('connections: tutte le fonti in errore → codice 1, file comunque scritto', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  const code = await runMode('connections', dir, { ...quiet, sources: { google: async () => { throw new Error('google-blocked'); } } });
  assert.equal(code, 1);
  const file = JSON.parse(await readFile(join(dir, 'connections.json'), 'utf8'));
  assert.equal(file.sources.google.status, 'error');
});

test('modalità sconosciuta → errore', async () => {
  await assert.rejects(runMode('boh', '.', quiet));
});

test('ogni modalità ha il proprio file dati e il proprio file di stato degli avvisi', () => {
  assert.equal(MODES.direct.stateFile, 'alerts_state_direct.json');
  assert.equal(MODES.connections.stateFile, 'alerts_state_connections.json');
});

test('una fonte che lancia un valore senza message non fa crashare il runner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  const code = await runMode('connections', dir, { ...quiet, sources: { google: async () => { throw undefined; } } });
  assert.equal(code, 1);
  const file = JSON.parse(await readFile(join(dir, 'connections.json'), 'utf8'));
  assert.equal(file.sources.google.status, 'error');
  assert.equal(file.sources.google.error, 'errore sconosciuto');
});

// Itinerario da Roma Fiumicino: stessa struttura di `fare`, con origine e tratte da/per FCO
const outboundFCO = { ...outbound, segments: [{ ...outbound.segments[0], from: 'FCO', flight: 'FR100' }] };
const inboundFCO = { ...inbound, segments: [{ ...inbound.segments[0], to: 'FCO', flight: 'FR101' }] };
const fareFCO = { ...fare, id: itineraryId('FCO', outboundFCO, inboundFCO), origin: 'FCO', outbound: outboundFCO, inbound: inboundFCO };
const sourcesFCO = { ryanair: async () => [fareFCO], wizz: async () => [] };

test('gruppo roma: scrive direct-roma.json e non direct.json né lo stato avvisi', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  await runMode('direct', dir, { ...quiet, gruppo: 'roma', sources: sourcesFCO });
  const file = JSON.parse(await readFile(join(dir, 'direct-roma.json'), 'utf8'));
  assert.equal(file.itineraries.length, 1);
  assert.equal(file.itineraries[0].origin, 'FCO');
  assert.deepEqual(await readdir(dir), ['direct-roma.json']);
});

test('avvisi solo dalla Puglia', async () => {
  // Con env vuoto processAlerts non scrive lo stato (nessun canale): si controlla la riga di log
  const logs = { puglia: [], roma: [] };
  for (const gruppo of ['puglia', 'roma']) {
    const dir = await mkdtemp(join(tmpdir(), 'voli-'));
    const sources = gruppo === 'roma' ? sourcesFCO : { ryanair: async () => [fare], wizz: async () => [] };
    await runMode('direct', dir, { ...quiet, gruppo, sources, log: (m) => logs[gruppo].push(m) });
  }
  assert.ok(logs.puglia.some((m) => m.startsWith('avvisi:')));
  assert.ok(!logs.roma.some((m) => m.startsWith('avvisi:')));
});

test('direct: le fonti partono in parallelo (sequenziale andrebbe in stallo) e si uniscono in ordine originale', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voli-'));
  let started = 0;
  let release;
  const bothStarted = new Promise((r) => { release = r; });
  const start = () => { if (++started === 2) release(); return bothStarted; };
  const sources = {
    ryanair: async () => { await start(); await new Promise((r) => setTimeout(r, 20)); return [fare]; },
    wizz: async () => { await start(); return []; },
  };
  const code = await Promise.race([
    runMode('direct', dir, { ...quiet, sources }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('stallo: fonti non parallele')), 3000)),
  ]);
  assert.equal(code, 0);
  const file = JSON.parse(await readFile(join(dir, 'direct.json'), 'utf8'));
  assert.deepEqual(Object.keys(file.sources), ['ryanair', 'wizz']);
  assert.equal(file.sources.ryanair.status, 'ok');
  assert.equal(file.sources.wizz.status, 'ok');
});
