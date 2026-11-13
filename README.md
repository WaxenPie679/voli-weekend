# Voli Weekend

I voli weekend più economici da **Bari (BRI)** e **Brindisi (BDS)**, verso qualsiasi destinazione:

- andata il venerdì dalle 18:00 in poi oppure il sabato, ritorno la domenica (arrivo entro le 23:59);
- diretti, oppure con 1 scalo su biglietto unico e attesa di massimo 3 ore;
- fino a 200 € andata e ritorno, 1 adulto, solo bagaglio a mano piccolo;
- i prossimi 8 weekend, con finestra che scorre.

## Come funziona

| Cosa | Dove | Quando |
|---|---|---|
| Ryanair + Wizz Air (diretti) | GitHub Actions `direct.yml` | ogni 15 minuti (ai minuti :07, :22, :37, :52) |
| Google Voli (scali e altre compagnie) | GitHub Actions `connections.yml` | ogni 4 ore |
| Storico prezzi (Ryanair, Wizz) | GitHub Actions `history.yml`, branch `history` (un commit al giorno) | ogni giorno alle 03:41 UTC |
| Dati | branch `data` (`direct.json`, `connections.json`) | a ogni ricerca |
| Webapp | GitHub Pages, oppure in locale su http://127.0.0.1:5190 | sempre |
| Avvisi | bot Telegram, un riepilogo per giro con i voli nuovi o ribassati sotto 80 € | a ogni ricerca |

## Uso sul PC

Doppio clic su **`Avvia Voli Weekend.cmd`**: si apre http://127.0.0.1:5190. Non interferisce con SMOT (porta 5180).

In alternativa:

```bash
npm run serve
```

## Su iPhone

Apri l'indirizzo GitHub Pages in Safari → Condividi → **Aggiungi alla schermata Home**.

## Sviluppo

```bash
npm install
npm test                          # tutti i test
npm run direct                    # ricerca Ryanair + Wizz in ./data
npm run history                   # raccolta storico prezzi in ./history
npm run summary                   # riepilogo per tratta in ./summary (pubblicato sul branch `summary`, rifatto ogni notte)
npm run connections               # ricerca Google Voli in ./data (richiede: npx playwright install chromium)
```

Con `?sample=1` nell'URL la webapp usa i dati di esempio in `web/sample/`.

Le fonti sono API pubbliche ma non ufficiali (vedi `docs/sources.md`): se una smette di funzionare, la webapp lo segnala in alto e le altre continuano a lavorare.
