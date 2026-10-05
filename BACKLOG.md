# Beacon backlog: parked work, Matt's asks

Things Matt asked to have written down for later. Add new items to the top, and don't delete them; mark one done when it ships. This file is mirrored in the Claude project as `claude/BEACON_BACKLOG.md`.

## Next up (agreed 2026-10-05)

1. ~~Portfolio price-to-compare rollup~~. Shipped in bundle 121.
2. **Triggers** (leverage idea 2). First version: a per-client "Next 120 days" list combining contract expirations, default-rate moves from the monthly catalog, and BPS deadlines. Email alerts come later.
3. **Pre-engagement report** (leverage idea 1).
- ~~Repo / version control~~. This repo, from bundle 121.

## Parked

- **Reorganize the location pages.** Matt asked for this on 2026-10-05, to be done after phase 2 is complete, not before. The page has grown section by section, most recently with Price to Compare (bundle 120). No design work yet.

## The four leverage ideas

Context: Tango, Measurabl and EnergyCAP are built for the asset owner, as systems of record for compliance and ESG. Beacon is held by the broker and pointed at a prospect. Don't chase those three on their turf. In order of leverage:

1. **The unsolicited pre-engagement report.** From a public address plus an account number, Beacon can already compute BPS exposure, EUI vs peers, contract expiration and rate-vs-market. A broker emails a prospect "here's your 2031 LL97 exposure" before they've ever spoken, which Tango structurally cannot do. It's the highest value item and mostly assembly of math that exists. The price-to-compare catalog now supplies the rate-vs-market piece.
2. **Triggers, not dashboards** (roadmap item 16). Contract expirations, BPS deadlines and default-rate moves are timed sales events, for example "these six accounts expire in 120 days and their state default just went up 22%". This turns Beacon from something you show into something that generates pipeline. The monthly price-to-compare run records default-rate changes.
3. **Interval data and capacity tags** (roadmap items 15 and 17). The VPP tile says "$4.5M — directional, not a quote", the widest gap between what Beacon claims and what it can prove. Interval data closes it and makes demand-response revenue real.
4. **Multi-tenant validation** (roadmap item 21). Beacon can't be sold as SaaS to a second broker until a second tenant works end to end. This is the business-model gate.

## Later additions (not eliminated; revisit once Beacon is further along)

- **ESG framework exports (CDP, GRESB, SASB).** The full framework mapping is out: it's Measurabl's turf and needs data Beacon doesn't hold (waste, water, Scope 3, governance). The first slice is a "GRESB-ready energy data" export: annual energy by property and fuel, EUI, emissions, ENERGY STAR score and data coverage. About a day of work.
- **Predictive maintenance.** It needs equipment, building-automation and interval data, and it serves a facilities buyer. The first slice is a simple anomaly flag such as "base load up 30% last month", which comes almost for free once interval data exists.
- **Mobile app.** No native app. The first slice is making the location page and the pre-engagement report read well on a phone, plus an add-to-home-screen icon.

## Phase 2 (beacon schema), outstanding

- **The gate is the monthly bill parser.** Bill Anomaly and Weather-Normalized M&V run on synthetic demo bills. Most Intelligence tiles stay estimated or demo-only until real bills land.
- The ENERGY STAR edge function is packaged but not deployed; it needs EPA credentials.
- The front-end cutover to the beacon schema is planned but not executed.
- Recheck `recAllowance` and the `opportunity_calc` dead params. Bundle 118 addressed the BPS disclosure, the procurement rate and Seattle's factors.
- The leaked-password protection toggle in the Supabase dashboard (Matt's action).

## Utility price comparison: complete (bundles 119–121)

- The catalog covers 15 states, is refreshed monthly and includes estimates.
- The location-page comparison and the portfolio rollup (Intelligence → Theme · Supply) have shipped.
- Still open: regulated-state tariff detail waits until clients ask. Whether clients see the comparison is Matt's call; it's brokers-only for now.
