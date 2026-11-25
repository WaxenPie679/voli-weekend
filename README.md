# Voli Weekend

I voli weekend più economici da **Bari (BRI)** e **Brindisi (BDS)**, verso qualsiasi destinazione:

- andata il venerdì dalle 18:00 in poi oppure il sabato, ritorno la domenica (arrivo entro le 23:59);
- solo voli diretti Ryanair e Wizz Air;
- fino a 400 € andata e ritorno, 1 adulto, solo bagaglio a mano piccolo;
- i prossimi 13 weekend (3 mesi), con finestra che scorre; dal 4° al 12° mese e i weekend lunghi arrivano dallo storico notturno.

## Come funziona

| Cosa | Dove | Quando |
|---|---|---|
| Ryanair + Wizz Air (diretti) | GitHub Actions `direct.yml` | ogni 15 minuti (ai minuti :07, :22, :37, :52) |
| Storico prezzi (Ryanair, Wizz) | GitHub Actions `history.yml`, branch `history` (un commit al giorno) | ogni giorno alle 03:41 UTC |
| Dati | branch `data` (`direct.json`) | a ogni ricerca |
| Webapp | GitHub Pages, oppure in locale su http://127.0.0.1:5190 | sempre |
| Avvisi | notifica nell'app (iPhone) con i voli nuovi o ribassati sotto 80 € e i ribassi delle tratte seguite | a ogni ricerca |
| Check-up | bot Telegram, scrive solo se qualcosa non va | ogni giorno |

## Uso sul PC

Doppio clic su **`Avvia Voli Weekend.cmd`**: si apre http://127.0.0.1:5190. Non interferisce con SMOT (porta 5180).

In alternativa:

```bash
npm run serve
```

## Su iPhone

Apri l'indirizzo GitHub Pages in Safari → Condividi → **Aggiungi alla schermata Home**.

## Sito dovaivoli.it

È il sito pubblico di DoVai: mostra i voli economici del weekend dai bacini che seguiamo, con i filtri e i bottoni per aprire il biglietto su Kiwi o sul sito della compagnia. Si prepara dalla cartella `sito/` e finisce in `sito/dist/`.

**Vederlo sul tuo computer**

```bash
npm run sito:vedi
```

Prepara il sito e lo apre su http://127.0.0.1:5190 (da Claude Code la voce `dovai-sito` usa invece la porta 5197). La porta 5180 resta sempre libera per SMOT.

**Nome e città del titolare**

Apri `sito/titolare.js` e scrivi `nome` (nome e cognome) e `citta` tra gli apici. Finché uno dei due è vuoto, la pubblicazione si rifiuta di partire: su GitHub il giro finisce comunque verde (così non ricevi un'email di errore ogni ora), con l'avviso «Mancano nome e città del titolare» e senza pubblicare nulla. In locale `node sito/build.js --pubblica` si ferma con un errore. È voluto, serve a non mettere online le pagine legali con i segnaposto.

**Pubblicazione automatica**

Il workflow `Sito dovaivoli.it` gira ogni ora (al minuto 41), a ogni modifica di `sito/` su `main` e a mano da Actions. Esegue i test, prepara il sito e lo pubblica su Cloudflare Pages. Se i segreti di Cloudflare non ci sono ancora, salta solo la pubblicazione e lascia un avviso.

**Cosa devi fare tu su Cloudflare, una volta sola**

1. Cloudflare → Workers & Pages → Create → Pages → «Upload assets» (direct upload): crea un progetto che si chiama `dovai`.
2. Nel progetto, Custom domains → aggiungi `dovaivoli.it` (e anche `www.dovaivoli.it`).
3. My Profile → API Tokens → Create token, con un solo permesso: «Account · Cloudflare Pages · Edit». Copia il token e anche l'Account ID.
4. Su GitHub, nel repository: Settings → Secrets and variables → Actions → New repository secret. Crea due segreti: `CLOUDFLARE_API_TOKEN` (il token) e `CLOUDFLARE_ACCOUNT_ID` (l'Account ID).
5. Cloudflare → Web Analytics → aggiungi il sito dovaivoli.it e copia il token che ti dà. Su GitHub, nella stessa pagina, scheda Variables, crea la *variabile* (non il segreto) `CF_BEACON` con quel token.
6. Quando avrai l'id di affiliazione Kiwi, scrivilo in `KIWI_AFFILIATO` dentro `sito/config.js`. Finché è vuoto il sito non parla mai di link affiliati.

## Sviluppo

```bash
npm install
npm test                          # tutti i test
npm run direct                    # ricerca Ryanair + Wizz in ./data
npm run history                   # raccolta storico prezzi in ./history
npm run summary                   # riepilogo per tratta in ./summary (pubblicato sul branch `summary`, rifatto ogni notte)
```

Con `?sample=1` nell'URL la webapp usa i dati di esempio in `web/sample/`.

Le fonti sono API pubbliche ma non ufficiali (vedi `docs/sources.md`): se una smette di funzionare, la webapp lo segnala in alto e le altre continuano a lavorare.
