// firm-admin — platform administration for Beacon tenants (bundle 133).
// Only users listed in public.platform_admins may call it (checked here with the
// service role; the table has RLS on and no policies, so nobody else can read it).
//
// POST { action, ... } with the signed-in user's JWT.
//   me                                  → { admin }
//   list                                → { firms:[...], demos:[...] }
//   create_firm  { name, short, full, accent, logo, email, phone, website } → { firm }
//   update_brand { org_id, short, full, accent, logo, email, phone, website, require_share_token } → { ok }
//   copy_demo    { org_id, source, name }   → { customer_id, link }
//   add_user     { org_id, email, full_name, role: 'manager'|'rep' } → { user_id, created }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SITE = 'https://beacon.gridientsuite.com/';
const HEX = /^#[0-9A-Fa-f]{6}$/;
const LOGO = /^(data:image\/(png|jpeg|svg\+xml|webp);base64,|https:\/\/)/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function clean(v: unknown, max: number) { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; }
function brandFields(b: Record<string, unknown>) {
  const accent = clean(b.accent, 7), logo = b.logo ? String(b.logo) : null, email = clean(b.email, 120);
  if (accent && !HEX.test(accent)) throw new Error('accent must be a hex colour like #FF8000');
  if (logo && (!LOGO.test(logo) || logo.length > 420000)) throw new Error('logo must be an image under 300 KB or an https link');
  if (email && !EMAIL.test(email)) throw new Error('support email looks wrong');
  return {
    brand_short: clean(b.short, 40), brand_full: clean(b.full, 120), brand_accent: accent, brand_logo: logo,
    brand_email: email, brand_phone: clean(b.phone, 40), brand_website: clean(b.website, 120), brand_updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: ud } = await admin.auth.getUser(token);
  const uid = ud && ud.user && ud.user.id;
  if (!uid) return json({ error: 'Sign in first.' }, 401);
  const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle();
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (b.action === 'me') return json({ admin: !!pa });
  if (!pa) return json({ error: 'Platform admins only.' }, 403);

  try {
    if (b.action === 'list') {
      const [orgs, custs, profs] = await Promise.all([
        admin.from('organizations').select('id, name, short_name, tenant_type, brand_short, brand_full, brand_accent, brand_logo, brand_email, brand_phone, brand_website, require_share_token, created_at').order('created_at'),
        admin.from('customers').select('id, org_id, name, is_demo, share_token'),
        admin.from('profiles').select('id, org_id, role, full_name, is_active'),
      ]);
      if (orgs.error) throw orgs.error;
      const firms = (orgs.data || []).map((o) => {
        const cs = (custs.data || []).filter((c) => c.org_id === o.id), ps = (profs.data || []).filter((p) => p.org_id === o.id);
        return {
          ...o, has_logo: !!o.brand_logo, brand_logo: o.brand_logo && o.brand_logo.length < 60000 ? o.brand_logo : null,
          clients: cs.length, managers: ps.filter((p) => p.role === 'manager').length, reps: ps.filter((p) => p.role === 'rep').length,
          demo_links: cs.filter((c) => c.is_demo && c.share_token).slice(0, 5).map((c) => ({ id: c.id, name: c.name, link: SITE + '?clientId=' + encodeURIComponent(c.id) + '&share=' + c.share_token })),
        };
      });
      const demos = (custs.data || []).filter((c) => c.is_demo).map((c) => ({ id: c.id, name: c.name, org_id: c.org_id }));
      return json({ firms, demos });
    }

    if (b.action === 'create_firm') {
      const name = clean(b.name, 120);
      if (!name) throw new Error('firm name is required');
      const short = (clean(b.short, 40) || name).replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'FIRM';
      const row = { name, short_name: short, tenant_type: 'saas', ...brandFields({ ...b, short: b.short || name, full: b.full || name }) };
      const { data, error } = await admin.from('organizations').insert(row).select('id, name').single();
      if (error) throw error;
      console.log('[firm-admin] firm created', data.id, name, 'by', uid);
      return json({ firm: data });
    }

    if (b.action === 'update_brand') {
      const org = clean(b.org_id, 40); if (!org) throw new Error('org_id required');
      const upd: Record<string, unknown> = brandFields(b);
      if (typeof b.require_share_token === 'boolean') upd.require_share_token = b.require_share_token;
      if (b.keep_logo === true) delete upd.brand_logo;
      const { error } = await admin.from('organizations').update(upd).eq('id', org);
      if (error) throw error;
      return json({ ok: true });
    }

    if (b.action === 'copy_demo') {
      const org = clean(b.org_id, 40), src = clean(b.source, 80) || 'cust_sts_vandelay';
      if (!org) throw new Error('org_id required');
      const { data, error } = await admin.rpc('firm_copy_demo', { p_org: org, p_source: src, p_name: clean(b.name, 120) });
      if (error) throw error;
      const { data: c } = await admin.from('customers').select('id, share_token').eq('id', data).single();
      return json({ customer_id: data, link: SITE + '?clientId=' + encodeURIComponent(data) + '&share=' + (c && c.share_token) });
    }

    if (b.action === 'add_user') {
      const org = clean(b.org_id, 40), email = (clean(b.email, 200) || '').toLowerCase(), role = b.role === 'rep' ? 'rep' : 'manager';
      if (!org) throw new Error('org_id required');
      if (!EMAIL.test(email)) throw new Error('email looks wrong');
      let userId: string | null = null, created = false;
      const cr = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: clean(b.full_name, 120) } });
      if (cr.data && cr.data.user) { userId = cr.data.user.id; created = true; }
      else {
        for (let page = 1; page <= 20 && !userId; page++) {
          const lu = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          const hit = (lu.data && lu.data.users || []).find((u) => (u.email || '').toLowerCase() === email);
          if (hit) userId = hit.id;
          if (!lu.data || (lu.data.users || []).length < 1000) break;
        }
        if (!userId) throw new Error('could not create or find that user: ' + (cr.error && cr.error.message));
      }
      const { data: existing } = await admin.from('profiles').select('id, org_id, role').eq('id', userId).maybeSingle();
      if (existing && existing.org_id && existing.org_id !== org) throw new Error('that email already belongs to another firm');
      const prof = { id: userId, org_id: org, role, full_name: clean(b.full_name, 120) || email.split('@')[0], is_active: true };
      const { error } = existing ? await admin.from('profiles').update(prof).eq('id', userId) : await admin.from('profiles').insert(prof);
      if (error) throw error;
      console.log('[firm-admin] user', email, role, 'added to', org, 'by', uid);
      return json({ user_id: userId, created, signin: 'https://gridientsuite.com/signin' });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    const msg = (e && (e as { message?: string }).message) || String(e);
    console.error('[firm-admin]', b.action, msg);
    return json({ error: msg }, 400);
  }
});
