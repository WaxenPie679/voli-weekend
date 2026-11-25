// La pagina privata dei numeri: HTML preparato qui, senza JavaScript e senza link esterni.
const num = new Intl.NumberFormat('it-IT');
const dec = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const cella = (nome, n) => `<b class="n" data-${nome}="${n}">${num.format(n)}</b>`;
const quota = (a, b) => (a + b ? `${dec.format((a / (a + b)) * 100)} %` : '—');

const NOMI = {
  ingresso: 'Ingressi', pagina: 'Pagine viste', 'premium-passa': 'Passa a Premium', 'premium-lucchetto': 'Lucchetti',
  'premium-menu': 'Premium nel menù', 'premium-mensile': 'Scelta mensile', 'premium-annuale': 'Scelta annuale',
  'premium-avvisami': 'Avvisami', kiwi: 'Kiwi', compagnia: 'Compagnia', canale: 'Te lo scriviamo noi · canale',
  email: 'Te lo scriviamo noi · email', filtro: 'Filtri usati',
};

const STILE = `
:root{--moro:#2A1A14;--carta:#FFF8EC;--limone:#FFDD45;--ruggine:#C2410C;--foglia:#3F7D3A}
*{box-sizing:border-box}body{margin:0;background:var(--carta);color:var(--moro);font:16px/1.45 "DM Sans",system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:16px}h1{font:900 1.6rem/1.1 Gabarito,system-ui,sans-serif;margin:.5rem 0 1rem}
h2{font:700 1.1rem Gabarito,system-ui,sans-serif;margin:1.5rem 0 .5rem}
.n,.mono{font-family:"JetBrains Mono",ui-monospace,monospace}.n{font-weight:700}
.schede{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.scheda{background:#fff;border:1px solid rgb(42 26 20/.12);border-radius:16px;padding:12px}
.scheda .n{display:block;font-size:1.6rem}.piccolo{font-size:.85rem;opacity:.75}
.ok{color:var(--foglia)}.sotto{color:var(--ruggine)}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}
td,th{padding:6px 10px;border-bottom:1px solid rgb(42 26 20/.08);text-align:left}td:last-child,th:last-child{text-align:right}
nav a{color:var(--moro);margin-right:12px}nav a[aria-current]{font-weight:700;background:var(--limone);padding:2px 6px;border-radius:6px}`;

export function paginaNumeri(r, { ambiente, chiave, oggi }) {
  const k = encodeURIComponent(chiave);
  const p = r.soglia.percentuale;
  const stato = p === null ? '' : p >= r.soglia.obiettivo ? 'ok' : 'sotto';
  const percentuale = p === null ? '—' : `${dec.format(p)} %`;
  const righe7 = Object.keys(NOMI).map(e => `<tr><td>${NOMI[e]}</td><td>${cella(`u7-${e}`, r.ultimi7[e] ?? 0)}</td></tr>`).join('');
  const giorni = r.perGiorno.slice(0, 14).map(g => `<tr><td class="mono">${esc(g.giorno)}</td><td>${num.format(g.ingressi)}</td><td>${num.format(g.premium)}</td></tr>`).join('');
  const pagine = r.perPagina.slice(0, 10).map(x => `<tr><td class="mono">${esc(x.pagina)}</td><td>${num.format(x.pagine)}</td></tr>`).join('');
  const link = (a, testo) => `<a href="/numeri/?k=${k}${a === 'prova' ? '&amp;ambiente=prova' : ''}"${a === ambiente ? ' aria-current="page"' : ''}>${testo}</a>`;
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>Numeri · DoVai</title><style>${STILE}</style></head>
<body><main>
<h1>I numeri di DoVai</h1>
<nav>${link('vero', 'Sito vero')}${link('prova', 'Anteprima')}</nav>
<p class="piccolo">Aggiornati adesso · ${esc(oggi)} · solo totali anonimi, senza cookie</p>
<h2>Le soglie della fase 0</h2>
<div class="schede">
<div class="scheda"><span class="piccolo">Visite (ingressi)</span>${cella('ingressi', r.ingressi)}</div>
<div class="scheda"><span class="piccolo">Clic Premium ÷ visite · obiettivo 3 %</span><b class="n ${stato}" data-soglia="${p ?? ''}">${percentuale}</b>
<span class="piccolo">${r.premium.totale} clic: ${r.premium.passa} bottone, ${r.premium.lucchetto} lucchetti, ${r.premium.menu} menù · vale da ${r.soglia.visiteMinime} visite${r.soglia.valida ? '' : ' (non ancora)'}</span></div>
<div class="scheda"><span class="piccolo">Te lo scriviamo noi (in attesa del modulo)</span>${cella('iscrizioni', r.canale + r.email)}</div>
<div class="scheda"><span class="piccolo">Kiwi · compagnia</span>${cella('kiwi', r.kiwi)}<span class="piccolo">compagnia ${cella('compagnia', r.compagnia)}</span></div>
</div>
<h2>Mensile o annuale</h2>
<div class="schede">
<div class="scheda"><span class="piccolo">Mensile · 3 €</span>${cella('mensile', r.mensile)}<span class="piccolo">${quota(r.mensile, r.annuale)}</span></div>
<div class="scheda"><span class="piccolo">Annuale · 30 €</span>${cella('annuale', r.annuale)}<span class="piccolo">${quota(r.annuale, r.mensile)}</span></div>
<div class="scheda"><span class="piccolo">Avvisami</span>${cella('avvisami', r.avvisami)}</div>
</div>
<h2>Ultimi 7 giorni</h2>
<table><tbody>${righe7}</tbody></table>
<h2>Giorno per giorno</h2>
<table><thead><tr><th>Giorno</th><th>Visite</th><th>Clic Premium</th></tr></thead><tbody>${giorni || '<tr><td colspan="3">Ancora niente</td></tr>'}</tbody></table>
<h2>Pagine più viste</h2>
<table><tbody>${pagine || '<tr><td colspan="2">Ancora niente</td></tr>'}</tbody></table>
<p class="piccolo">Dall'inizio: ${num.format(r.pagine)} pagine viste, ${num.format(r.filtro)} usi dei filtri.</p>
</main></body></html>`;
}
