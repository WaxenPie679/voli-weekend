// La striscia in cima a ogni pagina: il logo (firma moro su limone) e due collegamenti.
import { h, grezzo } from '../statico/js/html.js';

export function intestazione({ percorso = '' } = {}) {
  const qui = p => grezzo(percorso === p ? ' aria-current="page"' : '');
  return h`<a class="salta" href="#contenuto">Vai al contenuto</a>
<header class="intestazione">
  <div class="contenitore intestazione__riga">
    <a class="intestazione__logo" href="/"><img src="/img/dovai-moro.svg" alt="DoVai, alla pagina iniziale" width="92" height="34"></a>
    <nav class="intestazione__menu" aria-label="Principale">
      <a href="/come-funziona/"${qui('/come-funziona/')}>Come funziona</a>
      <a href="/premium/"${qui('/premium/')}>Premium</a>
    </nav>
  </div>
</header>`;
}
