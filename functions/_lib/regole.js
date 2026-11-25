// Regole comuni del contatore: quali eventi e pagine si contano, da dove possono arrivare e in che giorno.
// Nessun dato della persona: solo il nome dell'evento e la pagina.

export const EVENTI = Object.freeze([
  'ingresso', 'pagina',
  'premium-passa', 'premium-lucchetto', 'premium-menu', 'premium-mensile', 'premium-annuale', 'premium-avvisami',
  'kiwi', 'compagnia', 'canale', 'email', 'filtro',
]);

// Le pagine scritte da sito/build.js (un test controlla che non ne manchi nessuna).
export const PERCORSI = Object.freeze([
  '/', '/puglia/', '/milano-bergamo/', '/roma/', '/premium/',
  '/come-funziona/', '/domande/', '/privacy/', '/note-legali/', '/404.html',
]);

const MASSIMO_BYTE = 200;
const TIPI = ['text/plain', 'application/json'];
const SITI = ['dovaivoli.it', 'www.dovaivoli.it'];

// Il corpo mandato da conta.js: {"e": evento, "p": percorso}. sendBeacon lo manda come text/plain.
export function leggiEvento(testo, tipo) {
  const base = (tipo ?? '').split(';')[0].trim().toLowerCase();
  if (!TIPI.includes(base)) return null;
  if (typeof testo !== 'string' || new TextEncoder().encode(testo).length > MASSIMO_BYTE) return null;
  let dati;
  try {
    dati = JSON.parse(testo);
  } catch {
    return null;
  }
  if (!dati || typeof dati !== 'object' || typeof dati.e !== 'string' || typeof dati.p !== 'string') return null;
  if (!EVENTI.includes(dati.e)) return null;
  const pulito = dati.p.split(/[?#]/)[0];
  return { e: dati.e, p: PERCORSI.includes(pulito) ? pulito : 'altro' };
}

// I numeri veri sono solo quelli di dovaivoli.it; anteprime e indirizzi pages.dev contano a parte.
export const ambiente = host => (SITI.includes(host) ? 'vero' : 'prova');

const hostAmmesso = host => SITI.includes(host) || host === 'dovai.pages.dev' || host.endsWith('.dovai.pages.dev');

// La richiesta deve venire dal sito (Origin, o Referer se manca).
export function origineAmmessa(origin, referer) {
  const fonte = origin || referer;
  if (!fonte) return false;
  try {
    const u = new URL(fonte);
    return u.protocol === 'https:' && hostAmmesso(u.hostname);
  } catch {
    return false;
  }
}

const GIORNO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });
export const giornoRoma = data => GIORNO.format(data);
