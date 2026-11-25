// Il volo del giorno nell'apertura (da computer): il più economico, come un biglietto appena timbrato.
// Non è un <details>: i dettagli stanno nella lista, il link «Tutti i dettagli» apre lì lo stesso volo.
// Sul telefono non c'è: il primo biglietto della lista è già lui, subito sotto i filtri.
import { h, grezzo } from '../statico/js/html.js';
import { tratta, tabellone } from '../statico/js/biglietto-html.js';
import { giornoBreve, ora, permanenza, visto, linkKiwi } from '../statico/js/formati.js';

const SICURO = /^https:\/\//;

export function delGiorno(v, { adesso, affiliato = '', pagina = '/' } = {}) {
  if (!v) return '';
  const vistoTesto = visto(v.visto, adesso ?? new Date());
  const compagnia = SICURO.test(v.url ?? '')
    ? h`<a class="o-su" href="${v.url}" target="_blank" rel="noopener" data-conta="compagnia">o su ${v.cia}</a>`
    : '';
  return h`<aside class="del-giorno" aria-labelledby="del-giorno-titolo">
  <p class="del-giorno__etichetta" id="del-giorno-titolo">Il più economico di oggi</p>
  <div class="biglietto biglietto--giorno">
    <div class="biglietto__corpo">
      <p class="tratta">${tratta(v)}</p>
      <span class="bollino bollino--timbro">${grezzo(tabellone(v.p))}</span>
      <span class="biglietto__quando dato"><span class="intero">${giornoBreve(v.va[0])} ${ora(v.va[0])} →</span> <span class="intero">${giornoBreve(v.ri[0])} ${ora(v.ri[0])}</span></span>
      <span class="biglietto__resta">${permanenza(v.resta, v.citta)}</span>
      <span class="biglietto__note"><span>solo zaino</span><span>${v.cia}</span>${grezzo(vistoTesto ? h`<span class="biglietto__visto">${vistoTesto}</span>` : '')}</span>
    </div>
    <div class="matrice">
      <span class="perforazione" aria-hidden="true"></span>
      <div class="matrice__bottoni">
        <a class="bottone bottone--kiwi" href="${linkKiwi(v, affiliato)}" target="_blank" rel="noopener" data-conta="kiwi">Vedi su Kiwi</a>
        ${grezzo(compagnia)}
        <a class="del-giorno__dettagli" href="${pagina}?volo=${v.k}">Tutti i dettagli</a>
      </div>
      ${grezzo(affiliato ? '<p class="nota-kiwi">Con Kiwi sostieni DoVai · link affiliato</p>' : '')}
    </div>
  </div>
</aside>`;
}
