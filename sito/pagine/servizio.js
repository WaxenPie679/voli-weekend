// Le pagine di servizio: come funziona, domande, privacy, note legali (SERVIZIO.md e PRIVACY.md).
// Si dice solo ciò che c'è: la commissione di Kiwi solo col codice affiliato, il resto «in arrivo».
import { h, grezzo } from '../statico/js/html.js';
import { EMAIL, KIWI_AFFILIATO } from '../config.js';
import { testoTitolare } from '../titolare.js';
import { documento, apertura } from './comune.js';

// Data dell'ultimo ritocco ai testi legali: si cambia a mano quando cambiano.
const AGGIORNATO = '25 novembre 2026';

const mail = grezzo(h`<a href="mailto:${EMAIL}">${EMAIL}</a>`);
const sezione = (titolo, ...righe) => h`<section class="testo__sezione"><h2>${titolo}</h2>${righe.map(r => grezzo(r))}</section>`;
const pag = pagina => h`<section class="sezione"><div class="contenitore testo">${grezzo(pagina)}</div></section>`;

// ---------- Come funziona ----------

function comeFunziona({ affiliato }) {
  const gratis = affiliato
    ? h`<p>Accanto a ogni volo ci sono due bottoni: <strong>la compagnia</strong> e <strong>Kiwi</strong>. Il prezzo che mostriamo è quello della compagnia. Se prenoti su Kiwi dal nostro link, Kiwi ci dà una piccola commissione: è quello che tiene DoVai gratis. Su Kiwi il prezzo può essere di qualche euro diverso, e paghi quello che vedi lì; noi non aggiungiamo nulla. Preferisci la compagnia? Va benissimo lo stesso. Più avanti ci sarà anche <strong>Premium</strong>, a 3 € al mese, per chi vuole sapere quando comprare.</p>`
    : h`<p>Accanto a ogni volo ci sono due bottoni: <strong>la compagnia</strong> e <strong>Kiwi</strong>. Il prezzo che mostriamo è quello della compagnia. Su Kiwi il prezzo può essere di qualche euro diverso, e paghi quello che vedi lì; noi non aggiungiamo nulla. Preferisci la compagnia? Va benissimo lo stesso. Più avanti ci sarà anche <strong>Premium</strong>, a 3 € al mese, per chi vuole sapere quando comprare.</p>`;
  const corpo = [
    sezione('Cosa trovi qui', h`<p>Voli andata e ritorno per il weekend da Bari, Brindisi, Milano, Bergamo e Roma. <strong>Weekend</strong>: parti venerdì dopo le 18:00 o sabato, torni domenica. <strong>Weekend lungo</strong>: parti da giovedì, torni entro lunedì; arriverà con Premium.</p>`),
    sezione('Da dove vengono i prezzi', h`<p>Controlliamo i prezzi ogni giorno sui siti delle compagnie aeree e dei motori di ricerca dei voli. Accanto a ogni prezzo scriviamo l'ora in cui l'abbiamo visto: <strong>visto alle 9:30</strong>. Dopo quell'ora il prezzo può cambiare, perché lo decide la compagnia.</p>`),
    sezione('Cosa è incluso nel prezzo', h`<p>Andata e ritorno per una persona, <strong>solo zaino</strong>. Se il bagaglio è incluso lo scriviamo. Non aggiungiamo niente di nostro.</p>`),
    sezione('Lo storico', h`<p>Ogni giorno segniamo il prezzo di ogni tratta e lo teniamo. Presto qui si vedrà come si muove nel tempo e quale weekend costa meno.</p>`),
    sezione(affiliato ? 'Come restiamo gratis' : 'Kiwi e la compagnia', gratis),
    sezione('Cosa non facciamo', h`<p>Non vendiamo biglietti: prenoti sul sito della compagnia o del partner. Non usiamo cookie per seguirti e non vendiamo la tua email a nessuno.</p>`),
    sezione('Chi siamo', h`<p>DoVai è un progetto italiano nato da chi parte nel weekend e si era stancato di controllare i prezzi ogni sera. Per qualsiasi cosa: <strong>${mail}</strong>.</p><p>Il team di DoVai</p>`),
  ];
  return {
    percorso: '/come-funziona/',
    titolo: 'Come funziona DoVai',
    descrizione: affiliato
      ? 'Da dove vengono i prezzi, cosa è incluso e come restiamo gratis.'
      : 'Da dove vengono i prezzi, cosa è incluso e come scegliere dove prenotare.',
    corpo: h`${grezzo(apertura({
      titolo: 'Come funziona DoVai',
      sottotitolo: affiliato
        ? 'Cosa controlliamo, come lo controlliamo e come facciamo a restare gratis.'
        : 'Cosa controlliamo, come lo controlliamo e dove puoi prenotare.',
    }))}${grezzo(pag(corpo.join('')))}`,
  };
}

// ---------- Domande frequenti ----------

function domande({ affiliato }) {
  const lista = [
    ['È davvero gratis?', affiliato
      ? 'Sì. Guadagniamo una piccola commissione quando prenoti su Kiwi dai nostri link. Premium, quando arriverà, sarà a pagamento: 3 € al mese o 30 € l\'anno.'
      : 'Sì. Premium, quando arriverà, sarà a pagamento: 3 € al mese o 30 € l\'anno.'],
    ['Il prezzo che vedo è quello che pago?', "È il prezzo che abbiamo visto all'ora indicata, andata e ritorno per una persona, solo zaino. Le compagnie lo cambiano spesso: se nel frattempo è salito, lo vedi sul sito dove prenoti."],
    ['Perché scrivete «solo zaino»?', 'Perché le compagnie low cost fanno pagare a parte il trolley e la valigia. Preferiamo dirlo subito che fartelo scoprire al pagamento.'],
    ['Prenotate voi il volo?', 'No. Noi troviamo il volo, tu scegli dove prenotarlo: sul sito della compagnia o su Kiwi.'],
    ['Perché il prezzo su Kiwi è diverso?', affiliato
      ? 'Noi mostriamo il prezzo della compagnia. Su Kiwi il prezzo può essere diverso, di solito di pochi euro. Se prenoti su Kiwi dal nostro link sostieni DoVai; se prenoti sulla compagnia paghi il suo prezzo. Ti lasciamo i due bottoni apposta: scegli tu.'
      : 'Noi mostriamo il prezzo della compagnia. Su Kiwi il prezzo può essere diverso, di solito di pochi euro. Su Kiwi paghi il prezzo che vedi su Kiwi, sulla compagnia paghi il suo. Ti lasciamo i due bottoni apposta: scegli tu.'],
    ['Che differenza c\'è tra Weekend e Weekend lungo?', 'Weekend: parti venerdì dopo le 18:00 o sabato e torni domenica, senza ferie. Weekend lungo: parti da giovedì e torni entro lunedì; arriverà con Premium.'],
    ['Da quali aeroporti partite?', 'Bari, Brindisi, Milano Malpensa, Bergamo Orio al Serio, Roma Fiumicino e Roma Ciampino. Ne aggiungeremo altri.'],
    ['Come funzionerà il canale WhatsApp?', 'Il canale sta per aprire.'],
    ['Quando arriva il riassunto email?', 'Non c\'è ancora: arriverà presto.'],
    ["Cos'è Premium?", "Ti dice quando comprare: compra o aspetta per ogni volo, il grafico dei prezzi prima della partenza, le tratte seguite e 12 mesi di weekend. Non è ancora attivo: se vuoi, ti avvisiamo quando parte."],
    ['Usate cookie?', 'Nessun cookie per seguirti o per la pubblicità. Contiamo le visite in modo anonimo, senza sapere chi sei.'],
    ['Ho trovato un errore', `Grazie: scrivici a ${EMAIL} e lo correggiamo.`],
  ];
  const strutturati = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: lista.map(([d, r]) => ({ '@type': 'Question', name: d, acceptedAnswer: { '@type': 'Answer', text: r } })),
  }).replace(/</g, '\\u003c');
  const voci = lista.map(([d, r]) => h`<section class="testo__sezione"><h2 class="domanda">${d}</h2><p>${r}</p></section>`);
  return {
    percorso: '/domande/',
    titolo: 'Domande frequenti · DoVai',
    descrizione: 'Prezzi, bagaglio, canale WhatsApp, email e Premium: le risposte in breve.',
    corpo: h`${grezzo(apertura({ titolo: 'Domande frequenti' }))}${grezzo(pag(voci.join('')))}`,
    extra: `<script type="application/ld+json">${strutturati}</script>`,
  };
}

// ---------- Privacy ----------

function tabella(intestazioni, righe) {
  return h`<div class="tabella-scorri"><table class="tabella"><thead><tr>${intestazioni.map(i => grezzo(h`<th scope="col">${i}</th>`))}</tr></thead><tbody>${righe.map(r => grezzo(h`<tr>${r.map(c => grezzo(h`<td>${c}</td>`))}</tr>`))}</tbody></table></div>`;
}

function privacy({ affiliato, titolare }) {
  const kiwi = affiliato
    ? h`<p>Accanto a ogni volo ci sono due bottoni: la compagnia e Kiwi. Il link a Kiwi è un <strong>link affiliato</strong>: se prenoti, Kiwi ci riconosce una piccola commissione e tu paghi il prezzo che vedi su Kiwi. Quando tocchi uno di questi bottoni lasci DoVai: Kiwi e la compagnia aerea possono usare cookie e trattare i tuoi dati secondo le <strong>loro</strong> regole. Noi da loro riceviamo solo numeri totali, mai il tuo nome o la tua email.</p>`
    : h`<p>Accanto a ogni volo ci sono due bottoni: la compagnia e Kiwi. Quando tocchi uno di questi bottoni lasci DoVai: Kiwi e la compagnia aerea possono usare cookie e trattare i tuoi dati secondo le <strong>loro</strong> regole. Noi da loro non riceviamo né il tuo nome né la tua email.</p>`;
  const dati = tabella(
    ['Quando', 'Quali dati', 'Perché', 'Base legale', 'Per quanto tempo'],
    [
      ['Visiti il sito', 'Indirizzo IP e dati tecnici del browser, letti da Cloudflare per far funzionare e proteggere il sito', 'Mostrarti le pagine, difendere il sito da attacchi', 'Interesse legittimo (art. 6.1.f GDPR)', 'Il tempo dei registri tecnici di Cloudflare'],
      ['Visiti il sito', 'Conteggi anonimi: pagine viste, da dove arrivi, telefono o computer', 'Capire cosa funziona sul sito', 'Interesse legittimo (art. 6.1.f GDPR)', 'I conteggi non ti riconoscono: restano come numeri totali'],
      ['Ci scrivi', `Email e quello che ci scrivi (anche se ci chiedi di avvisarti quando parte Premium)`, 'Risponderti e, se lo chiedi, scriverti una volta quando Premium parte', 'Rispondere a una tua richiesta (art. 6.1.b GDPR); il tuo consenso (art. 6.1.a GDPR) per l\'avviso su Premium', 'Il tempo che serve, al massimo 12 mesi'],
    ],
  );
  const aiuto = tabella(
    ['Chi', 'Cosa fa', 'Dove'],
    [
      ['Cloudflare', 'Ospita il sito e conta le visite senza cookie', 'USA e UE; trasferimenti coperti dal Data Privacy Framework UE-USA e dalle clausole contrattuali standard'],
      ['Apple (iCloud+)', `Casella ${EMAIL}`, 'UE (Irlanda) e USA, stesse garanzie'],
    ],
  );
  const corpo = [
    h`<h2>In breve</h2><ul><li>Per guardare i voli non serve darci niente: niente account, niente cookie.</li><li>Se ci scrivi a ${mail}, usiamo la tua email solo per risponderti, e non la vendiamo a nessuno.</li><li>Se prenoti tramite Kiwi, da quel momento sei sul sito di Kiwi e valgono le sue regole.</li></ul>`,
    sezione('1. Chi tratta i tuoi dati', h`<p>${testoTitolare(titolare)}, che gestisce DoVai (dovaivoli.it) come persona fisica. Per qualsiasi domanda sui tuoi dati: <strong>${mail}</strong>.</p>`),
    sezione('2. Quali dati e perché', dati, h`<p>Non usiamo i tuoi dati per profilarti, non prendiamo decisioni automatiche su di te e <strong>non vendiamo né cediamo la tua email</strong> a nessuno, Kiwi compresa.</p>`),
    sezione('3. Cookie', h`<p>Il sito non usa cookie, né nostri né di altri, e non ti chiede di accettarne. Per questo non vedi il solito banner. Le statistiche che usiamo funzionano senza cookie e senza riconoscerti da una visita all'altra.</p>`),
    sezione('4. Link a Kiwi e alle compagnie aeree', kiwi),
    sezione('5. Chi ci aiuta (e vede i dati per conto nostro)', aiuto, h`<p>Sono «responsabili del trattamento»: possono usare i dati solo per il servizio che ci danno.</p>`),
    sezione('6. I tuoi diritti', h`<p>Puoi chiederci in qualsiasi momento di <strong>vedere, correggere o cancellare</strong> i tuoi dati, di limitarne l'uso, di riceverli in un file, o di opporti all'uso basato sull'interesse legittimo. Puoi <strong>ritirare il consenso</strong> quando vuoi: vale da quel momento in poi.</p><p>Scrivici a <strong>${mail}</strong>: rispondiamo entro un mese. Se pensi che trattiamo male i tuoi dati puoi anche rivolgerti al <strong>Garante per la protezione dei dati personali</strong> (garanteprivacy.it).</p>`),
    sezione('7. Modifiche', h`<p>Se cambiamo qualcosa di importante, lo scriviamo qui. Ultimo aggiornamento: ${AGGIORNATO}.</p>`),
  ];
  return {
    percorso: '/privacy/',
    titolo: 'Privacy · DoVai',
    descrizione: 'Niente account e niente cookie. Cosa sappiamo di te quando visiti DoVai, e come cancellare ciò che ci scrivi.',
    corpo: h`${grezzo(apertura({ titolo: 'Privacy: cosa sappiamo di te (poco)' }))}${grezzo(pag(corpo.join('')))}`,
  };
}

// ---------- Note legali ----------

function noteLegali({ affiliato, titolare }) {
  const link = affiliato
    ? h`<p>Alcuni link a Kiwi sono link affiliati: se prenoti, Kiwi ci riconosce una piccola commissione e tu paghi il prezzo che vedi su Kiwi. Lo scriviamo vicino ai bottoni.</p>`
    : h`<p>I bottoni portano ai siti di Kiwi e delle compagnie aeree. Ciò che accade dopo il clic dipende da loro.</p>`;
  const corpo = [
    sezione('Chi gestisce il sito', h`<p>DoVai (dovaivoli.it) è gestito da ${testoTitolare(titolare)}, come persona fisica. Contatti: <strong>${mail}</strong>.</p>`),
    sezione('Cosa facciamo', h`<p>DoVai mostra voli trovati sui siti delle compagnie aeree e dei motori di ricerca. Non vendiamo biglietti e non siamo parte del contratto tra te e la compagnia o Kiwi.</p>`),
    sezione('Prezzi indicativi', h`<p>I prezzi sono indicativi: sono quelli visti all'ora indicata, andata e ritorno per una persona, solo zaino. Possono cambiare in qualsiasi momento e la disponibilità non è garantita. Vale il prezzo che vedi sul sito dove prenoti.</p>`),
    sezione('Link a Kiwi e alle compagnie', link),
    sezione('Marchi', h`<p>I nomi e i marchi delle compagnie aeree e di Kiwi appartengono ai rispettivi proprietari.</p>`),
    sezione('Errori', h`<p>Se trovi un errore scrivici a <strong>${mail}</strong> e lo correggiamo.</p>`),
  ];
  return {
    percorso: '/note-legali/',
    titolo: 'Note legali · DoVai',
    descrizione: 'Chi gestisce DoVai, come leggere i prezzi e cosa sono i link ai siti di Kiwi e delle compagnie.',
    corpo: h`${grezzo(apertura({ titolo: 'Note legali' }))}${grezzo(pag(corpo.join('')))}`,
  };
}

export function pagine({ affiliato = KIWI_AFFILIATO, titolare } = {}) {
  const opzioni = { affiliato, titolare };
  return [comeFunziona(opzioni), domande(opzioni), privacy(opzioni), noteLegali(opzioni)].map(p => ({
    percorso: p.percorso,
    indicizza: true,
    html: documento({
      titolo: p.titolo,
      descrizione: p.descrizione,
      percorso: p.percorso,
      indicizza: true,
      corpo: p.corpo,
      affiliato,
      extra: p.extra ?? '',
    }),
  }));
}
