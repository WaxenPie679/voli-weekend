// Genera le icone PNG dall'SVG del marchio (eseguito una volta, il risultato è committato).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('web/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: `web/icons/${name}` });
  await page.close();
}
await browser.close();
