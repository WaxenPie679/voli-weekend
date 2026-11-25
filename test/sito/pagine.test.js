import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h, grezzo } from '../../sito/statico/js/html.js';
import { biglietto } from '../../sito/parti/biglietto.js';
import { testa } from '../../sito/parti/testa.js';
import { intestazione } from '../../sito/parti/intestazione.js';
import { piede } from '../../sito/parti/piede.js';
import { filtri } from '../../sito/parti/filtri.js';
import { riquadroCanale, riquadroPremium } from '../../sito/parti/riquadri.js';
import { lucchetto } from '../../sito/parti/lucchetto.js';

const adesso = new Date('2026-11-25T12:00:00Z');

const volo = {
  k: 'bri-bva-2026-12-12-1840',
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
    'Con Kiwi sostieni DoVai',
    'data-k="bri-bva-2026-12-12-1840"',
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

test('biglietto: Kiwi col codice affiliato porta la nota, gli altri link restano', () => {
  const html = biglietto(volo, { adesso, affiliato: 'abc' });
  assert.ok(html.includes('affilid=abc'));
  assert.ok(html.includes('link affiliato'));
});

test('biglietto: «Da sapere» solo per gli aeroporti lontani, «Altre date» solo se ci sono', () => {
  const vicino = { ...volo, d: 'CDG', k: 'bri-cdg-2026-12-12-1840' };
  const html = biglietto(vicino, { adesso });
  assert.ok(!html.includes('Da sapere'));
  assert.ok(!html.includes('Altre date'));
  const altra = { ...vicino, k: 'bri-cdg-2027-01-09-0700', va: ['2027-01-09T07:00', '2027-01-09T09:15'], ri: ['2027-01-10T20:00', '2027-01-10T22:10'], p: 54 };
  const conAltre = biglietto(vicino, { adesso, altre: [altra] });
  assert.ok(conAltre.includes('Altre date per Parigi'));
  assert.ok(conAltre.includes('?volo=bri-cdg-2027-01-09-0700'));
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
});

test('intestazione: logo che porta alla home', () => {
  const html = intestazione();
  assert.match(html, /<a [^>]*href="\/"/);
  assert.ok(html.includes('/img/dovai-moro.svg'));
});

test('filtri: cursore 30–400 su 100 € a/r, lucchetti e tutti i controlli', () => {
  const html = filtri({ adesso });
  assert.match(html, /<form [^>]*method="get"/);
  assert.match(html, /type="range"[^>]*name="max"[^>]*min="30" max="400" value="100"/);
  for (const atteso of ['Da dove parti', 'Weekend lungo', 'Quando', 'I prossimi 3 mesi', 'Fino a 12 mesi con Premium',
    'Quanto resti', 'Dove vuoi andare', 'Togli i filtri', 'Parti venerdì dopo le 18:00 o sabato, torni domenica. Niente ferie.',
    'data-conta="filtro"', 'data-conta="premium-lucchetto"', 'Malpensa', 'Orio al Serio']) {
    assert.ok(html.includes(atteso), `manca «${atteso}»`);
  }
  assert.ok(!html.includes('Linate'));
  // i tre mesi dopo novembre 2026
  assert.ok(html.includes('value="2026-12"') && html.includes('value="2027-01"') && html.includes('value="2027-02"'));
  assert.ok(!html.includes('value="2027-03"'));
});

test('filtri: sulla pagina di un bacino quel bacino è già scelto', () => {
  const html = filtri({ bacino: 'roma', adesso });
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
