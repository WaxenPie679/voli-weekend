import { chromium } from 'playwright';
import { encodeTfs, exploreDateLabel } from '../src/sources/google.js';
const browser = await chromium.launch();
const page = await browser.newPage({ locale: 'it-IT', viewport: { width: 1280, height: 800 } });
const tfs = encodeTfs([{ date: '2026-11-13', from: 'BRI', to: '' }, { date: '2026-11-15', from: '', to: 'BRI' }]);
await page.goto(`https://www.google.com/travel/explore?tfs=${tfs}&hl=it&gl=IT&curr=EUR`);
const reject = page.getByRole('button', { name: /Rifiuta tutto/i });
if (await reject.count()) await reject.first().click();
await page.getByText(/Viaggio di|nei prossimi/).first().click({ timeout: 15000 });
await page.getByRole('tab', { name: 'Date specifiche' }).click();
for (const [ph, d] of [['Partenza', '2026-11-13'], ['Ritorno', '2026-11-15']]) {
  const input = page.locator(`input[placeholder="${ph}"]`).last();
  await input.click(); await input.fill(exploreDateLabel(d)); await input.press('Enter');
}
await page.getByRole('button', { name: /^Fine/ }).last().click();
await page.waitForTimeout(5000);
const u = new URL(page.url());
console.log(page.url());
const t = u.searchParams.get('tfs');
console.log(Buffer.from(t, 'base64url').toString('latin1').replace(/[^\x20-\x7e]/g, '.'));
console.log('ours', Buffer.from(tfs, 'base64url').toString('latin1').replace(/[^\x20-\x7e]/g, '.'));
console.log([...Buffer.from(t, 'base64url')].map(b=>b.toString(16).padStart(2,'0')).join(' '));
await browser.close();
