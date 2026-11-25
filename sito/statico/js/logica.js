// I filtri dell'esploratore: leggere e scrivere l'indirizzo, scegliere i voli, dire quanti sono.
// Funzioni pure: lo stesso file gira in Node (test e preparazione) e nel browser.
import { normalizza } from './formati.js';

// Stessi valori di config.js (che il browser non può importare): un test controlla che coincidano.
export const PREZZO_MIN = 30;
export const PREZZO_MAX = 400;
export const PREZZO_INIZIALE = 100;
export const BLOCCO = 12;

const GIORNO_MIN = 24 * 60;
const MESE = /^\d{4}-(0[1-9]|1[0-2])$/;

// I mesi di calendario che contengono i weekend dei voli (dal venerdì `w`), in ordine e senza doppioni.
export function mesiDeiVoli(voli) {
  return [...new Set(voli.map(v => String(v.w ?? '').slice(0, 7)).filter(m => MESE.test(m)))].sort();
}

const iniziali = bacino => ({ da: bacino || 'tutti', mese: 'tre', max: PREZZO_INIZIALE, resta: 0, a: '' });

// `da`: 'tutti', lo slug di un bacino o il codice di un suo aeroporto (maiuscole o minuscole).
function leggiDa(valore, bacini) {
  const v = String(valore ?? '').trim();
  if (v.toLowerCase() === 'tutti') return 'tutti';
  const bacino = bacini.find(b => b.slug === v.toLowerCase());
  if (bacino) return bacino.slug;
  const codice = v.toUpperCase();
  return bacini.some(b => b.aeroporti.includes(codice)) ? codice : null;
}

function leggiMax(valore) {
  if (!/^\d+$/.test(valore ?? '')) return PREZZO_INIZIALE;
  return Math.min(PREZZO_MAX, Math.max(PREZZO_MIN, Number(valore)));
}

// params: URLSearchParams. bacino: slug della pagina; bacini: da voli.json; mesi: i mesi liberi (mesiDeiVoli).
// Ogni valore che non torna riprende quello iniziale.
export function leggiFiltri(params, { bacino, bacini = [], mesi = [] } = {}) {
  const filtri = iniziali(bacino);
  if (params.has('da')) filtri.da = leggiDa(params.get('da'), bacini) ?? filtri.da;
  const mese = params.get('mese');
  if (mesi.includes(mese)) filtri.mese = mese;
  filtri.max = leggiMax(params.get('max'));
  const resta = params.get('resta');
  if (/^[0-3]$/.test(resta ?? '')) filtri.resta = Number(resta);
  filtri.a = normalizza(String(params.get('a') ?? '').trim());
  return filtri;
}

// La query dell'indirizzo (senza «?»), solo coi valori diversi da quelli iniziali.
export function scriviFiltri(filtri, { bacino } = {}) {
  const base = iniziali(bacino);
  const params = new URLSearchParams();
  for (const nome of ['da', 'mese', 'max', 'resta', 'a']) {
    if (filtri[nome] !== base[nome]) params.set(nome, String(filtri[nome]));
  }
  return params.toString();
}

function partenze(da, bacini) {
  if (da === 'tutti') return null;
  return bacini.find(b => b.slug === da)?.aeroporti ?? [da];
}

// I voli che passano i filtri, dal più economico (a parità di prezzo, dal primo che parte).
export function filtra(voli, filtri, bacini = []) {
  const aeroporti = partenze(filtri.da, bacini);
  return voli
    .filter(v => !aeroporti || aeroporti.includes(v.o))
    .filter(v => filtri.mese === 'tre' || String(v.w ?? '').startsWith(filtri.mese))
    .filter(v => v.p <= filtri.max)
    .filter(v => v.resta >= filtri.resta * GIORNO_MIN)
    .filter(v => !filtri.a || normalizza(v.citta ?? '').includes(filtri.a))
    .sort((x, y) => x.p - y.p || String(x.va?.[0]).localeCompare(String(y.va?.[0])) || String(x.k).localeCompare(String(y.k)));
}

// «42 voli da Puglia, Weekend, fino a 100 € a/r». nomi: { slug o codice → nome da mostrare }.
export function riepilogo(n, filtri, nomi = {}) {
  const da = filtri.da === 'tutti' ? 'tutti gli aeroporti' : (nomi[filtri.da] ?? filtri.da);
  return `${n} ${n === 1 ? 'volo' : 'voli'} da ${da}, Weekend, fino a ${filtri.max} € a/r`;
}

// ?volo= deve aprire sempre il suo biglietto: se i filtri lo escludono, si allarga solo quello che lo esclude.
// Prezzo fino al suo (tra 30 e 400), resta e destinazione azzerati, mese ai prossimi 3 mesi,
// partenza al bacino della pagina se lo contiene, altrimenti 'tutti'.
export function filtriPerVolo(filtri, volo, { bacino, bacini = [] } = {}) {
  const nuovi = { ...filtri };
  const aeroporti = partenze(filtri.da, bacini);
  if (aeroporti && !aeroporti.includes(volo.o)) {
    const suo = bacini.find(b => b.slug === bacino)?.aeroporti.includes(volo.o);
    nuovi.da = suo ? bacino : 'tutti';
  }
  if (filtri.mese !== 'tre' && !String(volo.w ?? '').startsWith(filtri.mese)) nuovi.mese = 'tre';
  if (volo.p > filtri.max) nuovi.max = Math.min(PREZZO_MAX, Math.max(PREZZO_MIN, Math.ceil(volo.p)));
  if (volo.resta < filtri.resta * GIORNO_MIN) nuovi.resta = 0;
  if (filtri.a && !normalizza(volo.citta ?? '').includes(filtri.a)) nuovi.a = '';
  return nuovi;
}
