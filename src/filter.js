import { DateTime } from 'luxon';
import { ZONE } from './weekends.js';

export const CONSTRAINTS = Object.freeze({
  origins: ['BRI', 'BDS'],
  fridayMinDeparture: '18:00',
  maxPrice: 200,
  maxStopsPerLeg: 1,
  maxLayoverMinutes: 180,
  alertThreshold: 80,
  weekends: 8,
});

const local = (s) => DateTime.fromISO(s, { zone: ZONE });

export function layoverMinutes(leg) {
  // Google fornisce la durata dello scalo ma non gli orari intermedi
  if (leg.layovers) return leg.layovers;
  const out = [];
  for (let i = 1; i < leg.segments.length; i++) {
    out.push(local(leg.segments[i].dep).diff(local(leg.segments[i - 1].arr), 'minutes').minutes);
  }
  return out;
}

function legOk(leg) {
  return !leg.selfTransfer
    && leg.segments.length >= 1
    && leg.segments.length - 1 <= CONSTRAINTS.maxStopsPerLeg
    && layoverMinutes(leg).every((m) => m >= 0 && m <= CONSTRAINTS.maxLayoverMinutes);
}

/** Vero se l'itinerario rispetta tutti i vincoli dello spec. */
export function isValid(it, now) {
  if (!CONSTRAINTS.origins.includes(it.origin)) return false;
  if (!(it.price <= CONSTRAINTS.maxPrice)) return false;
  if (!legOk(it.outbound) || !legOk(it.inbound)) return false;

  const dep = local(it.outbound.segments[0].dep);
  if (dep <= now) return false;
  const isFriday = dep.weekday === 5 && dep.toFormat('HH:mm') >= CONSTRAINTS.fridayMinDeparture;
  if (!isFriday && dep.weekday !== 6) return false;

  const sunday = dep.minus({ days: dep.weekday - 5 }).plus({ days: 2 }).toISODate();
  const retDep = local(it.inbound.segments[0].dep);
  const retArr = local(it.inbound.segments.at(-1).arr);
  return retDep.toISODate() === sunday && retArr.toISODate() === sunday;
}
