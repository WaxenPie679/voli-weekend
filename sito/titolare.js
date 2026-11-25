// Titolare del sito DoVai: nome e città si scrivono solo qui.
// Dal 25/11/2026 sono vuoti di proposito: il sito è privato (PRIVATO in config.js).
// Prima di aprirlo al pubblico vanno compilati: con PRIVATO = false e campi vuoti la pubblicazione viene rifiutata.
import { PRIVATO } from './config.js';

export const TITOLARE = { nome: '', citta: '' };

const pieno = (valore) => typeof valore === 'string' && valore.trim() !== '';

export function titolareCompleto(t = TITOLARE) {
  return pieno(t.nome) && pieno(t.citta);
}

// Testo «Nome Cognome, Città», oppure stringa vuota se manca qualcosa (le pagine allora non nominano nessuno).
export function testoTitolare(t = TITOLARE) {
  if (!titolareCompleto(t)) return '';
  return `${t.nome.trim()}, ${t.citta.trim()}`;
}

// Si pubblica se il sito è privato, oppure se il titolare è compilato.
export function puoPubblicare(t = TITOLARE, privato = PRIVATO) {
  return privato === true || titolareCompleto(t);
}
