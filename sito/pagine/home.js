// La home (HOME.md): un esploratore di voli. I biglietti sono già nell'HTML; il browser li filtra.
import { h, grezzo } from '../statico/js/html.js';
import { filtri, mesiDeiVoli } from '../parti/filtri.js';
import { riquadroCanale, riquadroPremium } from '../parti/riquadri.js';
import { KIWI_AFFILIATO } from '../config.js';
import { documento, apertura, voliIniziali, riepilogo, elencoBiglietti, elencoMete, SCRIPT_ESPLORA } from './comune.js';

const METE_IN_HOME = 12;
const CANALE_DOPO = 6;

// Le mete dei tre bacini, una per città, col prezzo più basso, dalla più economica.
function metePiuBasse(bacini) {
  const migliori = new Map();
  for (const stato of Object.values(bacini ?? {})) {
    if (!stato?.pronto) continue;
    for (const m of stato.mete) {
      const prima = migliori.get(m.citta);
      if (!prima || m.p < prima.p) migliori.set(m.citta, m);
    }
  }
  return [...migliori.values()].sort((a, b) => a.p - b.p || a.citta.localeCompare(b.citta, 'it')).slice(0, METE_IN_HOME);
}

export function pagina({ voli, bacini, adesso, affiliato = KIWI_AFFILIATO }) {
  const iniziali = voliIniziali(voli);
  const mete = metePiuBasse(bacini);
  const lista = elencoBiglietti({ voli: iniziali, tutti: voli, adesso, affiliato, riquadro: riquadroCanale(), dopo: CANALE_DOPO, pagina: '/' });
  const corpo = h`${grezzo(apertura({
    riga: 'Quando parti, DoVai?',
    titolo: 'I voli economici del weekend, controllati ogni giorno',
    sottotitolo: 'Da Bari, Brindisi, Milano, Bergamo e Roma. Prezzi andata e ritorno, dal più basso.',
  }))}
<section class="sezione sezione--voli" aria-label="I voli">
  <div class="contenitore">
    ${grezzo(filtri({ mesi: mesiDeiVoli(voli), riepilogo: riepilogo(iniziali.length, 'da tutti gli aeroporti') }))}
    ${grezzo(lista)}
  </div>
</section>
<section class="sezione">
  <div class="contenitore">${grezzo(riquadroPremium())}</div>
</section>
${grezzo(mete.length ? h`<section class="sezione" aria-labelledby="titolo-mete">
  <div class="contenitore">
    <h2 id="titolo-mete">Dove si va nel weekend</h2>
    <p class="sezione__sotto">Le mete più economiche dei prossimi tre mesi dai nostri aeroporti.</p>
    ${grezzo(elencoMete(mete))}
  </div>
</section>` : '')}`;
  return {
    percorso: '/',
    indicizza: true,
    html: documento({
      titolo: 'DoVai · voli economici per il weekend dal tuo aeroporto',
      descrizione: 'I voli del weekend da Bari, Brindisi, Milano, Bergamo e Roma, controllati ogni giorno. Prezzi andata e ritorno, dal più basso.',
      percorso: '/',
      indicizza: true,
      corpo,
      affiliato,
      extra: SCRIPT_ESPLORA,
    }),
  };
}
