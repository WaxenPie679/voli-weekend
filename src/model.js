/** @typedef {{from:string,to:string,dep:string,arr:string,flight:string,airline:string}} Segment */
/** @typedef {{segments:Segment[], selfTransfer:boolean, arrivalEstimated?:boolean}} Leg */
/** @typedef {{id:string, source:'ryanair'|'wizz'|'google', origin:'BRI'|'BDS',
 *   destination:{code:string,city:string,country:string},
 *   outbound:Leg, inbound:Leg, price:number, currency:'EUR',
 *   bookingUrl:string, weekend:string, seenAt:string}} Itinerary */

/** Identificativo stabile di un itinerario, indipendente dalla fonte. */
export function itineraryId(origin, outbound, inbound) {
  const dest = outbound.segments.at(-1).to;
  const flights = [...outbound.segments, ...inbound.segments].map((s) => s.flight).join('+');
  return `${origin}|${dest}|${outbound.segments[0].dep}|${inbound.segments[0].dep}|${flights}`;
}
