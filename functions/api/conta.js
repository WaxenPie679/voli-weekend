// POST /api/conta: riceve {"e": evento, "p": pagina} da conta.js e somma il contatore del giorno.
// Risponde sempre 204, anche quando ignora: chi prova a gonfiare i numeri non impara le regole.
// Non legge IP, user agent o paese: solo il corpo, l'host e da dove arriva la richiesta.
import { leggiEvento, ambiente, origineAmmessa, giornoRoma } from '../_lib/regole.js';
import { registra } from '../_lib/deposito.js';

const vuota = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  try {
    const h = request.headers;
    if (!env?.DB || !origineAmmessa(h.get('origin'), h.get('referer'))) return vuota();
    const evento = leggiEvento(await request.text(), h.get('content-type'));
    if (!evento) return vuota();
    await registra(env.DB, {
      giorno: giornoRoma(new Date()),
      ambiente: ambiente(new URL(request.url).hostname),
      evento: evento.e,
      pagina: evento.p,
    });
  } catch {
    // Un conteggio perso non deve mai diventare un errore per chi visita.
  }
  return vuota();
}
