// Titolare del sito DoVai: nome e città si scrivono solo qui.
// Bruno: compila `nome` (nome e cognome) e `citta` qui sotto.
// Finché uno dei due è vuoto, la pubblicazione del sito viene rifiutata.

export const TITOLARE = { nome: '', citta: '' };

const SEGNAPOSTO = '[Nome e cognome], [città]';

const pieno = (valore) => typeof valore === 'string' && valore.trim() !== '';

export function titolareCompleto(t = TITOLARE) {
  return pieno(t.nome) && pieno(t.citta);
}

export function testoTitolare(t = TITOLARE) {
  if (!titolareCompleto(t)) return SEGNAPOSTO;
  return `${t.nome.trim()}, ${t.citta.trim()}`;
}
