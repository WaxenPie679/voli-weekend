import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TITOLARE, titolareCompleto, testoTitolare, puoPubblicare } from '../../sito/titolare.js';

test('TITOLARE è vuoto finché il sito è privato', () => {
  assert.deepEqual(TITOLARE, { nome: '', citta: '' });
});

test('titolareCompleto è false se nome o città sono vuoti', () => {
  assert.equal(titolareCompleto({ nome: 'Mario Rossi', citta: '' }), false);
  assert.equal(titolareCompleto({ nome: '', citta: 'Bari' }), false);
});

test('titolareCompleto tratta uno spazio vuoto come vuoto', () => {
  assert.equal(titolareCompleto({ nome: '   ', citta: 'Bari' }), false);
  assert.equal(titolareCompleto({ nome: 'Mario Rossi', citta: '\t\n' }), false);
});

test('titolareCompleto è true quando entrambi i campi hanno testo', () => {
  assert.equal(titolareCompleto({ nome: 'Mario Rossi', citta: 'Bari' }), true);
});

test('testoTitolare con dati vuoti dà stringa vuota', () => {
  assert.equal(testoTitolare({ nome: '', citta: '' }), '');
  assert.equal(testoTitolare({ nome: '  ', citta: 'Bari' }), '');
});

test('testoTitolare con dati pieni dà nome e città, senza spazi ai bordi', () => {
  assert.equal(testoTitolare({ nome: ' Mario Rossi ', citta: ' Bari ' }), 'Mario Rossi, Bari');
});

test('puoPubblicare: privato sì sempre; pubblico solo con titolare', () => {
  assert.equal(puoPubblicare({ nome: '', citta: '' }, true), true);
  assert.equal(puoPubblicare({ nome: '', citta: '' }, false), false);
  assert.equal(puoPubblicare({ nome: 'Mario Rossi', citta: 'Bari' }, false), true);
});
