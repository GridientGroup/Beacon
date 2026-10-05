# Beacon price-to-compare catalog

Built 2026-10-05. Maintained monthly by a scheduled task.

## Purpose

There is no reliable national source for the commercial "price to compare" in deregulated states, meaning the utility's default-service supply price for each commercial service class. Matt asked for one to be built and kept current every month so Beacon can compare a client's contracted rate against what they would pay on default service.

## Where it lives

The data is in Supabase project `wnzpoacrdxrddwptpeiz`.

| Table | What it holds |
|---|---|
| `price_to_compare` | One row per state, utility, fuel, commercial class and effective period: `price` and `unit` (electric in cents/kWh, gas in the utility's own unit), `price_type`, effective dates, `source_url`, the exact `source_quote`, and the verifier's result (`verified`, `verification_note`). |
| `price_to_compare_sources` | The standing page or pages where each utility or PUC publishes these prices, with what each page carries (`publishes`) and how it changes (`update_pattern`). Each run sets `last_status`. |
| `price_to_compare_runs` | One row per build or monthly run. |

Row `status` values:

- `current`: a second worker re-opened the source and matched the figure.
- `needs_review`: the figure has not been confirmed.
- `superseded`: replaced by a newer period.

Each row has one of four `price_type` values:

- `fixed`: the price is set for a period, usually 6 to 12 months.
- `monthly_variable`: the price changes monthly, as with gas GCR, SCO or PGA rates and monthly standard offers.
- `hourly_index`: large commercial and industrial default service tied to wholesale LMP, so there is no single price.
- `none_published`: the class exists but no static price is posted. This covers calculator-only utilities and Texas ERCOT, which has no utility default service.

## Proxy prices for gaps

Matt asked for an estimate wherever no price to compare is published, because a clearly labelled estimate is better than a hole. These rows keep `price` null and carry `proxy_price` and `proxy_unit` alongside these fields:

- `proxy_basis`: what the number is, with the arithmetic when derived.
- `proxy_period_start` / `proxy_period_end`.
- `proxy_source_url` / `proxy_source_quote`.
- `proxy_verified` / `proxy_note`.

Typical bases, in order of preference:

1. The utility's own published monthly average supply price for the class.
2. A state-agency average.
3. A derived figure: the zonal average LMP plus published adders and capacity at an assumed load factor, or the EIA state commercial average minus TDU delivery charges.

Beacon should always label these "estimate".

## Coverage after the initial build (2026-10-05)

- 262 live rows across 15 jurisdictions: PA, OH, IL, MA, NY, NJ, MD, DC, DE, CT, RI, NH, ME, MI and TX.
- 227 rows are verified and 35 are needs_review.
- 208 classes have a published price.
- 47 classes carry a proxy estimate. 44 of those were checked by a second worker. Indiana Michigan Power's 3.56¢ is flagged as implausible.
- 7 classes are still blank. All are hourly classes with no published average:
  - ComEd BESH
  - Ameren DS-3 and DS-4
  - National Grid NY SC-3A
  - NYSEG SC-3 and SC-7
  - BGE Type II TOU
- 203 source pages are saved.
- Two passes ran, each with one Sonnet canvasser and one Sonnet verifier per state. Pass 2 re-opened every unconfirmed row and filled gaps.

Known weak spots:

- Pages rendered client-side: Delmarva supply rates, AEP Ohio, National Grid NY's current ESC and the Unitil rate finder.
- Calculator-only utilities: Con Ed MSC, NYSEG and RG&E.
- Michigan electric publishes only a system PSCR factor, with no class-level price.
- PUC sites that blocked the fetch tool: NH PUC and PUCT.

## Monthly maintenance

The scheduled task "Beacon: monthly price-to-compare refresh" runs on the 3rd of each month at 13:48 UTC. It follows `claude/ptc/PTC_MONTHLY_RUNBOOK.md`:

1. Export the catalog.
2. Sonnet workers re-open the saved source pages first, and search only if a page moved.
3. Verifiers confirm every change.
4. Changes are applied automatically: new periods are inserted and older ones superseded.
5. Proxies are refreshed.
6. The run is logged and a change report is written to `claude/ptc/runs/PTC_RUN_<YYYY-MM>.md`.

Code lives in the project at `claude/ptc/`:

- `ptc_monthly.js`
- `ptc_proxy.js`
- `ptc_tool.py`

A backup copy of each is kept in Supabase at `ptc_private.files`.

Write access uses token-gated RPCs: `ptc_load`, `ptc_export`, `ptc_touch`, `ptc_source_status`, `ptc_set_proxy` and `ptc_put_file`. Each run mints a one-time token in `ptc_private.loader_token` and deletes it afterwards. `ptc_supersede()` is admin-only.

## Wired into Beacon (bundle 119, 2026-10-05)

- Brokers see a Price to Compare section on the location page. `ptc.js` reads the catalog for the meter's state, matches the utility by name and the class by usage or Rate Class, and compares it with `accounts.supply_rate`.
- The section is hidden for clients (deep link and "View as: Client").
- The contracted rate is stored on `accounts`: `supply_rate`, `supply_rate_unit`, `rate_effective`, `rate_source`, `tariff_code`, and the broker overrides `ptc_utility` and `ptc_service_class`. It comes from the upload template's new columns or from broker entry on the card.

## Not yet done

- A portfolio-level rollup (meters above price to compare, $/yr) on the Intelligence or Footprint tab.
- Showing the comparison to clients, if Matt wants it. That needs the snapshot Edge Function to return the rate fields, plus a switch in `ptc.js`.
