// Riduzione dei dati grezzi dei voli in ciò che serve al sito. Solo Node.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BACINI, DATI_URL, PREZZO_INIZIALE, PREZZO_MAX, VECCHIO_ORE, AEROPORTI_NOMI } from './config.js';

const ORA_MS = 3600e3;
const MINUTO_MS = 60e3;
const GIORNO_MIN = 1440;
const METE_MAX = 8;

// Stessa forma di `chiaveVolo` di formati.js (es. 'bri-cdg-2026-12-12-1840'): qui è
// ripetuta perché formati.js nasce nel compito successivo; poi si può far importare da lì.
function chiave(o, d, dep) {
  return `${o}-${d}-${dep.slice(0, 10)}-${dep.slice(11, 13)}${dep.slice(14, 16)}`.toLowerCase();
}

// Orari locali senza fuso, letti entrambi come UTC: la differenza resta giusta perché
// arrivo e partenza sono nello stesso fuso, quello della destinazione.
function minutiTra(da, a) {
  return Math.round((Date.parse(a + 'Z') - Date.parse(da + 'Z')) / MINUTO_MS);
}

// Fasce di permanenza: meno di 1 giorno, 1, 2, 3 o più.
const fascia = resta => Math.min(3, Math.floor(resta / GIORNO_MIN));

function aVolo(it) {
  const andata = it.outbound.segments;
  const ritorno = it.inbound.segments;
  const va = [andata[0].dep, andata.at(-1).arr];
  const ri = [ritorno[0].dep, ritorno.at(-1).arr];
  return {
    k: chiave(it.origin, it.destination.code, va[0]),
    o: it.origin,
    d: it.destination.code,
    citta: it.destination.city,
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

function statoBacino(bacino, grezzi, voli, adesso) {
  const file = bacino.file.map(f => grezzi[f] ?? null);
  const generati = file.map(f => f?.generatedAt).filter(g => Number.isFinite(Date.parse(g)));
  const completo = file.every(Boolean) && generati.length === file.length;
  const aggiornato = completo ? generati.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a)) : null;
  const pronto = completo && adesso - Date.parse(aggiornato) <= VECCHIO_ORE * ORA_MS;
  if (!pronto) return { pronto, aggiornato, numero: 0, piuBasso: null, mete: [] };

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
    pronto,
    aggiornato,
    numero: suoi.filter(v => v.p <= PREZZO_INIZIALE).length,
    piuBasso: suoi[0] ?? null,
    mete,
  };
}

export function riduci(grezzi, { adesso }) {
  const ammessi = new Set(Object.keys(AEROPORTI_NOMI));
  const migliori = new Map();
  for (const f of Object.values(grezzi)) {
    for (const it of f?.itineraries ?? []) {
      if (!ammessi.has(it.origin)) continue;
      const v = aVolo(it);
      if (v.p > PREZZO_MAX) continue;
      const chiaveGruppo = `${v.o}|${v.d}|${v.w}|${fascia(v.resta)}`;
      const attuale = migliori.get(chiaveGruppo);
      if (!attuale || v.p < attuale.p) migliori.set(chiaveGruppo, v);
    }
  }
  const voli = [...migliori.values()].sort((a, b) => a.p - b.p || a.va[0].localeCompare(b.va[0]));
  const bacini = Object.fromEntries(BACINI.map(b => [b.slug, statoBacino(b, grezzi, voli, adesso.getTime())]));
  return { voli, bacini };
}

async function leggi(percorsoOUrl, daCartella) {
  try {
    const testo = daCartella
      ? await readFile(percorsoOUrl, 'utf8')
      : await (async () => {
          const r = await fetch(percorsoOUrl);
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
