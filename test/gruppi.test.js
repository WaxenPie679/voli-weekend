import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRUPPI, gruppoDaEnv, dataFile, historyBranch } from '../src/gruppi.js';
import { CONSTRAINTS } from '../src/filter.js';

test('gruppoDaEnv: default puglia, nome valido, errore su sconosciuto', () => {
  assert.equal(gruppoDaEnv({}), 'puglia');
  assert.equal(gruppoDaEnv({ GRUPPO: '' }), 'puglia');
  assert.equal(gruppoDaEnv({ GRUPPO: 'bergamo' }), 'bergamo');
  assert.throws(() => gruppoDaEnv({ GRUPPO: 'Milano' }), /gruppo sconosciuto: Milano/);
});

test('GRUPPI: aeroporti e bacini', () => {
  assert.deepEqual(GRUPPI.milano.aeroporti, ['MXP', 'LIN']);
  assert.deepEqual(GRUPPI.bergamo.aeroporti, ['BGY']);
  assert.deepEqual(GRUPPI.roma.aeroporti, ['FCO', 'CIA']);
  assert.deepEqual(GRUPPI.puglia.aeroporti, ['BRI', 'BDS']);
  assert.equal(GRUPPI.bergamo.bacino, GRUPPI.milano.bacino);
  assert.equal(GRUPPI.milano.bacino, 'Milano e Bergamo');
  assert.equal(GRUPPI.puglia.bacino, 'Puglia');
  assert.equal(GRUPPI.roma.bacino, 'Roma');
});

test('nessun aeroporto in due gruppi', () => {
  const tutti = Object.values(GRUPPI).flatMap((g) => g.aeroporti);
  assert.equal(new Set(tutti).size, tutti.length);
});

test('dataFile e historyBranch', () => {
  assert.equal(dataFile('direct', 'puglia'), 'direct.json');
  assert.equal(dataFile('direct', 'milano'), 'direct-milano.json');
  assert.equal(dataFile('connections', 'roma'), 'connections-roma.json');
  assert.equal(historyBranch('puglia'), 'history');
  assert.equal(historyBranch('roma'), 'history-roma');
  assert.equal(historyBranch('milano'), 'history-milano');
});

// I test vanno lanciati senza GRUPPO impostato nella shell
test('CONSTRAINTS.origins viene dal gruppo (senza GRUPPO = Puglia)', () => {
  assert.deepEqual(CONSTRAINTS.origins, ['BRI', 'BDS']);
});
