// Un finto D1 per i test: capisce solo le istruzioni del contatore (crea tabella, somma, legge).
// Con { senzaTabella: true } finge che la tabella sparisca dopo la prima creazione, per provare il ritentativo.
export function fintoD1({ senzaTabella = false } = {}) {
  const righe = new Map();
  let tabella = false;
  let sparita = senzaTabella;
  const istruzioni = [];
  const esegui = (sql, arg) => {
    istruzioni.push(sql);
    if (/^CREATE TABLE IF NOT EXISTS conteggi/i.test(sql)) {
      tabella = true;
      return { results: [] };
    }
    if (!tabella) throw new Error('D1_ERROR: no such table: conteggi');
    if (/^INSERT INTO conteggi/i.test(sql)) {
      if (sparita) {
        sparita = false;
        tabella = false;
        throw new Error('D1_ERROR: no such table: conteggi');
      }
      const [giorno, ambiente, evento, pagina] = arg;
      const k = [giorno, ambiente, evento, pagina].join('|');
      const r = righe.get(k) ?? { giorno, ambiente, evento, pagina, n: 0 };
      r.n += 1;
      righe.set(k, r);
      return { results: [] };
    }
    if (/^SELECT/i.test(sql)) {
      const [dal, al, ambiente] = arg;
      return { results: [...righe.values()].filter(r => r.ambiente === ambiente && r.giorno >= dal && r.giorno <= al).map(r => ({ ...r })) };
    }
    throw new Error('istruzione non prevista: ' + sql);
  };
  return {
    righe,
    istruzioni,
    prepare(sql) {
      const fai = arg => ({ run: async () => esegui(sql, arg), all: async () => esegui(sql, arg) });
      return { bind: (...arg) => fai(arg), ...fai([]) };
    },
  };
}
