import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { upcomingWeekends } from '../src/weekends.js';

const at = (iso) => DateTime.fromISO(iso, { setZone: true });

test('da lunedì: 8 weekend a partire dal prossimo venerdì', () => {
  const w = upcomingWeekends(at('2026-11-02T10:00Z'));
  assert.equal(w.length, 8);
  assert.deepEqual(w[0], { friday: '2026-11-06', saturday: '2026-11-07', sunday: '2026-11-08' });
  assert.equal(w[7].friday, '2026-12-25');
});

test('sabato mattina il weekend corrente è ancora incluso', () => {
  assert.equal(upcomingWeekends(at('2026-11-07T08:00Z'))[0].friday, '2026-11-06');
});

test('domenica 00:30 a Roma (sabato 23:30 UTC) il weekend corrente è escluso', () => {
  assert.equal(upcomingWeekends(at('2026-11-07T23:30Z'))[0].friday, '2026-11-13');
});

test('count personalizzato', () => {
  assert.equal(upcomingWeekends(at('2026-11-02T10:00Z'), 3).length, 3);
});
