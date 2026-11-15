import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBody, parseTracking } from '../web/tracking-spec.js';
import {
  newIssueUrl, priceLine, ageText, buyAdvice, formToTracking, romeToday, departTime, comboText,
  namesMap, airportCode, nextMonths, isStale, priceNotes, updatedText,
} from '../web/seguite-view.js';

const TODAY = '2026-11-15';
const finestra = { from: 'BRI', to: 'DBV', roundTrip: true, mode: 'finestra', months: ['2027-07'], weekdays: [4, 5], nights: [5, 7], people: 6, name: 'Dubrovnik con gli amici' };

const day = (airline, date, price, time) => ({ airline, date, price, time });
const item = (over = {}) => ({
  tracking: finestra,
  best: { out: day('ryanair', '2027-07-08', 56, '06:25-07:30'), back: day('ryanair', '2027-07-15', 0, '21:10-22:15'), price: 56, nights: 7 },
  alertRef: 64,
  ...over,
});

// --- newIssueUrl ---
test('newIssueUrl: repo, etichetta tracking, titolo e corpo uguale a formatBody', () => {
  const url = new URL(newIssueUrl(finestra, { DBV: 'Dubrovnik' }));
  assert.equal(url.origin + url.pathname, 'https://github.com/WaxenPie679/voli-weekend/issues/new');
  assert.equal(url.searchParams.get('labels'), 'tracking');
  assert.equal(url.searchParams.get('title'), 'Segui: Bari → Dubrovnik e ritorno · luglio 2027 · gio, ven · 5–7 notti · 6 persone');
  assert.equal(url.searchParams.get('body'), formatBody(finestra));
  assert.match(newIssueUrl(finestra), /[?&]labels=tracking&/);
});

// --- priceLine ---
test('priceLine: 1 persona senza totale', () => {
  const p = priceLine(item({ tracking: { ...finestra, people: 1 }, alertRef: null }));
  assert.deepEqual(p, { perPerson: '56 €', total: null, drop: null });
});

test('priceLine: 6 persone con totale e ribasso dall\'ultimo avviso', () => {
  const p = priceLine(item());
  assert.equal(p.perPerson, '56 €');
  assert.equal(p.total, '336 € in 6');
  assert.equal(p.drop, '↓ 8 € dall\'ultimo avviso');
});

test('priceLine: decimali, nessun ribasso se il prezzo è pari o salito', () => {
  const best = { ...item().best, price: 49.99 };
  assert.equal(priceLine(item({ best, alertRef: 52.5 })).drop, '↓ 2,51 € dall\'ultimo avviso');
  assert.equal(priceLine(item({ best, alertRef: 52.5 })).perPerson, '49,99 €');
  assert.equal(priceLine(item({ best, alertRef: 49.99 })).drop, null);
  assert.equal(priceLine(item({ best, alertRef: 40 })).drop, null);
});

test('priceLine: senza prezzo → null', () => {
  assert.equal(priceLine(item({ best: null })), null);
});

// --- ageText / isStale ---
test('ageText: mai, ora, minuti, ore, giorni', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  assert.equal(ageText(null, now), 'mai controllato');
  assert.equal(ageText('2026-11-15T09:59:40Z', now), 'aggiornato ora');
  assert.equal(ageText('2026-11-15T09:20:00Z', now), 'aggiornato 40 min fa');
  assert.equal(ageText('2026-11-15T09:00:00Z', now), 'aggiornato 1 ora fa');
  assert.equal(ageText('2026-11-15T05:00:00Z', now), 'aggiornato 5 ore fa');
  assert.equal(ageText('2026-11-14T09:00:00Z', now), 'aggiornato 1 giorno fa');
  assert.equal(ageText('2026-11-12T09:00:00Z', now), 'aggiornato 3 giorni fa');
});

test('priceNotes: senza prezzo e con la fonte in errore si mostra solo l\'errore di fonte', () => {
  assert.deepEqual(priceNotes(item()), { noPrice: null, sourceError: null });
  assert.deepEqual(priceNotes(item({ sourceErrors: ['Ryanair: prezzi non scaricabili ora'] })), {
    noPrice: null, sourceError: 'Ultimo controllo non riuscito (Ryanair: prezzi non scaricabili ora): il prezzo mostrato è del controllo precedente.',
  });
  assert.deepEqual(priceNotes(item({ best: null })), { noPrice: 'Nessun prezzo disponibile ora: la tratta potrebbe non essere ancora in vendita.', sourceError: null });
  assert.deepEqual(priceNotes(item({ best: null, sourceErrors: ['Elenco delle tratte non scaricabile ora', 'Wizz Air: prezzi non scaricabili ora'] })), {
    noPrice: null, sourceError: 'Ultimo controllo non riuscito (Elenco delle tratte non scaricabile ora; Wizz Air: prezzi non scaricabili ora).',
  });
});

test('updatedText: solo l\'ora se è di oggi (Roma), altrimenti anche il giorno', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  assert.equal(updatedText('2026-11-15T09:20:00Z', now), 'elenco aggiornato alle 10:20');
  assert.equal(updatedText('2026-11-14T09:20:00Z', now), 'elenco aggiornato il 14 nov alle 10:20');
  // 23:30 UTC del 14 è già il 15 a Roma
  assert.equal(updatedText('2026-11-14T23:30:00Z', now), 'elenco aggiornato alle 00:30');
  assert.equal(updatedText(null, now), null);
});

test('isStale: oltre 6 ore o mai controllato', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  assert.equal(isStale('2026-11-15T05:00:00Z', now), false);
  assert.equal(isStale('2026-11-15T03:00:00Z', now), true);
  assert.equal(isStale(null, now), true);
});

// --- buyAdvice ---
const summary = (reliability, airlines) => ({ reliability, airlines });

test('buyAdvice: giorni mancanti e salita della compagnia dell\'andata, stima se non affidabile', () => {
  const s = summary('crescita', { ryanair: { rise: 6 }, wizz: { rise: 3 } });
  assert.equal(buyAdvice(item(), s, '2026-11-14'),
    'Mancano 236 giorni. Di solito il prezzo inizia a salire circa 6 settimane prima della partenza (stima: ancora nessuna estate raccolta).');
});

test('buyAdvice: affidabile senza nota di stima; ripiego su un\'altra compagnia con salita', () => {
  const s = summary('affidabile', { ryanair: { rise: null }, wizz: { rise: 1 } });
  assert.equal(buyAdvice(item(), s, '2027-07-07'),
    'Manca 1 giorno. Di solito il prezzo inizia a salire circa 1 settimana prima della partenza.');
});

test('buyAdvice: prima stima → testo di riseText senza nota di stima', () => {
  const s = summary('prima', { ryanair: { rise: null } });
  assert.equal(buyAdvice(item(), s, '2027-07-08'), 'Si parte oggi. Ancora pochi dati per dire quando sale: servono circa 4 settimane.');
});

test('buyAdvice: senza riepilogo → storico in costruzione', () => {
  assert.equal(buyAdvice(item(), null, '2026-11-14'), 'Mancano 236 giorni. Storico in costruzione da quando l\'hai aggiunta.');
  assert.equal(buyAdvice(item({ best: null }), null, TODAY), 'Storico in costruzione da quando l\'hai aggiunta.');
});

test('buyAdvice: nessuna salita chiara', () => {
  const s = summary('crescita', { ryanair: { rise: null } });
  assert.equal(buyAdvice(item(), s, '2026-11-14'), 'Mancano 236 giorni. Nessuna salita chiara finora (stima: ancora nessuna estate raccolta).');
});

// --- formToTracking ---
const campiFinestra = {
  da: 'Bari (BRI)', a: 'DBV', tipo: 'ar', date: 'finestra', mesi: ['2027-07', '2027-08'], giorni: ['4', '5'],
  nottiMin: '5', nottiMax: '7', persone: '6', nome: 'Dubrovnik con gli amici',
};

test('formToTracking: finestra valida', () => {
  const { tracking, errors } = formToTracking(campiFinestra, { today: TODAY });
  assert.deepEqual(errors, []);
  assert.deepEqual(tracking, { from: 'BRI', to: 'DBV', roundTrip: true, mode: 'finestra', months: ['2027-07', '2027-08'], weekdays: [4, 5], nights: [5, 7], people: 6, name: 'Dubrovnik con gli amici' });
});

test('formToTracking: mesi vuoti → errore', () => {
  const { tracking, errors } = formToTracking({ ...campiFinestra, mesi: [] }, { today: TODAY });
  assert.equal(tracking, null);
  assert.ok(errors.some((e) => e.includes('«mesi»')), errors.join(' | '));
});

test('formToTracking: date precise solo andata, città riconosciuta dall\'elenco aeroporti', () => {
  const airports = [{ code: 'TRN', city: 'Torino', country: 'Italia' }];
  const { tracking, errors } = formToTracking({ da: 'BDS', a: 'torino', tipo: 'solo', date: 'precise', andata: '2027-02-12', persone: '1', nome: '' }, { today: TODAY, airports });
  assert.deepEqual(errors, []);
  assert.deepEqual(tracking, { from: 'BDS', to: 'TRN', roundTrip: false, mode: 'precise', out: '2027-02-12', people: 1, name: '' });
});

test('formToTracking: campi mancanti → errori in italiano, mai eccezioni', () => {
  const { tracking, errors } = formToTracking({}, { today: TODAY });
  assert.equal(tracking, null);
  assert.ok(errors.some((e) => e.includes('«da»')));
  assert.ok(errors.some((e) => e.includes('«a»')));
});

test('formToTracking: il nome senza a capo né « #» torna uguale dopo formatBody/parseTracking', () => {
  const { tracking, errors } = formToTracking({ ...campiFinestra, nome: 'Gita #2\ncon\r\nMarco #1' }, { today: TODAY });
  assert.deepEqual(errors, []);
  assert.equal(tracking.name, 'Gita n.2 con Marco n.1');
  assert.equal(parseTracking(formatBody(tracking), { today: TODAY }).tracking.name, tracking.name);
  assert.equal(formToTracking({ ...campiFinestra, nome: '#1 viaggio' }, { today: TODAY }).tracking.name, 'n.1 viaggio');
});

// --- piccoli aiuti ---
test('romeToday: giorno di calendario a Roma', () => {
  assert.equal(romeToday(new Date('2026-11-15T23:30:00Z')), '2026-11-16');
  assert.equal(romeToday(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
});

test('departTime: solo se sicuro', () => {
  assert.equal(departTime(day('ryanair', '2027-07-08', 1, '06:25-07:30')), '06:25');
  assert.equal(departTime(day('ryanair', '2027-07-08', 1, '')), '');
  assert.equal(departTime(day('wizz', '2027-07-08', 1, '15:20')), '15:20');
  assert.equal(departTime(day('wizz', '2027-07-08', 1, '15:20 21:40')), '');
});

test('comboText: stessa compagnia una volta sola, compagnie diverse per gamba', () => {
  assert.equal(comboText(item().best), 'Andata gio 8 lug 06:25 · Ritorno gio 15 lug 21:10 · Ryanair');
  const misto = { out: day('wizz', '2027-07-08', 30, '15:20 21:40'), back: day('ryanair', '2027-07-13', 26, '21:10-22:15'), price: 56, nights: 5 };
  assert.equal(comboText(misto), 'Andata gio 8 lug · Wizz Air · Ritorno mar 13 lug 21:10 · Ryanair');
  assert.equal(comboText({ out: day('wizz', '2027-02-12', 30, '15:20'), back: null, price: 30, nights: 0 }), 'Andata ven 12 feb 15:20 · Wizz Air');
});

test('namesMap, airportCode, nextMonths', () => {
  const airports = [{ code: 'DBV', city: 'Dubrovnik', country: 'Croazia' }, { code: 'BRI', city: 'Bari', country: 'Italia' }];
  assert.deepEqual(namesMap(airports), { DBV: 'Dubrovnik', BRI: 'Bari' });
  assert.equal(airportCode('Dubrovnik (DBV)', airports), 'DBV');
  assert.equal(airportCode(' dbv ', airports), 'DBV');
  assert.equal(airportCode('dubrovnik', airports), 'DBV');
  assert.equal(airportCode('Xyzland', airports), 'Xyzland');
  const m = nextMonths('2026-11-15', 12);
  assert.equal(m.length, 12);
  assert.deepEqual(m[0], { value: '2026-11', label: 'nov 2026' });
  assert.deepEqual(m[11], { value: '2027-10', label: 'ott 2027' });
});
