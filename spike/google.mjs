// Spike usa e getta: osserva come la vista Esplora di Google Flights carica i dati.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'https://www.google.com/travel/explore?q=voli%20da%20Bari%20il%206%20novembre%20ritorno%208%20novembre&hl=it&gl=IT&curr=EUR';
const browser = await chromium.launch();
const page = await browser.newPage({ locale: 'it-IT' });
const seen = [];
page.on('response', async (r) => {
  const u = r.url();
  if (/FlightsFrontendService|batchexecute|GetExplore|GetShopping/i.test(u)) {
    const body = await r.text().catch(() => '');
    seen.push({ u: u.slice(0, 200), len: body.length });
    if (/GetExploreDestinations/i.test(u)) writeFileSync('test/fixtures/google-explore.txt', body);
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
console.log('landed', page.url().slice(0, 120));
const reject = page.getByRole('button', { name: /Rifiuta tutto|Reject all/i });
if (await reject.count()) { await reject.first().click(); console.log('consenso: rifiutato'); }
await page.waitForTimeout(8000);
await page.screenshot({ path: 'spike/explore.png' });
console.log(JSON.stringify(seen, null, 1));
await browser.close();
