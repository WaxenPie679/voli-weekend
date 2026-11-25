// Riduzione dei dati grezzi dei voli in ciò che serve al sito. Solo Node.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chiaveVolo, oraDiRoma } from './statico/js/formati.js';
import { BACINI, DATI_URL, PREZZO_INIZIALE, PREZZO_MAX, VECCHIO_ORE, AEROPORTI_NOMI } from './config.js';

const ORA_MS = 3600e3;
const MINUTO_MS = 60e3;
const GIORNO_MIN = 1440;
const METE_MAX = 8;

// Orari locali senza fuso, letti entrambi come UTC: la differenza resta giusta perché
// arrivo e partenza sono nello stesso fuso, quello della destinazione.
function minutiTra(da, a) {
  return Math.round((Date.parse(a + 'Z') - Date.parse(da + 'Z')) / MINUTO_MS);
}

// Fasce di permanenza: meno di 1 giorno, 1, 2, 3 o più.
const fascia = resta => Math.min(3, Math.floor(resta / GIORNO_MIN));

// Il raccoglitore passa i nomi così come li danno le compagnie: «Warsaw Any», «Londra (tutti gli
// aeroporti)», «Parigi Orly», «Tenerife (Isole Canerie)». Sul sito e nei link Kiwi va la città, in italiano.
// Per codice di destinazione, perché lo stesso codice deve dare sempre la stessa città.
export const CITTA_PULITA = {
  BBU: 'Bucarest', // «Bucarest Baneasa»
  OTP: 'Bucarest', // «Bucarest Henri Coandă»
  BCN: 'Barcellona', // «Barcellona El Prat»
  BER: 'Berlino', // «Berlino Brandenburgo»
  CPH: 'Copenaghen', // «Copenhagen»
  LON: 'Londra', // «Londra (tutti gli aeroporti)»
  LTN: 'Londra', // «Londra Luton»
  LUX: 'Lussemburgo', // «Luxembourg»
  ORY: 'Parigi', // «Parigi Orly»
  PAR: 'Parigi', // «Parigi (tutti gli aeroporti)»
  PMO: 'Palermo', // «Palermo (Sicilia)»
  SUF: 'Lamezia Terme', // «Lamezia» per Ryanair, «Lamezia Terme» per Wizz
  TFS: 'Tenerife', // «Tenerife (Isole Canerie)»
  VAR: 'Varna', // «Varna (Mar Nero)»
  WAW: 'Varsavia', // «Varsavia Chopin»
  WMI: 'Varsavia', // «Varsavia Modlin»
  WSW: 'Varsavia', // «Warsaw Any»
  ZAG: 'Zagabria', // «Zagreb»
};

// Codici che per Wizz valgono «tutta la città»: portano gli stessi voli di un aeroporto vero.
// BBU (Baneasa) è chiuso ai voli di linea: Wizz lo usa con gli stessi orari di OTP.
const CODICI_CITTA = new Set(['LON', 'PAR', 'WSW', 'BBU']);

// Prima la mappa; per i nomi nuovi si toglie almeno « (…)» e « Any» in fondo.
export function cittaPulita(codice, citta) {
  if (CITTA_PULITA[codice]) return CITTA_PULITA[codice];
  return String(citta ?? '').replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+Any\s*$/i, '').trim();
}

// Lo stesso volo sotto due codici (città e aeroporto): resta quello dell'aeroporto vero,
// poi il più economico, poi il codice in ordine alfabetico, così la scelta non dipende dall'ordine dei file.
function preferito(a, b) {
  const cittaA = CODICI_CITTA.has(a.d);
  if (cittaA !== CODICI_CITTA.has(b.d)) return cittaA ? b : a;
  if (a.p !== b.p) return a.p < b.p ? a : b;
  return a.d <= b.d ? a : b;
}

function aVolo(it) {
  const andata = it.outbound.segments;
  const ritorno = it.inbound.segments;
  // Sul sito solo voli diretti: un'andata o un ritorno con più tratte si scarta.
  if (andata.length !== 1 || ritorno.length !== 1) throw new Error('volo con scalo');
  const va = [andata[0].dep, andata.at(-1).arr];
  const ri = [ritorno[0].dep, ritorno.at(-1).arr];
  return {
    k: chiaveVolo({ o: it.origin, d: it.destination.code, va, ri }),
    o: it.origin,
    d: it.destination.code,
    citta: cittaPulita(it.destination.code, it.destination.city),
    paese: it.destination.country,
    va,
    ri,
    cia: andata[0].airline,
    p: Math.ceil(it.price),
    url: it.bookingUrl,
    w: it.weekend,
    visto: it.seenAt,
    resta: minutiTra(va[1], ri[0]),
  };
}

// Un file conta solo se c'è e il suo generatedAt non è più vecchio di VECCHIO_ORE:
// i prezzi di un file vecchio non si mostrano mai.
function fileValido(f, adesso) {
  const t = Date.parse(f?.generatedAt);
  return Number.isFinite(t) && adesso - t <= VECCHIO_ORE * ORA_MS;
}

function statoBacino(bacino, grezzi, voli, adesso) {
  const validi = bacino.file.map(n => grezzi[n]).filter(f => fileValido(f, adesso));
  if (!validi.length) return { pronto: false, aggiornato: null, numero: 0, piuBasso: null, mete: [] };
  const aggiornato = validi.map(f => f.generatedAt).reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));

  const suoi = voli.filter(v => bacino.aeroporti.includes(v.o));
  const mete = [];
  const viste = new Set();
  for (const v of suoi) {
    if (viste.has(v.citta)) continue;
    viste.add(v.citta);
    mete.push({ citta: v.citta, d: v.d, p: v.p });
    if (mete.length === METE_MAX) break;
  }
  return {
    pronto: true,
    aggiornato,
    numero: suoi.filter(v => v.p <= PREZZO_INIZIALE).length,
    piuBasso: suoi[0] ?? null,
    mete,
  };
}

export function riduci(grezzi, { adesso }) {
  const ora = adesso.getTime();
  // Gli orari dei voli sono locali dell'aeroporto di partenza; si confrontano con l'ora di Roma,
  // che per i nostri aeroporti (tutti italiani) è quella giusta.
  const oraRoma = oraDiRoma(adesso);
  const ammessi = new Set(Object.keys(AEROPORTI_NOMI));
  const unici = new Map();
  let scartati = 0;
  for (const f of Object.values(grezzi)) {
    if (!fileValido(f, ora)) continue;
    for (const it of f.itineraries ?? []) {
      if (!ammessi.has(it?.origin)) continue;
      // Un itinerario malformato (tratte o destinazione mancanti) o con scalo si salta e si conta, non fa cadere tutto.
      let v;
      try {
        v = aVolo(it);
        if (!Number.isFinite(v.p) || !Number.isFinite(v.resta)) throw new Error('itinerario incompleto');
      } catch {
        scartati++;
        continue;
      }
      if (v.p > PREZZO_MAX) continue;
      if (v.va[0] <= oraRoma) continue; // già partito
      const chiaveVoloFisico = `${v.o}|${v.citta}|${v.va[0]}|${v.ri[0]}|${v.cia}`;
      const doppio = unici.get(chiaveVoloFisico);
      unici.set(chiaveVoloFisico, doppio ? preferito(doppio, v) : v);
    }
  }
  const migliori = new Map();
  for (const v of unici.values()) {
    const chiaveGruppo = `${v.o}|${v.d}|${v.w}|${fascia(v.resta)}`;
    const attuale = migliori.get(chiaveGruppo);
    if (!attuale || v.p < attuale.p) migliori.set(chiaveGruppo, v);
  }
  const voli = [...migliori.values()].sort((a, b) => a.p - b.p || a.va[0].localeCompare(b.va[0]));
  const bacini = Object.fromEntries(BACINI.map(b => [b.slug, statoBacino(b, grezzi, voli, ora)]));
  return { voli, bacini, scartati };
}

async function leggi(percorsoOUrl, daCartella) {
  try {
    const testo = daCartella
      ? await readFile(percorsoOUrl, 'utf8')
      : await (async () => {
          const r = await fetch(percorsoOUrl, { signal: AbortSignal.timeout(30000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })();
    return JSON.parse(testo);
  } catch {
    return null;
  }
}

// Scarica (o legge da `cartella`) tutti i file dei bacini; quelli mancanti o illeggibili valgono null.
export async function scaricaDati({ cartella } = {}) {
  const nomi = BACINI.flatMap(b => b.file);
  const lette = await Promise.all(
    nomi.map(n => leggi(cartella ? join(cartella, n) : DATI_URL + n, Boolean(cartella))),
  );
  return Object.fromEntries(nomi.map((n, i) => [n, lette[i]]));
}
