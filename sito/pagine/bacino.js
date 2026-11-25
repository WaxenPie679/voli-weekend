// Le pagine dei bacini (BACINI.md): l'esploratore già filtrato, con introduzione locale e canale del bacino.
// Milano e Bergamo: solo Malpensa e Orio al Serio (Linate non c'è).
import { h, grezzo } from '../statico/js/html.js';
import { tratta } from '../statico/js/biglietto-html.js';
import { filtri, mesiDeiVoli } from '../parti/filtri.js';
import { riquadroCanale } from '../parti/riquadri.js';
import { striscia } from '../parti/striscia.js';
import { delGiorno } from '../parti/del-giorno.js';
import { BACINI, KIWI_AFFILIATO, PREZZO_INIZIALE } from '../config.js';
import { documento, apertura, voliIniziali, riepilogo, elencoBiglietti, elencoMete, SCRIPT_ESPLORA, SCRIPT_AEREO } from './comune.js';

const CANALE_DOPO = 3;
const NON_PRONTO = 'Stiamo iniziando a seguire i voli da qui. I primi prezzi arrivano a giorni.';

// Testi locali di ogni bacino. `introduzione` riceve {numero, tratta, prezzo, soglia} già pronti.
const TESTI = {
  puglia: {
    titolo: 'Voli economici per il weekend dalla Puglia',
    titoloPagina: 'Voli economici per il weekend da Bari e Brindisi · DoVai',
    sottotitolo: 'Da Bari e Brindisi, andata e ritorno, controllati ogni giorno. Dal più economico.',
    locale: 'Meh, chiudi tutte cose che dobbiamo andare!',
    inizio: 'Da Bari e Brindisi nei prossimi tre mesi ci sono',
    inizioZero: 'Da Bari e Brindisi nei prossimi tre mesi non ci sono',
    nomi: 'Bari e Brindisi',
    descrizione: ({ prezzo }) => `I voli del weekend dalla Puglia, andata e ritorno, controllati ogni giorno. Il più basso dei prossimi tre mesi: ${prezzo} € a/r.`,
    aeroporti: ['Bari', 'Brindisi'],
  },
  'milano-bergamo': {
    titolo: 'Voli economici per il weekend da Milano e Bergamo',
    titoloPagina: 'Voli economici per il weekend da Milano e Bergamo · DoVai',
    sottotitolo: 'Da Malpensa e Orio al Serio, andata e ritorno, controllati ogni giorno. Dal più economico.',
    locale: "Esci dall'ufficio venerdì e in serata sei altrove.",
    inizio: 'Nei prossimi tre mesi da Malpensa e Orio al Serio ci sono',
    inizioZero: 'Nei prossimi tre mesi da Malpensa e Orio al Serio non ci sono',
    nomi: 'Milano e Bergamo',
    descrizione: () => 'Malpensa e Orio al Serio: i voli del weekend andata e ritorno, controllati ogni giorno.',
    aeroporti: ['Malpensa', 'Orio al Serio'],
  },
  roma: {
    titolo: 'Voli economici per il weekend da Roma',
    titoloPagina: 'Voli economici per il weekend da Roma · DoVai',
    sottotitolo: 'Da Fiumicino e Ciampino, andata e ritorno, controllati ogni giorno. Dal più economico.',
    locale: "Dal Raccordo all'Alfama in tre ore.",
    inizio: 'Nei prossimi tre mesi da Fiumicino e Ciampino ci sono',
    inizioZero: 'Nei prossimi tre mesi da Fiumicino e Ciampino non ci sono',
    nomi: 'Roma',
    descrizione: () => 'Fiumicino e Ciampino: i voli del weekend andata e ritorno, controllati ogni giorno.',
    aeroporti: ['Fiumicino', 'Ciampino'],
  },
};

// Introduzione con i dati del giorno. In Puglia la frase locale di Bruno sta a parte e si dice il volo più basso;
// a Milano e Roma la frase locale apre il paragrafo. Se nessun volo arriva alla soglia, si dice il più basso lo stesso.
function introduzione(t, stato, slug) {
  const { numero, piuBasso } = stato;
  const soglia = PREZZO_INIZIALE;
  const conta = numero > 0
    ? h`${t.inizio} <strong>${numero} ${numero === 1 ? 'volo' : 'voli'} del weekend</strong> fino a <span class="intero">${soglia} € a/r</span>.`
    : h`${t.inizioZero} voli del weekend fino a <span class="intero">${soglia} € a/r</span>.`;
  const piu = slug === 'puglia' || numero === 0
    ? h` Il più basso è <strong>${tratta(piuBasso)} a ${piuBasso.p} € a/r</strong>.`
    : '';
  const locale = slug === 'puglia' ? '' : `${t.locale} `;
  const frase = slug === 'puglia' ? h`<p class="intro__locale">${t.locale}</p>` : '';
  return h`${grezzo(frase)}<p>${locale}${grezzo(conta)}${grezzo(piu)}</p>`;
}

function inFondo(t, stato, slug) {
  const aeroporti = t.aeroporti.map(a => grezzo(h`<li>Voli da ${a}</li>`));
  return h`<section class="sezione" aria-labelledby="titolo-mete">
  <div class="contenitore">
    <h2 id="titolo-mete">Le mete più economiche da ${t.nomi}</h2>
    ${grezzo(elencoMete(stato.mete, `/${slug}/`))}
    <ul class="aeroporti">${aeroporti}</ul>
  </div>
</section>`;
}

export function pagina({ voli, bacini, adesso, affiliato = KIWI_AFFILIATO }, slug) {
  const t = TESTI[slug];
  const config = BACINI.find(b => b.slug === slug);
  if (!t || !config) throw new Error(`Bacino sconosciuto: ${slug}`);
  const percorso = `/${slug}/`;
  const stato = bacini?.[slug];

  if (!stato?.pronto || !stato.piuBasso) {
    const altri = BACINI.filter(b => b.slug !== slug).map(b => grezzo(h`<a class="bottone bottone--contorno" href="/${b.slug}/">${b.nome}</a>`));
    const corpo = h`${grezzo(apertura({ titolo: t.titolo, sottotitolo: t.sottotitolo }))}
<section class="sezione">
  <div class="contenitore">
    <p class="vuoto"><strong>Stiamo iniziando a seguire i voli da qui.</strong> I primi prezzi arrivano a giorni.</p>
    <p class="azioni"><a class="bottone bottone--kiwi" href="/">Guarda gli altri aeroporti</a> ${altri}</p>
  </div>
</section>`;
    return {
      percorso,
      indicizza: false,
      html: documento({
        titolo: t.titoloPagina,
        descrizione: `${NON_PRONTO} I voli del weekend da ${t.nomi}.`,
        percorso,
        indicizza: false,
        corpo,
        affiliato,
      }),
    };
  }

  const suoi = voli.filter(v => config.aeroporti.includes(v.o));
  const iniziali = voliIniziali(suoi);
  const lista = elencoBiglietti({ voli: iniziali, tutti: suoi, adesso, affiliato, riquadro: riquadroCanale({ bacino: slug }), dopo: CANALE_DOPO, pagina: percorso });
  const corpo = h`${grezzo(apertura({
    titolo: t.titolo,
    sottotitolo: t.sottotitolo,
    extra: h`<div class="intro">${grezzo(introduzione(t, stato, slug))}</div>`,
    giorno: delGiorno(iniziali[0] ?? suoi[0], { adesso, affiliato, pagina: percorso }),
  }))}
${grezzo(striscia(suoi))}
<section class="sezione sezione--voli" aria-labelledby="titolo-voli">
  <div class="contenitore">
    <h2 class="nascosto" id="titolo-voli">I voli</h2>
    ${grezzo(filtri({ bacino: slug, mesi: mesiDeiVoli(suoi), riepilogo: riepilogo(iniziali.length, `da ${config.nome}`) }))}
    ${grezzo(lista)}
  </div>
</section>
${grezzo(stato.mete.length ? inFondo(t, stato, slug) : '')}`;
  return {
    percorso,
    indicizza: true,
    html: documento({
      titolo: t.titoloPagina,
      descrizione: t.descrizione({ prezzo: stato.piuBasso.p }),
      percorso,
      indicizza: true,
      corpo,
      affiliato,
      extra: SCRIPT_AEREO + SCRIPT_ESPLORA,
      aereo: true,
    }),
  };
}

export const pagine = ctx => BACINI.map(b => pagina(ctx, b.slug));
