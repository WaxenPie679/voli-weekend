// La pagina 404 (SERVIZIO.md §C): cosa è successo e dove andare, senza colpe.
import { h, grezzo } from '../statico/js/html.js';
import { BACINI, KIWI_AFFILIATO } from '../config.js';
import { documento, apertura } from './comune.js';

export function pagina({ affiliato = KIWI_AFFILIATO } = {}) {
  const bacini = BACINI.map(b => grezzo(h`<a class="bottone bottone--contorno" href="/${b.slug}/">${b.nome}</a>`));
  const corpo = h`${grezzo(apertura({ titolo: "Questa pagina non c'è." }))}
<section class="sezione">
  <div class="contenitore testo">
    <p class="testo__grande">Forse il link è vecchio o c'è un errore di battitura.</p>
    <p class="azioni"><a class="bottone bottone--kiwi bottone--grande" href="/">Guarda i voli di oggi</a></p>
    <p class="azioni">${bacini}</p>
  </div>
</section>`;
  return {
    percorso: '/404.html',
    indicizza: false,
    html: documento({
      titolo: "Questa pagina non c'è · DoVai",
      descrizione: "Questa pagina non c'è. Forse il link è vecchio o c'è un errore di battitura.",
      percorso: '/404.html',
      indicizza: false,
      corpo,
      affiliato,
    }),
  };
}
