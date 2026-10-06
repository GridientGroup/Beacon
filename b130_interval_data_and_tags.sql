-- Bundle 130 · interval data + capacity tags. APPLIED to wnzpoacrdxrddwptpeiz on 2026-10-06
-- (migration b130_interval_data_and_tags). Repo-only: never ship in the Netlify zip.
alter table beacon.meters
  add column if not exists capacity_tag_kw numeric,
  add column if not exists capacity_tag_year text,
  add column if not exists transmission_tag_kw numeric,
  add column if not exists tag_source text,
  add column if not exists tag_updated_at timestamptz;
-- Functions (SECURITY DEFINER, authenticated only; anon revoked):
--   public.interval_save(p_customer text, p_account text, p_seconds int, p_rows jsonb, p_source text, p_doc text) -> int
--       rows = [["YYYY-MM-DDTHH:MM" local wall time, kWh], ...] ≤ 6000; stored with interval_seconds > 0,
--       demand_kw = kWh × 3600 / seconds; upsert on (meter_id, period_start, period_end); sets has_interval_data.
--   public.tag_save(p_customer, p_account, p_capacity_kw, p_year, p_transmission_kw, p_source) -> boolean
--   public.interval_profile(p_customer) -> per account: interval_seconds, n, first/last, total_kwh, peak_kw, peak_at,
--       avg_kw, base_kw (5th percentile), shape {wd[24], we[24]}, monthly {YYYY-MM:{peak_kw,kwh}}, tags.
-- Full bodies: select pg_get_functiondef('public.interval_profile(text)'::regprocedure); etc.
