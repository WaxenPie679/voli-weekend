// Configurazione del sito DoVai. Solo Node: il browser non importa questo file.

export const BACINI = [
  { slug: 'puglia', nome: 'Puglia', aeroporti: ['BRI', 'BDS'], file: ['direct.json'] },
  { slug: 'milano-bergamo', nome: 'Milano e Bergamo', aeroporti: ['MXP', 'BGY'], file: ['direct-milano.json', 'direct-bergamo.json'] },
  { slug: 'roma', nome: 'Roma', aeroporti: ['FCO', 'CIA'], file: ['direct-roma.json'] },
];

export const DATI_URL = 'https://raw.githubusercontent.com/WaxenPie679/voli-weekend/data/';

export const PREZZO_INIZIALE = 100;
export const PREZZO_MIN = 30;
export const PREZZO_MAX = 400;
export const BLOCCO = 12;
export const VECCHIO_ORE = 24;

// Sito privato: si apre solo con la password (segreto SITO_PASSWORD su GitHub), non si indicizza
// e le pagine legali non nominano il titolare. Per aprirlo al pubblico: false, e compilare sito/titolare.js.
export const PRIVATO = true;

export const KIWI_AFFILIATO = '';
export const SITO = 'https://dovaivoli.it';
export const EMAIL = 'info@dovaivoli.it';

export const AEROPORTI_NOMI = {
  BRI: 'Bari', BDS: 'Brindisi', MXP: 'Malpensa', BGY: 'Orio al Serio', FCO: 'Fiumicino', CIA: 'Ciampino',
};
