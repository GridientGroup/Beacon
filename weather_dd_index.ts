// weather-dd — daily heating/cooling degree days for bill periods (bundle 127).
// POST { points: [{ key, lat, lon }], start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
// → { results: { [key]: { station, name, lat, lon, days: { 'YYYY-MM-DD': [hdd65, cdd65] } } } }
// Source: NOAA NCEI daily summaries (GHCN-Daily), public domain, no key. The
// nearest airport (USW…) station with data for the range is preferred, then
// any cooperative station. Degree days use the standard (TMAX+TMIN)/2 mean.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const NCEI = 'https://www.ncei.noaa.gov/access/services';

function km(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}
async function findStation(lat: number, lon: number, start: string, end: string) {
  for (const pad of [0.35, 0.9, 1.8]) {
    const bbox = [lat + pad, lon - pad, lat - pad, lon + pad].map((v) => v.toFixed(3)).join(',');
    const u = `${NCEI}/search/v1/data?dataset=daily-summaries&bbox=${bbox}&startDate=${start}T00:00:00&endDate=${end}T23:59:59&dataTypes=TMAX,TMIN&limit=25`;
    const r = await fetch(u);
    if (!r.ok) continue;
    const j = await r.json();
    const c = (j.results || []).map((x: any) => {
      const st = (x.stations || [])[0] || {}, co = (x.location && x.location.coordinates) || x.centroid || [];
      return { id: st.id, name: st.name, lon: co[0], lat: co[1], end: x.endDate || '' };
    }).filter((s: any) => s.id && s.lat != null && s.end >= end);
    if (!c.length) continue;
    c.forEach((s: any) => { s.km = km(lat, lon, s.lat, s.lon); s.rank = (String(s.id).startsWith('USW') ? 0 : 50) + s.km; });
    c.sort((a: any, b: any) => a.rank - b.rank);
    return c[0];
  }
  return null;
}
async function daily(id: string, start: string, end: string) {
  const u = `${NCEI}/data/v1?dataset=daily-summaries&stations=${id}&startDate=${start}&endDate=${end}&dataTypes=TMAX,TMIN&format=json&units=standard`;
  const r = await fetch(u);
  if (!r.ok) throw new Error('NOAA data ' + r.status);
  const rows = await r.json();
  const days: Record<string, [number, number]> = {};
  for (const x of rows || []) {
    const hi = Number(x.TMAX), lo = Number(x.TMIN);
    if (!isFinite(hi) || !isFinite(lo) || x.TMAX === undefined || x.TMIN === undefined) continue;
    const t = (hi + lo) / 2;
    days[String(x.DATE).slice(0, 10)] = [Math.max(0, 65 - t), Math.max(0, t - 65)];
  }
  return days;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(b.start || '') || !re.test(b.end || '') || b.end < b.start) return json({ error: 'start/end as YYYY-MM-DD' }, 400);
  if ((Date.parse(b.end) - Date.parse(b.start)) / 864e5 > 1100) return json({ error: 'range over 3 years' }, 400);
  const pts = Array.isArray(b.points) ? b.points.slice(0, 25) : [];
  const out: Record<string, unknown> = {};
  for (const p of pts) {
    try {
      const lat = Number(p.lat), lon = Number(p.lon);
      if (!isFinite(lat) || !isFinite(lon)) { out[p.key] = { error: 'no coordinates' }; continue; }
      const st = await findStation(lat, lon, b.start, b.end);
      if (!st) { out[p.key] = { error: 'no NOAA station with data nearby' }; continue; }
      out[p.key] = { station: st.id, name: st.name, lat: st.lat, lon: st.lon, km: Math.round(st.km), days: await daily(st.id, b.start, b.end) };
    } catch (e) { out[p.key] = { error: (e as Error).message }; }
  }
  return json({ results: out, source: 'NOAA NCEI GHCN-Daily (TMAX/TMIN), base 65°F' });
});
