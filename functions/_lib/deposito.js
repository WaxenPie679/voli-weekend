// Il deposito del contatore: una riga per giorno, ambiente, evento e pagina, con il totale n.
// La tabella si crea da sola alla prima scrittura: nel pannello Cloudflare non serve nessun passaggio a mano.

const CREA = `CREATE TABLE IF NOT EXISTS conteggi (
  giorno TEXT NOT NULL,
  ambiente TEXT NOT NULL,
  evento TEXT NOT NULL,
  pagina TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (giorno, ambiente, evento, pagina)
)`;

const SOMMA = `INSERT INTO conteggi (giorno, ambiente, evento, pagina, n) VALUES (?, ?, ?, ?, 1)
  ON CONFLICT (giorno, ambiente, evento, pagina) DO UPDATE SET n = n + 1`;

// Una volta per istanza (per database): dopo la prima creazione non si ripete a ogni clic.
const pronti = new WeakSet();

export async function preparaTabella(db) {
  if (pronti.has(db)) return;
  await db.prepare(CREA).run();
  pronti.add(db);
}

export async function registra(db, { giorno, ambiente, evento, pagina }) {
  await preparaTabella(db);
  const somma = () => db.prepare(SOMMA).bind(giorno, ambiente, evento, pagina).run();
  try {
    await somma();
  } catch (e) {
    if (!/no such table/i.test(String(e?.message))) throw e;
    pronti.delete(db);
    await preparaTabella(db);
    await somma();
  }
}
