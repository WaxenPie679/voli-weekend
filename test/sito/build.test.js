import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, existsSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { prepara, MSG_TITOLARE } from '../../sito/build.js';
import { riduci } from '../../sito/dati.js';

const mini = JSON.parse(readFileSync(new URL('./fixtures/direct-mini.json', import.meta.url), 'utf8'));
const ADESSO = new Date(mini.generatedAt);

function cartelle() {
  const base = mkdtempSync(join(tmpdir(), 'dovai-build-'));
  const dati = join(base, 'dati');
  mkdirSync(dati);
  copyFileSync(new URL('./fixtures/direct-mini.json', import.meta.url), join(dati, 'direct.json'));
  return { dati, out: join(base, 'dist') };
}

test('prepara scrive pagine, voli.json, sitemap, robots e _headers', async () => {
  const { dati, out } = cartelle();
  const r = await prepara({ cartella: dati, out, adesso: ADESSO });
  assert.equal(r.pagine, 10);
  for (const f of ['index.html', 'puglia/index.html', 'premium/index.html', 'privacy/index.html', '404.html', 'css/sito.css', 'js/formati.js', 'caratteri/gabarito.woff2', 'img/favicon.svg'])
    assert.ok(existsSync(join(out, f)), f);
  const dati2 = JSON.parse(readFileSync(join(out, 'voli.json'), 'utf8'));
  assert.equal(dati2.generato, ADESSO.toISOString());
  assert.deepEqual(dati2.bacini.map(b => b.slug), ['puglia', 'milano-bergamo', 'roma']);
  assert.ok(dati2.voli.length > 0);
  const robots = readFileSync(join(out, 'robots.txt'), 'utf8');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/dovaivoli\.it\/sitemap\.xml/);
  assert.match(readFileSync(join(out, '_headers'), 'utf8'), /\/css\/\*\n  Cache-Control: public, max-age=3600/);
});

test('la sitemap ha solo pagine indicizzate, non i bacini senza dati', async () => {
  const { dati, out } = cartelle();
  const r = await prepara({ cartella: dati, out, adesso: ADESSO });
  const s = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  assert.match(s, /<loc>https:\/\/dovaivoli\.it\/puglia\/<\/loc>/);
  assert.doesNotMatch(s, /milano-bergamo|\/roma\/|404/);
  assert.ok(r.avvisi.some(a => a.includes('Roma')));
});

test('con titolare vuoto, --pubblica rigetta', async () => {
  const { dati, out } = cartelle();
  await assert.rejects(prepara({ cartella: dati, out, adesso: ADESSO, pubblica: true }), { message: MSG_TITOLARE });
  assert.equal(MSG_TITOLARE, 'Mancano nome e città del titolare in sito/titolare.js: il sito non si pubblica.');
});

test('senza nessun bacino con dati freschi la preparazione fallisce', async () => {
  const { dati, out } = cartelle();
  await assert.rejects(prepara({ cartella: dati, out, adesso: new Date(ADESSO.getTime() + 48 * 3600e3) }), /Nessun bacino/);
});

test('la riga di comando esce con codice 1 se mancano tutti i bacini', async () => {
  const { execFileSync } = await import('node:child_process');
  const vuota = mkdtempSync(join(tmpdir(), 'dovai-vuota-'));
  writeFileSync(join(vuota, 'x.json'), '{}');
  assert.throws(
    () => execFileSync('node', ['sito/build.js', '--data', vuota, '--out', join(vuota, 'dist')], { stdio: 'pipe' }),
    e => e.status === 1,
  );
});

test('riduci salta un itinerario malformato e lo conta', () => {
  const rotto = { origin: 'BRI', destination: { code: 'XXX', city: 'Xxx', country: 'Italia' }, price: 50, weekend: '2027-01-15', outbound: {}, inbound: {} };
  const f = { generatedAt: mini.generatedAt, itineraries: [rotto, ...mini.itineraries] };
  const { voli, scartati } = riduci({ 'direct.json': f }, { adesso: ADESSO });
  assert.equal(scartati, 1);
  assert.ok(voli.length > 0);
});

const RIFIUTO = /non è una cartella del sito: non la svuoto/;

test('prepara rifiuta una cartella piena senza marcatore e la lascia intatta', async () => {
  const { dati, out } = cartelle();
  mkdirSync(out);
  writeFileSync(join(out, 'mio.txt'), 'importante');
  await assert.rejects(prepara({ cartella: dati, out, adesso: ADESSO }), RIFIUTO);
  assert.equal(readFileSync(join(out, 'mio.txt'), 'utf8'), 'importante');
});

test('prepara rifà una cartella già preparata (marcatore) e accetta una vuota', async () => {
  const { dati, out } = cartelle();
  await prepara({ cartella: dati, out, adesso: ADESSO });
  assert.ok(existsSync(join(out, '.dovai-dist')));
  writeFileSync(join(out, 'vecchio.txt'), 'x');
  await prepara({ cartella: dati, out, adesso: ADESSO });
  assert.ok(!existsSync(join(out, 'vecchio.txt')));
  assert.doesNotMatch(readFileSync(join(out, 'sitemap.xml'), 'utf8'), /dovai-dist/);
  const vuota = join(out, '..', 'vuota');
  mkdirSync(vuota);
  await prepara({ cartella: dati, out: vuota, adesso: ADESSO });
  assert.ok(existsSync(join(vuota, 'index.html')));
});

test('prepara rifiuta radice, home, repo, cwd, antenati, maiuscole diverse e link a cartelle piene', async () => {
  const { dati, out } = cartelle();
  const piena = join(out, '..', 'piena');
  mkdirSync(piena);
  writeFileSync(join(piena, 'a.txt'), 'a');
  symlinkSync(piena, out);
  const scelte = ['/', homedir(), process.cwd(), resolve('sito'), resolve('..'), out];
  if (existsSync('/users')) scelte.push('/users');
  for (const o of scelte) await assert.rejects(prepara({ cartella: dati, out: o, adesso: ADESSO }), RIFIUTO, o);
  assert.ok(existsSync(join(piena, 'a.txt')));
});
