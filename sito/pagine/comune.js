// Pezzi che le pagine hanno in comune: il documento intero, l'apertura, l'elenco dei biglietti e le mete.
import { h, grezzo } from '../statico/js/html.js';
import { biglietto, nessunVolo } from '../statico/js/biglietto-html.js';
import { normalizza } from '../statico/js/formati.js';
import { testa } from '../parti/testa.js';
import { intestazione } from '../parti/intestazione.js';
import { piede } from '../parti/piede.js';
import { PREZZO_INIZIALE, BLOCCO } from '../config.js';

// Il documento HTML intero: testa, intestazione, corpo, piede.
export function documento({ titolo, descrizione, percorso, indicizza, corpo, affiliato = '', extra = '' }) {
  return '<!doctype html>\n' + h`<html lang="it">
${grezzo(testa({ titolo, descrizione, percorso, indicizza }))}
<body>
${grezzo(intestazione())}
<main id="contenuto">
${grezzo(corpo)}
</main>
${grezzo(piede({ affiliato }))}
${grezzo(extra)}
</body>
</html>
`;
}

// Apertura di una pagina: riga piccola (facoltativa), titolo H1 e sottotitolo.
export function apertura({ riga = '', titolo, sottotitolo = '' }) {
  return h`<section class="apertura">
  <div class="contenitore">
    ${grezzo(riga ? h`<p class="apertura__riga dato">${riga}</p>` : '')}
    <h1>${titolo}</h1>
    ${grezzo(sottotitolo ? h`<p class="apertura__sotto">${sottotitolo}</p>` : '')}
  </div>
</section>`;
}

// I voli che si vedono all'apertura: fino a PREZZO_INIZIALE, già in ordine di prezzo.
export const voliIniziali = voli => voli.filter(v => v.p <= PREZZO_INIZIALE);

const riepilogo = (n, da) => `${n} ${n === 1 ? 'volo' : 'voli'} ${da}, Weekend, fino a ${PREZZO_INIZIALE} € a/r`;
export { riepilogo };

// Lo script dell'esploratore: lo caricano solo le pagine con la lista dei voli.
export const SCRIPT_ESPLORA = '<script type="module" src="/js/esplora.js" defer></script>';

function biglietti({ voli, tutti, adesso, affiliato, riquadro, dopo }) {
  const primi = voli.slice(0, BLOCCO);
  const pezzi = primi.map((v, i) => {
    const altre = tutti.filter(a => a.k !== v.k && a.o === v.o && a.citta === v.citta);
    const scheda = grezzo(biglietto(v, { adesso, affiliato, altre }));
    return i + 1 === dopo ? [scheda, grezzo(riquadro)] : scheda;
  });
  // Se i biglietti sono meno del punto scelto, il riquadro chiude comunque la lista.
  if (riquadro && primi.length < dopo) pezzi.push(grezzo(riquadro));
  return pezzi;
}

// La lista dei voli con il primo blocco di biglietti; il riquadro (se c'è) sta dopo il biglietto `dopo`.
// Senza voli: «Con questi filtri non c'è niente.» e poi il riquadro.
// «Mostra altri voli» compare solo se ce ne sono altri: lo accende il browser, a blocchi di BLOCCO.
// data-affiliato e data-dopo servono a esplora.js per ridisegnare la lista uguale.
export function elencoBiglietti({ voli, tutti = voli, adesso, affiliato = '', riquadro = '', dopo, pagina = '/' }) {
  const pezzi = voli.length
    ? biglietti({ voli, tutti, adesso, affiliato, riquadro, dopo })
    : [grezzo(nessunVolo(pagina)), grezzo(riquadro)];
  const altri = voli.length > BLOCCO
    ? h`<p class="altri"><button class="bottone bottone--contorno" type="button" data-altri>Mostra altri voli</button></p>`
    : '';
  return h`<div class="esploratore" data-affiliato="${affiliato}" data-dopo="${dopo ?? ''}">
<div class="biglietti">${pezzi}</div>
${grezzo(altri)}
</div>`;
}

// Elenco di mete: ognuna porta alla lista già cercata su quella città.
export function elencoMete(mete, base = '/') {
  return h`<ul class="mete">${mete.map(m => grezzo(h`<li><a href="${base}?a=${encodeURIComponent(normalizza(m.citta))}"><span class="mete__nome">${m.citta}</span> <span class="dato">${m.p} € a/r</span></a></li>`))}</ul>`;
}
