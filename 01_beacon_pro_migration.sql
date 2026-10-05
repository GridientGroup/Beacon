-- ============================================================================
-- Beacon Pro / Intelligence — Tier 3-Ready Schema Migration
-- ============================================================================
-- Idempotent. Safe to apply to a live Beacon Supabase project (wnzpoacrdxrddwptpeiz).
-- Apply via Supabase SQL Editor (paste, review, run).
--
-- This migration creates the foundational data model that supports all three
-- Beacon tiers (Free, Pro, Intelligence). Front-end features can be enabled
-- progressively as tables get populated.
--
-- ORDER OF OPERATIONS:
--   1. Extensions
--   2. Reference tables (partners, clients)
--   3. Portfolio hierarchy (locations, meters)
--   4. Time-series (meter_readings, weather_readings)
--   5. Analytics (baseline_periods, emissions_snapshots)
--   6. RLS policies
--   7. Indexes
--
-- ROLLBACK:
--   To fully undo this migration, execute the statements at the bottom in
--   the "-- ROLLBACK" section, in order. Note: rollback deletes ALL data
--   in these tables.
-- ============================================================================

-- ── 1. EXTENSIONS ───────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 2. REFERENCE TABLES ─────────────────────────────────────────────────────

-- Partners: STS, consulting firms, other resellers
CREATE TABLE IF NOT EXISTS partners (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  slug                 text UNIQUE NOT NULL,
  primary_contact_name  text,
  primary_contact_email text,
  brand_color_primary  text,
  brand_color_secondary text,
  logo_url             text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE partners IS 'Companies that use Beacon under their own brand to serve their client base.';

-- Clients: end customers whose portfolios Beacon manages
CREATE TABLE IF NOT EXISTS clients (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id            uuid REFERENCES partners(id) ON DELETE RESTRICT,
  name                  text NOT NULL,
  tier                  text NOT NULL DEFAULT 'free'
                        CHECK (tier IN ('free','pro','intelligence')),
  parent_company        text,
  primary_contact_name  text,
  primary_contact_email text,
  primary_contact_phone text,
  industry              text,
  billing_status        text DEFAULT 'active'
                        CHECK (billing_status IN ('active','trial','suspended','churned')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE clients IS 'End customers. tier controls which Beacon features are enabled.';
CREATE INDEX IF NOT EXISTS clients_partner_idx ON clients(partner_id);
CREATE INDEX IF NOT EXISTS clients_tier_idx ON clients(tier);

-- ── 3. PORTFOLIO HIERARCHY ──────────────────────────────────────────────────

-- Locations: individual physical properties
CREATE TABLE IF NOT EXISTS locations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  store_code             text,
  name                   text,
  address_line1          text,
  address_line2          text,
  city                   text,
  state                  text,
  zip                    text,
  country                text DEFAULT 'US',
  latitude               numeric(10,7),
  longitude              numeric(10,7),
  sqft                   integer,
  sqft_source            text CHECK (sqft_source IN ('reported','estimated','inferred')),
  property_type          text,       -- maps to DOE reference building
  ownership              text CHECK (ownership IN ('owned','leased','mixed')),
  lease_expiration       date,
  year_built             integer,
  operating_hours_weekly integer,
  climate_zone           text,       -- ASHRAE 169-2013 zone
  egrid_subregion        text,       -- for emissions calc
  weather_station_id     text,       -- nearest NOAA GHCN station
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE locations IS 'Individual physical properties within a client portfolio.';
CREATE INDEX IF NOT EXISTS locations_client_idx ON locations(client_id);
CREATE INDEX IF NOT EXISTS locations_state_idx ON locations(state);

-- Meters: revenue meters at each location
CREATE TABLE IF NOT EXISTS meters (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id        uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  commodity          text NOT NULL CHECK (commodity IN ('electric','gas','water','steam')),
  utility            text,
  account_number     text,
  meter_number       text,
  rate_schedule      text,
  contract_type      text CHECK (contract_type IN ('fixed','index','variable','hybrid','utility-default')),
  contract_supplier  text,
  contract_start     date,
  contract_end       date,
  contract_rate      numeric,
  service_start_date date,
  has_interval_data  boolean NOT NULL DEFAULT false,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE meters IS 'Revenue meters. One location typically has 1-2 meters (electric+gas); hospitals may have many.';
CREATE INDEX IF NOT EXISTS meters_location_idx ON meters(location_id);
CREATE INDEX IF NOT EXISTS meters_contract_end_idx ON meters(contract_end) WHERE contract_end IS NOT NULL;

-- ── 4. TIME-SERIES TABLES ───────────────────────────────────────────────────

-- Meter readings: universal table for monthly bills AND interval data
CREATE TABLE IF NOT EXISTS meter_readings (
  id                bigserial PRIMARY KEY,
  meter_id          uuid NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  period_start      timestamptz NOT NULL,
  period_end        timestamptz NOT NULL,
  interval_seconds  integer NOT NULL,     -- 2592000 for monthly, 3600 for hourly, 900 for 15-min
  consumption       numeric NOT NULL,
  consumption_unit  text NOT NULL,        -- kWh, therms, gallons
  demand_kw         numeric,               -- electric only
  cost              numeric,
  cost_currency     text NOT NULL DEFAULT 'USD',
  rate_per_unit     numeric,
  bill_source       text CHECK (bill_source IN ('manual','pdf_parse','csv_upload','green_button','utility_api','submeter')),
  source_document_url text,               -- Supabase Storage URL if from PDF parse
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meter_id, period_start, period_end)
);
COMMENT ON TABLE meter_readings IS 'Time-series meter data. Supports monthly bills and interval data via interval_seconds.';
CREATE INDEX IF NOT EXISTS meter_readings_meter_period_idx
  ON meter_readings(meter_id, period_start DESC);
CREATE INDEX IF NOT EXISTS meter_readings_period_idx
  ON meter_readings(period_start DESC);

-- Weather readings: daily weather per location, populated nightly by edge function
CREATE TABLE IF NOT EXISTS weather_readings (
  id            bigserial PRIMARY KEY,
  location_id   uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  reading_date  date NOT NULL,
  temp_avg_f    numeric,
  temp_min_f    numeric,
  temp_max_f    numeric,
  hdd_base_65   numeric,   -- precomputed to speed up regression
  cdd_base_65   numeric,
  station_id    text,
  source        text DEFAULT 'noaa_ghcn' CHECK (source IN ('noaa_ghcn','openweather','manual')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, reading_date)
);
COMMENT ON TABLE weather_readings IS 'Daily weather per location. Powers weather normalization and hourly emissions.';
CREATE INDEX IF NOT EXISTS weather_readings_location_date_idx
  ON weather_readings(location_id, reading_date DESC);

-- ── 5. ANALYTICS TABLES ─────────────────────────────────────────────────────

-- Baseline periods: for M&V work under ASHRAE Guideline 14
CREATE TABLE IF NOT EXISTS baseline_periods (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id              uuid NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
  label                 text NOT NULL,      -- "Pre-retrofit baseline"
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  regression_model      jsonb,              -- {baseload, heating_slope, cooling_slope}
  r_squared             numeric,
  cv_rmse               numeric,
  meets_ashrae_14       boolean,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE baseline_periods IS 'Fitted weather-normalization models for M&V. One or more per meter.';
CREATE INDEX IF NOT EXISTS baseline_periods_meter_idx ON baseline_periods(meter_id);

-- Emissions snapshots: cached monthly for fast dashboard rendering
CREATE TABLE IF NOT EXISTS emissions_snapshots (
  id                        bigserial PRIMARY KEY,
  client_id                 uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  as_of                     date NOT NULL,
  scope1_metric_tons_co2e   numeric NOT NULL DEFAULT 0,
  scope2_metric_tons_co2e   numeric NOT NULL DEFAULT 0,
  scope2_market_based       numeric,       -- when RECs applied
  by_location               jsonb,          -- per-location breakdown
  methodology               text,           -- "egrid_2023, gwp_ar5"
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, as_of)
);
COMMENT ON TABLE emissions_snapshots IS 'Monthly cached emissions per client. Refreshed on 1st of each month by edge function.';
CREATE INDEX IF NOT EXISTS emissions_snapshots_client_asof_idx
  ON emissions_snapshots(client_id, as_of DESC);

-- ── 6. ROW-LEVEL SECURITY ───────────────────────────────────────────────────

ALTER TABLE partners             ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE meters               ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_readings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseline_periods     ENABLE ROW LEVEL SECURITY;
ALTER TABLE emissions_snapshots  ENABLE ROW LEVEL SECURITY;

-- Partner isolation: each partner sees only their clients (and everything downstream)
-- JWT is expected to carry partner_id.
DROP POLICY IF EXISTS partner_read_own ON clients;
CREATE POLICY partner_read_own ON clients FOR SELECT USING (
  partner_id::text = (auth.jwt() ->> 'partner_id')
);
DROP POLICY IF EXISTS partner_write_own ON clients;
CREATE POLICY partner_write_own ON clients FOR ALL USING (
  partner_id::text = (auth.jwt() ->> 'partner_id')
);

DROP POLICY IF EXISTS partner_locations_own ON locations;
CREATE POLICY partner_locations_own ON locations FOR ALL USING (
  client_id IN (
    SELECT id FROM clients WHERE partner_id::text = (auth.jwt() ->> 'partner_id')
  )
);

DROP POLICY IF EXISTS partner_meters_own ON meters;
CREATE POLICY partner_meters_own ON meters FOR ALL USING (
  location_id IN (
    SELECT l.id FROM locations l
    JOIN clients c ON c.id = l.client_id
    WHERE c.partner_id::text = (auth.jwt() ->> 'partner_id')
  )
);

DROP POLICY IF EXISTS partner_readings_own ON meter_readings;
CREATE POLICY partner_readings_own ON meter_readings FOR ALL USING (
  meter_id IN (
    SELECT m.id FROM meters m
    JOIN locations l ON l.id = m.location_id
    JOIN clients c ON c.id = l.client_id
    WHERE c.partner_id::text = (auth.jwt() ->> 'partner_id')
  )
);

DROP POLICY IF EXISTS partner_weather_own ON weather_readings;
CREATE POLICY partner_weather_own ON weather_readings FOR ALL USING (
  location_id IN (
    SELECT l.id FROM locations l
    JOIN clients c ON c.id = l.client_id
    WHERE c.partner_id::text = (auth.jwt() ->> 'partner_id')
  )
);

DROP POLICY IF EXISTS partner_baselines_own ON baseline_periods;
CREATE POLICY partner_baselines_own ON baseline_periods FOR ALL USING (
  meter_id IN (
    SELECT m.id FROM meters m
    JOIN locations l ON l.id = m.location_id
    JOIN clients c ON c.id = l.client_id
    WHERE c.partner_id::text = (auth.jwt() ->> 'partner_id')
  )
);

DROP POLICY IF EXISTS partner_emissions_own ON emissions_snapshots;
CREATE POLICY partner_emissions_own ON emissions_snapshots FOR ALL USING (
  client_id IN (
    SELECT id FROM clients WHERE partner_id::text = (auth.jwt() ->> 'partner_id')
  )
);

DROP POLICY IF EXISTS partner_self_read ON partners;
CREATE POLICY partner_self_read ON partners FOR SELECT USING (
  id::text = (auth.jwt() ->> 'partner_id')
);

-- Service role bypass is automatic in Supabase; no policy needed.
-- Edge functions using service_role will bypass RLS for backfill / cross-tenant admin.

-- ── 7. UPDATED_AT TRIGGERS ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_partners_updated_at') THEN
    CREATE TRIGGER set_partners_updated_at BEFORE UPDATE ON partners
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_clients_updated_at') THEN
    CREATE TRIGGER set_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_locations_updated_at') THEN
    CREATE TRIGGER set_locations_updated_at BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_meters_updated_at') THEN
    CREATE TRIGGER set_meters_updated_at BEFORE UPDATE ON meters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_baseline_updated_at') THEN
    CREATE TRIGGER set_baseline_updated_at BEFORE UPDATE ON baseline_periods
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ── Verification ────────────────────────────────────────────────────────────
SELECT 'Beacon Pro schema migration complete. Tables created:' AS status;
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('partners','clients','locations','meters','meter_readings',
                    'weather_readings','baseline_periods','emissions_snapshots')
ORDER BY tablename;

-- ============================================================================
-- ROLLBACK — execute these in order to fully undo. DESTRUCTIVE.
-- ============================================================================
-- DROP TABLE IF EXISTS emissions_snapshots CASCADE;
-- DROP TABLE IF EXISTS baseline_periods CASCADE;
-- DROP TABLE IF EXISTS weather_readings CASCADE;
-- DROP TABLE IF EXISTS meter_readings CASCADE;
-- DROP TABLE IF EXISTS meters CASCADE;
-- DROP TABLE IF EXISTS locations CASCADE;
-- DROP TABLE IF EXISTS clients CASCADE;
-- DROP TABLE IF EXISTS partners CASCADE;
-- DROP FUNCTION IF EXISTS set_updated_at();
