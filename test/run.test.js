import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
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
