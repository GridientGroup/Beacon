-- Bundle 133 — applied to Supabase 2026-10-06 (migrations b133_beacon_auto_meters,
-- b133_platform_admins, b133_firm_copy_demo). Kept here for the record; already live.

-- 1. Every public.accounts row gets its beacon partner → client → location → meter chain,
--    so bills, interval data and capacity tags work for any firm's newly added accounts.
--    public.beacon_ensure_meter(account_id) + trigger trg_accounts_ensure_meter (after insert
--    on public.accounts; failures only raise a warning, never block the insert). Backfilled.
--    (Full body: see supabase_migrations.schema_migrations name = 'b133_beacon_auto_meters'.)

-- 2. Platform admins (who may use Admin → Firms). RLS on, no policies: only the service role reads it.
create table if not exists public.platform_admins (user_id uuid primary key, added_at timestamptz not null default now(), note text);
alter table public.platform_admins enable row level security;
-- insert into public.platform_admins (user_id, note) values ('<auth user id>', '<who>');   -- done in Supabase; ids not kept in the public repo
create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- 3. public.firm_copy_demo(p_org uuid, p_source text, p_name text) → new customer id.
--    Copies a DEMO customer (is_demo = true only) with its locations and accounts into another
--    firm under a 'd<6 hex>_' id prefix. Service role only (called by firm-admin after the
--    platform-admin check). Full body: schema_migrations name = 'b133_firm_copy_demo'.
