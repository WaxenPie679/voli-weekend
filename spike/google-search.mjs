// Spike usa e getta: pagina risultati Google Flights per una tratta A/R con max 1 scalo.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { encodeTfs } from './tfs.mjs';

const tfs = encodeTfs([{ date: '2026-11-07', from: 'BRI', to: 'AMS' }, { date: '2026-11-08', from: 'AMS', to: 'BRI' }]);
const url = `https://www.google.com/travel/flights/search?tfs=${tfs}&hl=it&gl=IT&curr=EUR`;
const browser = await chromium.launch();
const page = await browser.newPage({ locale: 'it-IT' });
await page.goto(url, { waitUntil: 'domcontentloaded' });
const reject = page.getByRole('button', { name: /Rifiuta tutto|Reject all/i });
if (await reject.count()) await reject.first().click();
await page.waitForTimeout(8000);
await page.screenshot({ path: 'spike/search.png', fullPage: false });
writeFileSync('test/fixtures/google-detail.html', await page.content());
const items = await page.locator('li').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || '').filter((t) => /euro|€/i.test(t)).slice(0, 6));
console.log(url, '\n', items.join('\n---\n'));
await browser.close();
