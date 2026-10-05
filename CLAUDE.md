# CLAUDE.md: read this first, every session

This is the handoff for any Claude session working on Beacon. Matt Helland owns the product and makes every product decision; Claude writes all the code. Matt is not a developer.

## What Beacon is

Beacon is the STS client portal in the Gridient Suite (beacon.gridientsuite.com). A broker holds it and points it at a client or a prospect. It covers energy benchmarking, Building Performance Standard (BPS) exposure, opportunities, rebates, ENERGY STAR scoring, market data, and the contracted rate vs the utility's price to compare.

## How it ships (do not change without Matt)

- **The repo is flat: every file sits at the top level, with no folders.** Matt uploads through the GitHub website, where folders are awkward. Keep it flat.
- **Repo-only files never go into the Netlify zip,** because Netlify would serve them publicly:
  - `CLAUDE.md`, `README.md`, `VERSION`, `BACKLOG.md`, `BUNDLE_NOTES.txt`
  - `*.sql`
  - `PTC_*.md`, `ptc_monthly.js`, `ptc_proxy.js`, `ptc_tool.py`

  Everything else is the site.
- **Deploy = Matt drags a flat zip of the site files onto Netlify** (site `beacongridient`). Build it with `zip -j beacon_index_NNN-deploy.zip $(ls | grep -v -E '^(CLAUDE.md|README.md|VERSION|BACKLOG.md|BUNDLE_NOTES.txt|PTC_.*|ptc_monthly.js|ptc_proxy.js|ptc_tool.py|.*\.sql)$')`. The local test copy is the same files with `index.html` renamed to `beacon-local.html`. Note that `ptc.js` IS a site file, used by index.html; only `ptc_monthly.js`, `ptc_proxy.js` and `ptc_tool.py` are ops scripts.
- Every bundle is **cumulative** and numbered. The current one is in `VERSION`. Matt deploys one bundle at a time; never hand him a partial or overlay zip.
- **Never rename or drop a site file.** Removing `market_intel.js`, `opportunity_calc.js`, `perloc.js` or `rebates_database.json` once broke the live site.
- `rebates_database.json` is generated from `rebates_data.js`: strip the JS wrapper and write the JSON.
- Netlify serves filenames in lowercase, so the template link `STS_Portfolio_Upload_Template_v2.xlsx` resolves to `sts_portfolio_upload_template_v2.xlsx`. Leave both as they are.
- **Workflow for every change:**
  1. Edit the files.
  2. Test in headless Chromium.
  3. Bump `VERSION`.
  4. Add a section at the top of `BUNDLE_NOTES.txt`.
  5. Commit as "bundle NNN: …".
  6. Push.
  7. Hand Matt the deploy zip.

## Backend

- **Supabase project** `wnzpoacrdxrddwptpeiz` (gridient-suite-prod), in Matt's paid org "Ship of Fools".
- SQL changes go in numbered `NN_*.sql` files and are applied through the Supabase MCP. Additive changes only, unless Matt approves otherwise.
- **Main tables:** `customers`, `locations`, `accounts` (one row per meter) and `building_scores`.
- **Accounts rate fields:** `supply_rate` with `supply_rate_unit`, plus `rate_effective`, `rate_source`, `tariff_code`, `ptc_utility` and `ptc_service_class`. Added in bundle 119.
- **Price-to-compare catalog:** `price_to_compare`, `price_to_compare_sources` and `price_to_compare_runs`, with estimate (`proxy_*`) columns for classes with no published price.
- **The `beacon` schema (Phase 2):** applied and populated, but the front end still reads `public`. The cutover is planned, not executed.
- **Edge functions:** `beacon-customer-snapshot` serves the unauthenticated client deep link using the service role, `ask-gridient` runs the chat, and `energy-star-score` and `commodity-fetcher` also exist.
- **Monthly scheduled task** "Beacon: monthly price-to-compare refresh" runs on the 3rd at 13:48 UTC. It follows `PTC_MONTHLY_RUNBOOK.md`.

## Settled decisions (don't reopen without Matt)

- **Opportunity rates** live in one table, `window.BEACON_OPP_RATES` in `benchmarks.js`:
  - procurement 8% of supply, deregulated states only
  - demand response 4%
  - solar 8%
  - recovery 2% × 3 years
  - efficiency: the gap to the median building of the same type, with 20% as the fallback only when sqft is unknown
- **Solar:** one engine everywhere, using live PVWatts with **no ITC**.
- **BPS:** one dated rule table in `bps_jurisdictions.js`, using real published rules only. Oregon stays "not yet priced".
- **Price to compare** is brokers-only and hidden in client views. Estimates are always labelled as estimates and never presented as the utility's price.
- **Never fabricate a number.** If data is missing, say so on screen.

## How Matt wants to work

- When he says go, execute. Don't open with clarifying questions; make the conservative call, state it in one line, and ship.
- Deliver complete files and complete deploy zips, never patches to merge by hand.
- Keep the Beacon look: dark theme, lime `#add540`, the existing classes (`.icard`, `.ic-lbl`, `.bm-row`, `.loc-card`, …), and no marketing or upsell copy inside the product.
- New panels go **inside** an existing `.sec` section, or they get orphaned by the tab system.
- He can't see earlier chats from inside a new one, so anything he decides goes into `BACKLOG.md` (and the Claude project).

## Where the plan lives

- `BACKLOG.md`: what's next, his four leverage ideas, later additions, and parked work.
- `BUNDLE_NOTES.txt`: what each bundle changed, newest first.
- `PTC_CATALOG.md`, `PTC_MONTHLY_RUNBOOK.md` and the `ptc_*` scripts: the price-to-compare catalog.
- The Claude project "Beacon" holds the longer history: decisions, findings and design docs.
