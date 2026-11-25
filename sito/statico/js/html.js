// Scrittura sicura dell'HTML con un tagged template, senza import:
// lo stesso file gira in Node e nel browser.

class Grezzo {
  constructor(testo) {
    this.testo = String(testo);
  }
}

// Marca un pezzo di HTML già pronto (per esempio un altro h``) perché non venga ripulito.
export const grezzo = testo => new Grezzo(testo);

const ENTITA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const pulisci = testo => String(testo).replace(/[&<>"']/g, c => ENTITA[c]);

function valore(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Grezzo) return v.testo;
  if (Array.isArray(v)) return v.map(valore).join('');
  return pulisci(v);
}

// h`<p>${testo}</p>` ripulisce ogni valore; i pezzi marcati con grezzo() passano così come sono.
export function h(pezzi, ...valori) {
  let uscita = pezzi[0];
  for (let i = 0; i < valori.length; i++) uscita += valore(valori[i]) + pezzi[i + 1];
  return uscita;
}

// Lucchetto disegnato (mai emoji): segna ciò che c'è solo con Premium.
// `nascosto` è un seguito letto solo dai lettori di schermo (il disegno per loro non c'è),
// es. ' (solo Premium)' quando l'etichetta da sola non dice che è bloccato.
export function lucchetto(etichetta, { nascosto = '' } = {}) {
  const seguito = nascosto ? grezzo(h`<span class="nascosto">${nascosto}</span>`) : '';
  return h`<span class="lucchetto"><svg class="lucchetto__icona" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><rect x="2.75" y="7" width="10.5" height="7.25" rx="2"/><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7"/></svg>${etichetta}${seguito}</span>`;
}
