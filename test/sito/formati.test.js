import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giornoBreve, ora, permanenza, visto, prezzo, chiaveVolo, linkKiwi, normalizza, oraDiRoma } from '../../sito/statico/js/formati.js';

const volo = { o: 'BRI', d: 'CDG', citta: 'Parigi', paese: 'Francia', va: ['2026-12-12T18:40', '2026-12-12T21:10'], ri: ['2026-12-14T07:00', '2026-12-14T09:30'] };

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

test('visto: orologio sfasato (nel futuro) conta come oggi', () => {
  assert.equal(visto('2026-11-26T10:00:00Z', new Date('2026-11-25T12:00:00Z')), 'visto alle 11:00');
});

test('visto: data non valida dà testo vuoto', () => {
  assert.equal(visto('boh', new Date('2026-11-25T12:00:00Z')), '');
  assert.equal(visto(undefined, new Date('2026-11-25T12:00:00Z')), '');
});

test('prezzo', () => {
  assert.equal(prezzo(69), '69 € a/r');
});

test('chiaveVolo: andata e ritorno, minuscola e senza separatori nell\'ora', () => {
  assert.equal(chiaveVolo(volo), 'bri-cdg-2026-12-12-1840-2026-12-14-0700');
  // Stessa andata, ritorno diverso: chiave diversa.
  const altroRitorno = { ...volo, ri: ['2026-12-14T21:35', '2026-12-14T23:55'] };
  assert.equal(chiaveVolo(altroRitorno), 'bri-cdg-2026-12-12-1840-2026-12-14-2135');
  assert.match(chiaveVolo(altroRitorno), /^[a-z0-9-]+$/);
});

test('linkKiwi con e senza affiliato: città e paese, non i codici', () => {
  const base = 'https://www.kiwi.com/it/search/results/bari-italia/parigi-francia/2026-12-12/2026-12-14?adults=1';
  assert.equal(linkKiwi(volo), base);
  assert.ok(!linkKiwi(volo).includes('affilid'));
  assert.equal(linkKiwi(volo, 'abc'), base + '&affilid=abc');
});

test('linkKiwi: accenti, spazi e apostrofi diventano trattini', () => {
  const su = (o, citta, paese) => linkKiwi({ ...volo, o, citta, paese }).split('/').slice(6, 8).join('/');
  assert.equal(su('FCO', 'Málaga', 'Spagna'), 'roma-italia/malaga-spagna');
  assert.equal(su('BGY', 'Reggio Calabria', 'Italia'), 'bergamo-italia/reggio-calabria-italia');
  assert.equal(su('MXP', 'Londra', 'Regno Unito'), 'milano-italia/londra-regno-unito');
  assert.equal(su('CIA', "L'Aquila", 'Italia'), 'roma-italia/l-aquila-italia');
  assert.equal(su('BDS', 'Kraków', 'Polonia'), 'brindisi-italia/krakow-polonia');
});

test('normalizza toglie accenti e maiuscole', () => {
  assert.equal(normalizza('Málaga'), 'malaga');
  assert.equal(normalizza('LISBONA'), 'lisbona');
});

test('oraDiRoma: come gli orari dei voli, con ora solare e legale', () => {
  assert.equal(oraDiRoma(new Date('2026-12-12T17:40:00Z')), '2026-12-12T18:40');
  assert.equal(oraDiRoma(new Date('2026-07-10T22:05:00Z')), '2026-07-11T00:05');
  assert.equal(oraDiRoma(new Date('2027-01-01T08:03:00Z')), '2027-01-01T09:03');
});

test('giorniWeekend: stesso mese o a cavallo di due', async () => {
  const { giorniWeekend } = await import('../../sito/statico/js/formati.js');
  assert.equal(giorniWeekend('2027-01-16T08:30', '2027-01-17T10:15'), '16–17 gen');
  assert.equal(giorniWeekend('2027-01-30T08:30', '2027-02-01T10:15'), '30 gen–1 feb');
});

test('lineaWeekend: da venerdì a mezzanotte dopo il ritorno, pieno il tempo a destinazione', async () => {
  const { lineaWeekend } = await import('../../sito/statico/js/formati.js');
  const l = lineaWeekend(['2027-01-08T22:55', '2027-01-08T23:45'], ['2027-01-10T06:25', '2027-01-10T07:15']);
  assert.deepEqual(l.giorni.map(g => g.nome), ['ven', 'sab', 'dom']);
  assert.ok(Math.abs(l.da - (23.75 / 72) * 100) < 0.01);
  assert.ok(Math.abs(l.a - ((48 + 6 + 25 / 60) / 72) * 100) < 0.01);
  const sabato = lineaWeekend(['2027-01-16T08:30', '2027-01-16T09:50'], ['2027-01-17T10:15']);
  assert.equal(sabato.giorni[0].nome, 'ven', 'anche partendo sabato la linea parte dal venerdì');
});
