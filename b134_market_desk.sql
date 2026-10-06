-- Bundle 134 — applied to Supabase 2026-10-06 (migrations b134_market_desk, b134_market_desk_median).
-- One-call market summary for Beacon's broker Trading Desk tab.
-- Reads only public market data (commodity_snapshots). Invoker rights; public market data only.
--   iso[]      benchmark hub per ISO: last, 24h / prior-24h / 7d / 30d average, 30d median,
--              24h min/max, hourly (7d) and daily (30d) averages, latest of every hub/zone
--   henry_hub  EIA RNGWHHD: last, ~1 week / ~1 month / ~1 year ago, last 30 prints
--   storage    EIA Lower-48 working gas: last, prior week, ~1 year ago, same-week 5-yr average,
--              52-week history, 5 regions (last + prior)
--   steo       EIA STEO commercial electricity (ESCMUUS) and Henry Hub (NGHHUUS) forecasts + fetch date
create or replace function public.market_desk() returns jsonb
language sql stable set search_path to 'public' as $$
with b(iso, label, bench, bench_label, ord) as (values
  ('PJM','PJM','PJM_LMP_WESTERN_HUB','Western Hub',1),
  ('NYISO','NYISO','nyiso.n_y_c','Zone J · NYC',2),
  ('ISONE','ISO-NE','isone.h_internal_hub','Internal Hub',3),
  ('MISO','MISO','miso.indiana_hub','Indiana Hub',4),
  ('ERCOT','ERCOT','ERCOT_LMP_HB_NORTH','North Hub',5),
  ('CAISO','CAISO','CAISO_LMP_TH_SP15_GEN_APND','SP15',6)),
br as (
  select b.iso, s.observed_at t, s.value::numeric v
  from b join commodity_snapshots s on s.series_id = b.bench and s.observed_at > now() - interval '31 days'),
bstat as (
  select iso,
    (array_agg(v order by t desc))[1] last, max(t) last_at,
    round(avg(v) filter (where t > now() - interval '24 hours'), 2) avg24,
    round(avg(v) filter (where t <= now() - interval '24 hours' and t > now() - interval '48 hours'), 2) avg_prev24,
    round(avg(v) filter (where t > now() - interval '7 days'), 2) avg7,
    round(avg(v), 2) avg30,
    round((percentile_cont(0.5) within group (order by v))::numeric, 2) median30,
    round(min(v) filter (where t > now() - interval '24 hours'), 2) min24,
    round(max(v) filter (where t > now() - interval '24 hours'), 2) max24,
    count(*) n30
  from br group by iso),
bhour as (
  select iso, date_trunc('hour', t) h, round(avg(v), 2) v from br where t > now() - interval '7 days' group by 1, 2),
bday as (
  select iso, date_trunc('day', t) d, round(avg(v), 2) v from br group by 1, 2),
rec as (
  select s.iso, s.series_id, s.observed_at t, s.value::numeric v,
    coalesce(s.metadata->>'node', s.metadata->>'zone', s.metadata->>'point', s.metadata->>'location', s.series_id) lbl
  from commodity_snapshots s
  where s.category = 'electric_lmp' and s.observed_at > now() - interval '24 hours'
    and (s.iso <> 'MISO' or s.series_id like 'miso.%hub')
    and (s.iso <> 'NYISO' or s.series_id not in ('nyiso.h_q','nyiso.npx','nyiso.o_h','nyiso.pjm'))
    and (s.iso <> 'ISONE' or s.series_id like 'isone.h\_%' or s.series_id like 'isone.z\_%')),
hubs as (
  select iso, series_id, min(lbl) lbl, (array_agg(v order by t desc))[1] last, max(t) last_at, round(avg(v), 2) avg24
  from rec group by iso, series_id),
gas_hh as (select observed_at t, value::numeric v from commodity_snapshots where series_id = 'RNGWHHD' order by observed_at desc limit 400),
gas_st as (select observed_at t, value::numeric v from commodity_snapshots where series_id = 'NW2_EPG0_SWO_R48_BCF' order by observed_at desc limit 300),
reg(id, label, ord) as (values ('NW2_EPG0_SWO_R31_BCF','East',1),('NW2_EPG0_SWO_R32_BCF','Midwest',2),('NW2_EPG0_SWO_R35_BCF','South Central',3),('NW2_EPG0_SWO_R33_BCF','Mountain',4),('NW2_EPG0_SWO_R34_BCF','Pacific',5)),
regv as (
  select reg.label, reg.ord, x.vals
  from reg cross join lateral (
    select array_agg(value::numeric order by observed_at desc) vals
    from (select value, observed_at from commodity_snapshots where series_id = reg.id order by observed_at desc limit 2) z) x),
steo as (
  select series_id, max(fetched_at) fetched,
    jsonb_agg(jsonb_build_object('m', to_char(observed_at, 'YYYY-MM'), 'v', value::numeric) order by observed_at) filter (where observed_at >= date_trunc('month', now()) - interval '3 months') pts
  from commodity_snapshots where series_id in ('eia.steo.escmuus','eia.steo.nghhuus') group by series_id)
select jsonb_build_object(
  'asof', now(),
  'iso', (select jsonb_agg(jsonb_build_object(
      'iso', b.iso, 'label', b.label, 'bench', b.bench, 'bench_label', b.bench_label,
      'last', s.last, 'last_at', s.last_at, 'avg24', s.avg24, 'avg_prev24', s.avg_prev24, 'avg7', s.avg7, 'avg30', s.avg30, 'median30', s.median30,
      'min24', s.min24, 'max24', s.max24, 'n30', s.n30,
      'hourly', (select jsonb_agg(jsonb_build_array(h.h, h.v) order by h.h) from bhour h where h.iso = b.iso),
      'daily', (select jsonb_agg(jsonb_build_array(d.d, d.v) order by d.d) from bday d where d.iso = b.iso),
      'hubs', (select jsonb_agg(jsonb_build_object('id', hb.series_id, 'label', hb.lbl, 'last', hb.last, 'last_at', hb.last_at, 'avg24', hb.avg24) order by hb.lbl) from hubs hb where hb.iso = b.iso)
    ) order by b.ord) from b left join bstat s on s.iso = b.iso),
  'henry_hub', jsonb_build_object(
    'last', (select v from gas_hh order by t desc limit 1), 'last_at', (select max(t) from gas_hh),
    'wk', (select v from gas_hh where t <= (select max(t) from gas_hh) - interval '7 days' order by t desc limit 1),
    'mo', (select v from gas_hh where t <= (select max(t) from gas_hh) - interval '30 days' order by t desc limit 1),
    'yr', (select v from gas_hh where t <= (select max(t) from gas_hh) - interval '365 days' order by t desc limit 1),
    'hist', (select jsonb_agg(jsonb_build_array(t, v) order by t) from (select * from gas_hh order by t desc limit 30) q)),
  'storage', jsonb_build_object(
    'last', (select v from gas_st order by t desc limit 1), 'last_at', (select max(t) from gas_st),
    'prev', (select v from gas_st order by t desc offset 1 limit 1),
    'yr', (select v from gas_st where t <= (select max(t) from gas_st) - interval '361 days' order by t desc limit 1),
    'avg5', (select round(avg(v)) from gas_st g, generate_series(1, 5) k
             where abs(extract(epoch from (g.t - ((select max(t) from gas_st) - make_interval(years => k)))) ) < 4 * 86400),
    'hist', (select jsonb_agg(jsonb_build_array(t, v) order by t) from (select * from gas_st order by t desc limit 52) q),
    'regions', (select jsonb_agg(jsonb_build_object('label', label, 'last', vals[1], 'prev', vals[2]) order by ord) from regv)),
  'steo', (select jsonb_object_agg(series_id, jsonb_build_object('fetched', fetched, 'pts', pts)) from steo)
);
$$;
revoke all on function public.market_desk() from public, anon;
grant execute on function public.market_desk() to authenticated;
-- b134_market_desk_anon_read: market data is public (commodity_snapshots has an anon read policy),
-- so local testing without sign-in shows real numbers.
grant execute on function public.market_desk() to anon;
