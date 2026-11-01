import { DateTime } from 'luxon';
import { upcomingWeekends } from '../src/weekends.js';
import { fetchGoogle } from '../src/sources/google.js';
const w = upcomingWeekends(DateTime.now()).slice(1, 2);
try {
  const its = await fetchGoogle(w, { perExplore: 1, pauseMs: 1500 });
  console.log('OK itinerari', its.length);
} catch (err) {
  console.log('ERRORE', err?.constructor?.name, JSON.stringify(err?.message), String(err).slice(0, 300));
}
