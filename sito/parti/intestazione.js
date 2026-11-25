// La striscia in cima a ogni pagina: il logo (firma moro su limone) e due collegamenti.
// Il logo sta dentro la pagina (non come immagine) perché la D si possa nascondere mentre l'aereo atterra (aereo.js).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { h, grezzo } from '../statico/js/html.js';

// Il logo viene dal file ufficiale. I suoi primi tre tracciati sono la D: la pancia, l'ala sinistra (ovale
// piccolo), l'asta con la coda. L'aereo dell'icona app è l'asta con due ali, l'ovale e lo stesso ovale ribaltato:
// all'atterraggio l'ala destra si allarga e diventa la pancia (aereo.js).
const FILE_LOGO = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'statico', 'img', 'dovai-moro.svg'), 'utf8');
const TRACCIATI = [...FILE_LOGO.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
export const [D_PANCIA, D_ALA, D_ASTA] = TRACCIATI;

const LOGO = `<svg class="logo" viewBox="0 0 186.74 69.35" width="92" height="34" aria-hidden="true" focusable="false"><g fill="#2A1A14"><g class="logo__d">${TRACCIATI.slice(0, 3).map(d => `<path d="${d}"/>`).join('')}</g>${TRACCIATI.slice(3).map(d => `<path d="${d}"/>`).join('')}</g></svg>`;

// Il volo parte solo alla prima apertura della visita, in cima alla pagina e col movimento permesso.
// Questo pezzo gira prima che la pagina si veda: nasconde la D (la porta l'aereo) e segna la pagina,
// così il tabellone del biglietto del giorno aspetta l'atterraggio. Se aereo.js non arriva, il CSS rimette la D.
const AVVIO_AEREO = `<script>try{var d=document.documentElement;if(!sessionStorage.getItem('dovai-aereo')&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&scrollY<10&&!location.hash&&!/[?&]volo=/.test(location.search)){sessionStorage.setItem('dovai-aereo','1');d.classList.add('con-aereo','aereo-in-volo')}}catch(e){}</script>`;

export function intestazione({ percorso = '', aereo = false } = {}) {
  const qui = p => grezzo(percorso === p ? ' aria-current="page"' : '');
  return h`<a class="salta" href="#contenuto">Vai al contenuto</a>
<header class="intestazione">
  <div class="contenitore intestazione__riga">
    <a class="intestazione__logo" href="/" aria-label="DoVai, alla pagina iniziale">${grezzo(LOGO)}</a>
    <nav class="intestazione__menu" aria-label="Principale">
      <a href="/come-funziona/"${qui('/come-funziona/')}>Come funziona</a>
      <a href="/premium/" data-conta="premium-menu"${qui('/premium/')}>Premium</a>
    </nav>
  </div>
</header>${grezzo(aereo ? AVVIO_AEREO : '')}`;
}
