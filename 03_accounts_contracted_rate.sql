-- Bundle 119: contracted supply rate on accounts + price-to-compare read for anon.
-- ALREADY APPLIED to wnzpoacrdxrddwptpeiz on 2026-10-05. Kept as the record.
-- Safe to re-run: every statement is idempotent.
alter table public.accounts
  add column if not exists supply_rate numeric,
  add column if not exists supply_rate_unit text,
  add column if not exists rate_effective date,
  add column if not exists rate_source text,
  add column if not exists tariff_code text,
  add column if not exists ptc_utility text,
  add column if not exists ptc_service_class text,
  add column if not exists rate_updated_at timestamptz;
alter table public.accounts drop constraint if exists accounts_supply_rate_unit_check;
alter table public.accounts add constraint accounts_supply_rate_unit_check
  check (supply_rate_unit is null or supply_rate_unit in ('cents_per_kwh','dollars_per_therm','dollars_per_ccf','dollars_per_mcf','dollars_per_dth')) not valid;
alter table public.accounts drop constraint if exists accounts_rate_source_check;
alter table public.accounts add constraint accounts_rate_source_check
  check (rate_source is null or rate_source in ('upload','broker','switchboard','bill')) not valid;
alter table public.accounts drop constraint if exists accounts_supply_rate_band;
alter table public.accounts add constraint accounts_supply_rate_band
  check (supply_rate is null or (supply_rate > 0 and supply_rate < 100 and supply_rate_unit is not null)) not valid;
drop policy if exists ptc_read_anon on public.price_to_compare;
create policy ptc_read_anon on public.price_to_compare for select to anon using (true);
