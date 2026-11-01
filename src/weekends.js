import { DateTime } from 'luxon';

export const ZONE = 'Europe/Rome';

/**
 * Prossimi `count` weekend (venerdì/sabato/domenica). Il weekend corrente resta
 * incluso finché il suo sabato non è finito in ora di Roma.
 */
export function upcomingWeekends(now, count = 8) {
  const local = now.setZone(ZONE).startOf('day');
  // weekday: 1 = lunedì … 7 = domenica
  // lun–gio → venerdì successivo; ven/sab → venerdì corrente; dom → venerdì successivo
  const offset = local.weekday === 7 ? 5 : 5 - local.weekday;
  const friday = local.plus({ days: offset });
  const out = [];
  for (let i = 0; i < count; i++) {
    const f = friday.plus({ weeks: i });
    out.push({ friday: f.toISODate(), saturday: f.plus({ days: 1 }).toISODate(), sunday: f.plus({ days: 2 }).toISODate() });
  }
  return out;
}
