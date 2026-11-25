// Pezzi che le pagine hanno in comune: il documento intero, l'apertura, l'elenco dei biglietti e le mete.
import { h, grezzo } from '../statico/js/html.js';
import { biglietto, nessunVolo } from '../statico/js/biglietto-html.js';
import { normalizza } from '../statico/js/formati.js';
import { testa } from '../parti/testa.js';
import { intestazione } from '../parti/intestazione.js';
import { piede } from '../parti/piede.js';
import { PREZZO_INIZIALE, BLOCCO } from '../config.js';
import { versione } from '../parti/versione.js';

// Il documento HTML intero: testa, intestazione, corpo, piede.
// Con `aereo` (home e bacini) l'aereo dell'apertura atterra nel logo: vedi intestazione.js e aereo.js.
export function documento({ titolo, descrizione, percorso, indicizza, corpo, affiliato = '', extra = '', aereo = false }) {
  return '<!doctype html>\n' + h`<html lang="it">
${grezzo(testa({ titolo, descrizione, percorso, indicizza }))}
<body>
${grezzo(intestazione({ percorso, aereo }))}
<main id="contenuto">
${grezzo(corpo)}
</main>
${grezzo(piede({ affiliato }))}
${grezzo(extra)}
${grezzo(SCRIPT_CONTA)}
</body>
</html>
`;
}

// Apertura di una pagina: titolo H1, sottotitolo e, se c'è, un pezzo in più sotto (l'introduzione del bacino).
// Con `giorno` (l'HTML del volo del giorno) l'apertura diventa a due colonne da computer: testo a sinistra, biglietto a destra.
// Lo slogan non sta più sopra il titolo: apre la striscia delle partenze.
export function apertura({ titolo, sottotitolo = '', extra = '', giorno = '' }) {
  return h`<section class="apertura${grezzo(giorno ? ' apertura--giorno' : '')}">
  <div class="contenitore apertura__griglia">
    <div class="apertura__testo">
      <h1>${titolo}</h1>
      ${grezzo(sottotitolo ? h`<p class="apertura__sotto">${sottotitolo}</p>` : '')}
      ${grezzo(extra)}
    </div>
    ${grezzo(giorno)}
  </div>
</section>`;
}

// I voli che si vedono all'apertura: fino a PREZZO_INIZIALE, già in ordine di prezzo.
export const voliIniziali = voli => voli.filter(v => v.p <= PREZZO_INIZIALE);

const riepilogo = (n, da) => `${n} ${n === 1 ? 'volo' : 'voli'} ${da}, Weekend, fino a ${PREZZO_INIZIALE} € a/r`;
export { riepilogo };

// Lo script dell'esploratore: lo caricano solo le pagine con la lista dei voli.
export const SCRIPT_ESPLORA = `<script type="module" src="/js/esplora.js?v=${versione('js/esplora.js')}" defer></script>`;
// Il contatore senza cookie: lo caricano tutte le pagine (vedi js/conta.js e functions/api/conta.js).
export const SCRIPT_CONTA = `<script type="module" src="/js/conta.js?v=${versione('js/conta.js')}" defer></script>`;
// L'aereo che atterra nel logo all'apertura (solo dove c'è anche il volo del giorno).
export const SCRIPT_AEREO = `<script type="module" src="/js/aereo.js?v=${versione('js/aereo.js')}"></script>`;

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
// «Mostra altri voli» c'è solo se ce ne sono altri, nascosto: senza JavaScript non servirebbe, lo accende esplora.js.
// data-affiliato e data-dopo servono a esplora.js per ridisegnare la lista uguale.
export function elencoBiglietti({ voli, tutti = voli, adesso, affiliato = '', riquadro = '', dopo, pagina = '/' }) {
  const pezzi = voli.length
    ? biglietti({ voli, tutti, adesso, affiliato, riquadro, dopo })
    : [grezzo(nessunVolo(pagina)), grezzo(riquadro)];
  const altri = voli.length > BLOCCO
    ? h`<p class="altri" hidden><button class="bottone bottone--contorno" type="button" data-altri>Mostra altri voli</button></p>`
    : '';
  return h`<div class="esploratore" data-affiliato="${affiliato}" data-dopo="${dopo ?? ''}">
<div class="biglietti">${pezzi}</div>
${grezzo(altri)}
</div>`;
}

// L'indirizzo di una meta: la lista cercata su quella città. Se la meta costa più del prezzo
// iniziale, anche il prezzo massimo sale fino al suo, altrimenti la lista si aprirebbe vuota.
function indirizzoMeta(m, base) {
  const max = m.p > PREZZO_INIZIALE ? `&max=${Math.ceil(m.p)}` : '';
  return `${base}?a=${encodeURIComponent(normalizza(m.citta))}${max}`;
}

// Elenco di mete: ognuna porta alla lista già cercata su quella città.
export function elencoMete(mete, base = '/') {
  return h`<ul class="mete">${mete.map(m => grezzo(h`<li><a href="${indirizzoMeta(m, base)}"><span class="mete__nome">${m.citta}</span> <span class="dato">${m.p} € a/r</span></a></li>`))}</ul>`;
}
