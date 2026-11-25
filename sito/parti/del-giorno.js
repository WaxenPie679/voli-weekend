// Il volo del giorno nell'apertura (da computer): il più economico, con le stesse parti dei biglietti della lista.
// Non è un <details>: i dettagli stanno nella lista, il link «Tutti i dettagli» apre lì lo stesso volo.
// Sul telefono non c'è: il primo biglietto della lista è già lui, subito sotto i filtri.
import { h, grezzo } from '../statico/js/html.js';
import { corpoBiglietto, talloncino } from '../statico/js/biglietto-html.js';

export function delGiorno(v, { adesso, affiliato = '', pagina = '/' } = {}) {
  if (!v) return '';
  return h`<aside class="del-giorno" aria-labelledby="del-giorno-titolo">
  <p class="del-giorno__etichetta" id="del-giorno-titolo">Il più economico di oggi</p>
  <div class="biglietto biglietto--giorno">
    <div class="biglietto__corpo">
      ${grezzo(corpoBiglietto(v, { titolo: 'p' }))}
    </div>
    <div class="matrice">
      <span class="perforazione" aria-hidden="true"></span>
      ${grezzo(talloncino(v, { adesso, affiliato }))}
      ${grezzo(affiliato ? '<p class="nota-kiwi">Con Kiwi sostieni DoVai · link affiliato</p>' : '')}
      <a class="del-giorno__dettagli" href="${pagina}?volo=${v.k}">Tutti i dettagli</a>
    </div>
  </div>
</aside>`;
}
