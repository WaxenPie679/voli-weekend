// Il piede di ogni pagina: testi di HOME «Piede», con l'email info@.
// La commissione di Kiwi si nomina solo quando c'è davvero il codice affiliato.
import { h, grezzo } from '../statico/js/html.js';
import { EMAIL } from '../config.js';

const KIWI_CON_COMMISSIONE = "Se prenoti su Kiwi dai nostri link riceviamo una piccola commissione: è quello che tiene DoVai gratis. Su Kiwi paghi il prezzo che vedi su Kiwi, noi non aggiungiamo nulla. Se preferisci la compagnia, il bottone c'è sempre.";
const KIWI_SENZA_COMMISSIONE = "Su Kiwi paghi il prezzo che vedi su Kiwi, noi non aggiungiamo nulla. Se preferisci la compagnia, il bottone c'è sempre.";

export function piede({ affiliato = '' } = {}) {
  return h`<footer class="piede">
  <div class="contenitore">
    <p class="piede__payoff">Più weekend, <span>quando conviene.</span></p>
    <p class="piede__marchio"><img src="/img/dovai-carta.svg" alt="DoVai" width="92" height="34"> <span>Quando parti, DoVai?</span></p>
    <nav class="piede__menu" aria-label="Pagine del sito">
      <a href="/come-funziona/">Come funziona</a>
      <a href="/domande/">Domande frequenti</a>
      <a href="/premium/">Premium</a>
    </nav>
    <p>${grezzo(affiliato ? KIWI_CON_COMMISSIONE : KIWI_SENZA_COMMISSIONE)}</p>
    <p>Prezzi andata e ritorno per una persona, controllati all'ora indicata: sul sito della compagnia possono cambiare.</p>
    <p class="piede__fondo">
      <span>Questo sito non usa cookie per seguirti.</span>
      <a href="/privacy/">Privacy</a>
      <a href="/note-legali/">Note legali</a>
      <a href="mailto:${EMAIL}">${EMAIL}</a>
    </p>
  </div>
</footer>`;
}
