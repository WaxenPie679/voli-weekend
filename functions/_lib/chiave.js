// La chiave della pagina privata. Nel codice c'è solo la sua impronta sha256: dall'impronta non si risale alla chiave.
// La chiave vera sta nel file ~/Documents/DoVai/numeri-chiave.txt sul Mac di Bruno.
// NUMERI_IMPRONTA tra le variabili del progetto Pages, se c'è, prende il posto di questa (per cambiare chiave senza pubblicare).
export const IMPRONTA = '0000000000000000000000000000000000000000000000000000000000000000';

const esadecimale = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function chiaveGiusta(chiave, impronta = IMPRONTA) {
  if (typeof chiave !== 'string' || chiave === '' || typeof impronta !== 'string') return false;
  const calcolata = esadecimale(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chiave)));
  // Confronto a tempo costante: stessa lunghezza, si guardano tutti i caratteri.
  if (calcolata.length !== impronta.length) return false;
  let diversi = 0;
  for (let i = 0; i < calcolata.length; i++) diversi |= calcolata.charCodeAt(i) ^ impronta.charCodeAt(i);
  return diversi === 0;
}

export const improntaDa = env => env?.NUMERI_IMPRONTA || IMPRONTA;
