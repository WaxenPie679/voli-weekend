// Preparazione completa del sito DoVai in sito/dist: scarica i dati, li riduce, scrive pagine e file di servizio.
// Uso: node sito/build.js [--data <cartella>] [--out <cartella>] [--pubblica]
import { mkdir, writeFile, rm, cp, realpath, stat, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { BACINI, SITO, PRIVATO } from './config.js';
import { scaricaDati, riduci } from './dati.js';
import { TITOLARE, puoPubblicare } from './titolare.js';
import { pagina as home } from './pagine/home.js';
import { pagine as bacini } from './pagine/bacino.js';
import { pagina as premium } from './pagine/premium.js';
import { pagine as servizio } from './pagine/servizio.js';
import { pagina as errore } from './pagine/errore.js';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE_REPO = resolve(QUI, '..');

export const MSG_TITOLARE = 'Mancano nome e città del titolare in sito/titolare.js: il sito non si pubblica.';
const MARCATORE = '.dovai-dist';

// La cartella di uscita si svuota solo se: non esiste, è vuota, oppure porta il marcatore scritto da una
// preparazione precedente. Mai se coincide con il repo o un suo antenato (percorsi reali, seguendo i link).
// Ritorna il percorso reale da usare.
async function controllaUscita(fuori) {
  const rifiuto = () => new Error(`La cartella di uscita ${fuori} non è una cartella del sito: non la svuoto.`);
  let reale;
  try {
    reale = await realpath(fuori);
  } catch (e) {
    if (e.code === 'ENOENT') return fuori;
    throw e;
  }
  const repo = await realpath(RADICE_REPO);
  if ((repo + sep).startsWith(reale.endsWith(sep) ? reale : reale + sep)) throw rifiuto();
  if (!(await stat(reale)).isDirectory()) throw rifiuto();
  if ((await readdir(reale)).length === 0) return reale;
  try {
    await stat(join(reale, MARCATORE));
  } catch {
    throw rifiuto();
  }
  return reale;
}

// Dove va scritto un percorso: `/puglia/` diventa puglia/index.html, `/404.html` resta com'è.
const fileDi = percorso => (percorso.endsWith('/') ? percorso + 'index.html' : percorso).slice(1);

async function scrivi(out, relativo, contenuto) {
  const dest = join(out, relativo);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, contenuto);
}

function sitemap(pagine) {
  const righe = pagine.filter(p => p.indicizza).map(p => `  <url><loc>${SITO}${p.percorso}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${righe.join('\n')}\n</urlset>\n`;
}

// Le pagine (e i file dati) stanno 5 minuti in cache; css, js, caratteri e immagini un'ora.
// Niente "immutable": il foglio di stile e esplora.js hanno la versione nel link (parti/versione.js), gli altri file no.
function intestazioni(pagine) {
  const breve = 'Cache-Control: public, max-age=300';
  const lungo = 'Cache-Control: public, max-age=3600';
  const blocchi = [...pagine.map(p => p.percorso), '/voli.json', '/sitemap.xml', '/robots.txt'].map(p => `${p}\n  ${breve}`);
  for (const d of ['css', 'js', 'caratteri', 'img']) blocchi.push(`/${d}/*\n  ${lungo}`);
  // Per tutto il sito: il browser non indovina il tipo dei file e ai siti esterni va solo il dominio.
  blocchi.push('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin');
  return blocchi.join('\n\n') + '\n';
}

// Sito privato: _worker.js davanti a tutte le pagine chiede la password (accesso del browser, nome utente libero).
// Nel worker finisce solo l'impronta SHA-256 della password; senza password il sito resta chiuso a tutti.
export function workerPrivato(password = '') {
  const impronta = password ? createHash('sha256').update(password, 'utf8').digest('hex') : '';
  return `// Prodotto da sito/build.js: sito privato, si entra solo con la password.
const IMPRONTA = ${JSON.stringify(impronta)};
const NOINDEX = 'noindex, nofollow, noarchive';

async function sha256(testo) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function autorizzato(request) {
  if (!IMPRONTA) return false;
  const intestazione = request.headers.get('Authorization') || '';
  if (!intestazione.startsWith('Basic ')) return false;
  let chiaro;
  try { chiaro = atob(intestazione.slice(6)); } catch { return false; }
  const i = chiaro.indexOf(':');
  if (i < 0) return false;
  const prova = await sha256(chiaro.slice(i + 1));
  let diff = 0;
  for (let k = 0; k < IMPRONTA.length; k++) diff |= prova.charCodeAt(k) ^ IMPRONTA.charCodeAt(k);
  return diff === 0 && prova.length === IMPRONTA.length;
}

export default {
  async fetch(request, env) {
    if (!(await autorizzato(request))) {
      return new Response('<!doctype html><meta charset="utf-8"><title>Sito privato</title><p style="font-family:sans-serif;margin:3rem">Sito privato.</p>', {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'WWW-Authenticate': 'Basic realm="DoVai", charset="UTF-8"', 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX },
      });
    }
    const risposta = await env.ASSETS.fetch(request);
    const r = new Response(risposta.body, risposta);
    r.headers.set('X-Robots-Tag', NOINDEX);
    r.headers.set('Cache-Control', 'private, no-store');
    return r;
  },
};
`;
}

export async function prepara({ cartella, out = join(QUI, 'dist'), adesso = new Date(), pubblica = false, titolare = TITOLARE, privato = PRIVATO, password = process.env.SITO_PASSWORD || '' } = {}) {
  if (pubblica && !puoPubblicare(titolare, privato)) throw new Error(MSG_TITOLARE);
  const grezzi = await scaricaDati({ cartella });
  const { voli, bacini: stati, scartati } = riduci(grezzi, { adesso });
  const avvisi = [];
  for (const b of BACINI) if (!stati[b.slug].pronto) avvisi.push(`Bacino «${b.nome}» senza dati freschi: la pagina dice che stiamo iniziando a seguirlo.`);
  if (!BACINI.some(b => stati[b.slug].pronto)) throw new Error('Nessun bacino ha dati freschi: il sito non si prepara.');
  if (scartati > 0) avvisi.push(`${scartati} itinerari malformati o con scalo saltati.`);

  const ctx = { voli, bacini: stati, adesso };
  const pagine = [home(ctx), ...bacini(ctx), premium(ctx), ...servizio(ctx), errore(ctx)];

  const fuori = await controllaUscita(resolve(out));
  await rm(fuori, { recursive: true, force: true });
  await mkdir(fuori, { recursive: true });
  await cp(join(QUI, 'statico'), fuori, { recursive: true });
  for (const p of pagine) await scrivi(fuori, fileDi(p.percorso), p.html);
  const elencoBacini = BACINI.map(({ slug, nome, aeroporti }) => ({ slug, nome, aeroporti }));
  await scrivi(fuori, 'voli.json', JSON.stringify({ generato: adesso.toISOString(), bacini: elencoBacini, voli }));
  await scrivi(fuori, MARCATORE, 'Cartella prodotta da sito/build.js: si può svuotare e rifare.\n');
  await scrivi(fuori, 'sitemap.xml', sitemap(pagine));
  await scrivi(fuori, 'robots.txt', privato ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${SITO}/sitemap.xml\n`);
  await scrivi(fuori, '_headers', intestazioni(pagine));
  if (privato) await scrivi(fuori, '_worker.js', workerPrivato(password));
  return { pagine: pagine.length, voli: voli.length, avvisi };
}

function leggiArgomenti(argv) {
  const a = { pubblica: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pubblica') a.pubblica = true;
    else if (argv[i] === '--data') a.cartella = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = await prepara(leggiArgomenti(process.argv.slice(2)));
    for (const v of r.avvisi) console.warn('Attenzione: ' + v);
    console.log(`Sito pronto: ${r.pagine} pagine, ${r.voli} voli.`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
