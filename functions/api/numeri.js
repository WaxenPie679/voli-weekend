// GET /api/numeri: i totali in JSON per il cruscotto e il resoconto del lunedì.
// Serve «Authorization: Bearer <chiave>»; senza la chiave giusta risponde 404.
import { chiaveGiusta, improntaDa } from '../_lib/chiave.js';
import { leggi, riepilogo } from '../_lib/numeri.js';
import { giornoRoma } from '../_lib/regole.js';

const GIORNO = /^\d{4}-\d{2}-\d{2}$/;
const nonTrovata = () => new Response('Non trovata', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestGet({ request, env }) {
  const chiave = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!(await chiaveGiusta(chiave, improntaDa(env))) || !env?.DB) return nonTrovata();
  const q = new URL(request.url).searchParams;
  const oggi = giornoRoma(new Date());
  const ambiente = q.get('ambiente') === 'prova' ? 'prova' : 'vero';
  const dal = GIORNO.test(q.get('dal') ?? '') ? q.get('dal') : '2000-01-01';
  const al = GIORNO.test(q.get('al') ?? '') ? q.get('al') : oggi;
  const r = riepilogo(await leggi(env.DB, { dal, al, ambiente }), { oggi: al });
  return Response.json({ ambiente, dal, al, aggiornato: new Date().toISOString(), ...r }, { headers: { 'Cache-Control': 'no-store' } });
}
