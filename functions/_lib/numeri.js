// Lettura dei contatori e riepilogo per la pagina privata e per /api/numeri.
import { preparaTabella } from './deposito.js';

export const SOGLIA_PREMIUM = 3;
export const VISITE_MINIME = 800;

const LEGGI = `SELECT giorno, ambiente, evento, pagina, n FROM conteggi
  WHERE giorno >= ? AND giorno <= ? AND ambiente = ? ORDER BY giorno`;

export async function leggi(db, { dal = '2000-01-01', al, ambiente = 'vero' }) {
  await preparaTabella(db);
  const { results } = await db.prepare(LEGGI).bind(dal, al, ambiente).all();
  return results ?? [];
}

// Il giorno di sei giorni prima (gli ultimi 7 giorni comprendono oggi).
function seiGiorniPrima(oggi) {
  const d = new Date(`${oggi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString().slice(0, 10);
}

const somma = (righe, evento) => righe.filter(r => r.evento === evento).reduce((t, r) => t + r.n, 0);

export function riepilogo(righe, { oggi }) {
  const t = e => somma(righe, e);
  const premium = { passa: t('premium-passa'), lucchetto: t('premium-lucchetto'), menu: t('premium-menu') };
  premium.totale = premium.passa + premium.lucchetto + premium.menu;
  const ingressi = t('ingresso');
  const percentuale = ingressi ? Math.round((premium.totale / ingressi) * 1000) / 10 : null;

  const inizio7 = seiGiorniPrima(oggi);
  const ultimi7 = {};
  for (const r of righe) if (r.giorno >= inizio7 && r.giorno <= oggi) ultimi7[r.evento] = (ultimi7[r.evento] ?? 0) + r.n;

  const giorni = new Map();
  for (const r of righe) {
    const g = giorni.get(r.giorno) ?? { giorno: r.giorno, ingressi: 0, premium: 0 };
    if (r.evento === 'ingresso') g.ingressi += r.n;
    if (['premium-passa', 'premium-lucchetto', 'premium-menu'].includes(r.evento)) g.premium += r.n;
    giorni.set(r.giorno, g);
  }
  const pagine = new Map();
  for (const r of righe) if (r.evento === 'pagina') pagine.set(r.pagina, (pagine.get(r.pagina) ?? 0) + r.n);

  return {
    ingressi,
    pagine: t('pagina'),
    premium,
    soglia: { percentuale, valida: ingressi >= VISITE_MINIME, obiettivo: SOGLIA_PREMIUM, visiteMinime: VISITE_MINIME },
    mensile: t('premium-mensile'),
    annuale: t('premium-annuale'),
    avvisami: t('premium-avvisami'),
    kiwi: t('kiwi'),
    compagnia: t('compagnia'),
    canale: t('canale'),
    email: t('email'),
    filtro: t('filtro'),
    ultimi7,
    perGiorno: [...giorni.values()].sort((a, b) => b.giorno.localeCompare(a.giorno)),
    perPagina: [...pagine].map(([pagina, n]) => ({ pagina, pagine: n })).sort((a, b) => b.pagine - a.pagine),
  };
}
