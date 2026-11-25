import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TITOLARE, titolareCompleto, testoTitolare } from '../../sito/titolare.js';

const SEGNAPOSTO = '[Nome e cognome], [città]';

test('TITOLARE è Titolare DoVai, Brindisi', () => {
  assert.deepEqual(TITOLARE, { nome: 'Titolare DoVai', citta: 'Brindisi' });
});

test('titolareCompleto è false se nome o città sono vuoti', () => {
    assert.equal(titolareCompleto({ nome: 'Bruno Rossi', citta: '' }), false);
  assert.equal(titolareCompleto({ nome: '', citta: 'Bari' }), false);
});

test('titolareCompleto tratta uno spazio vuoto come vuoto', () => {
  assert.equal(titolareCompleto({ nome: '   ', citta: 'Bari' }), false);
  assert.equal(titolareCompleto({ nome: 'Bruno Rossi', citta: '\t\n' }), false);
});

test('titolareCompleto è true quando entrambi i campi hanno testo', () => {
  assert.equal(titolareCompleto({ nome: 'Bruno Rossi', citta: 'Bari' }), true);
});

test('testoTitolare con dati vuoti dà il segnaposto', () => {
  assert.equal(testoTitolare({ nome: '', citta: '' }), SEGNAPOSTO);
  assert.equal(testoTitolare({ nome: '  ', citta: 'Bari' }), SEGNAPOSTO);
});

test('testoTitolare con dati pieni dà nome e città', () => {
  assert.equal(testoTitolare({ nome: 'Bruno Rossi', citta: 'Bari' }), 'Bruno Rossi, Bari');
});

test('testoTitolare toglie gli spazi ai bordi', () => {
  assert.equal(testoTitolare({ nome: ' Bruno Rossi ', citta: ' Bari ' }), 'Bruno Rossi, Bari');
});
