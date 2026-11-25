// Pezzi che le pagine hanno in comune: il documento intero, l'apertura, l'elenco dei biglietti e le mete.
import { h, grezzo } from '../statico/js/html.js';
import { biglietto } from '../statico/js/biglietto-html.js';
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

// Il primo blocco di biglietti; il riquadro (se c'è) sta dopo il biglietto `dopo`.
// «Mostra altri voli» compare solo se ce ne sono altri: lo accende il browser, a blocchi di BLOCCO.
export function elencoBiglietti({ voli, tutti = voli, adesso, affiliato, riquadro = '', dopo }) {
  const primi = voli.slice(0, BLOCCO);
  const pezzi = primi.map((v, i) => {
    const altre = tutti.filter(a => a.k !== v.k && a.o === v.o && a.citta === v.citta);
    const scheda = grezzo(biglietto(v, { adesso, affiliato, altre }));
    return i + 1 === dopo ? [scheda, grezzo(riquadro)] : scheda;
  });
  // Se i biglietti sono meno del punto scelto, il riquadro chiude comunque la lista.
  if (riquadro && primi.length < dopo) pezzi.push(grezzo(riquadro));
  const altri = voli.length > BLOCCO
    ? h`<p class="altri"><button class="bottone bottone--contorno" type="button" data-altri>Mostra altri voli</button></p>`
    : '';
  return h`<div class="biglietti">${pezzi}</div>
${grezzo(altri)}`;
}

export function nessunVolo() {
  return h`<div class="vuoto">
  <p><strong>Con questi filtri non c'è niente.</strong> Prova ad alzare il prezzo o a scegliere Weekend lungo.</p>
  <p><a class="bottone bottone--contorno" href="/" data-conta="filtro">Togli i filtri</a></p>
</div>`;
}

// Elenco di mete: ognuna porta alla lista già cercata su quella città.
export function elencoMete(mete, base = '/') {
  return h`<ul class="mete">${mete.map(m => grezzo(h`<li><a href="${base}?a=${encodeURIComponent(normalizza(m.citta))}"><span class="mete__nome">${m.citta}</span> <span class="dato">${m.p} € a/r</span></a></li>`))}</ul>`;
}
