import { encodeTfs } from './tfs.mjs';
// tfs senza destinazione: proviamo a passarla vuota
const varint = (n) => { const b = []; while (n > 127) { b.push((n & 127) | 128); n >>>= 7; } b.push(n); return b; };
const t = encodeTfs([{ date: '2026-11-07', from: 'BRI', to: '' }, { date: '2026-11-08', from: '', to: 'BRI' }]);
console.log(`https://www.google.com/travel/explore?tfs=${t}&hl=it&gl=IT&curr=EUR`);
