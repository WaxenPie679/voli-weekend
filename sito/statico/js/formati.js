// Formati di date, permanenza, «visto alle», prezzi e link Kiwi.
// Funzioni pure, senza import: lo stesso file gira in Node e nel browser.

const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// Data e ora locali dell'aeroporto, scritte come '2026-12-12T18:40' (nessun fuso).
function parti(iso) {
  return { anno: +iso.slice(0, 4), mese: +iso.slice(5, 7), giorno: +iso.slice(8, 10) };
}

export function giornoBreve(iso) {
  const { anno, mese, giorno } = parti(iso);
  const settimana = new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay();
  return `${GIORNI[settimana]} ${giorno} ${MESI[mese - 1]}`;
}

export const ora = iso => iso.slice(11, 16);

const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

// Sotto le 24 ore si dice in ore; da un giorno in su «N giorni e M ore» (ore 0: solo giorni).
export function permanenza(minuti, citta) {
  const ore = Math.floor(minuti / 60);
  const giorni = Math.floor(ore / 24);
  const resto = ore % 24;
  let testo;
  if (giorni === 0) testo = plurale(ore, 'ora', 'ore');
  else if (resto === 0) testo = plurale(giorni, 'giorno', 'giorni');
  else testo = `${plurale(giorni, 'giorno', 'giorni')} e ${plurale(resto, 'ora', 'ore')}`;
  return `${testo} a ${citta}`;
}

const FORMATO_ROMA = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

function romano(data) {
  const p = Object.fromEntries(FORMATO_ROMA.formatToParts(data).map(x => [x.type, x.value]));
  return { anno: +p.year, mese: +p.month, giorno: +p.day, ore: +p.hour, minuti: +p.minute };
}

// L'ora di Roma scritta come gli orari dei voli: '2026-12-12T18:40'.
export function oraDiRoma(data) {
  const r = romano(data);
  const due = n => String(n).padStart(2, '0');
  return `${r.anno}-${due(r.mese)}-${due(r.giorno)}T${due(r.ore)}:${due(r.minuti)}`;
}

// «visto alle 9:30» / «visto ieri alle 22:10» / «visto il 22 nov alle 9:30», in ora di Roma.
export function visto(seenAtIso, adesso) {
  const quando = new Date(seenAtIso);
  if (Number.isNaN(quando.getTime())) return '';
  const v = romano(quando);
  const n = romano(adesso);
  const giorniDiDifferenza =
    (Date.UTC(n.anno, n.mese - 1, n.giorno) - Date.UTC(v.anno, v.mese - 1, v.giorno)) / 86400e3;
  const orario = `${v.ore}:${String(v.minuti).padStart(2, '0')}`;
  // Orologi sfasati: un «visto» nel futuro conta come oggi.
  if (giorniDiDifferenza <= 0) return `visto alle ${orario}`;
  if (giorniDiDifferenza === 1) return `visto ieri alle ${orario}`;
  return `visto il ${v.giorno} ${MESI[v.mese - 1]} alle ${orario}`;
}

export const prezzo = euro => `${euro} € a/r`;

// Identificatore stabile di un volo: andata e ritorno insieme, es. 'bri-cdg-2026-12-12-1840-2026-12-14-2135'.
// Con la sola andata, la stessa partenza con due ritorni diversi avrebbe la stessa chiave.
const dataOra = iso => `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;

export function chiaveVolo({ o, d, va, ri }) {
  return `${o}-${d}-${dataOra(va[0])}-${dataOra(ri[0])}`.toLowerCase();
}

// Kiwi riempie «Da» e «A» solo con città e paese nell'indirizzo, non con i codici IATA.
const CITTA_DI_PARTENZA = { BRI: 'Bari', BDS: 'Brindisi', MXP: 'Milano', BGY: 'Bergamo', FCO: 'Roma', CIA: 'Roma' };

// «Reggio Calabria» → 'reggio-calabria', «Málaga» → 'malaga', «L'Aquila» → 'l-aquila'.
const slug = testo =>
  normalizza(testo).replace(/[\s'’]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const luogo = (citta, paese) => [citta, paese].filter(Boolean).map(slug).join('-');

export function linkKiwi(volo, affiliato = '') {
  const { o, citta, paese, va, ri } = volo;
  const da = luogo(CITTA_DI_PARTENZA[o] ?? o, 'Italia');
  const a = luogo(citta, paese);
  const base = `https://www.kiwi.com/it/search/results/${da}/${a}/${va[0].slice(0, 10)}/${ri[0].slice(0, 10)}?adults=1`;
  return affiliato ? `${base}&affilid=${affiliato}` : base;
}

// Per la ricerca: minuscolo e senza accenti.
export const normalizza = testo =>
  testo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
