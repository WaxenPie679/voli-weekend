// GET /numeri/?k=<chiave>: la pagina privata dei numeri (segnalibro di Bruno). Senza chiave giusta: 404.
import { chiaveGiusta, improntaDa } from '../_lib/chiave.js';
import { leggi, riepilogo } from '../_lib/numeri.js';
import { paginaNumeri } from '../_lib/pagina-numeri.js';
import { giornoRoma } from '../_lib/regole.js';

const PRIVATA = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const chiave = q.get('k');
  if (!(await chiaveGiusta(chiave, improntaDa(env))) || !env?.DB) {
    return new Response('Pagina non trovata', { status: 404, headers: PRIVATA });
  }
  const ambiente = q.get('ambiente') === 'prova' ? 'prova' : 'vero';
  const oggi = giornoRoma(new Date());
  const r = riepilogo(await leggi(env.DB, { al: oggi, ambiente }), { oggi });
  return new Response(paginaNumeri(r, { ambiente, chiave, oggi }), {
    headers: { ...PRIVATA, 'Content-Type': 'text/html; charset=utf-8' },
  });
}
