import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const [name, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:5190/?sample=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `.impeccable/review/${name}.png`, fullPage: true });
  await page.screenshot({ path: `.impeccable/review/${name}-fold.png` });
  if (name === 'mobile') {
    await page.click('summary');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.impeccable/review/mobile-filters-open.png` });
    await page.goto('http://localhost:5190/?sample=1');
    await page.evaluate(() => { const r = document.querySelector('#max'); r.value = 20; r.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.impeccable/review/mobile-empty.png` });
    await page.evaluate(() => { const r = document.querySelector('#max'); r.value = 200; r.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  await page.close();
}
await browser.close();
