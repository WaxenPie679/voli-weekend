import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giornoBreve, ora, permanenza, visto, prezzo, chiaveVolo, linkKiwi, normalizza } from '../../sito/statico/js/formati.js';

const volo = { o: 'BRI', d: 'CDG', va: ['2026-12-12T18:40', '2026-12-12T21:10'], ri: ['2026-12-14T07:00', '2026-12-14T09:30'] };

test('giornoBreve e ora lavorano sulla stringa locale', () => {
  assert.equal(giornoBreve('2026-12-12T18:40'), 'sab 12 dic');
  assert.equal(giornoBreve('2026-12-13T00:05'), 'dom 13 dic');
  assert.equal(ora('2026-12-12T18:40'), '18:40');
});

test('permanenza: giorni e ore, singolari, sotto le 24 ore', () => {
  assert.equal(permanenza(1500, 'Parigi'), '1 giorno e 1 ora a Parigi');
  assert.equal(permanenza(1320, 'Tirana'), '22 ore a Tirana');
  assert.equal(permanenza(2880, 'Parigi'), '2 giorni a Parigi');
  assert.equal(permanenza(2820, 'Lisbona'), '1 giorno e 23 ore a Lisbona');
  assert.equal(permanenza(60, 'Roma'), '1 ora a Roma');
  assert.equal(permanenza(2940, 'Parigi'), '2 giorni e 1 ora a Parigi');
});

test('visto: oggi, ieri e oltre, sempre in ora di Roma', () => {
  assert.equal(visto('2026-11-25T08:30:00Z', new Date('2026-11-25T12:00:00Z')), 'visto alle 9:30');
  assert.equal(visto('2026-11-24T21:10:00Z', new Date('2026-11-25T08:00:00Z')), 'visto ieri alle 22:10');
  assert.equal(visto('2026-11-24T23:30:00Z', new Date('2026-11-25T08:00:00Z')), 'visto alle 0:30');
  assert.equal(visto('2026-11-22T08:30:00Z', new Date('2026-11-25T08:00:00Z')), 'visto il 22 nov alle 9:30');
});

test('visto: ora legale (estate) e cambio mese', () => {
  assert.equal(visto('2026-07-10T07:05:00Z', new Date('2026-07-10T10:00:00Z')), 'visto alle 9:05');
  assert.equal(visto('2026-10-31T10:00:00Z', new Date('2026-11-01T10:00:00Z')), 'visto ieri alle 11:00');
});

test('prezzo', () => {
  assert.equal(prezzo(69), '69 € a/r');
});

test('chiaveVolo è minuscola e senza separatori nell\'ora', () => {
  assert.equal(chiaveVolo(volo), 'bri-cdg-2026-12-12-1840');
});

test('linkKiwi con e senza affiliato', () => {
  const base = 'https://www.kiwi.com/it/search/results/BRI/CDG/2026-12-12/2026-12-14?adults=1';
  assert.equal(linkKiwi(volo), base);
  assert.ok(!linkKiwi(volo).includes('affilid'));
  assert.equal(linkKiwi(volo, 'abc'), base + '&affilid=abc');
});

test('normalizza toglie accenti e maiuscole', () => {
  assert.equal(normalizza('Málaga'), 'malaga');
  assert.equal(normalizza('LISBONA'), 'lisbona');
});
