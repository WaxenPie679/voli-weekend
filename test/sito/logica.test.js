import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiFiltri, scriviFiltri, filtra, riepilogo, mesiDeiVoli, filtriPerVolo } from '../../sito/statico/js/logica.js';

const BACINI = [
  { slug: 'puglia', nome: 'Puglia', aeroporti: ['BRI', 'BDS'] },
  { slug: 'milano-bergamo', nome: 'Milano e Bergamo', aeroporti: ['MXP', 'BGY'] },
  { slug: 'roma', nome: 'Roma', aeroporti: ['FCO', 'CIA'] },
];

const INIZIALI = { da: 'tutti', mese: 'tre', max: 100, resta: 0, a: '' };

const volo = (k, o, citta, p, w, resta = 2000) => ({ k, o, d: 'XXX', citta, p, w, resta, va: [`${w}T18:00`, `${w}T20:00`], ri: [] });

const VOLI = [
  volo('a', 'BRI', 'Málaga', 80, '2026-12-11'),
  volo('b', 'BDS', 'Lisbona', 45, '2026-11-27', 1500),
  volo('c', 'MXP', 'Parigi', 60, '2027-01-08', 3000),
  volo('d', 'FCO', 'Parigi', 150, '2026-12-04'),
  volo('e', 'BGY', 'Malta', 30, '2026-12-18'),
];

const OPZIONI = { bacini: BACINI, mesi: mesiDeiVoli(VOLI) };

test('leggiFiltri: indirizzi strani tornano ai valori iniziali', () => {
  assert.deepEqual(leggiFiltri(new URLSearchParams('max=abc&da=napoli&mese=2030-01')), INIZIALI);
  assert.deepEqual(leggiFiltri(new URLSearchParams('max=abc&da=napoli&mese=2030-01&resta=9'), OPZIONI), INIZIALI);
  assert.deepEqual(leggiFiltri(new URLSearchParams('')), INIZIALI);
});

test('leggiFiltri: sulla pagina di un bacino si parte da lì', () => {
  assert.equal(leggiFiltri(new URLSearchParams(''), { ...OPZIONI, bacino: 'roma' }).da, 'roma');
  assert.equal(leggiFiltri(new URLSearchParams('da=napoli'), { ...OPZIONI, bacino: 'roma' }).da, 'roma');
  assert.equal(leggiFiltri(new URLSearchParams('da=tutti'), { ...OPZIONI, bacino: 'roma' }).da, 'tutti');
});

test('leggiFiltri: da accetta un bacino o un aeroporto, maiuscole o minuscole', () => {
  assert.equal(leggiFiltri(new URLSearchParams('da=Puglia'), OPZIONI).da, 'puglia');
  assert.equal(leggiFiltri(new URLSearchParams('da=bri'), OPZIONI).da, 'BRI');
  assert.equal(leggiFiltri(new URLSearchParams('da=LIN'), OPZIONI).da, 'tutti');
});

test('leggiFiltri: mese solo tra quelli liberi, altrimenti i prossimi 3 mesi', () => {
  assert.equal(leggiFiltri(new URLSearchParams('mese=2026-12'), OPZIONI).mese, '2026-12');
  assert.equal(leggiFiltri(new URLSearchParams('mese=2027-03'), OPZIONI).mese, 'tre');
  assert.equal(leggiFiltri(new URLSearchParams('mese=dicembre'), OPZIONI).mese, 'tre');
});

test('leggiFiltri: prezzo tra 30 e 400, resta da 0 a 3, destinazione normalizzata', () => {
  assert.equal(leggiFiltri(new URLSearchParams('max=20')).max, 30);
  assert.equal(leggiFiltri(new URLSearchParams('max=999')).max, 400);
  assert.equal(leggiFiltri(new URLSearchParams('max=150')).max, 150);
  assert.equal(leggiFiltri(new URLSearchParams('max=1e2')).max, 100);
  assert.equal(leggiFiltri(new URLSearchParams('resta=2')).resta, 2);
  assert.equal(leggiFiltri(new URLSearchParams('resta=-1')).resta, 0);
  assert.equal(leggiFiltri(new URLSearchParams('a=%20M%C3%A1laga%20')).a, 'malaga');
});

test('scriviFiltri: niente per i valori iniziali, solo quello che cambia', () => {
  assert.equal(scriviFiltri(INIZIALI), '');
  assert.equal(scriviFiltri({ ...INIZIALI, da: 'roma' }, { bacino: 'roma' }), '');
  assert.equal(scriviFiltri({ ...INIZIALI, da: 'tutti' }, { bacino: 'roma' }), 'da=tutti');
  assert.equal(scriviFiltri({ ...INIZIALI, max: 150, a: 'parigi' }), 'max=150&a=parigi');
  const filtri = { da: 'BRI', mese: '2026-12', max: 200, resta: 1, a: 'malaga' };
  assert.deepEqual(leggiFiltri(new URLSearchParams(scriviFiltri(filtri)), OPZIONI), filtri);
});

test('filtra: «malaga» trova Málaga, «LISBONA» trova Lisbona', () => {
  assert.deepEqual(filtra(VOLI, { ...INIZIALI, a: 'malaga' }, BACINI).map(v => v.k), ['a']);
  const a = leggiFiltri(new URLSearchParams('a=LISBONA')).a;
  assert.deepEqual(filtra(VOLI, { ...INIZIALI, a }, BACINI).map(v => v.k), ['b']);
});

test('filtra: resta 2 esclude un volo da 1500 minuti', () => {
  const k = filtra(VOLI, { ...INIZIALI, resta: 2 }, BACINI).map(v => v.k);
  assert.ok(!k.includes('b'));
  assert.deepEqual(k, ['c']);
});

test('filtra: un volo senza resta conta come 0 minuti', () => {
  const senza = { ...VOLI[0], k: 'z', resta: undefined };
  assert.deepEqual(filtra([senza], INIZIALI, BACINI).map(v => v.k), ['z']);
  assert.deepEqual(filtra([senza], { ...INIZIALI, resta: 1 }, BACINI), []);
  assert.equal(filtriPerVolo({ ...INIZIALI, resta: 1 }, senza, { bacini: BACINI }).resta, 0);
});

test('filtra: prezzo, bacino, aeroporto e mese; dal più economico', () => {
  assert.deepEqual(filtra(VOLI, INIZIALI, BACINI).map(v => v.k), ['e', 'b', 'c', 'a']);
  assert.deepEqual(filtra(VOLI, { ...INIZIALI, da: 'puglia' }, BACINI).map(v => v.k), ['b', 'a']);
  assert.deepEqual(filtra(VOLI, { ...INIZIALI, da: 'MXP' }, BACINI).map(v => v.k), ['c']);
  assert.deepEqual(filtra(VOLI, { ...INIZIALI, mese: '2026-12', max: 400 }, BACINI).map(v => v.k), ['e', 'a', 'd']);
});

test('riepilogo: singolare, plurale, da dove', () => {
  assert.equal(riepilogo(1, INIZIALI), '1 volo da tutti gli aeroporti, Weekend, fino a 100 € a/r');
  assert.equal(riepilogo(42, { ...INIZIALI, da: 'puglia' }, { puglia: 'Puglia' }), '42 voli da Puglia, Weekend, fino a 100 € a/r');
  assert.equal(riepilogo(0, { ...INIZIALI, da: 'MXP', max: 150 }, { MXP: 'Malpensa' }), '0 voli da Malpensa, Weekend, fino a 150 € a/r');
});

test('mesiDeiVoli: mesi dei weekend, in ordine e senza doppioni', () => {
  assert.deepEqual(mesiDeiVoli(VOLI), ['2026-11', '2026-12', '2027-01']);
});

test('le costanti del browser coincidono con config.js', async () => {
  const config = await import('../../sito/config.js');
  const logica = await import('../../sito/statico/js/logica.js');
  for (const nome of ['PREZZO_MIN', 'PREZZO_MAX', 'PREZZO_INIZIALE', 'BLOCCO']) assert.equal(logica[nome], config[nome], nome);
});

test('filtriPerVolo: allarga solo quello che esclude il volo', () => {
  const caro = VOLI[3]; // FCO, Parigi, 150 €, dicembre
  assert.deepEqual(filtriPerVolo(INIZIALI, caro, { bacini: BACINI }), { ...INIZIALI, max: 150 });
  assert.deepEqual(filtriPerVolo({ ...INIZIALI, max: 100.5 }, { ...caro, p: 120.2 }, { bacini: BACINI }).max, 121);
  const stretti = { da: 'puglia', mese: '2027-01', max: 30, resta: 3, a: 'lisbona' };
  assert.deepEqual(filtriPerVolo(stretti, caro, { bacini: BACINI }), { da: 'tutti', mese: 'tre', max: 150, resta: 0, a: '' });
  assert.equal(filtriPerVolo({ ...INIZIALI, da: 'CIA' }, caro, { bacino: 'roma', bacini: BACINI }).da, 'roma');
  assert.equal(filtriPerVolo({ ...INIZIALI, da: 'puglia' }, caro, { bacino: 'puglia', bacini: BACINI }).da, 'tutti');
  const largo = { da: 'roma', mese: '2026-12', max: 200, resta: 1, a: 'par' };
  assert.deepEqual(filtriPerVolo(largo, caro, { bacini: BACINI }), largo);
  assert.equal(filtriPerVolo(INIZIALI, { ...caro, p: 999 }, { bacini: BACINI }).max, 400);
  assert.deepEqual(filtra([caro], filtriPerVolo({ ...stretti, da: 'MXP' }, caro, { bacini: BACINI }), BACINI), [caro]);
});
