// Il biglietto di un volo, chiuso e aperto. Stesso HTML nella preparazione (Node) e nel browser.
// Importa solo formati.js e html.js: niente configurazione, il codice affiliato arriva come argomento.
import { giornoBreve, giorniWeekend, lineaWeekend, ora, permanenza, visto, prezzo, linkKiwi } from './formati.js';
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

export const tratta = v => `${CITTA_PARTENZA[v.o] ?? v.o} → ${v.citta}`;

function bottoneKiwi(v, affiliato, classe = '') {
  return h`<a class="bottone bottone--kiwi ${classe}" href="${linkKiwi(v, affiliato)}" target="${ESTERNO.target}" rel="${ESTERNO.rel}" data-conta="kiwi">Vedi su Kiwi</a>`;
}

// Finché non c'è il codice affiliato, DoVai non guadagna da Kiwi: niente nota.
function notaKiwi(affiliato) {
  if (!affiliato) return '';
  return h`<p class="nota-kiwi">Con Kiwi sostieni DoVai · link affiliato</p>`;
}

function compraOAspetta() {
  return h`<a class="premium-chiuso" href="/premium/" data-conta="premium-lucchetto">Compra o aspetta? ${grezzo(lucchetto('Premium'))}</a>`;
}

// Una riga del viaggio: «ven 8 gen · 22:55 → 23:45». Il giorno in foglia (il «quando»), gli orari in carta.
function tappa(etichetta, [partenza, arrivo]) {
  return h`<div class="tappa">
    <dt>${etichetta}</dt>
    <dd class="dato"><span class="tappa__giorno">${giornoBreve(partenza)}</span> · ${ora(partenza)} → ${ora(arrivo ?? partenza)}</dd>
  </div>`;
}

// La linea del weekend: i giorni in fila e, pieno, il tempo passato a destinazione.
function linea(v) {
  const l = lineaWeekend(v.va, v.ri);
  const giorni = l.giorni.map(g => grezzo(h`<span>${g.nome}</span>`));
  return h`<div class="linea">
    <div class="linea__disegno" aria-hidden="true">
      <div class="linea__binario" style="--giorni: ${l.giorni.length}"><span class="linea__pieno" style="--da: ${l.da.toFixed(1)}%; --a: ${l.a.toFixed(1)}%"></span></div>
      <div class="linea__giorni" style="--giorni: ${l.giorni.length}">${giorni}</div>
    </div>
    <p class="linea__resta">${permanenza(v.resta, v.citta)}</p>
  </div>`;
}

// La parte alta del biglietto, uguale nella lista e nel volo del giorno.
// I codici grandi sono per l'occhio; il titolo letto ad alta voce resta «Bari → Parigi».
export function corpoBiglietto(v, { titolo = 'h3', id = '' } = {}) {
  const da = CITTA_PARTENZA[v.o] ?? v.o;
  const testa = h`<span class="codici" aria-hidden="true"><span class="codici__da">${v.o}</span> <span class="codici__freccia">→</span> <span>${v.d}</span></span><span class="nascosto">${tratta(v)}</span>`;
  const intestazione = titolo === 'h3'
    ? h`<h3 class="tratta" id="${id}">${grezzo(testa)}</h3>`
    : h`<p class="tratta">${grezzo(testa)}</p>`;
  return h`${grezzo(intestazione)}
      <p class="biglietto__meta"><strong>${v.citta}</strong> ${v.paese ? `${v.paese} · ` : ''}da ${da} · diretto</p>
      <dl class="tappe">
        ${grezzo(tappa('Andata', v.va))}
        ${grezzo(tappa('Ritorno', v.ri))}
      </dl>
      ${grezzo(linea(v))}`;
}

// La matrice: weekend, prezzo grande, note oneste e i bottoni per prenotare.
export function talloncino(v, { adesso, affiliato = '', grande = false } = {}) {
  const vistoTesto = visto(v.visto, adesso ?? new Date());
  const compagniaLink = grande
    ? compagnia(v, 'bottone bottone--contorno', `Vedi su ${v.cia}`)
    : compagnia(v, 'o-su', `o su ${v.cia}`);
  return h`<div class="talloncino">
      <div class="talloncino__info">
        <p class="talloncino__weekend">Weekend ${giorniWeekend(v.va[0], v.ri[0])}</p>
        <p class="talloncino__prezzo">${prezzo(v.p)}</p>
        <p class="talloncino__note">andata e ritorno · solo zaino · ${v.cia}${grezzo(vistoTesto ? h`<span class="talloncino__visto">${vistoTesto}</span>` : '')}</p>
      </div>
      <div class="matrice__bottoni">
        ${grezzo(bottoneKiwi(v, affiliato, grande ? 'bottone--grande' : ''))}
        ${grezzo(compagniaLink)}
      </div>
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

// Senza codice affiliato si tolgono le parti sulla commissione: oggi non sarebbero vere.
function perche(v, vistoTesto, affiliato) {
  const quale = vistoTesto ? `quello della compagnia, ${vistoTesto}` : 'quello della compagnia';
  const testo = affiliato
    ? `Il prezzo che vedi qui è ${quale}. Su Kiwi può essere di qualche euro diverso: lì paghi il prezzo che vedi su Kiwi, e DoVai riceve una piccola commissione che lo tiene gratis. Su ${v.cia} prenoti direttamente, e a noi va bene lo stesso. Scegli tu.`
    : `Il prezzo che vedi qui è ${quale}. Su Kiwi può essere di qualche euro diverso: lì paghi il prezzo che vedi su Kiwi. Su ${v.cia} prenoti direttamente. Scegli tu.`;
  return h`<details class="perche">
    <summary>Perché due bottoni?</summary>
    <p>${testo}</p>
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

// Il link della compagnia viene dai dati: solo https, mai javascript: o data:.
const SICURO = /^https:\/\//;

function compagnia(v, classe, testo) {
  if (!SICURO.test(v.url ?? '')) return '';
  return h`<a class="${classe}" href="${v.url}" target="${ESTERNO.target}" rel="${ESTERNO.rel}" data-conta="compagnia">${testo}</a>`;
}

// volo: { k, o, d, citta, paese, va, ri, cia, p, url, visto, resta }
// opzioni: adesso (Date), aperto (biglietto già aperto), affiliato (codice Kiwi), altre (altri voli per la stessa città)
export function biglietto(volo, { adesso, aperto = false, affiliato = '', altre = [] } = {}) {
  const v = volo;
  const vistoTesto = visto(v.visto, adesso ?? new Date());
  const idTitolo = `t-${v.k}`;
  return h`<article class="biglietto" data-k="${v.k}" aria-labelledby="${idTitolo}">
  <details class="biglietto__dettagli"${grezzo(aperto ? ' open' : '')}>
    <summary class="biglietto__corpo">
      ${grezzo(corpoBiglietto(v, { id: idTitolo }))}
      <span class="biglietto__apri" aria-hidden="true"><span class="biglietto__apri-testo">Dettagli</span><svg viewBox="0 0 16 16" width="16" height="16" focusable="false"><path d="M4 6l4 4 4-4"/></svg></span>
    </summary>
    <div class="biglietto__aperto">
      ${grezzo(daSapere(v))}
      <div class="matrice matrice--aperta">
        <span class="perforazione" aria-hidden="true"></span>
        ${grezzo(talloncino(v, { adesso, affiliato, grande: true }))}
        ${grezzo(notaKiwi(affiliato))}
        ${grezzo(perche(v, vistoTesto, affiliato))}
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
    ${grezzo(talloncino(v, { adesso, affiliato }))}
    ${grezzo(notaKiwi(affiliato))}
    ${grezzo(compraOAspetta())}
  </div>
</article>`;
}

// Nessun volo con questi filtri. `pagina` è dove si torna togliendo i filtri ('/' o '/puglia/').
// Sta qui perché lo scrivono sia la preparazione sia il browser.
export function nessunVolo(pagina = '/') {
  return h`<div class="vuoto">
  <p><strong>Con questi filtri non c'è niente.</strong> Prova ad alzare il prezzo o a scegliere Weekend lungo.</p>
  <p><a class="bottone bottone--contorno" href="${pagina}" data-conta="filtro">Togli i filtri</a></p>
</div>`;
}
