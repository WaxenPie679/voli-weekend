# Contatore DoVai · piano di lavoro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** contare senza cookie ingressi, pagine e clic su dovaivoli.it in un database Cloudflare D1, con la pagina privata `/numeri/` e la scelta mensile/annuale su `/premium/`.

**Architecture:** uno script del browser (`sito/statico/js/conta.js`) manda `{e, p}` con sendBeacon a una Pages Function (`functions/api/conta.js`) che somma contatori giornalieri in D1 (collegamento `DB`). `functions/api/numeri.js` (JSON) e `functions/numeri/index.js` (HTML) leggono i totali, protetti da una chiave di cui il codice conosce solo l'impronta sha256.

**Tech Stack:** Node 24 ESM, `node --test`, Cloudflare Pages Functions + D1, sito statico di `sito/build.js`, wrangler 3.114.0 (già nel workflow).

**Spec:** `docs/superpowers/specs/2026-11-25-contatore-dovai-design.md`

## Global Constraints

- Mai salvare né leggere IP, user agent, paese; mai cookie, localStorage o sessionStorage in `conta.js`.
- Nessuno script o servizio di terzi.
- Il conteggio non blocca né ritarda nessun link (sendBeacon, fallback `fetch` con `keepalive: true`, errori muti).
- Testi del riquadro Premium invariati: «Passa a Premium» · «3 € al mese o 30 € l'anno. Lo togli quando vuoi.».
- `/api/conta` risponde sempre `204`; `/api/numeri` e `/numeri/` senza chiave giusta rispondono `404`.
- Giorno nell'ora di Roma (`Europe/Rome`), formato `AAAA-MM-GG`.
- Ambiente `vero` solo per host `dovaivoli.it` e `www.dovaivoli.it`; tutto il resto `prova`.
- Test in `test/` (solo lì li legge `npm test`); commenti e nomi in italiano come nel resto del repo.
- Niente `wrangler.toml`.

## Review Focus

1. Corpo inviato da sendBeacon come `text/plain;charset=UTF-8`: deve essere accettato (test nel Task 1).
2. Clic col tasto destro (`auxclick` con `button === 2`) non conta; tasto centrale sì (test nel Task 4).
3. Tabella D1 inesistente al primo evento: la Function la crea e non perde l'evento (test nel Task 2).
4. Chiave sbagliata, vuota o mancante su `/numeri/` e `/api/numeri`: `404`, nessun numero nel corpo (test nel Task 3).
5. Percorso con query, `#` o pagina sconosciuta (`/roma/?volo=x`, `/pippo`): diventa `/roma/` o `altro` (test nei Task 1 e 4).

---

### Task 1: Regole comuni

**Files:**
- Create: `functions/_lib/regole.js`
- Test: `test/contatore/regole.test.js`

**Interfaces:**
- Produces:
  - `EVENTI: readonly string[]`: i 13 eventi della tabella del progetto.
  - `PERCORSI: readonly string[]`: `/`, `/puglia/`, `/milano-bergamo/`, `/roma/`, `/premium/`, `/come-funziona/`, `/domande/`, `/privacy/`, `/note-legali/`, `/404.html`.
  - `leggiEvento(testo: string, tipo: string | null) → { e: string, p: string } | null`
  - `ambiente(host: string) → 'vero' | 'prova'`
  - `origineAmmessa(origin: string | null, referer: string | null) → boolean`
  - `giornoRoma(data: Date) → string`

- [ ] **Step 1: test che falliscono**

```js
test('leggiEvento accetta text/plain di sendBeacon', () => {
  assert.deepEqual(leggiEvento('{"e":"kiwi","p":"/roma/"}', 'text/plain;charset=UTF-8'), { e: 'kiwi', p: '/roma/' });
});
test('leggiEvento accetta application/json e rifiuta altri tipi', () => {
  assert.ok(leggiEvento('{"e":"kiwi","p":"/"}', 'application/json'));
  assert.equal(leggiEvento('{"e":"kiwi","p":"/"}', 'multipart/form-data'), null);
});
test('leggiEvento: evento sconosciuto, JSON rotto o corpo oltre 200 byte → null', () => {
  assert.equal(leggiEvento('{"e":"hack","p":"/"}', 'text/plain'), null);
  assert.equal(leggiEvento('{non json', 'text/plain'), null);
  assert.equal(leggiEvento(JSON.stringify({ e: 'kiwi', p: '/' + 'x'.repeat(200) }), 'text/plain'), null);
});
test('leggiEvento: percorso pulito o «altro»', () => {
  assert.equal(leggiEvento('{"e":"pagina","p":"/roma/?volo=x#a"}', 'text/plain').p, '/roma/');
  assert.equal(leggiEvento('{"e":"pagina","p":"/pippo"}', 'text/plain').p, 'altro');
});
test('ambiente: vero solo su dovaivoli.it e www', () => {
  assert.equal(ambiente('dovaivoli.it'), 'vero');
  assert.equal(ambiente('www.dovaivoli.it'), 'vero');
  assert.equal(ambiente('prova.dovai.pages.dev'), 'prova');
  assert.equal(ambiente('dovai.pages.dev'), 'prova');
});
test('origineAmmessa: sito, www e anteprime; il resto no', () => {
  assert.ok(origineAmmessa('https://dovaivoli.it', null));
  assert.ok(origineAmmessa(null, 'https://www.dovaivoli.it/roma/'));
  assert.ok(origineAmmessa('https://prova.dovai.pages.dev', null));
  assert.ok(origineAmmessa('https://a1b2c3.dovai.pages.dev', null));
  assert.equal(origineAmmessa('https://dovaivoli.it.evil.com', null), false);
  assert.equal(origineAmmessa(null, null), false);
});
test('giornoRoma usa l\'ora italiana', () => {
  assert.equal(giornoRoma(new Date('2026-11-25T23:30:00Z')), '2026-11-26');
});
```

- [ ] **Step 2:** `node --test test/contatore/regole.test.js` → FAIL (modulo mancante).
- [ ] **Step 3:** implementa `functions/_lib/regole.js`. Percorso: togli tutto da `?` o `#`; se non è in `PERCORSI` → `'altro'`. Origine: `new URL()` e host esatto `dovaivoli.it` / `www.dovaivoli.it`, oppure che finisce con `.dovai.pages.dev` o è `dovai.pages.dev`, solo `https:`. Giorno: `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' })`.
- [ ] **Step 4:** `node --test test/contatore/regole.test.js` → PASS.
- [ ] **Step 5:** aggiungi a `test/sito/build.test.js` un test: ogni `percorso` delle pagine scritte da `prepara` (con le fixture già usate dal file) è in `PERCORSI`. `npm test` → PASS.
- [ ] **Step 6:** commit `feat(contatore): regole comuni per eventi, percorsi e origine`.

### Task 2: Deposito D1 e `POST /api/conta`

**Files:**
- Create: `functions/_lib/deposito.js`, `functions/api/conta.js`
- Test: `test/contatore/conta.test.js` (con un finto D1)

**Interfaces:**
- Consumes: Task 1 (`leggiEvento`, `ambiente`, `origineAmmessa`, `giornoRoma`).
- Produces:
  - `registra(db: D1Database, riga: { giorno, ambiente, evento, pagina }) → Promise<void>`: `CREATE TABLE IF NOT EXISTS conteggi (giorno TEXT, ambiente TEXT, evento TEXT, pagina TEXT, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (giorno, ambiente, evento, pagina))`, poi `INSERT … VALUES (?,?,?,?,1) ON CONFLICT DO UPDATE SET n = n + 1`. Creazione della tabella una volta per istanza (variabile del modulo), riprovata se l'insert fallisce con «no such table».
  - `onRequestPost({ request, env }) → Response` (sempre `204`, `Cache-Control: no-store`).
  - Finto D1 per i test in `test/contatore/finto-d1.js`: `fintoD1() → { prepare(sql).bind(...).run()/all(), righe: Map }`, che interpreta solo le tre istruzioni usate (create, upsert, select del Task 3).

- [ ] **Step 1: test che falliscono**

```js
test('un clic Kiwi da dovaivoli.it diventa una riga «vero»', async () => {
  const db = fintoD1();
  const r = await onRequestPost(richiesta({ host: 'dovaivoli.it', origin: 'https://dovaivoli.it', corpo: '{"e":"kiwi","p":"/roma/"}' }, db));
  assert.equal(r.status, 204);
  assert.deepEqual([...db.righe.values()], [{ giorno: giornoRoma(new Date()), ambiente: 'vero', evento: 'kiwi', pagina: '/roma/', n: 1 }]);
});
test('due clic uguali sommano n', async () => { /* stesso evento due volte → n === 2 */ });
test('dall\'anteprima conta come «prova»', async () => { /* host prova.dovai.pages.dev → ambiente 'prova' */ });
test('origine estranea o evento non valido: 204 e nessuna riga', async () => { /* origin https://altro.it → db.righe.size === 0 */ });
test('senza collegamento DB: 204, nessun errore', async () => { /* env = {} */ });
test('non legge IP né user agent', async () => {
  // la Request di prova ha cf-connecting-ip e user-agent: nessuna riga contiene quei valori
});
```

- [ ] **Step 2:** `node --test test/contatore/conta.test.js` → FAIL.
- [ ] **Step 3:** implementa `deposito.js` e `functions/api/conta.js` (corpo letto con `request.text()`, host da `new URL(request.url).hostname`).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `feat(contatore): /api/conta somma i contatori in D1`.

### Task 3: Numeri, chiave e pagina privata

**Files:**
- Create: `functions/_lib/chiave.js`, `functions/_lib/numeri.js`, `functions/_lib/pagina-numeri.js`, `functions/api/numeri.js`, `functions/numeri/index.js`
- Test: `test/contatore/numeri.test.js`

**Interfaces:**
- Consumes: Task 2 (`fintoD1`, tabella `conteggi`).
- Produces:
  - `IMPRONTA: string` (sha256 esadecimale; nel Task 7 si sostituisce con quella vera; nei test si passa un'impronta di prova).
  - `chiaveGiusta(chiave: string | null, impronta = IMPRONTA) → Promise<boolean>`: `crypto.subtle.digest('SHA-256')`, confronto a tempo costante; `null` o vuota → `false`.
  - `leggi(db, { dal, al, ambiente }) → Promise<Riga[]>`
  - `riepilogo(righe: Riga[], { oggi: string }) → { ingressi, pagine, premium: { totale, passa, lucchetto, menu }, soglia: { percentuale: number | null, valida: boolean }, mensile, annuale, avvisami, kiwi, compagnia, canale, email, filtro, ultimi7: {evento → n}, perGiorno: [{giorno, ingressi, premium}], perPagina: [{pagina, pagine}] }`. `percentuale = premium.totale / ingressi * 100` (una cifra decimale; `null` con 0 ingressi); `valida = ingressi >= 800`.
  - `paginaNumeri(riepilogo, { ambiente, chiave }) → string` (HTML intero).
  - `onRequestGet` in `functions/api/numeri.js` (Bearer, parametri `dal`, `al`, `ambiente`, JSON) e in `functions/numeri/index.js` (`?k=`, `?ambiente=prova`, HTML).

- [ ] **Step 1: test che falliscono**

```js
test('riepilogo: soglia Premium = (passa+lucchetto+menu) / ingressi', () => {
  const r = riepilogo([riga('ingresso', 1000), riga('premium-passa', 20), riga('premium-lucchetto', 8), riga('premium-menu', 2)], { oggi: '2026-11-26' });
  assert.equal(r.premium.totale, 30);
  assert.equal(r.soglia.percentuale, 3);
  assert.equal(r.soglia.valida, true);
});
test('riepilogo: sotto 800 ingressi la soglia non è valida; con 0 ingressi percentuale null', () => { /* … */ });
test('chiaveGiusta: giusta sì, sbagliata/vuota/null no', async () => { /* impronta di 'segreta' */ });
test('/numeri/ senza chiave o con chiave sbagliata: 404 senza numeri', async () => { /* corpo non contiene «ingressi» */ });
test('/numeri/ con chiave: 200, no-store, noindex, Referrer-Policy no-referrer, mostra la percentuale', async () => {
  // headers: Cache-Control no-store, Referrer-Policy no-referrer, X-Robots-Tag noindex; corpo contiene «3,0 %» e «vale da 800 visite»
});
test('/numeri/ non contiene link esterni', async () => { /* nessun href="http che non sia dovaivoli.it */ });
test('/api/numeri con Bearer giusto: JSON con soglia; senza: 404', async () => { /* … */ });
test('?ambiente=prova legge solo le righe prova', async () => { /* … */ });
```

- [ ] **Step 2:** `node --test test/contatore/numeri.test.js` → FAIL.
- [ ] **Step 3:** implementa. La pagina: HTML con stile inline nei colori del sito (testa di moro `#2A1A14` su carta, numeri in `JetBrains Mono` con fallback monospace), leggibile a 375 px; sezioni nell'ordine del progetto (soglie, 7 giorni e totale, mensile/annuale, pagine più viste); interruttore «vero / prova» come due link che tengono `k`. Numeri formattati all'italiana (`Intl.NumberFormat('it-IT')`). Escape di ogni valore letto dal database.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `feat(contatore): pagina privata /numeri/ e /api/numeri`.

### Task 4: Script del browser su ogni pagina

**Files:**
- Create: `sito/statico/js/conta.js`
- Modify: `sito/pagine/comune.js` (documento: aggiunge lo script a ogni pagina), `sito/parti/intestazione.js` e `sito/parti/piede.js` (`data-conta="premium-menu"` sulla voce Premium)
- Test: `test/sito/conta.test.js`, `test/sito/pagine.test.js`

**Interfaces:**
- Produces (esportate da `conta.js` per i test; lo script si avvia da solo solo se `typeof document !== 'undefined'`):
  - `eIngresso(referrer: string, host: string) → boolean`: vero se vuoto o di un altro host.
  - `percorsoPulito(pathname: string) → string`
  - `daContare(evento: { type, button, target }) → string | null`: nome dal `data-conta` più vicino; per `auxclick` solo `button === 1`; per `click` su `select`/`input` (filtri) `null`.
  - `SCRIPT_CONTA` in `comune.js`: `<script type="module" src="/js/conta.js?v=${versione('js/conta.js')}" defer></script>`.

- [ ] **Step 1: test che falliscono**

```js
test('eIngresso: da fuori o senza referrer sì, da dovaivoli.it no', () => {
  assert.equal(eIngresso('', 'dovaivoli.it'), true);
  assert.equal(eIngresso('https://www.instagram.com/', 'dovaivoli.it'), true);
  assert.equal(eIngresso('https://dovaivoli.it/roma/', 'dovaivoli.it'), false);
});
test('daContare: tasto destro no, centrale sì', () => {
  const a = finto('a', { conta: 'kiwi' });
  assert.equal(daContare({ type: 'auxclick', button: 2, target: a }), null);
  assert.equal(daContare({ type: 'auxclick', button: 1, target: a }), 'kiwi');
});
test('daContare: clic su un select dei filtri non conta (conta il change)', () => { /* … */ });
test('daContare: clic sullo span dentro il bottone risale al data-conta', () => { /* … */ });
test('percorsoPulito toglie query e #', () => { assert.equal(percorsoPulito('/roma/'), '/roma/'); });
// in pagine.test.js:
test('ogni pagina carica conta.js con la versione', () => { /* tutte le pagine contengono /js/conta.js?v= */ });
test('la voce Premium di menù e piede ha data-conta="premium-menu"', () => { /* … */ });
```

- [ ] **Step 2:** `npm test` → FAIL sui nuovi test.
- [ ] **Step 3:** implementa `conta.js`: all'avvio `invia('pagina')` e, se `eIngresso(document.referrer, location.hostname)`, `invia('ingresso')`; ascoltatori `click` e `auxclick` sul documento (fase di cattura, `passive`) con `daContare`; ascoltatore `change` per gli elementi `[data-conta="filtro"]` con al massimo un invio ogni 2000 ms. `invia(e)`: `navigator.sendBeacon('/api/conta', JSON.stringify({ e, p: percorsoPulito(location.pathname) }))`, altrimenti `fetch(..., { method: 'POST', body, keepalive: true }).catch(() => {})`, tutto in `try`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `feat(contatore): conta.js su ogni pagina`.

### Task 5: Pagina Premium con la scelta e privacy

Prima di scrivere i testi: skill `design:ux-copy` sulla voce di `brand/GUIDA.md` (repo del servizio); i testi si approvano sull'anteprima.

**Files:**
- Modify: `sito/pagine/premium.js`, `sito/statico/css/sito.css`, `sito/pagine/servizio.js`
- Test: `test/sito/pagine.test.js`

**Interfaces:**
- Consumes: Task 4 (`data-conta` letti da `conta.js`).

- [ ] **Step 1: test che falliscono**

```js
test('premium: due scelte con data-conta e link a #mensile e #annuale', () => {
  // href="#mensile" data-conta="premium-mensile" «3 € al mese»; href="#annuale" data-conta="premium-annuale" «30 € l'anno»
});
test('premium: il messaggio «Premium non c\'è ancora.» c\'è due volte, con id mensile e annuale', () => {
  // ogni blocco ha Avvisami con oggetto «Avvisami quando parte Premium (mensile)» / «(annuale)», data-conta="premium-avvisami"
});
test('riquadro Premium invariato', () => { /* «Passa a Premium» e «3 € al mese o 30 € l'anno. Lo togli quando vuoi.» */ });
test('privacy: i conteggi anonimi nominano i bottoni toccati, senza IP né dati del browser', () => { /* … */ });
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** implementa. CSS: `.premium-scelta:target` mostra il blocco, i blocchi sono nascosti finché non sono `:target`; i due bottoni con lo stile `bottone--kiwi` e `bottone--contorno`. Privacy: riga «Conteggi anonimi» e riga del fornitore Cloudflare come nel progetto.
- [ ] **Step 4:** `npm test` → PASS; `npm run sito:vedi` e controllo a 375 px e da computer.
- [ ] **Step 5:** commit `feat(premium): scelta mensile o annuale prima di «non c'è ancora»`.

### Task 6: Pubblicazione

**Files:**
- Modify: `.github/workflows/sito.yml` (`paths` del push: aggiunge `'functions/**'`)
- Test: `test/sito/workflow.test.js`

- [ ] **Step 1:** test che fallisce: `assert.match(yml, /paths: \[[^\]]*'functions\/\*\*'/)`.
- [ ] **Step 2:** `npm test` → FAIL; aggiungi il percorso; `npm test` → PASS.
- [ ] **Step 3:** commit `ci(sito): pubblica anche quando cambiano le functions`.

### Task 7: Configurazione e verifica (Claude, browser e terminale)

- [ ] **Step 1:** nel browser (account Cloudflare di Bruno): D1 → crea `dovai-numeri`; progetto Pages `dovai` → Impostazioni → Collegamenti → D1 `DB` → `dovai-numeri`, Produzione **e** Anteprima.
- [ ] **Step 2:** chiave: `mkdir -p ~/Documents/DoVai && umask 077 && openssl rand -hex 24 > ~/Documents/DoVai/numeri-chiave.txt` (mai stampata); impronta con `shasum -a 256` del contenuto senza a capo → `IMPRONTA` in `functions/_lib/chiave.js`. Commit `chore(contatore): impronta della chiave`.
- [ ] **Step 3:** push del ramo, `gh workflow run sito.yml --ref <ramo>`, attesa del giro verde.
- [ ] **Step 4:** su https://prova.dovai.pages.dev (scheda privata): un clic su Kiwi, uno su «Passa a Premium», la scelta mensile, Avvisami; la pagina `/numeri/?k=…&ambiente=prova` (aperta da script, chiave letta dal file) li mostra; in modalità «vero» niente. Controllo che il link Kiwi si apra subito e che non ci siano cookie né storage scritti da `conta.js`.
- [ ] **Step 5:** a Bruno l'anteprima e i testi nuovi da approvare; dopo il suo ok, PR e unione in main; un ingresso reale su dovaivoli.it compare sotto «vero».
- [ ] **Step 6:** `open "https://dovaivoli.it/numeri/?k=$(cat ~/Documents/DoVai/numeri-chiave.txt)"` per il segnalibro di Bruno; chiusura di #12 e #13 con resoconto; aggiornamento del cruscotto.
