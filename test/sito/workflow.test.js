import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yml = readFileSync(new URL('../../.github/workflows/sito.yml', import.meta.url), 'utf8');

// Il passo che inizia con «- name: <nome>», fino al passo successivo.
function passo(nome) {
  const inizio = yml.indexOf(`- name: ${nome}`);
  assert.ok(inizio >= 0, nome);
  const dopo = yml.indexOf('\n      - ', inizio + 1);
  return yml.slice(inizio, dopo < 0 ? undefined : dopo);
}

test('workflow sito: i segreti Cloudflare solo nei passi che li usano', () => {
  const primaDeiPassi = yml.slice(0, yml.indexOf('    steps:'));
  assert.doesNotMatch(primaDeiPassi, /secrets\./, 'niente segreti a livello di lavoro');
  const conSegreti = yml.split('\n      - ').filter(p => p.includes('secrets.'));
  assert.equal(conSegreti.length, 2, 'solo il controllo e la pubblicazione');
  assert.match(passo('Controllo segreti Cloudflare'), /id: segreti/);
  assert.match(passo('Controllo segreti Cloudflare'), /\[ -n "\$T" \] && \[ -n "\$A" \]/);
  assert.match(passo('Pubblica su Cloudflare Pages'), /steps\.segreti\.outputs\.presenti == 'true'/);
  assert.match(passo('Avviso, segreti Cloudflare mancanti'), /steps\.segreti\.outputs\.presenti != 'true'/);
});

test('workflow sito: wrangler a versione esatta', () => {
  assert.match(passo('Pubblica su Cloudflare Pages'), /npx --yes wrangler@\d+\.\d+\.\d+ pages deploy/);
});

test('workflow sito: si pubblica anche quando cambiano le functions del contatore', () => {
  assert.match(yml, /paths: \[[^\]]*'functions\/\*\*'/);
});
