import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h, grezzo } from '../../sito/statico/js/html.js';
import { biglietto } from '../../sito/parti/biglietto.js';
import { testa } from '../../sito/parti/testa.js';
import { intestazione } from '../../sito/parti/intestazione.js';
import { piede } from '../../sito/parti/piede.js';
import { filtri, mesiDeiVoli } from '../../sito/parti/filtri.js';
import { riquadroCanale, riquadroPremium } from '../../sito/parti/riquadri.js';
import { lucchetto } from '../../sito/parti/lucchetto.js';
import { pagina as home } from '../../sito/pagine/home.js';
import { pagina as bacino, pagine as bacini } from '../../sito/pagine/bacino.js';
import { pagina as premium } from '../../sito/pagine/premium.js';
import { pagine as servizio } from '../../sito/pagine/servizio.js';
import { pagina as errore } from '../../sito/pagine/errore.js';
import { striscia } from '../../sito/parti/striscia.js';
import { delGiorno } from '../../sito/parti/del-giorno.js';

const adesso = new Date('2026-11-25T12:00:00Z');

const volo = {
  k: 'bri-bva-2026-12-12-1840-2026-12-14-2135',
  o: 'BRI',
  d: 'BVA',
  citta: 'Parigi',
  paese: 'Francia',
  va: ['2026-12-12T18:40', '2026-12-12T20:55'],
  ri: ['2026-12-14T21:35', '2026-12-14T23:40'],
  cia: 'Ryanair',
  p: 69,
  url: 'https://www.ryanair.com/it/it/trip/flights/select?originIata=BRI&destinationIata=BVA',
  w: '2026-12-12',
  visto: '2026-11-25T08:30:00Z',
  resta: 2920,
};

test('h fa escape dei valori e lascia passare solo quelli grezzi', () => {
  assert.equal(h`<p>${'<script>alert(1)</script>'}</p>`, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(h`<a title="${'"x" & \'y\''}">`, '<a title="&quot;x&quot; &amp; &#39;y&#39;">');
  assert.equal(h`<div>${grezzo('<b>ok</b>')}</div>`, '<div><b>ok</b></div>');
  assert.equal(h`<ul>${['<a>', grezzo('<li>b</li>')]}</ul>`, '<ul>&lt;a&gt;<li>b</li></ul>');
  assert.equal(h`${null}${undefined}${false}${0}`, '0');
});

test('biglietto: tutte le voci del biglietto chiuso', () => {
  const html = biglietto(volo, { adesso });
  for (const atteso of [
    'Bari → Parigi',
    '69 € a/r',
    'solo zaino',
    'Ryanair',
    'visto alle 9:30',
    '2 giorni a Parigi',
    'sab 12 dic',
    '18:40',
    'data-conta="kiwi"',
    'data-conta="compagnia"',
    'Vedi su Kiwi',
    'o su Ryanair',
    'Vedi su Ryanair',
    'rel="noopener"',
    'target="_blank"',
    'Compra o aspetta?',
    'data-conta="premium-lucchetto"',
    'data-k="bri-bva-2026-12-12-1840-2026-12-14-2135"',
  ]) {
    assert.ok(html.includes(atteso), `manca «${atteso}»`);
  }
  assert.ok(!html.includes('link affiliato'), 'niente «link affiliato» senza codice affiliato');
  assert.ok(!html.includes('uguale'), 'mai «costa uguale»');
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(html), 'niente emoji');
});

test('biglietto: la parte aperta sta in un <details>, chiusa salvo aperto:true', () => {
  const chiuso = biglietto(volo, { adesso });
  assert.match(chiuso, /<details class="biglietto__dettagli">/);
  assert.ok(chiuso.includes('Andata') && chiuso.includes('Ritorno'));
  assert.ok(chiuso.includes('20:55') && chiuso.includes('23:40'));
  assert.ok(chiuso.includes('Perché due bottoni?'));
  assert.ok(chiuso.includes('Ryanair atterra a Beauvais, a circa 80 km dal centro.'));
  assert.ok(chiuso.includes('Ricevilo prima la prossima volta'));
  assert.match(biglietto(volo, { adesso, aperto: true }), /<details class="biglietto__dettagli" open>/);
});

test('biglietto senza codice affiliato: nessuna parola su commissioni o sostegno', () => {
  const html = biglietto(volo, { adesso });
  assert.ok(!html.includes('sostieni'));
  assert.ok(!html.includes('commissione'));
  assert.ok(!html.includes('affilid'));
  assert.ok(html.includes('Il prezzo che vedi qui è quello della compagnia, visto alle 9:30. Su Kiwi può essere di qualche euro diverso: lì paghi il prezzo che vedi su Kiwi. Su Ryanair prenoti direttamente. Scegli tu.'));
});

test('biglietto col codice affiliato: tornano nota e testo completo', () => {
  const html = biglietto(volo, { adesso, affiliato: 'abc' });
  assert.ok(html.includes('affilid=abc'));
  assert.ok(html.includes('Con Kiwi sostieni DoVai · link affiliato'));
  assert.ok(html.includes('Il prezzo che vedi qui è quello della compagnia, visto alle 9:30. Su Kiwi può essere di qualche euro diverso: lì paghi il prezzo che vedi su Kiwi, e DoVai riceve una piccola commissione che lo tiene gratis. Su Ryanair prenoti direttamente, e a noi va bene lo stesso. Scegli tu.'));
});

test('biglietto: «Da sapere» solo per gli aeroporti lontani, «Altre date» solo se ci sono', () => {
  const vicino = { ...volo, d: 'CDG', k: 'bri-cdg-2026-12-12-1840-2026-12-14-2135' };
  const html = biglietto(vicino, { adesso });
  assert.ok(!html.includes('Da sapere'));
  assert.ok(!html.includes('Altre date'));
  const altra = { ...vicino, k: 'bri-cdg-2027-01-09-0700-2027-01-10-2000', va: ['2027-01-09T07:00', '2027-01-09T09:15'], ri: ['2027-01-10T20:00', '2027-01-10T22:10'], p: 54 };
  const conAltre = biglietto(vicino, { adesso, altre: [altra] });
  assert.ok(conAltre.includes('Altre date per Parigi'));
  assert.ok(conAltre.includes('?volo=bri-cdg-2027-01-09-0700-2027-01-10-2000'));
  assert.ok(conAltre.includes('54 € a/r'));
});

test('biglietto: i testi dei dati vengono sempre puliti', () => {
  const html = biglietto({ ...volo, citta: '<img src=x>' }, { adesso });
  assert.ok(!html.includes('<img src=x>'));
});

test('piede: email info@, niente cookie per seguirti', () => {
  const html = piede();
  assert.ok(html.includes('info@dovaivoli.it'));
  assert.ok(!html.includes('ciao@'));
  assert.ok(html.includes('Questo sito non usa cookie per seguirti.'));
  assert.ok(html.includes('Quando parti, DoVai?'));
  assert.ok(html.includes('Prezzi andata e ritorno per una persona, controllati all\'ora indicata: sul sito della compagnia possono cambiare.'));
});

test('piede: la commissione Kiwi si nomina solo col codice affiliato', () => {
  const senza = piede();
  assert.ok(!senza.includes('commissione'));
  assert.ok(senza.includes('Su Kiwi paghi il prezzo che vedi su Kiwi, noi non aggiungiamo nulla. Se preferisci la compagnia, il bottone c\'è sempre.'));
  const con = piede({ affiliato: 'abc' });
  assert.ok(con.includes('Se prenoti su Kiwi dai nostri link riceviamo una piccola commissione: è quello che tiene DoVai gratis.'));
});

test('intestazione: logo che porta alla home', () => {
  const html = intestazione();
  assert.match(html, /<a [^>]*href="\/"/);
  assert.match(html, /aria-label="DoVai, alla pagina iniziale"/);
  assert.match(html, /<g class="logo__d">(<path d="[^"]+"\/>){3}<\/g>/);
  assert.ok(!html.includes('aereo'), "senza aereo niente pezzo d'avvio");
});

test("intestazione: con l'aereo, il pezzo d'avvio controlla movimento, visita e posizione", () => {
  const html = intestazione({ aereo: true });
  for (const atteso of ["sessionStorage.getItem('dovai-aereo')", 'prefers-reduced-motion: reduce', 'scrollY<10', 'aereo-in-volo']) {
    assert.ok(html.includes(atteso), atteso);
  }
});

test('filtri: cursore 30–400 su 100 € a/r, lucchetti e tutti i controlli', () => {
  const html = filtri({ mesi: ['2026-11', '2026-12', '2027-01', '2027-02'] });
  assert.match(html, /<form [^>]*method="get"/);
  assert.match(html, /type="range"[^>]*name="max"[^>]*min="30" max="400" value="100"/);
  for (const atteso of ['Da dove parti', 'Weekend lungo', 'Quando', 'I prossimi 3 mesi', 'Fino a 12 mesi con Premium',
    'Quanto resti', 'Dove vuoi andare', 'Togli i filtri', 'Parti venerdì dopo le 18:00 o sabato, torni domenica. Niente ferie.',
    'data-conta="filtro"', 'data-conta="premium-lucchetto"', 'Malpensa', 'Orio al Serio']) {
    assert.ok(html.includes(atteso), `manca «${atteso}»`);
  }
  assert.ok(!html.includes('Linate'));
  for (const [valore, nome] of [['2026-11', 'novembre'], ['2026-12', 'dicembre'], ['2027-01', 'gennaio'], ['2027-02', 'febbraio']]) {
    assert.ok(html.includes(`<option value="${valore}">${nome}</option>`), `manca ${nome}`);
  }
  assert.ok(!html.includes('value="2027-03"'));
  assert.ok(html.indexOf('febbraio') < html.indexOf('Fino a 12 mesi con Premium'));
});

test('filtri: in vista partenza, tipo e prezzo; quando, quanto resti e dove dentro «Altri filtri»', () => {
  const html = filtri({ mesi: ['2026-12'], riepilogo: '4 voli' });
  const altri = html.indexOf('<details class="filtri__altri">');
  assert.ok(altri > 0, 'manca il riquadro «Altri filtri»');
  assert.ok(html.includes('<summary class="filtri__altri-titolo">Altri filtri</summary>'));
  for (const id of ['f-da', 'f-tipo', 'f-max']) assert.ok(html.indexOf(`id="${id}"`) < altri, `${id} deve stare in vista`);
  const fine = html.indexOf('</details>');
  for (const id of ['f-mese', 'f-resta', 'f-a']) {
    const dove = html.indexOf(`id="${id}"`);
    assert.ok(dove > altri && dove < fine, `${id} deve stare in «Altri filtri»`);
  }
  assert.ok(html.indexOf('filtri__riepilogo') > fine, 'il riepilogo resta sempre in vista');
  assert.match(html, /role="group" aria-labelledby="f-tipo" aria-describedby="f-tipo-spiega"/);
  assert.ok(!/<details class="filtri__altri" open/.test(html), 'all\'apertura è chiuso');
});

test('mesiDeiVoli: i mesi dei weekend coi voli, mese in corso compreso', () => {
  const voli = ['2026-11-27', '2026-12-11', '2026-12-04', '2027-01-15', '2027-02-19', 'boh', undefined].map(w => ({ w }));
  assert.deepEqual(mesiDeiVoli(voli), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(mesiDeiVoli([]), []);
  assert.ok(!filtri({ mesi: ['2026-13', '<x>'] }).includes('2026-13'));
});

test('filtri: sulla pagina di un bacino quel bacino è già scelto', () => {
  const html = filtri({ bacino: 'roma' });
  assert.match(html, /<option value="roma" selected>/);
  assert.match(html, /href="\/roma\/"[^>]*>Togli i filtri/);
});

test('riquadro canale: stati onesti, niente finti moduli', () => {
  const html = riquadroCanale();
  assert.ok(html.includes('Non vuoi controllare ogni giorno?'));
  assert.ok(html.includes('Il canale sta per aprire'));
  assert.ok(html.includes('Il riassunto del martedì arriva presto'));
  assert.ok(html.includes('data-conta="canale"') && html.includes('data-conta="email"'));
  assert.ok(!html.includes('<form') && !html.includes('<input'));
  assert.ok(riquadroCanale({ bacino: 'puglia' }).includes('Puglia'));
});

test('riquadro Premium: testi e punto da contare', () => {
  const html = riquadroPremium();
  assert.ok(html.includes('Premium · ti diciamo anche quando comprare'));
  assert.ok(html.includes('Passa a Premium'));
  assert.ok(html.includes('data-conta="premium-passa"'));
  assert.ok(html.includes('3 € al mese o 30 € l\'anno. Lo togli quando vuoi.'));
});

test('lucchetto: svg disegnato con etichetta', () => {
  const html = lucchetto('Premium');
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.ok(html.includes('Premium'));
  assert.ok(!html.includes('nascosto'));
});

test('lucchetto: seguito per i lettori di schermo, ripulito', () => {
  assert.ok(lucchetto('Weekend lungo', { nascosto: ' (solo Premium)' }).includes('<span class="nascosto"> (solo Premium)</span>'));
  assert.ok(lucchetto('x', { nascosto: '<b>' }).includes('&lt;b&gt;'));
});

test('filtri: Weekend lungo dice anche a voce che è solo Premium', () => {
  const html = filtri();
  assert.match(html, /data-conta="premium-lucchetto"><span class="lucchetto">.*Weekend lungo<span class="nascosto"> \(solo Premium\)<\/span>/);
});

test('biglietto: il link della compagnia passa solo se è https', () => {
  for (const url of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', 'http://ryanair.com', '', undefined]) {
    const html = biglietto({ ...volo, url }, { adesso });
    assert.ok(!html.includes('data-conta="compagnia"'), `passato: ${url}`);
    assert.ok(!/javascript:|data:text/i.test(html));
    assert.ok(html.includes('data-conta="kiwi"'));
  }
  assert.ok(biglietto(volo, { adesso }).includes('data-conta="compagnia"'));
});

test('testa: canonical, noindex, caratteri e beacon solo col token', () => {
  const prima = process.env.CF_BEACON;
  try {
    delete process.env.CF_BEACON;
    const senza = testa({ titolo: 'DoVai', descrizione: 'Voli <belli>', percorso: '/puglia/', indicizza: false });
    assert.ok(senza.includes('<link rel="canonical" href="https://dovaivoli.it/puglia/">'));
    assert.ok(senza.includes('<meta name="robots" content="noindex">'));
    assert.ok(senza.includes('Voli &lt;belli&gt;'));
    assert.ok(senza.includes('/css/sito.css'));
    assert.match(senza, /rel="preload"[^>]*\/caratteri\/dm-sans\.woff2/);
    assert.ok(senza.includes('og:title'));
    assert.ok(!senza.includes('cloudflareinsights'));
    process.env.CF_BEACON = 'tok123';
    const con = testa({ titolo: 'DoVai', descrizione: 'x', percorso: '/', indicizza: true });
    assert.ok(!con.includes('noindex'));
    assert.ok(con.includes('static.cloudflareinsights.com/beacon.min.js'));
    assert.ok(con.includes('tok123'));
  } finally {
    if (prima === undefined) delete process.env.CF_BEACON;
    else process.env.CF_BEACON = prima;
  }
});

// ---------- Pagine intere ----------

// L'apostrofo nell'HTML esce come entità: per cercare le frasi lo si rimette.
const leggibile = html => html.replaceAll('&#39;', "'");

const altroVolo = (o, citta, p, n) => ({
  ...volo,
  k: `${o}-${citta}-${n}`.toLowerCase(),
  o,
  citta,
  p,
  va: [`2026-12-${String(10 + n).padStart(2, '0')}T18:40`, '2026-12-12T20:55'],
  w: '2026-12-12',
});

const voliProva = [
  altroVolo('BRI', 'Parigi', 40, 1), altroVolo('MXP', 'Lisbona', 55, 2), altroVolo('FCO', 'Parigi', 61, 3),
  altroVolo('BGY', 'Madrid', 70, 4), altroVolo('BDS', 'Tirana', 80, 5), altroVolo('CIA', 'Atene', 90, 6),
  altroVolo('BRI', 'Praga', 95, 7), altroVolo('MXP', 'Vienna', 99, 8), altroVolo('FCO', 'Berlino', 100, 9),
  altroVolo('BRI', 'Malaga', 100, 10), altroVolo('MXP', 'Oslo', 100, 11), altroVolo('BGY', 'Riga', 100, 12),
  altroVolo('FCO', 'Sofia', 100, 13), altroVolo('BRI', 'Cara', 250, 14),
];

const stato = (voliBacino, piuBasso = voliBacino[0]) => ({
  pronto: true,
  aggiornato: '2026-11-25T06:00:00Z',
  numero: voliBacino.filter(v => v.p <= 100).length,
  piuBasso,
  mete: voliBacino.slice(0, 3).map(v => ({ citta: v.citta, d: v.d, p: v.p })),
});
const vuoto = { pronto: false, aggiornato: null, numero: 0, piuBasso: null, mete: [] };
const di = aeroporti => voliProva.filter(v => aeroporti.includes(v.o));

const ctx = {
  voli: voliProva,
  bacini: {
    puglia: stato(di(['BRI', 'BDS'])),
    'milano-bergamo': stato(di(['MXP', 'BGY'])),
    roma: stato(di(['FCO', 'CIA'])),
  },
  adesso,
  titolare: { nome: '', citta: '' },
};

test('home: indicizzata, H1 esatto, niente «Come cambiano i prezzi»', () => {
  const p = home(ctx);
  assert.equal(p.percorso, '/');
  assert.equal(p.indicizza, true);
  assert.ok(p.html.startsWith('<!doctype html>'));
  assert.ok(p.html.includes('<h1>I voli economici del weekend, controllati ogni giorno</h1>'));
  assert.ok(!p.html.includes('Come cambiano i prezzi'));
  assert.ok(!p.html.includes('Guarda lo storico'));
  assert.ok(!p.html.includes('noindex'));
  assert.ok(!p.html.includes('Linate') && !p.html.includes('ciao@'));
});

test('home: 12 biglietti fino a 100 €, canale dopo il sesto, «Mostra altri voli»', () => {
  const html = home(ctx).html;
  assert.equal((html.match(/<article class="biglietto"/g) ?? []).length, 12);
  assert.ok(!html.includes('Cara'), 'sopra i 100 € non si vede');
  assert.ok(html.includes('Mostra altri voli'));
  assert.match(html, /<p class="altri" hidden><button[^>]*data-altri>Mostra altri voli/, 'nascosto finché non lo accende il browser');
  const posCanale = html.indexOf('id="te-lo-scriviamo"');
  const biglietti = [...html.matchAll(/<article class="biglietto"/g)].map(m => m.index);
  assert.ok(biglietti[5] < posCanale && posCanale < biglietti[6]);
  assert.ok(html.includes('Premium · ti diciamo anche quando comprare'));
  assert.ok(html.includes('Quando parti, DoVai?'));
  assert.ok(html.includes('Da Bari, Brindisi, Milano, Bergamo e Roma. Prezzi andata e ritorno, dal più basso.'));
});

test('home: dove si va, mete uniche e più basse, link al filtro', () => {
  const html = home(ctx).html;
  assert.ok(html.includes('Dove si va nel weekend'));
  assert.ok(html.includes('Le mete più economiche dei prossimi tre mesi dai nostri aeroporti.'));
  assert.ok(html.includes('href="/?a=parigi"'));
  assert.equal((html.match(/href="\/\?a=parigi"/g) ?? []).length, 1);
  assert.ok(html.includes('40 € a/r') && !html.includes('da 40'));
  assert.ok(!html.includes('ponti'));
});

test('home: senza voli dice che non c\'è niente, senza rompersi', () => {
  const html = home({ ...ctx, voli: [], bacini: { puglia: vuoto, 'milano-bergamo': vuoto, roma: vuoto } }).html;
  assert.ok(html.includes('Con questi filtri non c\'è niente.'));
  assert.ok(!html.includes('Mostra altri voli'));
});

test('bacino milano-bergamo: «Malpensa e Orio al Serio», mai Linate', () => {
  const p = bacino(ctx, 'milano-bergamo');
  assert.equal(p.percorso, '/milano-bergamo/');
  assert.equal(p.indicizza, true);
  assert.ok(p.html.includes('Malpensa e Orio al Serio'));
  assert.ok(!/Linate|LIN\b/.test(p.html));
  assert.ok(p.html.includes('<h1>Voli economici per il weekend da Milano e Bergamo</h1>'));
  assert.ok(leggibile(p.html).includes('Esci dall\'ufficio venerdì e in serata sei altrove.'));
  assert.ok(p.html.includes('Voli da Malpensa') && p.html.includes('Voli da Orio al Serio'));
  assert.ok(!/<a [^>]*>Voli da /.test(p.html), 'pagine per aeroporto non esistono: niente link');
});

test('bacino puglia: introduzione coi dati veri e la frase locale di Bruno', () => {
  const html = leggibile(bacino(ctx, 'puglia').html);
  assert.ok(html.includes('Meh, chiudi tutte cose che dobbiamo andare!'));
  assert.match(html, /<strong>4 voli del weekend<\/strong> fino a <span class="intero">100 € a\/r<\/span>/);
  assert.ok(html.includes('<strong>Bari → Parigi a 40 € a/r</strong>'));
  assert.ok(html.includes('Il più basso dei prossimi tre mesi: 40 € a/r.'));
  assert.ok(!html.includes('Lisbona →') && !html.includes('→ Lisbona'), 'solo i voli del bacino');
  assert.ok(html.includes('Le mete più economiche da Bari e Brindisi'));
});

test('bacino: l\'introduzione conta i voli dei prossimi tre mesi, non «questo mese»', () => {
  const attesi = {
    puglia: 'Da Bari e Brindisi nei prossimi tre mesi',
    'milano-bergamo': 'Nei prossimi tre mesi da Malpensa e Orio al Serio',
    roma: 'Nei prossimi tre mesi da Fiumicino e Ciampino',
  };
  for (const [slug, inizio] of Object.entries(attesi)) {
    const html = leggibile(bacino(ctx, slug).html);
    assert.ok(html.includes(inizio), slug);
    assert.ok(!/questo mese/i.test(html), slug);
  }
  assert.ok(!/questo mese/i.test(home(ctx).html));
});

test('bacino: il canale sta dopo il terzo biglietto, con il suo bacino', () => {
  const html = bacino(ctx, 'roma').html;
  const posCanale = html.indexOf('id="te-lo-scriviamo"');
  const biglietti = [...html.matchAll(/<article class="biglietto"/g)].map(m => m.index);
  assert.ok(biglietti[2] < posCanale && posCanale < biglietti[3]);
  assert.ok(html.includes('Roma'));
});

test('bacino non pronto: noindex e la frase, niente biglietti', () => {
  const p = bacino({ ...ctx, bacini: { ...ctx.bacini, roma: vuoto } }, 'roma');
  assert.equal(p.indicizza, false);
  assert.ok(p.html.includes('<meta name="robots" content="noindex">'));
  assert.ok(p.html.includes('Stiamo iniziando a seguire i voli da qui. I primi prezzi arrivano a giorni.'));
  assert.ok(!p.html.includes('<article'));
  assert.ok(p.html.includes('href="/puglia/"'));
  assert.ok(bacino({ ...ctx, bacini: {} }, 'roma').html.includes('Stiamo iniziando'));
});

test('bacini: una pagina per ciascuno', () => {
  assert.deepEqual(bacini(ctx).map(p => p.percorso), ['/puglia/', '/milano-bergamo/', '/roma/']);
});

test('premium: «non c\'è ancora», avvisami per email, non indicizzata', () => {
  const p = premium(ctx);
  assert.equal(p.percorso, '/premium/');
  assert.equal(p.indicizza, false);
  assert.ok(leggibile(p.html).includes('Premium non c\'è ancora.'));
  assert.ok(p.html.includes('mailto:info@dovaivoli.it?subject=Avvisami%20quando%20parte%20Premium'));
  assert.ok(p.html.includes('data-conta="premium-avvisami"'));
  assert.ok(p.html.includes('Nessun pagamento, nessun impegno.'));
  assert.ok(p.html.includes('noindex'));
});

test('servizio: quattro pagine con i percorsi giusti', () => {
  const l = servizio(ctx);
  assert.deepEqual(l.map(p => p.percorso), ['/come-funziona/', '/domande/', '/privacy/', '/note-legali/']);
  assert.deepEqual(l.map(p => p.indicizza), [true, true, true, true]);
  for (const p of l) {
    assert.ok(!p.html.includes('ciao@'), p.percorso);
    assert.ok(!/Linate/.test(p.html), p.percorso);
    assert.ok(p.html.includes('info@dovaivoli.it'), p.percorso);
  }
});

test('servizio: senza codice affiliato nessuna frase sulla commissione', () => {
  for (const p of servizio(ctx)) {
    assert.ok(!/commission|sostieni|affiliat/i.test(p.html), `${p.percorso} parla di commissioni`);
  }
});

test('servizio: col codice affiliato tornano commissione e link affiliato', () => {
  const l = servizio({ ...ctx, affiliato: 'abc' });
  assert.ok(l[0].html.includes('Kiwi ci dà una piccola commissione'));
  assert.ok(l[1].html.includes('Guadagniamo una piccola commissione'));
  assert.ok(l[2].html.includes('link affiliato'));
  assert.ok(l[3].html.includes('link affiliati'));
});

test('domande: dati strutturati FAQ validi', () => {
  const html = servizio(ctx)[1].html;
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(json, 'manca il JSON-LD');
  const dati = JSON.parse(json[1]);
  assert.equal(dati['@type'], 'FAQPage');
  assert.ok(dati.mainEntity.length >= 10);
  assert.ok(dati.mainEntity.every(d => d.name && d.acceptedAnswer.text));
});

test('privacy con titolare vuoto: nessun nome; compilato: nome e città', () => {
  const vuota = servizio(ctx)[2].html;
  assert.ok(vuota.includes('è gestito da una persona fisica'));
  const piena = servizio({ ...ctx, titolare: { nome: 'Mario Rossi', citta: 'Bari' } })[2].html;
  assert.ok(piena.includes('Mario Rossi, Bari'));
  assert.ok(!piena.includes('una persona fisica'));
});

test('privacy: niente lista email né fornitori di newsletter', () => {
  const html = servizio(ctx)[2].html;
  assert.ok(!/Brevo|MailerLite|riassunto|iscrizione|iscriv/i.test(html));
  assert.ok(html.includes('Cloudflare'));
  assert.ok(html.includes('Il sito non usa cookie'));
});

test('note legali: titolare e contatto', () => {
  const html = servizio(ctx)[3].html;
  assert.ok(html.includes('è gestito da una persona fisica'));
  assert.ok(html.includes('Prezzi indicativi'));
});

test('come funziona: niente promesse di cose che non ci sono ancora', () => {
  const html = servizio(ctx)[0].html;
  assert.ok(!html.includes('Weekend lungo</strong>: parti da giovedì, torni entro lunedì.'));
  assert.ok(html.includes('Come funziona DoVai'));
});

test('404: «Questa pagina non c\'è», collegamenti ai bacini, non indicizzata', () => {
  const p = errore(ctx);
  assert.equal(p.percorso, '/404.html');
  assert.equal(p.indicizza, false);
  assert.ok(leggibile(p.html).includes('Questa pagina non c\'è.'));
  for (const l of ['href="/"', 'href="/puglia/"', 'href="/milano-bergamo/"', 'href="/roma/"']) assert.ok(p.html.includes(l), l);
  assert.ok(p.html.includes('noindex'));
});

test('tutte le pagine: solo collegamenti interni a pagine che esistono', () => {
  const esistenti = new Set(['/', '/puglia/', '/milano-bergamo/', '/roma/', '/premium/', '/come-funziona/', '/domande/', '/privacy/', '/note-legali/']);
  const tutte = [home(ctx), ...bacini(ctx), premium(ctx), ...servizio(ctx), errore(ctx)];
  for (const p of tutte) {
    for (const [, href] of p.html.matchAll(/<a [^>]*href="(\/[^"?#]*)/g)) {
      assert.ok(esistenti.has(href), `${p.percorso} punta a ${href}`);
    }
  }
});

test('nessuna pagina mostra [object Object]', () => {
  for (const p of [home(ctx), ...bacini(ctx), premium(ctx), ...servizio(ctx), errore(ctx)]) {
    assert.ok(!p.html.includes('[object'), p.percorso);
  }
});

test('domande: canale e riassunto email dicono solo che non ci sono ancora', () => {
  const html = leggibile(servizio(ctx)[1].html);
  assert.ok(html.includes('Il canale sta per aprire.'));
  assert.ok(html.includes('Non c\'è ancora: arriverà presto.'));
  // Senza i disegni (il logo è in SVG dentro la pagina e i suoi tracciati hanno cifre qualsiasi) né le versioni dei file (?v=).
  assert.ok(!/martedì|22|clic in fondo|cancell/.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/\?v=[0-9a-f]+/g, '')));
});

test('privacy: i conteggi anonimi nominano i bottoni toccati, senza IP né dati del browser', () => {
  const html = leggibile(servizio(ctx)[2].html);
  assert.ok(html.includes('quali bottoni vengono toccati'));
  assert.ok(html.includes('senza indirizzo IP né dati del browser'));
  assert.ok(html.includes('Ospita il sito e tiene i conteggi anonimi, senza cookie'));
});

test('mete: oltre il prezzo iniziale il link porta anche il prezzo massimo, così la lista non è vuota', () => {
  const pochi = [altroVolo('BRI', 'Parigi', 40, 1), altroVolo('BRI', 'Cara', 250, 14), altroVolo('BDS', 'Giusta', 100, 2)];
  const c = { ...ctx, voli: pochi, bacini: { puglia: stato(pochi), 'milano-bergamo': vuoto, roma: vuoto } };
  const casa = home(c).html;
  assert.ok(casa.includes('href="/?a=cara&amp;max=250"'));
  assert.ok(casa.includes('href="/?a=parigi"'));
  assert.ok(casa.includes('href="/?a=giusta"'), 'a 100 € basta il filtro iniziale');
  const puglia = bacino(c, 'puglia').html;
  assert.ok(puglia.includes('href="/puglia/?a=cara&amp;max=250"'));
  assert.ok(puglia.includes('href="/puglia/?a=parigi"'));
});

test('servizio: i prezzi vengono dai siti delle compagnie, non dai motori di ricerca', () => {
  for (const p of servizio(ctx)) assert.ok(!p.html.includes('motori di ricerca'), p.percorso);
  assert.ok(servizio(ctx)[0].html.includes('Controlliamo i prezzi ogni giorno sui siti delle compagnie aeree.'));
  assert.ok(servizio(ctx)[3].html.includes('DoVai mostra voli trovati sui siti delle compagnie aeree. Non vendiamo biglietti'));
});

test('striscia: apre con lo slogan, una voce per tratta, la copia che scorre è nascosta ai lettori', () => {
  const html = striscia([volo, { ...volo, k: 'altro', p: 80 }, { ...volo, k: 'terzo', citta: 'Londra', d: 'STN', p: 90 }]);
  assert.ok(html.includes('Quando parti, DoVai?'));
  assert.equal((html.match(/Bari → Parigi/g) ?? []).length, 2, 'una volta per nastro, anche se ci sono due voli');
  assert.equal((html.match(/aria-hidden="true">\s*<li class="striscia__voce striscia__voce--slogan"/g) ?? []).length, 1);
  assert.ok(html.includes('69 € a/r'));
  assert.ok(html.includes('Ferma la striscia'));
  assert.equal(striscia([]), '');
});

test('volo del giorno: dati e bottoni del biglietto, nota affiliato solo col codice', () => {
  const senza = delGiorno(volo, { adesso, pagina: '/puglia/' });
  assert.ok(senza.includes('Bari → Parigi'));
  assert.ok(senza.includes('69 € a/r'));
  assert.ok(senza.includes('solo zaino'));
  assert.ok(senza.includes(`href="/puglia/?volo=${volo.k}"`));
  assert.ok(!senza.includes('link affiliato'));
  assert.ok(delGiorno(volo, { adesso, affiliato: 'abc' }).includes('Con Kiwi sostieni DoVai · link affiliato'));
  assert.ok(!delGiorno({ ...volo, url: 'javascript:alert(1)' }, { adesso }).includes('javascript:'));
  assert.equal(delGiorno(undefined), '');
});

test('intestazione: il primo link salta al contenuto, la pagina in cui sei è segnata', () => {
  const html = intestazione({ percorso: '/premium/' });
  assert.ok(html.indexOf('href="#contenuto"') < html.indexOf('<header'));
  assert.match(html, /<a href="\/premium\/" data-conta="premium-menu" aria-current="page">Premium<\/a>/);
  assert.ok(!html.includes('href="/come-funziona/" aria-current'));
});

test('piede: chiude col payoff', () => {
  assert.ok(piede().includes('Più weekend, <span>quando conviene.</span>'));
});

test('testa: il foglio di stile porta la versione del suo contenuto, così la cache non serve quello vecchio', () => {
  const html = testa({ titolo: 'T', descrizione: 'D', percorso: '/', indicizza: true });
  assert.match(html, /<link rel="stylesheet" href="\/css\/sito\.css\?v=[0-9a-f]{10}">/);
});

test('ogni pagina carica conta.js con la versione', () => {
  const tutte = [home(ctx), ...bacini(ctx), premium(ctx), ...servizio(ctx), errore(ctx)];
  for (const p of tutte) assert.match(p.html, /<script type="module" src="\/js\/conta\.js\?v=[0-9a-f]+" defer><\/script>/, p.percorso);
});

test('la voce Premium di menù e piede ha data-conta="premium-menu"', () => {
  assert.match(intestazione({ percorso: '/' }), /<a href="\/premium\/" data-conta="premium-menu">Premium<\/a>/);
  assert.match(piede({}), /<a href="\/premium\/" data-conta="premium-menu">Premium<\/a>/);
});

test('premium: prima la scelta tra mensile e annuale, senza finti acquisti', () => {
  const html = premium(ctx).html;
  const testo = leggibile(html);
  assert.ok(testo.includes('Quale ti fa più comodo?'));
  assert.ok(testo.includes('adesso non paghi niente'));
  assert.match(html, /<a class="[^"]*" href="#mensile" data-conta="premium-mensile">Mensile · 3 € al mese<\/a>/);
  assert.match(html, /<a class="[^"]*" href="#annuale" data-conta="premium-annuale">Annuale · 30 € l'anno<\/a>/);
  assert.ok(testo.includes('Due mesi gratis'));
});

test('premium: dopo la scelta «non c\'è ancora» con Avvisami che riporta la scelta', () => {
  const html = premium(ctx).html;
  for (const [id, nome] of [['mensile', 'il mensile'], ['annuale', "l'annuale"]]) {
    const blocco = html.match(new RegExp(`<section class="premium-scelta" id="${id}"[\\s\\S]*?</section>`))?.[0];
    assert.ok(blocco, id);
    assert.ok(leggibile(blocco).includes(`Hai scelto ${nome}.`), id);
    assert.ok(leggibile(blocco).includes("Premium non c'è ancora."), id);
    assert.ok(blocco.includes(`subject=Avvisami%20quando%20parte%20Premium%20(${id})`), id);
    assert.ok(blocco.includes('data-conta="premium-avvisami"'), id);
  }
});

test('riquadro Premium invariato', () => {
  const r = riquadroPremium();
  assert.ok(r.includes('>Passa a Premium</a>'));
  assert.ok(r.includes("3 € al mese o 30 € l'anno. Lo togli quando vuoi."));
});
