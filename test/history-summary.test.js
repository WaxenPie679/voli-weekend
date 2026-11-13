import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { quantile, reliability, risePoint, buildSummary, writeSummary } from '../src/history/summary.js';
import { encodeCsv } from '../src/history/store.js';

const row = (airline, origin, dest, date, state, price = null) => ({ airline, origin, dest, date, state, price });
const hist = (...vals) => new Map(vals.map((v) => [v, 1]));
const routes = {
  'ryanair|BDS|TRN': { airline: 'ryanair', origin: 'BDS', code: 'TRN', city: 'Torino', country: 'Italia' },
  'wizz|BDS|TRN': { airline: 'wizz', origin: 'BDS', code: 'TRN', city: 'Torino', country: 'Italia' },
};
const opts = { generatedAt: '2026-11-13T03:00:00Z' };

test('quantile: interpolazione lineare tipo 7 sui centesimi', () => {
  const h = hist(10, 20, 30, 40);
  assert.equal(quantile(h, 0.5), 25);
  assert.equal(quantile(h, 0.25), 17.5);
  assert.equal(quantile(h, 0.75), 32.5);
  for (const q of [0, 0.25, 0.5, 1]) assert.equal(quantile(hist(50), q), 50);
  assert.equal(quantile(new Map([[10, 3], [20, 1]]), 0.5), 10);
});

test('reliability: soglie 28 e 90 giorni', () => {
  assert.equal(reliability(1), 'prima');
  assert.equal(reliability(27), 'prima');
  assert.equal(reliability(28), 'crescita');
  assert.equal(reliability(89), 'crescita');
  assert.equal(reliability(90), 'affidabile');
});

const curveOf = (medians, n = 5) => medians.map((m, w) => [w, m, m, m, n]);

test('risePoint: null se la storia è troppo corta', () => {
  assert.equal(risePoint(curveOf([90, 80, 70, 50, 50, 50, 50, 50, 50, 50]), 'prima'), null);
});

test('risePoint: settimana più lontana con tutto il tratto fino a 0 sopra il minimo +10%', () => {
  assert.equal(risePoint(curveOf([90, 80, 70, 50, 50, 50, 50, 50, 50, 50]), 'crescita'), 2);
  assert.equal(risePoint(curveOf([90, 80, 70, 50, 50, 50, 50, 50, 50, 50]), 'affidabile'), 2);
});

test('risePoint: casi senza salita', () => {
  assert.equal(risePoint(curveOf([50, 50, 50, 50, 50, 50, 50, 50, 50, 50]), 'crescita'), null);
  assert.equal(risePoint(curveOf([50, 60, 70, 80, 90, 90, 90, 90, 90, 90]), 'crescita'), null);
  assert.equal(risePoint(curveOf([90, 80, 70, 50, 50, 50, 50]), 'crescita'), null);
});

test('risePoint: settimane con meno di 5 punti non contano', () => {
  const c = curveOf([90, 80, 70, 50, 50, 50, 50, 50, 50, 50]);
  c[8][4] = 4;
  c[9][4] = 4;
  assert.equal(risePoint(c, 'crescita'), 2); // 8 settimane usabili: basta
  c[7][4] = 4;
  assert.equal(risePoint(c, 'crescita'), null); // 7 usabili: troppo poche
});

test('buildSummary: curve, voli, indice', () => {
  const days = [
    { day: '2026-11-12', rows: [
      row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 30),
      row('ryanair', 'BDS', 'TRN', '2026-12-20', 'prezzo', 60),
      row('ryanair', 'TRN', 'BDS', '2026-11-22', 'prezzo', 40),
      row('wizz', 'BDS', 'TRN', '2026-11-20', 'esaurito'),
    ] },
    { day: '2026-11-13', rows: [row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 35)] },
  ];
  const { index, files } = buildSummary(days, routes, opts);
  assert.equal(index.generatedAt, opts.generatedAt);
  assert.equal(index.daysCollected, 2);
  assert.equal(index.firstDay, '2026-11-12');
  assert.equal(index.lastDay, '2026-11-13');
  assert.equal(index.reliability, 'prima');
  assert.deepEqual(index.routes, [
    { from: 'BDS', to: 'TRN', city: 'Torino', country: 'Italia', airlines: ['ryanair', 'wizz'] },
    { from: 'TRN', to: 'BDS', city: 'Torino', country: 'Italia', airlines: ['ryanair'] },
  ]);
  const f = files.get('BDS-TRN');
  assert.equal(f.from, 'BDS');
  assert.equal(f.lastDay, '2026-11-13');
  assert.deepEqual(f.airlines.ryanair.curve, [[1, 32.5, 31.25, 33.75, 2], [5, 60, 60, 60, 2]]);
  assert.equal(f.airlines.ryanair.rise, null);
  assert.deepEqual(f.airlines.ryanair.flights.find(([d]) => d === '2026-11-20'),
    ['2026-11-20', [['2026-11-12', 'prezzo', 30], ['2026-11-13', 'prezzo', 35]], '']);
  assert.deepEqual(f.airlines.wizz.curve, []);
  assert.deepEqual(f.airlines.wizz.flights, [['2026-11-20', [['2026-11-12', 'esaurito', null]], '']]);
  assert.ok(files.has('TRN-BDS'));
});

test('buildSummary: orario del volo = quello dell\'ultima riga vista', () => {
  const days = [
    { day: '2026-11-12', rows: [{ ...row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 30), time: '' }] },
    { day: '2026-11-14', rows: [{ ...row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 35), time: '10:05-11:55' }] },
  ];
  const fl = buildSummary(days, routes, opts).files.get('BDS-TRN').airlines.ryanair.flights;
  assert.deepEqual(fl, [['2026-11-20', [['2026-11-12', 'prezzo', 30], ['2026-11-14', 'prezzo', 35]], '10:05-11:55']]);
});

test('buildSummary: riga con solo l\'orario cambiato aggiorna l\'orario e non duplica i cambi', () => {
  const days = [
    { day: '2026-11-12', rows: [{ ...row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 30), time: '' }] },
    { day: '2026-11-13', rows: [{ ...row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 30), time: '10:05-11:55' }] },
  ];
  const fl = buildSummary(days, routes, opts).files.get('BDS-TRN').airlines.ryanair.flights;
  assert.deepEqual(fl, [['2026-11-20', [['2026-11-12', 'prezzo', 30]], '10:05-11:55']]);
});

test('buildSummary: volo con prezzo poi nessun_volo con orario vuoto -> orario vuoto', () => {
  const days = [
    { day: '2026-11-12', rows: [{ ...row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 30), time: '10:05-11:55' }] },
    { day: '2026-11-13', rows: [{ ...row('ryanair', 'BDS', 'TRN', '2026-11-20', 'nessun_volo'), time: '' }] },
  ];
  const fl = buildSummary(days, routes, opts).files.get('BDS-TRN').airlines.ryanair.flights;
  assert.deepEqual(fl, [['2026-11-20', [['2026-11-12', 'prezzo', 30], ['2026-11-13', 'nessun_volo', null]], '']]);
});

test('buildSummary: volo senza orario (formato vecchio) ha orario vuoto', () => {
  const days = [{ day: '2026-11-12', rows: [row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 30)] }];
  const fl = buildSummary(days, routes, opts).files.get('BDS-TRN').airlines.ryanair.flights;
  assert.deepEqual(fl, [['2026-11-20', [['2026-11-12', 'prezzo', 30]], '']]);
});

test('buildSummary: giorni saltati usano lo stato rigiocato', () => {
  const days = [
    { day: '2026-11-12', rows: [row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 30)] },
    { day: '2026-11-14', rows: [] },
  ];
  const { index, files } = buildSummary(days, routes, opts);
  assert.equal(index.daysCollected, 2);
  // giorno 12: p-g = 8 -> settimana 1; giorno 14: 6 -> settimana 0
  assert.deepEqual(files.get('BDS-TRN').airlines.ryanair.curve, [[0, 30, 30, 30, 1], [1, 30, 30, 30, 1]]);
});

test('buildSummary: partenze passate escluse da curva e voli', () => {
  const days = [
    { day: '2026-11-12', rows: [
      row('ryanair', 'BDS', 'TRN', '2026-10-01', 'prezzo', 20),
      row('ryanair', 'BDS', 'TRN', '2026-11-01', 'prezzo', 25),
      row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 30),
    ] },
    { day: '2026-11-13', rows: [] },
  ];
  const a = buildSummary(days, routes, opts).files.get('BDS-TRN').airlines.ryanair;
  assert.deepEqual(a.curve.map((r) => r[4]), [2]);
  assert.deepEqual(a.flights.map(([d]) => d), ['2026-11-01', '2026-11-20']);
});

test('buildSummary: tratta assente da routes', () => {
  const days = [{ day: '2026-11-12', rows: [row('ryanair', 'BDS', 'XYZ', '2026-11-20', 'prezzo', 30)] }];
  const { index } = buildSummary(days, routes, opts);
  assert.deepEqual(index.routes, [{ from: 'BDS', to: 'XYZ', city: 'XYZ', country: '', airlines: ['ryanair'] }]);
});

test('buildSummary: settimane oltre 52 confluiscono nella 52', () => {
  const days = [{ day: '2026-11-12', rows: [
    row('ryanair', 'BDS', 'TRN', '2027-12-01', 'prezzo', 30),
    row('ryanair', 'BDS', 'TRN', '2028-03-01', 'prezzo', 50),
  ] }];
  const c = buildSummary(days, routes, opts).files.get('BDS-TRN').airlines.ryanair.curve;
  assert.deepEqual(c, [[52, 40, 35, 45, 2]]);
});

test('buildSummary: tratta di ritorno assente da routes usa l\'aeroporto estero', () => {
  const days = [{ day: '2026-11-12', rows: [row('ryanair', 'TRN', 'BDS', '2026-11-20', 'prezzo', 30)] }];
  const { index } = buildSummary(days, {}, opts);
  assert.deepEqual(index.routes, [{ from: 'TRN', to: 'BDS', city: 'TRN', country: '', airlines: ['ryanair'] }]);
});

async function makeDir() {
  const dir = await mkdtemp(join(tmpdir(), 'riepilogo-'));
  await mkdir(join(dir, '2026', '11'), { recursive: true });
  await writeFile(join(dir, '2026', '11', '2026-11-12.csv.gz'), encodeCsv([row('ryanair', 'BDS', 'TRN', '2026-11-20', 'prezzo', 30)]));
  await writeFile(join(dir, 'routes.json'), JSON.stringify(routes));
  return dir;
}
const NOW = DateTime.fromISO('2026-11-13T03:00:00Z');

test('writeSummary: scrive index e file di tratta, senza resti', async () => {
  const dir = await makeDir();
  try {
    const res = await writeSummary(dir, { out: join(dir, 'summary'), now: NOW, log: () => {} });
    const index = JSON.parse(await readFile(join(dir, 'summary', 'index.json'), 'utf8'));
    const file = JSON.parse(await readFile(join(dir, 'summary', 'BDS-TRN.json'), 'utf8'));
    assert.equal(index.generatedAt, '2026-11-13T03:00:00.000Z');
    assert.deepEqual(index.routes.map((r) => `${r.from}-${r.to}`), ['BDS-TRN']);
    assert.equal(file.city, 'Torino');
    assert.ok(!existsSync(join(dir, 'summary.tmp')));
    assert.equal(res.routes, 1);
    assert.ok(res.bytes > 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('writeSummary: la cartella summary viene sostituita intera', async () => {
  const dir = await makeDir();
  try {
    await mkdir(join(dir, 'summary'));
    await writeFile(join(dir, 'summary', 'VECCHIO-XXX.json'), '{}');
    await writeSummary(dir, { out: join(dir, 'summary'), now: NOW, log: () => {} });
    assert.deepEqual((await readdir(join(dir, 'summary'))).sort(), ['BDS-TRN.json', 'index.json']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('writeSummary: con un file corrotto rifiuta e lascia intatto il riepilogo precedente', async () => {
  const dir = await makeDir();
  try {
    await writeSummary(dir, { out: join(dir, 'summary'), now: NOW, log: () => {} });
    const before = await readFile(join(dir, 'summary', 'index.json'), 'utf8');
    await writeFile(join(dir, '2026', '11', '2026-11-13.csv.gz'), 'non gzip');
    await assert.rejects(writeSummary(dir, { out: join(dir, 'summary'), now: NOW, log: () => {} }), /2026-11-13\.csv\.gz/);
    assert.equal(await readFile(join(dir, 'summary', 'index.json'), 'utf8'), before);
    assert.ok(!existsSync(join(dir, 'summary.tmp')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('writeSummary: senza file giornalieri rifiuta e lascia intatto il riepilogo precedente', async () => {
  const dir = await makeDir();
  const empty = await mkdtemp(join(tmpdir(), 'vuota-'));
  try {
    const out = join(dir, 'summary');
    await writeSummary(dir, { out, now: NOW, log: () => {} });
    const before = await readFile(join(out, 'index.json'), 'utf8');
    // cartella mancante
    await assert.rejects(writeSummary(join(empty, 'non-esiste'), { out, now: NOW, log: () => {} }), /nessun file giornaliero in /);
    // cartella vuota
    await assert.rejects(writeSummary(empty, { out, now: NOW, log: () => {} }), /nessun file giornaliero in /);
    assert.equal(await readFile(join(out, 'index.json'), 'utf8'), before);
    assert.ok(!existsSync(`${out}.tmp`));
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(empty, { recursive: true, force: true });
  }
});
