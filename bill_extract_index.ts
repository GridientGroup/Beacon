// bill-extract — read a utility bill PDF into monthly readings (bundle 127).
// POST { pdf_base64, filename } with a signed-in broker's JWT.
// → { data: { utility, account_number, service_address, customer_name, meters: [ { commodity, account_number,
//      meter_number, unit, periods: [ { start, end, month, usage, demand_kw, cost, from } ] } ], notes } }
// Only figures printed on the bill are returned; nothing is inferred. Beacon
// shows every row for the broker to check before anything is saved.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODELS = ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001'];

const SYSTEM = `You read US commercial utility bills (electric and natural gas) and return ONLY a JSON object, no prose.
Rules:
- Copy figures exactly as printed. Never estimate, compute, or fill gaps. If a value is not printed, use null.
- One entry in "meters" per metered service (electric and gas are separate meters; separate account or meter numbers are separate meters).
- For each meter, "periods" holds the CURRENT billing period (from: "statement") and, if the bill prints a usage history table or chart with numbers, each month in it (from: "history"). Skip chart bars that have no printed number.
- Dates as YYYY-MM-DD. If the history shows only a month, set start and end to null and month to "YYYY-MM".
- "usage" is the billed consumption for the period in "unit" exactly as printed: one of kWh, MWh, therms, ccf, mcf, dth, CCF. Do not convert.
- "demand_kw" is billed or metered peak kW for that period if printed, else null. "cost" is the total amount for that service for that period if printed, else null.
JSON shape:
{"utility":string|null,"account_number":string|null,"service_address":string|null,"customer_name":string|null,
 "meters":[{"commodity":"electric"|"gas","account_number":string|null,"meter_number":string|null,"unit":string,
   "periods":[{"start":string|null,"end":string|null,"month":string|null,"usage":number|null,"demand_kw":number|null,"cost":number|null,"from":"statement"|"history"}]}],
 "notes":string|null}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!KEY) return json({ error: 'Bill reading is not configured (no ANTHROPIC_API_KEY).' }, 503);
  const url = Deno.env.get('SUPABASE_URL')!, svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, svc, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: ud } = await admin.auth.getUser(token);
  const uid = ud && ud.user && ud.user.id;
  if (!uid) return json({ error: 'Sign in first.' }, 401);
  const { data: prof } = await admin.from('profiles').select('role, is_active').eq('id', uid).maybeSingle();
  if (!prof || prof.is_active === false || !['rep', 'manager', 'superadmin'].includes(prof.role)) return json({ error: 'Brokers only.' }, 403);
  const { data: rl } = await admin.rpc('ask_gridient_check_rate', { p_key: 'bill:' + uid, p_limit: 80 });
  const row = Array.isArray(rl) ? rl[0] : rl;
  if (!row || row.allowed !== true) return json({ error: 'Too many bills this hour. Try again later.' }, 429);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const pdf = String(b.pdf_base64 || '');
  if (!pdf || pdf.length > 14_000_000) return json({ error: 'PDF missing or over 10 MB.' }, 400);
  let lastErr = '';
  for (const model of MODELS) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 4000, system: SYSTEM,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
          { type: 'text', text: 'Return the JSON for this bill.' },
        ] }],
      }),
    });
    if (!r.ok) { lastErr = model + ' ' + r.status + ' ' + (await r.text()).slice(0, 200); continue; }
    const j = await r.json();
    const txt = String((j.content || []).map((c: any) => c.text || '').join('')).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      const data = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      return json({ data, model, filename: String(b.filename || '').slice(0, 200) });
    } catch { lastErr = model + ' returned unreadable output'; }
  }
  console.error('[bill-extract]', lastErr);
  return json({ error: 'Could not read this bill (' + lastErr.slice(0, 120) + ').' }, 502);
});
