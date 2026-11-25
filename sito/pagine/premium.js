// «Premium non c'è ancora» (GUIDA §4): finché non esiste lo diciamo subito, niente finti acquisti.
import { h, grezzo } from '../statico/js/html.js';
import { EMAIL, KIWI_AFFILIATO } from '../config.js';
import { documento, apertura } from './comune.js';

// Avvisami porta nell'oggetto la scelta fatta, così sappiamo chi voleva il mensile e chi l'annuale.
const avvisami = id => `mailto:${EMAIL}?subject=Avvisami%20quando%20parte%20Premium%20(${id})`;

// Strada B (progetto del contatore, 25/11/2026): prima la scelta, poi «non c'è ancora» (GUIDA §4).
// Senza JavaScript i due bottoni portano a #mensile e #annuale e il CSS (:target) mostra il messaggio.
function dopoLaScelta(id, nome) {
  return h`<section class="premium-scelta" id="${id}" aria-labelledby="titolo-${id}">
  <p class="premium-scelta__fatta">Hai scelto ${nome}.</p>
  <h2 id="titolo-${id}">Premium non c'è ancora.</h2>
  <p class="testo__grande">Lo stiamo preparando: ti dirà quando comprare. Vuoi che ti avvisiamo quando parte?</p>
  <p class="azioni"><a class="bottone bottone--kiwi bottone--grande" href="${avvisami(id)}" data-conta="premium-avvisami">Avvisami</a></p>
  <p class="riquadro__piccolo">Nessun pagamento, nessun impegno. Ti scriviamo una volta sola, quando parte. <a href="/privacy/">Privacy</a></p>
</section>`;
}

export function pagina({ affiliato = KIWI_AFFILIATO } = {}) {
  const corpo = h`${grezzo(apertura({ titolo: 'Quale ti fa più comodo?', sottotitolo: 'Con Premium ti diciamo anche quando comprare. Scegli: adesso non paghi niente.' }))}
<section class="sezione">
  <div class="contenitore testo">
    <div class="premium-piani">
      <p class="premium-piano"><a class="bottone bottone--kiwi bottone--grande" href="#mensile" data-conta="premium-mensile">Mensile · 3 € al mese</a></p>
      <p class="premium-piano"><a class="bottone bottone--contorno bottone--grande" href="#annuale" data-conta="premium-annuale">Annuale · 30 € l'anno</a><span class="riquadro__piccolo">Due mesi gratis</span></p>
      <p class="riquadro__piccolo premium-piani__nota">Lo togli quando vuoi.</p>
    </div>
    ${grezzo(dopoLaScelta('mensile', 'il mensile'))}
    ${grezzo(dopoLaScelta('annuale', "l'annuale"))}
  </div>
</section>`;
  return {
    percorso: '/premium/',
    indicizza: false,
    html: documento({
      titolo: 'Premium · DoVai',
      descrizione: "Premium ti dice anche quando comprare: 3 € al mese o 30 € l'anno. Non c'è ancora: scegli e ti avvisiamo quando parte.",
      percorso: '/premium/',
      indicizza: false,
      corpo,
      affiliato,
    }),
  };
}
