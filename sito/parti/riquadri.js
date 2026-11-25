// I riquadri tra i biglietti: «Te lo scriviamo noi» (canale ed email) e Premium.
// Canale WhatsApp e riassunto email non esistono ancora: si dice così, senza finti moduli.
import { h } from '../statico/js/html.js';
import { BACINI } from '../config.js';

export function riquadroCanale({ bacino } = {}) {
  const suo = BACINI.find(b => b.slug === bacino);
  const quale = suo ? suo.nome : `scegli il tuo: ${BACINI.map(b => b.nome).join(' · ')}`;
  return h`<section class="riquadro riquadro--canale" id="te-lo-scriviamo" aria-labelledby="titolo-canale">
  <h2 id="titolo-canale">Non vuoi controllare ogni giorno?</h2>
  <p class="riquadro__sotto">Ti scriviamo noi quando esce un volo che conviene.</p>
  <ul class="presto">
    <li class="presto__voce" data-conta="canale">
      <strong>Entra nel canale WhatsApp</strong>
      <span class="presto__dettaglio">${quale}</span>
      <span class="presto__stato">Il canale sta per aprire</span>
    </li>
    <li class="presto__voce" data-conta="email">
      <strong>Ricevi il riassunto via email</strong>
      <span class="presto__dettaglio">Una volta a settimana, il martedì: i voli migliori dei prossimi weekend.</span>
      <span class="presto__stato">Il riassunto del martedì arriva presto</span>
    </li>
  </ul>
  <p class="riquadro__piccolo">Gratis. Esci quando vuoi.</p>
</section>`;
}

export function riquadroPremium() {
  return h`<section class="riquadro riquadro--premium" aria-labelledby="titolo-premium">
  <h2 id="titolo-premium">Premium · ti diciamo anche quando comprare</h2>
  <ul class="premium__lista">
    <li><strong>Tratte seguite:</strong> scegli una tratta e delle date, ti avvisiamo quando il prezzo scende.</li>
    <li><strong>Compra o aspetta:</strong> per ogni volo ti diciamo se conviene adesso o se di solito scende.</li>
  </ul>
  <p class="premium__azione">
    <a class="bottone bottone--kiwi bottone--grande" href="/premium/" data-conta="premium-passa">Passa a Premium</a>
    <span class="riquadro__piccolo">3 € al mese o 30 € l'anno. Lo togli quando vuoi.</span>
  </p>
</section>`;
}
