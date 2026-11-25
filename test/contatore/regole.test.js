import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTI, PERCORSI, leggiEvento, ambiente, origineAmmessa, giornoRoma } from '../../functions/_lib/regole.js';

test('gli eventi sono i 13 del progetto', () => {
  assert.deepEqual([...EVENTI].sort(), [
    'canale', 'compagnia', 'email', 'filtro', 'ingresso', 'kiwi', 'pagina',
    'premium-annuale', 'premium-avvisami', 'premium-lucchetto', 'premium-mensile', 'premium-menu', 'premium-passa',
  ]);
  assert.ok(PERCORSI.includes('/roma/'));
});

test('leggiEvento accetta text/plain di sendBeacon', () => {
  assert.deepEqual(leggiEvento('{"e":"kiwi","p":"/roma/"}', 'text/plain;charset=UTF-8'), { e: 'kiwi', p: '/roma/' });
});

test('leggiEvento accetta application/json e rifiuta altri tipi', () => {
  assert.ok(leggiEvento('{"e":"kiwi","p":"/"}', 'application/json'));
  assert.equal(leggiEvento('{"e":"kiwi","p":"/"}', 'multipart/form-data'), null);
  assert.equal(leggiEvento('{"e":"kiwi","p":"/"}', null), null);
});

test('leggiEvento: evento sconosciuto, JSON rotto, non oggetto o corpo oltre 200 byte → null', () => {
  assert.equal(leggiEvento('{"e":"hack","p":"/"}', 'text/plain'), null);
  assert.equal(leggiEvento('{non json', 'text/plain'), null);
  assert.equal(leggiEvento('null', 'text/plain'), null);
  assert.equal(leggiEvento('{"e":"kiwi","p":5}', 'text/plain'), null);
  assert.equal(leggiEvento(JSON.stringify({ e: 'kiwi', p: '/' + 'x'.repeat(200) }), 'text/plain'), null);
});

test('leggiEvento: percorso pulito o «altro»', () => {
  assert.equal(leggiEvento('{"e":"pagina","p":"/roma/?volo=x#a"}', 'text/plain').p, '/roma/');
  assert.equal(leggiEvento('{"e":"pagina","p":"/roma/#a"}', 'text/plain').p, '/roma/');
  assert.equal(leggiEvento('{"e":"pagina","p":"/pippo"}', 'text/plain').p, 'altro');
});

test('ambiente: vero solo su dovaivoli.it e www', () => {
  assert.equal(ambiente('dovaivoli.it'), 'vero');
  assert.equal(ambiente('www.dovaivoli.it'), 'vero');
  assert.equal(ambiente('prova.dovai.pages.dev'), 'prova');
  assert.equal(ambiente('dovai.pages.dev'), 'prova');
});

test('origineAmmessa: sito, www e anteprime; il resto no', () => {
  assert.ok(origineAmmessa('https://dovaivoli.it', null));
  assert.ok(origineAmmessa(null, 'https://www.dovaivoli.it/roma/'));
  assert.ok(origineAmmessa('https://prova.dovai.pages.dev', null));
  assert.ok(origineAmmessa('https://a1b2c3.dovai.pages.dev', null));
  assert.ok(origineAmmessa('https://dovai.pages.dev', null));
  assert.equal(origineAmmessa('https://dovaivoli.it.evil.com', null), false);
  assert.equal(origineAmmessa('https://evildovai.pages.dev', null), false);
  assert.equal(origineAmmessa('http://dovaivoli.it', null), false);
  assert.equal(origineAmmessa('null', null), false);
  assert.equal(origineAmmessa(null, null), false);
});

test("giornoRoma usa l'ora italiana", () => {
  assert.equal(giornoRoma(new Date('2026-11-25T23:30:00Z')), '2026-11-26');
  assert.equal(giornoRoma(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
});
