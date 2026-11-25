// I filtri della lista (HOME §2): un modulo GET, così l'indirizzo si può condividere.
// Weekend lungo e i mesi dopo quelli coi dati stanno dietro il lucchetto Premium.
import { h, grezzo, lucchetto } from '../statico/js/html.js';
import { mesiDeiVoli } from '../statico/js/logica.js';
import { BACINI, AEROPORTI_NOMI, PREZZO_MIN, PREZZO_MAX, PREZZO_INIZIALE } from '../config.js';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const MESE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// La stessa regola dei mesi serve al browser per leggere l'indirizzo: sta in logica.js.
export { mesiDeiVoli };

function voceMese(valore) {
  const [, , mese] = valore.match(MESE);
  return { valore, nome: MESI[+mese - 1] };
}

const scelto = sì => grezzo(sì ? ' selected' : '');

function aeroporti(bacino) {
  const gruppi = BACINI.map(b => grezzo(h`<optgroup label="${b.nome}">
        <option value="${b.slug}"${scelto(b.slug === bacino)}>${b.nome}</option>
        ${b.aeroporti.map(a => grezzo(h`<option value="${a}">${AEROPORTI_NOMI[a]}</option>`))}
      </optgroup>`));
  return h`<option value="tutti"${scelto(!bacino)}>Tutti</option>
      ${gruppi}`;
}

// opzioni: bacino (slug della pagina), mesi (['2026-11', …] da mesiDeiVoli), riepilogo (riga «42 voli da …»)
export function filtri({ bacino, mesi = [], riepilogo = '' } = {}) {
  const pagina = bacino ? `/${bacino}/` : '/';
  const voci = mesi.filter(m => MESE.test(m)).map(voceMese).map(m => grezzo(h`<option value="${m.valore}">${m.nome}</option>`));
  return h`<form class="filtri" method="get" action="${pagina}" role="search" aria-label="Filtri dei voli">
  <div class="filtri__campo">
    <label for="f-da">Da dove parti</label>
    <select id="f-da" name="da" data-conta="filtro">
      ${grezzo(aeroporti(bacino))}
    </select>
  </div>
  <div class="filtri__campo filtri__campo--tipo">
    <span class="filtri__etichetta" id="f-tipo">Tipo di weekend</span>
    <div class="segmenti" role="group" aria-labelledby="f-tipo">
      <span class="segmento segmento--attivo" aria-current="true">Weekend</span>
      <a class="segmento" href="/premium/" data-conta="premium-lucchetto">${grezzo(lucchetto('Weekend lungo', { nascosto: ' (solo Premium)' }))}</a>
    </div>
    <p class="filtri__spiega">Parti venerdì dopo le 18:00 o sabato, torni domenica. Niente ferie.</p>
  </div>
  <div class="filtri__campo">
    <label for="f-mese">Quando</label>
    <select id="f-mese" name="mese" data-conta="filtro">
      <option value="tre" selected>I prossimi 3 mesi</option>
      ${voci}
    </select>
    <a class="filtri__premium" href="/premium/" data-conta="premium-lucchetto">${grezzo(lucchetto('Fino a 12 mesi con Premium'))}</a>
  </div>
  <div class="filtri__campo filtri__campo--prezzo">
    <label for="f-max">Fino a <output id="f-max-valore" for="f-max">${PREZZO_INIZIALE}</output> € a/r</label>
    <input id="f-max" type="range" name="max" min="${PREZZO_MIN}" max="${PREZZO_MAX}" value="${PREZZO_INIZIALE}" step="5" data-conta="filtro">
    <span class="filtri__scala dato" aria-hidden="true"><span>${PREZZO_MIN} €</span><span>${PREZZO_MAX} €</span></span>
  </div>
  <div class="filtri__campo">
    <label for="f-resta">Quanto resti</label>
    <select id="f-resta" name="resta" data-conta="filtro" aria-describedby="f-resta-spiega">
      <option value="0" selected>Qualsiasi</option>
      <option value="1">almeno 1 giorno</option>
      <option value="2">almeno 2 giorni</option>
      <option value="3">almeno 3 giorni</option>
    </select>
    <p class="filtri__spiega" id="f-resta-spiega">Dall'atterraggio al decollo del ritorno.</p>
  </div>
  <div class="filtri__campo">
    <label for="f-a">Dove vuoi andare</label>
    <input id="f-a" type="search" name="a" placeholder="Parigi, Lisbona…" list="f-a-mete" autocomplete="off" data-conta="filtro">
    <datalist id="f-a-mete"></datalist>
  </div>
  <div class="filtri__fondo">
    <p class="filtri__riepilogo" aria-live="polite">${riepilogo}</p>
    <a class="filtri__togli" href="${pagina}" data-conta="filtro">Togli i filtri</a>
    <button class="bottone bottone--scuro filtri__invia" type="submit">Mostra i voli</button>
  </div>
</form>`;
}
