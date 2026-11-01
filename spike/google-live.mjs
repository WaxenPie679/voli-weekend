import { DateTime } from 'luxon';
import { upcomingWeekends } from '../src/weekends.js';
import { fetchGoogle } from '../src/sources/google.js';
const w = upcomingWeekends(DateTime.now()).slice(1, 2);
const t = Date.now();
const its = await fetchGoogle(w, { perExplore: 2, pauseMs: 2000 });
console.log('itinerari', its.length, 'in', Math.round((Date.now() - t) / 1000), 's');
for (const i of its) console.log(i.origin, i.destination.code, i.destination.city, i.price, i.outbound.segments.map(s=>s.from+'>'+s.to).join(' '), i.outbound.segments[0].dep, '|', i.inbound.segments[0].dep, '→', i.inbound.segments.at(-1).arr, i.outbound.layovers);
