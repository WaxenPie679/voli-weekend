import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { runTracking } from '../src/tracking/run.js';
import { createGitHub } from '../src/tracking/github.js';
import { trackingHash, bodyHash, parseTracking } from '../src/tracking/spec.js';

const NOW = DateTime.fromISO('2026-11-15T10:00:00Z');
const PAGINA = 'https://waxenpie679.github.io/voli-weekend/seguite.html';
const BODY = ['da: BRI', 'a: DBV', 'tipo: andata e ritorno', 'date: precise', 'andata: 2026-12-10', 'ritorno: 2026-12-14', 'persone: 2'].join('\n');
const OBS = [
  { airline: 'ryanair', origin: 'BRI', dest: 'DBV', date: '2026-12-10', state: 'prezzo', price: 30, time: '06:25-08:00' },
  { airline: 'ryanair', origin: 'DBV', dest: 'BRI', date: '2026-12-14', state: 'prezzo', price: 25, time: '21:10-22:40' },
];
const AIRPORTS = [{ code: 'BRI', city: 'Bari', country: 'Italia' }, { code: 'DBV', city: 'Dubrovnik', country: 'Croazia' }];

const issue = (number, body = BODY, login = 'WaxenPie679') => ({
  number, title: `Tratta ${number}`, body, user: { login }, html_url: `https://github.com/WaxenPie679/voli-weekend/issues/${number}`,
});

function fakeGitHub(issues) {
  const gh = {
    issues, comments: [], closed: [], labelled: 0,
    async listTrackingIssues() { if (gh.fail) throw new Error('GitHub HTTP 500'); return gh.issues; },
    async comment(number, text) { gh.comments.push({ number, text }); },
    async close(number, text) { gh.closed.push({ number, text }); },
    async ensureLabel() { gh.labelled++; },
  };
  return gh;
}

function fakeSources({ airlines = ['ryanair'], obs = OBS, airports = AIRPORTS } = {}) {
  const s = {
    calls: [], airportCalls: 0, failPrices: false, airlines, obs, airportList: airports,
    async airlinesFor() { return s.airlines; },
    async dayPrices(airline, from, to, months, today) {
      s.calls.push({ airline, from, to, months, today });
      if (s.failPrices) throw new Error('HTTP 503');
      return s.obs.filter((o) => o.airline === airline && o.origin === from && o.dest === to);
    },
    async airports() { s.airportCalls++; if (s.airportList instanceof Error) throw s.airportList; return s.airportList; },
  };
  return s;
}

/** Telegram finto: conta i messaggi. */
function fakeTelegram() {
  const f = async (url, init) => { f.sent.push(JSON.parse(init.body).text); return { ok: true, status: 200 }; };
  f.sent = [];
  return f;
}
const TG_ENV = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' };

let dir;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tracking-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const readJson = async (name) => JSON.parse(await readFile(join(dir, name), 'utf8'));
const run = (opts) => runTracking(dir, { now: NOW, env: {}, log: () => {}, ...opts });

test('issue di un altro utente ignorata', async () => {
  const github = fakeGitHub([issue(5, BODY, 'qualcuno')]);
  const sources = fakeSources();
  assert.equal(await run({ github, sources }), 0);
  assert.deepEqual((await readJson('tracking.json')).items, []);
  assert.equal(github.comments.length, 0);
  assert.equal(sources.calls.length, 0);
});

test('issue valida: conferma commentata una volta sola su due giri', async () => {
  const github = fakeGitHub([issue(1)]);
  const sources = fakeSources();
  await run({ github, sources });
  await run({ github, sources, now: NOW.plus({ hours: 2 }) });
  assert.equal(github.comments.length, 1);
  const { number, text } = github.comments[0];
  assert.equal(number, 1);
  assert.match(text, /^✅ Ora seguo: Bari → Dubrovnik e ritorno · 10 dic → 14 dic 2026 · 2 persone/);
  assert.ok(text.includes('Prezzo di oggi: 55 € a persona · 110 € in 2'));
  assert.ok(text.includes(`Pagina: ${PAGINA}`));
  const [it] = (await readJson('tracking.json')).items;
  const t = parseTracking(BODY, { today: '2026-11-15' }).tracking;
  assert.equal(it.id, 1);
  assert.equal(it.title, 'Tratta 1');
  assert.equal(it.url, 'https://github.com/WaxenPie679/voli-weekend/issues/1');
  assert.equal(it.status, 'attivo');
  assert.deepEqual(it.errors, []);
  assert.deepEqual(it.airlines, ['ryanair']);
  assert.equal(it.best.price, 55);
  assert.equal(it.top.length, 1);
  assert.equal(it.links.length, 1);
  assert.match(it.links[0].url, /adults=2/);
  assert.equal(it.checkedAt, NOW.plus({ hours: 2 }).toUTC().toISO());
  assert.deepEqual(it.series, [['2026-11-15', 55]]);
  assert.equal(it.hash, trackingHash(t));
  assert.equal(it.commentedFor, trackingHash(t));
  assert.deepEqual(it.sourceErrors, []);
  // mesi richiesti: andata e ritorno nelle due direzioni
  assert.deepEqual(sources.calls.slice(0, 2).map((c) => [c.from, c.to, c.months, c.today]), [['BRI', 'DBV', ['2026-12'], '2026-11-15'], ['DBV', 'BRI', ['2026-12'], '2026-11-15']]);
});

test('corpo con errori: commento d’errore una volta per versione, status errore', async () => {
  const github = fakeGitHub([issue(3, 'da: BRI\na: XX')]);
  const sources = fakeSources();
  await run({ github, sources });
  await run({ github, sources });
  assert.equal(github.comments.length, 1);
  const { text } = github.comments[0];
  assert.match(text, /^Non riesco a seguire questa tratta:/);
  assert.match(text, /\n- «a» non è un codice aeroporto/);
  assert.ok(text.trim().endsWith('Modifica la issue per correggerla.'));
  let [it] = (await readJson('tracking.json')).items;
  assert.equal(it.status, 'errore');
  assert.equal(it.tracking, null);
  assert.ok(it.errors.length >= 2);
  assert.equal(it.commentedFor, bodyHash('da: BRI\na: XX'));
  assert.equal(sources.calls.length, 0);

  github.issues = [issue(3, 'da: BRI\na: YYYY')];
  await run({ github, sources });
  assert.equal(github.comments.length, 2);
  [it] = (await readJson('tracking.json')).items;
  assert.equal(it.commentedFor, bodyHash('da: BRI\na: YYYY'));
});

test('tratta non servita: status errore, commento una volta sola', async () => {
  const github = fakeGitHub([issue(4)]);
  const sources = fakeSources({ airlines: [] });
  await run({ github, sources });
  await run({ github, sources });
  assert.equal(github.comments.length, 1);
  assert.ok(github.comments[0].text.includes('- Nessun volo diretto Ryanair o Wizz su questa tratta'));
  const [it] = (await readJson('tracking.json')).items;
  assert.equal(it.status, 'errore');
  assert.deepEqual(it.errors, ['Nessun volo diretto Ryanair o Wizz su questa tratta']);
  assert.equal(it.commentedFor, 'nonservita:' + it.hash);
  assert.equal(it.best, null);
});

test('fonte in errore: best e checkedAt del giro prima conservati, nessun avviso', async () => {
  const github = fakeGitHub([issue(1)]);
  const sources = fakeSources();
  const fetchImpl = fakeTelegram();
  await run({ github, sources, env: TG_ENV, alertDeps: { fetchImpl } });
  assert.equal(fetchImpl.sent.length, 1);

  // al giro dopo il prezzo scenderebbe, ma la fonte fallisce
  sources.failPrices = true;
  const later = NOW.plus({ hours: 2 });
  await run({ github, sources, now: later, env: TG_ENV, alertDeps: { fetchImpl } });
  let [it] = (await readJson('tracking.json')).items;
  assert.equal(it.best.price, 55);
  assert.equal(it.top.length, 1);
  assert.equal(it.checkedAt, NOW.toUTC().toISO());
  assert.equal(it.links.length, 1);
  assert.equal(it.sourceErrors.length, 1);
  assert.match(it.sourceErrors[0], /Ryanair/);
  assert.equal(it.status, 'attivo');
  assert.equal(fetchImpl.sent.length, 1);
  // riferimento dell'avviso non azzerato
  assert.deepEqual((await readJson('alerts_state_tracking.json'))['1'].ref, 55);
  assert.equal(it.alertRef, 55);

  // fonte di nuovo a posto: errori azzerati
  sources.failPrices = false;
  await run({ github, sources, now: later.plus({ hours: 2 }), env: TG_ENV, alertDeps: { fetchImpl } });
  [it] = (await readJson('tracking.json')).items;
  assert.deepEqual(it.sourceErrors, []);
  assert.equal(it.checkedAt, later.plus({ hours: 2 }).toUTC().toISO());
  assert.equal(fetchImpl.sent.length, 1);
});

test('fonte in errore al primo giro: nessuna conferma finché il controllo non riesce', async () => {
  const github = fakeGitHub([issue(1)]);
  const sources = fakeSources();
  sources.airlinesFor = async () => { throw new Error('elenchi tratte non scaricabili'); };
  await run({ github, sources });
  const [it] = (await readJson('tracking.json')).items;
  assert.equal(it.status, 'attivo');
  assert.equal(it.best, null);
  assert.equal(it.checkedAt, null);
  assert.equal(it.sourceErrors.length, 1);
  assert.equal(it.commentedFor, null);
  assert.equal(github.comments.length, 0);
});

test('nessuna combinazione: best null, status attivo, nessun avviso', async () => {
  const github = fakeGitHub([issue(1)]);
  const sources = fakeSources({ obs: [] });
  const fetchImpl = fakeTelegram();
  await run({ github, sources, env: TG_ENV, alertDeps: { fetchImpl } });
  const [it] = (await readJson('tracking.json')).items;
  assert.equal(it.status, 'attivo');
  assert.equal(it.best, null);
  assert.deepEqual(it.top, []);
  assert.deepEqual(it.links, []);
  assert.deepEqual(it.series, []);
  assert.equal(it.checkedAt, NOW.toUTC().toISO());
  assert.equal(it.alertRef, null);
  assert.equal(fetchImpl.sent.length, 0);
  assert.ok(github.comments[0].text.includes('Nessun prezzo disponibile ora: la tratta potrebbe non essere ancora in vendita.'));
});

test('date passate: issue chiusa con prezzo più basso visto, voce tolta', async () => {
  // finestra senza più domeniche nel mese: corpo valido ma scaduto
  const body = 'da: BRI\na: DBV\ntipo: solo andata\nmesi: 2026-11\ngiorni: dom';
  const t = parseTracking(body, { today: '2026-11-01' }).tracking;
  await writeFile(join(dir, 'tracking.json'), JSON.stringify({ generatedAt: 'x', items: [
    { id: 8, tracking: t, hash: trackingHash(t), status: 'attivo', series: [['2026-11-03', 60], ['2026-11-04', 49], ['2026-11-05', 49]] },
  ] }));
  const github = fakeGitHub([issue(8, body)]);
  const sources = fakeSources();
  await run({ github, sources, now: DateTime.fromISO('2026-11-30T12:00:00Z') });
  assert.deepEqual(github.closed, [{ number: 8, text: 'Date passate: smetto di seguire. Prezzo più basso visto: 49 € il 4 nov 2026.' }]);
  assert.deepEqual((await readJson('tracking.json')).items, []);
  assert.equal(sources.calls.length, 0);
});

test('date precise passate di una tratta seguita: chiusa (senza serie, senza prezzo)', async () => {
  const t = parseTracking(BODY, { today: '2026-11-15' }).tracking;
  await writeFile(join(dir, 'tracking.json'), JSON.stringify({ generatedAt: 'x', items: [
    { id: 1, tracking: t, hash: trackingHash(t), status: 'attivo', series: [] },
  ] }));
  const github = fakeGitHub([issue(1)]);
  await run({ github, sources: fakeSources(), now: DateTime.fromISO('2027-01-20T12:00:00Z') });
  assert.deepEqual(github.closed, [{ number: 1, text: 'Date passate: smetto di seguire.' }]);
  assert.equal(github.comments.length, 0);
  assert.deepEqual((await readJson('tracking.json')).items, []);
});

test('date precise già passate in una issue nuova: commento d’errore, non chiusa', async () => {
  const github = fakeGitHub([issue(1)]);
  await run({ github, sources: fakeSources(), now: DateTime.fromISO('2027-01-20T12:00:00Z') });
  assert.equal(github.closed.length, 0);
  assert.match(github.comments[0].text, /già passata/);
});

test('issue chiusa a mano: voce tolta da tracking.json', async () => {
  const github = fakeGitHub([issue(1), issue(2)]);
  const sources = fakeSources();
  await run({ github, sources });
  assert.deepEqual((await readJson('tracking.json')).items.map((i) => i.id), [1, 2]);
  github.issues = [issue(1)];
  await run({ github, sources });
  assert.deepEqual((await readJson('tracking.json')).items.map((i) => i.id), [1]);
});

test('corpo modificato: nuova conferma, serie conservata', async () => {
  const github = fakeGitHub([issue(1)]);
  const sources = fakeSources();
  await run({ github, sources });
  const body2 = BODY.replace('persone: 2', 'persone: 3');
  github.issues = [issue(1, body2)];
  const domani = NOW.plus({ days: 1 });
  sources.obs = OBS.map((o) => ({ ...o, price: o.price - 5 }));
  await run({ github, sources, now: domani });
  assert.equal(github.comments.length, 2);
  assert.ok(github.comments[1].text.includes('3 persone'));
  assert.ok(github.comments[1].text.includes('Prezzo di oggi: 45 € a persona · 135 € in 3'));
  const [it] = (await readJson('tracking.json')).items;
  assert.deepEqual(it.series, [['2026-11-15', 55], ['2026-11-16', 45]]);
  assert.equal(it.commentedFor, trackingHash(parseTracking(body2, { today: '2026-11-16' }).tracking));
});

test('alertRef: riferimento dell’ultimo avviso nella voce', async () => {
  const github = fakeGitHub([issue(1)]);
  const fetchImpl = fakeTelegram();
  await run({ github, sources: fakeSources(), env: TG_ENV, alertDeps: { fetchImpl } });
  assert.equal(fetchImpl.sent.length, 1);
  assert.equal((await readJson('tracking.json')).items[0].alertRef, 55);
  // senza canali: nessun avviso, nessun riferimento
  await rm(join(dir, 'alerts_state_tracking.json'));
  await run({ github, sources: fakeSources() });
  assert.equal((await readJson('tracking.json')).items[0].alertRef, null);
});

test('airports.json rifatto solo se non è di oggi', async () => {
  const github = fakeGitHub([]);
  const sources = fakeSources();
  await run({ github, sources });
  assert.equal(sources.airportCalls, 1);
  let file = await readJson('airports.json');
  assert.equal(file.generatedAt, NOW.toUTC().toISO());
  assert.deepEqual(file.airports, AIRPORTS);

  await run({ github, sources, now: NOW.plus({ hours: 2 }) });
  assert.equal(sources.airportCalls, 1);

  // file di ieri (data di Roma) → rifatto
  await writeFile(join(dir, 'airports.json'), JSON.stringify({ generatedAt: '2026-11-14T22:30:00Z', airports: [] }));
  await run({ github, sources });
  assert.equal(sources.airportCalls, 2);
  assert.deepEqual((await readJson('airports.json')).airports, AIRPORTS);

  // fonte in errore → file vecchio conservato
  await writeFile(join(dir, 'airports.json'), JSON.stringify({ generatedAt: '2026-11-10T10:00:00Z', airports: [AIRPORTS[1]] }));
  sources.airportList = new Error('giù');
  await run({ github, sources });
  assert.deepEqual(await readJson('airports.json'), { generatedAt: '2026-11-10T10:00:00Z', airports: [AIRPORTS[1]] });
});

test('elenco issue non scaricabile: uscita 1, tracking.json non toccato', async () => {
  const github = fakeGitHub([]);
  github.fail = true;
  assert.equal(await run({ github, sources: fakeSources() }), 1);
  assert.equal(existsSync(join(dir, 'tracking.json')), false);
  await writeFile(join(dir, 'tracking.json'), '{"vecchio":true}');
  assert.equal(await run({ github, sources: fakeSources() }), 1);
  assert.equal(await readFile(join(dir, 'tracking.json'), 'utf8'), '{"vecchio":true}');
});

// --- github.js ---

function fakeFetch(responses) {
  const f = async (url, init = {}) => {
    f.calls.push({ url, init });
    const r = responses.shift() ?? { status: 200, body: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  f.calls = [];
  return f;
}

test('github: elenco issue con intestazioni, senza pull request', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: [issue(1), { ...issue(2), pull_request: {} }] }]);
  const gh = createGitHub({ repo: 'WaxenPie679/voli-weekend', token: 'tok', fetchImpl });
  const list = await gh.listTrackingIssues();
  assert.deepEqual(list.map((i) => i.number), [1]);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://api.github.com/repos/WaxenPie679/voli-weekend/issues?state=open&labels=tracking&per_page=100');
  assert.equal(init.headers.Authorization, 'Bearer tok');
  assert.equal(init.headers.Accept, 'application/vnd.github+json');
  assert.equal(init.headers['User-Agent'], 'voli-weekend');
  assert.equal(init.headers['X-GitHub-Api-Version'], '2022-11-28');
});

test('github: errore HTTP → eccezione con lo stato', async () => {
  const gh = createGitHub({ repo: 'a/b', token: 't', fetchImpl: fakeFetch([{ status: 500, body: {} }]) });
  await assert.rejects(gh.listTrackingIssues(), /500/);
});

test('github: close commenta e poi chiude; ensureLabel ignora 422', async () => {
  const fetchImpl = fakeFetch([{ status: 201 }, { status: 200 }, { status: 422, body: { message: 'already_exists' } }]);
  const gh = createGitHub({ repo: 'a/b', token: 't', fetchImpl });
  await gh.close(7, 'fine');
  assert.equal(fetchImpl.calls[0].url, 'https://api.github.com/repos/a/b/issues/7/comments');
  assert.equal(fetchImpl.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { body: 'fine' });
  assert.equal(fetchImpl.calls[1].url, 'https://api.github.com/repos/a/b/issues/7');
  assert.equal(fetchImpl.calls[1].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(fetchImpl.calls[1].init.body), { state: 'closed' });
  await gh.ensureLabel();
  assert.equal(fetchImpl.calls[2].url, 'https://api.github.com/repos/a/b/labels');
  assert.equal(JSON.parse(fetchImpl.calls[2].init.body).name, 'tracking');
});
