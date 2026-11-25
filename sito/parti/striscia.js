// La striscia delle partenze (GUIDA §7): sul sito in foglia, testo moro in mono maiuscolo, scorre da destra a sinistra.
// Apre con lo slogan, poi le tratte più economiche del giorno. Funziona senza JavaScript:
// si ferma col pulsante (una casella), passandoci sopra, e resta ferma se il movimento è ridotto.
import { h, grezzo } from '../statico/js/html.js';
import { tratta } from '../statico/js/biglietto-html.js';
import { prezzo } from '../statico/js/formati.js';

const QUANTE = 8;

// Le tratte più basse, una per tratta, già in ordine di prezzo.
function tratteDelGiorno(voli) {
  const viste = new Set();
  const scelte = [];
  for (const v of voli) {
    const t = tratta(v);
    if (viste.has(t)) continue;
    viste.add(t);
    scelte.push(v);
    if (scelte.length === QUANTE) break;
  }
  return scelte;
}

function nastro(voli, { nascosto = false } = {}) {
  const voci = voli.map(v => grezzo(h`<li class="striscia__voce"><span>${tratta(v)}</span> <span class="striscia__prezzo">${prezzo(v.p)}</span></li>`));
  return h`<ul class="striscia__nastro"${grezzo(nascosto ? ' aria-hidden="true"' : '')}>
    <li class="striscia__voce striscia__voce--slogan">Quando parti, DoVai?</li>
    ${voci}
  </ul>`;
}

export function striscia(voli = []) {
  const scelte = tratteDelGiorno(voli);
  if (!scelte.length) return '';
  return h`<section class="striscia" aria-label="Le partenze più economiche di oggi">
  <div class="striscia__binario">
    <div class="striscia__scorre">
      ${grezzo(nastro(scelte))}
      ${grezzo(nastro(scelte, { nascosto: true }))}
    </div>
  </div>
  <label class="striscia__pausa">
    <input type="checkbox" class="striscia__ferma">
    <svg class="striscia__icona striscia__icona--pausa" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 3.5v9M11 3.5v9"/></svg>
    <svg class="striscia__icona striscia__icona--vai" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 3.5l7 4.5-7 4.5z"/></svg>
    <span class="nascosto">Ferma la striscia</span>
  </label>
</section>`;
}
