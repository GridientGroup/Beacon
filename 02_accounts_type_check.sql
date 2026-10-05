-- Beacon bundle 118 · accounts.type must be 'Electric' or 'Gas'
-- ---------------------------------------------------------------------------
-- Matt's call, 2026-10-05. Every dollar in Beacon branches on this column, and
-- it was the one important column with no CHECK constraint (lifecycle_status,
-- annual_usage_source and property_type_source all have one).
--
-- Safe to run today: every live row is exactly 'Electric' (311) or 'Gas' (112).
-- The first statement proves that before the constraint is added; if it
-- returns any rows, STOP and fix those rows first.
--
-- Bundle 118's upload parser already writes only 'Electric' or 'Gas' (it
-- translates "Electricity", "Natural Gas", "Electric - Primary" and similar,
-- and leaves out — and reports — rows that are neither).

-- 1. Must return zero rows:
select type, count(*) from public.accounts
where type is null or type not in ('Electric', 'Gas')
group by type;

-- 2. Add the rule:
alter table public.accounts
  add constraint accounts_type_electric_or_gas
  check (type in ('Electric', 'Gas'));
