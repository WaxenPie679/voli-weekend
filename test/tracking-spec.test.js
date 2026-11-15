import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTracking, formatBody, describeTracking, trackingHash, bodyHash } from '../src/tracking/spec.js';

const NOMI = { DBV: 'Dubrovnik' };
const OGGI = { today: '2026-11-15' };
const BODY_FINESTRA = `da: BRI
a: DBV
tipo: andata e ritorno
date: finestra
mesi: 2027-07, 2027-08
giorni: gio, ven
notti: 5-7
persone: 6
nome: Dubrovnik con gli amici`;
const T = { from: 'BRI', to: 'DBV', roundTrip: true, mode: 'finestra', months: ['2027-07', '2027-08'], weekdays: [4, 5], nights: [5, 7], people: 6, name: 'Dubrovnik con gli amici' };
const T_PRECISE = { from: 'BRI', to: 'DBV', roundTrip: true, mode: 'precise', out: '2027-07-08', back: '2027-07-15', people: 6, name: 'Ponte' };

test('finestra completa', () => {
  const { tracking, errors } = parseTracking(BODY_FINESTRA, OGGI);
  assert.deepEqual(errors, []);
  assert.deepEqual(tracking, T);
});

test('date precise solo andata, persone predefinite 1', () => {
  const { tracking } = parseTracking('da: bri\na: dbv\ntipo: solo andata\ndate: precise\nandata: 2027-07-08', OGGI);
  assert.equal(tracking.people, 1);
  assert.equal(tracking.roundTrip, false);
  assert.equal(tracking.out, '2027-07-08');
  assert.equal(tracking.from, 'BRI');
});

test('scrittura libera: «Giovedì, Venerdi», «notti: 7», «tutti»', () => {
  const base = '  DA :  bri \nA: dbv\nTIPO: Andata e Ritorno\nDate: FINESTRA\nmesi: 2027-07\nriga sconosciuta: boh\n';
  const a = parseTracking(base + 'giorni: Giovedì, Venerdi\nnotti: 7', OGGI);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.tracking.weekdays, [4, 5]);
  assert.deepEqual(a.tracking.nights, [7, 7]);
  const b = parseTracking(base + 'giorni: tutti\nnotti: 3 – 5', OGGI);
  assert.deepEqual(b.tracking.weekdays, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(b.tracking.nights, [3, 5]);
  const c = parseTracking(base + 'giorni: Lunedì Sabato domenica\nnotti: 2', OGGI);
  assert.deepEqual(c.tracking.weekdays, [1, 6, 7]);
});

test('errori in italiano', () => {
  const r = parseTracking('da: BRI\ndate: precise\nandata: 2026-10-01\npersone: 12', OGGI);
  assert.equal(r.tracking, null);
  assert.ok(r.errors.some((e) => e.includes('«a»')));
  assert.ok(r.errors.some((e) => e.includes('già passata')));
  assert.ok(r.errors.some((e) => e.includes('da 1 a 9')));
});

test('valori sconosciuti: mese, giorno, tipo, date', () => {
  const r = parseTracking('da: BRI\na: DBV\ndate: finestra\nmesi: 2027-13, luglio\ngiorni: gio, pippo\nnotti: abc', OGGI);
  assert.equal(r.tracking, null);
  assert.ok(r.errors.some((e) => e.includes('«mesi»') && e.includes('2027-13')));
  assert.ok(r.errors.some((e) => e.includes('«mesi»') && e.includes('luglio')));
  assert.ok(r.errors.some((e) => e.includes('«giorni»') && e.includes('pippo')));
  assert.ok(r.errors.some((e) => e.includes('«notti»')));
  const s = parseTracking('da: BRI\na: DBV\ntipo: boh', OGGI);
  assert.ok(s.errors.some((e) => e.includes('«tipo»') && e.includes('boh')));
  const d = parseTracking('da: BR\na: DBV', OGGI);
  assert.ok(d.errors.some((e) => e.includes('«da»')));
});

test('ritorno prima dell’andata e notti min > max sono errori', () => {
  const r = parseTracking('da: BRI\na: DBV\ndate: precise\nandata: 2027-07-15\nritorno: 2027-07-08', OGGI);
  assert.equal(r.tracking, null);
  assert.ok(r.errors.some((e) => e.includes('«ritorno»') && e.includes('prima')));
  const n = parseTracking('da: BRI\na: DBV\ndate: finestra\nmesi: 2027-07\ngiorni: gio\nnotti: 7-5', OGGI);
  assert.equal(n.tracking, null);
  assert.ok(n.errors.some((e) => e.includes('«notti»')));
});

test('finestra con mesi tutti passati è un errore; mese corrente ammesso', () => {
  const base = 'da: BRI\na: DBV\ndate: finestra\ngiorni: gio\nnotti: 3\n';
  const passati = parseTracking(base + 'mesi: 2026-09, 2026-10', OGGI);
  assert.equal(passati.tracking, null);
  assert.ok(passati.errors.some((e) => e.includes('«mesi»') && e.includes('già passat')));
  const corrente = parseTracking(base + 'mesi: 2026-11', OGGI);
  assert.deepEqual(corrente.errors, []);
  assert.deepEqual(corrente.tracking.months, ['2026-11']);
});

test('mancano date/giorni/notti: errori che nominano il campo', () => {
  const r = parseTracking('da: BRI\na: DBV', OGGI);
  assert.equal(r.tracking, null);
  assert.ok(r.errors.some((e) => e.includes('«mesi»')));
  assert.ok(r.errors.some((e) => e.includes('«giorni»')));
  assert.ok(r.errors.some((e) => e.includes('«notti»')));
  const p = parseTracking('da: BRI\na: DBV\ndate: precise', OGGI);
  assert.ok(p.errors.some((e) => e.includes('«andata»')));
  assert.ok(p.errors.some((e) => e.includes('«ritorno»')));
});

test('formatBody → parseTracking restituisce lo stesso tracking', () => {
  for (const t of [T, T_PRECISE, { ...T_PRECISE, roundTrip: false, back: undefined, people: 1, name: '' }, { ...T, roundTrip: false, nights: undefined, weekdays: [1, 2, 3, 4, 5, 6, 7] }]) {
    const pulito = JSON.parse(JSON.stringify(t));
    const r = parseTracking(formatBody(pulito), OGGI);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.tracking, pulito);
  }
});

test('describeTracking', () => {
  assert.equal(describeTracking(T, NOMI), 'Bari → Dubrovnik e ritorno · luglio, agosto 2027 · gio, ven · 5–7 notti · 6 persone');
  assert.equal(describeTracking({ ...T, months: ['2026-12', '2027-01'], nights: [7, 7], people: 1 }, NOMI), 'Bari → Dubrovnik e ritorno · dicembre 2026, gennaio 2027 · gio, ven · 7 notti · 1 persona');
  assert.equal(describeTracking(T_PRECISE, NOMI), 'Bari → Dubrovnik e ritorno · 8 lug → 15 lug 2027 · 6 persone');
  assert.equal(describeTracking({ ...T_PRECISE, roundTrip: false, back: undefined, to: 'XYZ', from: 'BDS', people: 1 }), 'Brindisi → XYZ · 8 lug 2027 · 1 persona');
});

test('describeTracking: codice sconosciuto resta il codice', () => {
  assert.equal(describeTracking({ ...T_PRECISE, roundTrip: false, back: undefined, people: 1 }), 'Bari → DBV · 8 lug 2027 · 1 persona');
});

test('commenti «# ...» a fine riga ignorati', () => {
  const r = parseTracking('da: BRI   # partenza\na: DBV # arrivo\ndate: precise # esatte\nandata: 2027-07-08\nritorno: 2027-07-15\nnome: Gara#1', OGGI);
  assert.deepEqual(r.errors, []);
  assert.equal(r.tracking.from, 'BRI');
  assert.equal(r.tracking.name, 'Gara#1');
});

test('trackingHash cambia se cambiano le persone, non se cambia l’ordine delle righe', () => {
  assert.notEqual(trackingHash(T), trackingHash({ ...T, people: 5 }));
  const { tracking: a } = parseTracking(BODY_FINESTRA, OGGI);
  const righe = BODY_FINESTRA.split('\n').reverse().join('\n');
  const { tracking: b } = parseTracking(righe, OGGI);
  assert.equal(trackingHash(a), trackingHash(b));
  assert.equal(trackingHash(T), trackingHash({ name: T.name, people: 6, nights: [5, 7], weekdays: [4, 5], months: ['2027-07', '2027-08'], mode: 'finestra', roundTrip: true, to: 'DBV', from: 'BRI' }));
});

test('bodyHash ignora spazi e maiuscole, cambia se cambia il contenuto', () => {
  assert.equal(bodyHash('Da: BRI\n\nA:  DBV '), bodyHash('da:   bri\r\na: dbv'));
  assert.notEqual(bodyHash('da: BRI'), bodyHash('da: BDS'));
  assert.equal(typeof bodyHash(''), 'string');
});
