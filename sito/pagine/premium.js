// «Premium non c'è ancora» (GUIDA §4): finché non esiste lo diciamo subito, niente finti acquisti.
import { h, grezzo } from '../statico/js/html.js';
import { EMAIL, KIWI_AFFILIATO } from '../config.js';
import { documento, apertura } from './comune.js';

const AVVISAMI = `mailto:${EMAIL}?subject=Avvisami%20quando%20parte%20Premium`;

export function pagina({ affiliato = KIWI_AFFILIATO } = {}) {
  const corpo = h`${grezzo(apertura({ titolo: "Premium non c'è ancora." }))}
<section class="sezione">
  <div class="contenitore testo">
    <p class="testo__grande">Lo stiamo preparando: ti dirà quando comprare. Vuoi che ti avvisiamo quando parte?</p>
    <p class="azioni"><a class="bottone bottone--kiwi bottone--grande" href="${AVVISAMI}" data-conta="premium-avvisami">Avvisami</a></p>
    <p class="riquadro__piccolo">Nessun pagamento, nessun impegno. Ti scriviamo una volta sola, quando parte. <a href="/privacy/">Privacy</a></p>
  </div>
</section>`;
  return {
    percorso: '/premium/',
    indicizza: false,
    html: documento({
      titolo: 'Premium · DoVai',
      descrizione: "Premium non c'è ancora: lo stiamo preparando. Scrivici e ti avvisiamo quando parte.",
      percorso: '/premium/',
      indicizza: false,
      corpo,
      affiliato,
    }),
  };
}
