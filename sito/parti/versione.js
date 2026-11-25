// La versione di un file statico: le prime cifre dell'impronta del suo contenuto.
// Va in fondo al link (`/css/sito.css?v=…`): quando il file cambia cambia anche l'indirizzo,
// così né il browser né la cache di Cloudflare possono servire il vecchio foglio di stile con le pagine nuove.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATICO = join(dirname(fileURLToPath(import.meta.url)), '..', 'statico');
const fatte = new Map();

export function versione(relativo) {
  if (!fatte.has(relativo)) {
    const contenuto = readFileSync(join(STATICO, relativo));
    fatte.set(relativo, createHash('sha256').update(contenuto).digest('hex').slice(0, 10));
  }
  return fatte.get(relativo);
}
