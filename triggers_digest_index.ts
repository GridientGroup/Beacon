// triggers-digest — weekly "Next 120 days" email for brokers (bundle 126; per-firm branding bundle 133).
//
// POST { mode: 'preview' } with the broker's JWT  → builds that broker's digest,
//      stores it in trigger_digests, returns { html, event_count, send_status }.
//      Never emails.
// POST { mode: 'cron' } with header x-digest-secret (Vault 'digest_secret')
//      → for every broker with trigger_digest_prefs.enabled, builds and emails.
//
// The trigger math is Beacon's own browser code, fetched from the live site
// (BEACON_SITE, default https://beacon.gridientsuite.com) and run here
// unchanged, so the email and the Intelligence tab always agree. Email goes through Resend when RESEND_API_KEY and DIGEST_FROM
// are set; until then digests are built and logged with send_status
// 'not sent: email not configured'.
// Bundle 133: header, button colour, subject and From display name use the
// firm's brand (organizations.brand_*); reply_to = brand_email when set.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-digest-secret, apikey, x-client-info',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const ENGINE = ['benchmarks.js', 'perloc.js', 'bps_jurisdictions.js', 'ptc.js', 'triggers.js'];
const SITE = Deno.env.get('BEACON_SITE') || 'https://beacon.gridientsuite.com';

let engineReady: Promise<any> | null = null;
function loadEngine(admin: any) {
  if (engineReady) return engineReady;
  engineReady = (async () => {
    const g: any = globalThis as any;
    g.window = g;
    g._beaconSb = admin;
    for (const f of ENGINE) {
      const r = await fetch(SITE + '/' + f + '?v=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('could not load ' + f + ' from ' + SITE + ' (' + r.status + ')');
      (0, eval)(await r.text());
    }
    if (!g.BeaconTriggers || !g.BeaconTriggers.buildAll) { engineReady = null; throw new Error('the live site is older than bundle 126; deploy 126 first'); }
    return g.BeaconTriggers;
  })().catch((e) => { engineReady = null; throw e; });
  return engineReady;
}

function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
}
function monday(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

async function digestFor(admin: any, T: any, uid: string) {
  const { data: prof } = await admin.from('profiles').select('org_id, role, full_name, is_active').eq('id', uid).maybeSingle();
  if (!prof || prof.is_active === false) throw new Error('no active profile');
  const broker = ['rep', 'manager', 'superadmin'].includes(prof.role);
  if (!broker) throw new Error('digest is for brokers only');
  let cq = admin.from('customers').select('id, name, type, is_demo').eq('org_id', prof.org_id).order('name');
  if (prof.role === 'rep') cq = cq.eq('assigned_rep_id', uid);
  const { data: customers, error: ce } = await cq;
  if (ce) throw new Error(ce.message);
  // White-label (bundle 133): the firm's own name, colour and reply-to address.
  const { data: org } = await admin.from('organizations').select('brand_short, brand_full, brand_accent, brand_email').eq('id', prof.org_id).maybeSingle();
  const B = brandOf(org);
  const ids = (customers || []).map((c: any) => c.id);
  const accts: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await admin.from('accounts')
      .select('id, customer_id, sqft, type, utility, account_number, annual_usage, expiration, property_type, supply_rate, supply_rate_unit, rate_effective, rate_source, tariff_code, ptc_utility, ptc_service_class, lifecycle_status, locations ( address, suite, city, state, zip )')
      .in('customer_id', ids.slice(i, i + 50)).eq('lifecycle_status', 'active');
    if (error) throw new Error(error.message);
    accts.push(...(data || []));
  }
  const by: Record<string, any[]> = {};
  accts.forEach((a) => (by[a.customer_id] = by[a.customer_id] || []).push(T.mapAcct(a)));
  const clients = (customers || []).filter((c: any) => by[c.id]).map((c: any) => ({ id: c.id, name: c.name, btype: c.type || 'office', accts: by[c.id] }));
  const res = await T.buildAll(clients);
  const rows = res.events.filter((e: any) => e.days >= -45).map((e: any) => T.describe(e, res.asOf));
  const soon = rows.filter((r: any) => r.days >= 0 && r.days <= 30).length;
  const shown = rows.slice(0, 40);
  const html = '<!doctype html><html><body style="font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#111827;margin:0;padding:24px;background:#f9fafb">' +
    '<div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:22px">' +
    '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;font-weight:700">' + esc(B.name) + ' · Triggers</div>' +
    '<h1 style="font-size:20px;margin:4px 0 2px">Next 120 days across your clients</h1>' +
    '<div style="color:#6b7280;font-size:13px;margin-bottom:14px">' + rows.length + ' items · ' + soon + ' in the next 30 days · ' + res.stats.withEvents + ' of ' + res.stats.clients + ' clients · week of ' + monday() + '</div>' +
    (shown.length ? '<table style="border-collapse:collapse;width:100%;font-size:13px">' + shown.map((r: any) =>
      '<tr><td style="padding:8px 8px 8px 0;border-top:1px solid #f3f4f6;vertical-align:top;white-space:nowrap;color:#374151"><b>' + esc(r.when) + '</b><br><span style="color:#9ca3af;font-size:11px">' + (r.days < 0 ? Math.abs(r.days) + 'd ago' : 'in ' + r.days + 'd') + '</span></td>' +
      '<td style="padding:8px 0;border-top:1px solid #f3f4f6;vertical-align:top"><b>' + esc(r.client) + '</b> · ' + esc(r.kind) + (r.compound ? ' · <span style="color:#b45309">default also moving</span>' : '') +
      '<br>' + esc(r.where) + '<br><span style="color:#4b5563">' + esc(r.detail) + '</span></td></tr>').join('') + '</table>' +
      (rows.length > shown.length ? '<p style="color:#6b7280;font-size:12px">+' + (rows.length - shown.length) + ' more in ' + esc(B.name) + '.</p>' : '')
      : '<p>Nothing timed in the next 120 days across your clients.</p>') +
    '<p style="margin-top:18px"><a href="' + SITE + '" style="background:' + B.accent + ';color:' + B.ink + ';padding:9px 16px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">Open ' + esc(B.name) + '</a></p>' +
    '<p style="color:#9ca3af;font-size:11px;margin-top:18px">Same checks as the Triggers tiles in ' + esc(B.name) + ': contract expirations, default-rate moves from the monthly price-to-compare catalog, and BPS deadlines. Turn this email off in ' + esc(B.name) + ' → Admin → Triggers · All clients.</p>' +
    '</div></body></html>';
  return { prof, rows, html, eventCount: rows.length, brand: B };
}

function brandOf(org: any) {
  const accent = org && /^#[0-9A-Fa-f]{6}$/.test(org.brand_accent || '') ? org.brand_accent : '#add540';
  const n = parseInt(accent.slice(1), 16), lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return { name: (org && (org.brand_short || org.brand_full)) || 'Beacon', accent, ink: lum > 0.6 ? '#0a0e1a' : '#ffffff', email: (org && org.brand_email) || null };
}

async function send(to: string, subject: string, html: string, brand?: any) {
  const key = Deno.env.get('RESEND_API_KEY');
  let from = Deno.env.get('DIGEST_FROM');
  if (!key || !from) return 'not sent: email not configured';
  // Keep the verified sending address; only the display name changes per firm.
  if (brand && brand.name !== 'Beacon') { const m = from.match(/<([^>]+)>/); from = brand.name.replace(/[<>"]/g, '') + ' <' + (m ? m[1] : from) + '>'; }
  const payload: any = { from, to: [to], subject, html };
  if (brand && brand.email) payload.reply_to = brand.email;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.ok ? 'sent' : 'send failed: ' + r.status + ' ' + (await r.text()).slice(0, 200);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  try {
    const T = await loadEngine(admin);
    const week = monday();
    if (body.mode === 'cron') {
      const secret = req.headers.get('x-digest-secret') || '';
      const { data: ok } = await admin.rpc('digest_secret_ok', { s: secret });
      if (!ok) return json({ error: 'unauthorized' }, 401);
      const { data: prefs } = await admin.from('trigger_digest_prefs').select('user_id').eq('enabled', true);
      const out: any[] = [];
      for (const p of prefs || []) {
        try {
          const { data: done } = await admin.from('trigger_digests').select('id').eq('user_id', p.user_id).eq('week_of', week).like('send_status', 'sent%').limit(1);
          if (done && done.length) { out.push({ user: p.user_id, status: 'already sent' }); continue; }
          const d = await digestFor(admin, T, p.user_id);
          const { data: u } = await admin.auth.admin.getUserById(p.user_id);
          const email = u && u.user && u.user.email;
          const status = email ? await send(email, d.brand.name + ' · ' + d.eventCount + ' triggers in the next 120 days', d.html, d.brand) : 'not sent: no email on account';
          await admin.from('trigger_digests').insert({ user_id: p.user_id, org_id: d.prof.org_id, week_of: week, event_count: d.eventCount, events: d.rows, html: d.html, send_status: status, sent_at: status === 'sent' ? new Date().toISOString() : null });
          out.push({ user: p.user_id, status, items: d.eventCount });
        } catch (e) { out.push({ user: p.user_id, status: 'error: ' + (e as Error).message }); }
      }
      return json({ week, results: out });
    }
    // preview: the caller's own digest
    const auth = req.headers.get('Authorization') || '';
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'sign in first' }, 401);
    const d = await digestFor(admin, T, user.id);
    const configured = !!(Deno.env.get('RESEND_API_KEY') && Deno.env.get('DIGEST_FROM'));
    const status = 'preview' + (configured ? '' : ' (email sending not configured yet)');
    await admin.from('trigger_digests').insert({ user_id: user.id, org_id: d.prof.org_id, week_of: week, event_count: d.eventCount, events: d.rows, html: d.html, send_status: status });
    return json({ html: d.html, event_count: d.eventCount, send_status: status });
  } catch (e) {
    console.error('[triggers-digest]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
