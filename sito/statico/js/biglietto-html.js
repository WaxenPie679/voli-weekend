// Il biglietto di un volo, chiuso e aperto. Stesso HTML nella preparazione (Node) e nel browser.
// Importa solo formati.js e html.js: niente configurazione, il codice affiliato arriva come argomento.
import { giornoBreve, ora, permanenza, visto, prezzo, linkKiwi } from './formati.js';
import { h, grezzo, lucchetto } from './html.js';

// Città di partenza per la tratta (i biglietti dicono la città, non l'aeroporto).
const CITTA_PARTENZA = {
  BRI: 'Bari', BDS: 'Brindisi', MXP: 'Milano', BGY: 'Bergamo', FCO: 'Roma', CIA: 'Roma',
};

// «Da sapere»: aeroporti lontani dal centro della città, scritti a mano.
const AEROPORTI_LONTANI = {
  BVA: { nome: 'Beauvais', km: 80 },
  CRL: { nome: 'Charleroi', km: 60 },
  GRO: { nome: 'Girona', km: 100 },
  REU: { nome: 'Reus', km: 110 },
  NYO: { nome: 'Skavsta', km: 100 },
  TRF: { nome: 'Torp', km: 110 },
  HHN: { nome: 'Hahn', km: 120 },
  NRN: { nome: 'Weeze', km: 80 },
  FMM: { nome: 'Memmingen', km: 110 },
  WMI: { nome: 'Modlin', km: 40 },
};

const ESTERNO = { target: '_blank', rel: 'noopener' };

const tratta = v => `${CITTA_PARTENZA[v.o] ?? v.o} → ${v.citta}`;

// «sab 12 dic 18:40 → lun 14 dic 21:35»: partenza dell'andata → partenza del ritorno.
// Le due metà restano intere: se la riga non basta, si va a capo dopo la freccia.
const quando = v =>
  h`<span class="intero">${giornoBreve(v.va[0])} ${ora(v.va[0])} →</span> <span class="intero">${giornoBreve(v.ri[0])} ${ora(v.ri[0])}</span>`;

function bottoneKiwi(v, affiliato, classe = '') {
  return h`<a class="bottone bottone--kiwi ${classe}" href="${linkKiwi(v, affiliato)}" target="${ESTERNO.target}" rel="${ESTERNO.rel}" data-conta="kiwi">Vedi su Kiwi</a>`;
}

function notaKiwi(affiliato) {
  return h`<p class="nota-kiwi">Con Kiwi sostieni DoVai${affiliato ? ' · link affiliato' : ''}</p>`;
}

function compraOAspetta() {
  return h`<a class="premium-chiuso" href="/premium/" data-conta="premium-lucchetto">Compra o aspetta? ${grezzo(lucchetto('Premium'))}</a>`;
}

function tappa(etichetta, [partenza, arrivo], cia) {
  return h`<div class="tappa">
    <dt>${etichetta}</dt>
    <dd><span class="dato">${giornoBreve(partenza)}</span> <span class="dato">${ora(partenza)} → ${ora(arrivo)}</span> <span class="tappa__cia">${cia}</span></dd>
  </div>`;
}

function daSapere(v) {
  const lontano = AEROPORTI_LONTANI[v.d];
  if (!lontano) return '';
  return h`<div class="da-sapere">
    <h4>Da sapere</h4>
    <p>${v.cia} atterra a ${lontano.nome}, a circa ${lontano.km} km dal centro.</p>
  </div>`;
}

function perche(v, vistoTesto) {
  const quale = vistoTesto ? `quello della compagnia, ${vistoTesto}` : 'quello della compagnia';
  return h`<details class="perche">
    <summary>Perché due bottoni?</summary>
    <p>Il prezzo che vedi qui è ${quale}. Su Kiwi può essere di qualche euro diverso: lì paghi il prezzo che vedi su Kiwi, e DoVai riceve una piccola commissione che lo tiene gratis. Su ${v.cia} prenoti direttamente, e a noi va bene lo stesso. Scegli tu.</p>
  </details>`;
}

function altreDate(v, altre) {
  if (!altre.length) return '';
  const voci = altre.slice(0, 3).map(a => grezzo(h`<li><a href="?volo=${a.k}"><span class="dato">${giornoBreve(a.va[0])} → ${giornoBreve(a.ri[0])}</span> <span class="altre__prezzo">${prezzo(a.p)}</span></a></li>`));
  return h`<div class="altre">
    <h4>Altre date per ${v.citta}</h4>
    <ul>${voci}</ul>
  </div>`;
}

function compagnia(v, classe, testo) {
  if (!v.url) return '';
  return h`<a class="${classe}" href="${v.url}" target="${ESTERNO.target}" rel="${ESTERNO.rel}" data-conta="compagnia">${testo}</a>`;
}

// volo: { k, o, d, citta, va, ri, cia, p, url, visto, resta }
// opzioni: adesso (Date), aperto (biglietto già aperto), affiliato (codice Kiwi), altre (altri voli per la stessa città)
export function biglietto(volo, { adesso, aperto = false, affiliato = '', altre = [] } = {}) {
  const v = volo;
  const vistoTesto = visto(v.visto, adesso ?? new Date());
  const idTitolo = `t-${v.k}`;
  return h`<article class="biglietto" data-k="${v.k}" aria-labelledby="${idTitolo}">
  <details class="biglietto__dettagli"${grezzo(aperto ? ' open' : '')}>
    <summary class="biglietto__corpo">
      <h3 class="tratta" id="${idTitolo}">${tratta(v)}</h3>
      <span class="bollino">${prezzo(v.p)}</span>
      <span class="biglietto__quando dato">${grezzo(quando(v))}</span>
      <span class="biglietto__resta">${permanenza(v.resta, v.citta)}</span>
      <span class="biglietto__note"><span>solo zaino</span><span>${v.cia}</span>${grezzo(vistoTesto ? h`<span class="biglietto__visto">${vistoTesto}</span>` : '')}</span>
      <span class="biglietto__apri" aria-hidden="true"><span class="biglietto__apri-testo">Dettagli</span><svg viewBox="0 0 16 16" width="16" height="16" focusable="false"><path d="M4 6l4 4 4-4"/></svg></span>
    </summary>
    <div class="biglietto__aperto">
      <dl class="tappe">
        ${grezzo(tappa('Andata', v.va, v.cia))}
        ${grezzo(tappa('Ritorno', v.ri, v.cia))}
      </dl>
      ${grezzo(daSapere(v))}
      <div class="matrice matrice--aperta">
        <span class="perforazione" aria-hidden="true"></span>
        <div class="matrice__bottoni">
          ${grezzo(bottoneKiwi(v, affiliato, 'bottone--grande'))}
          ${grezzo(compagnia(v, 'bottone bottone--contorno', `Vedi su ${v.cia}`))}
        </div>
        ${grezzo(notaKiwi(affiliato))}
        ${grezzo(perche(v, vistoTesto))}
        ${grezzo(compraOAspetta())}
        <div class="matrice__altro">
          ${grezzo(altreDate(v, altre))}
          <a class="ricevilo" href="#te-lo-scriviamo">Ricevilo prima la prossima volta</a>
        </div>
      </div>
    </div>
  </details>
  <div class="matrice matrice--chiusa">
    <span class="perforazione" aria-hidden="true"></span>
    <div class="matrice__bottoni">
      ${grezzo(bottoneKiwi(v, affiliato))}
      ${grezzo(compagnia(v, 'o-su', `o su ${v.cia}`))}
    </div>
    ${grezzo(notaKiwi(affiliato))}
    ${grezzo(compraOAspetta())}
  </div>
</article>`;
}
