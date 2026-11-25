// Il piede di ogni pagina: testi di HOME «Piede», con l'email info@.
import { h } from '../statico/js/html.js';
import { EMAIL } from '../config.js';

export function piede() {
  return h`<footer class="piede">
  <div class="contenitore">
    <p class="piede__marchio"><img src="/img/dovai-carta.svg" alt="DoVai" width="92" height="34"> <span>Quando parti, DoVai?</span></p>
    <nav class="piede__menu" aria-label="Pagine del sito">
      <a href="/come-funziona/">Come funziona</a>
      <a href="/domande/">Domande frequenti</a>
      <a href="/premium/">Premium</a>
    </nav>
    <p>Se prenoti su Kiwi dai nostri link riceviamo una piccola commissione: è quello che tiene DoVai gratis. Su Kiwi paghi il prezzo che vedi su Kiwi, noi non aggiungiamo nulla. Se preferisci la compagnia, il bottone c'è sempre.</p>
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
