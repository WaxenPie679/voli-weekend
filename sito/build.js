// Preparazione completa del sito DoVai in sito/dist: scarica i dati, li riduce, scrive pagine e file di servizio.
// Uso: node sito/build.js [--data <cartella>] [--out <cartella>] [--pubblica]
import { mkdir, writeFile, rm, cp, realpath, stat, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACINI, SITO } from './config.js';
import { scaricaDati, riduci } from './dati.js';
import { titolareCompleto } from './titolare.js';
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
// Niente "immutable": i riferimenti nelle pagine non portano l'hash o la versione.
function intestazioni(pagine) {
  const breve = 'Cache-Control: public, max-age=300';
  const lungo = 'Cache-Control: public, max-age=3600';
  const blocchi = [...pagine.map(p => p.percorso), '/voli.json', '/sitemap.xml', '/robots.txt'].map(p => `${p}\n  ${breve}`);
  for (const d of ['css', 'js', 'caratteri', 'img']) blocchi.push(`/${d}/*\n  ${lungo}`);
  return blocchi.join('\n\n') + '\n';
}

export async function prepara({ cartella, out = join(QUI, 'dist'), adesso = new Date(), pubblica = false } = {}) {
  if (pubblica && !titolareCompleto()) throw new Error(MSG_TITOLARE);
  const grezzi = await scaricaDati({ cartella });
  const { voli, bacini: stati, scartati } = riduci(grezzi, { adesso });
  const avvisi = [];
  for (const b of BACINI) if (!stati[b.slug].pronto) avvisi.push(`Bacino «${b.nome}» senza dati freschi: la pagina dice che stiamo iniziando a seguirlo.`);
  if (!BACINI.some(b => stati[b.slug].pronto)) throw new Error('Nessun bacino ha dati freschi: il sito non si prepara.');
  if (scartati > 0) avvisi.push(`${scartati} itinerari malformati saltati.`);

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
  await scrivi(fuori, 'robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITO}/sitemap.xml\n`);
  await scrivi(fuori, '_headers', intestazioni(pagine));
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
