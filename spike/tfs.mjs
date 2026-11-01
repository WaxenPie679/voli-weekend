// Spike: codifica protobuf del parametro `tfs` di Google Flights (stesso schema usato da fast-flights).
const varint = (n) => { const b = []; while (n > 127) { b.push((n & 127) | 128); n >>>= 7; } b.push(n); return b; };
const field = (no, wire, payload) => [...varint((no << 3) | wire), ...payload];
const str = (no, s) => { const bytes = [...Buffer.from(s, 'utf8')]; return field(no, 2, [...varint(bytes.length), ...bytes]); };
const msg = (no, bytes) => field(no, 2, [...varint(bytes.length), ...bytes]);
const int = (no, n) => field(no, 0, varint(n));

export function encodeTfs(legs, maxStops = 1) {
  const out = [];
  for (const { date, from, to } of legs) {
    const fd = [...str(2, date), ...int(5, maxStops), ...msg(13, str(2, from)), ...msg(14, str(2, to))];
    out.push(...msg(3, fd));
  }
  out.push(...int(8, 1), ...int(9, 1), ...int(19, legs.length === 2 ? 1 : 2));
  return Buffer.from(out).toString('base64url');
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  console.log(encodeTfs([{ date: '2026-11-07', from: 'BRI', to: 'AMS' }, { date: '2026-11-08', from: 'AMS', to: 'BRI' }]));
}
