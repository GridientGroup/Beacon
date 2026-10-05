/* ============================================================================
 * sources.js — Beacon's single source-of-truth for data provenance.
 *
 * WHY THIS FILE EXISTS
 *
 * Provenance used to be written inline, next to the numbers: a "SOURCE" chip
 * under the EUI tile, a "SOURCES: EIA · GridStatus" bar across Market
 * Intelligence, a "Source: EIA Weekly Natural Gas Storage Report (NW2_...)"
 * line under each market panel, and prose paragraphs inside the analysis
 * sections. Accurate, and the wrong place for it. A client-facing product that
 * keeps explaining itself on every tile reads like a working document rather
 * than a finished one.
 *
 * The distinction this file is built around:
 *
 *   SOURCE CITATIONS are credentials. "CBECS 2018", "eGRID2023 Rev 2",
 *   "NOAA 1991-2020 Normals". They matter enormously for defensibility and
 *   not at all in the second someone reads a number. They belong in ONE
 *   place, reachable from the footer. That is this file.
 *
 *   ESTIMATION FLAGS are different in kind. "This floor area is modelled, not
 *   reported." "This EUI came from dollars, not meters." Those change how you
 *   read THAT number, so they stay next to it — but as a chip or a dotted
 *   underline, never a sentence. Those live with their tiles and are NOT
 *   this file's job.
 *
 * HOW TO ADD A SOURCE
 *
 * Add one entry below. Do not write a citation into a tile, a panel subtitle
 * or a card footer. If a number needs provenance, its metric gets an `id`
 * here and the Sources page picks it up automatically. That way the upcoming
 * redesign moves components around and the citations follow, instead of being
 * re-hunted through 22,000 lines of markup a second time.
 *
 * Every `url` here was resolvable at the date in `verified`. When an agency
 * publishes a revision, update `edition` and `verified` in this file only.
 * ========================================================================= */

(function () {
  'use strict';

  // Grouped in the order a reader would ask the questions, not alphabetically.
  window.BEACON_SOURCES = [
    {
      group: 'Building energy benchmarks',
      blurb: 'What "normal" looks like for a building of this type, size and climate.',
      items: [
        {
          name: 'EPA ENERGY STAR Portfolio Manager — U.S. National Median Table',
          edition: 'August 2024 release',
          url: 'https://portfoliomanager.energystar.gov/pdf/reference/US%20National%20Median%20Table.pdf',
          backs: 'Median site EUI by property type; the estimated ENERGY STAR score.',
          note: 'Estimated scores are Beacon’s own calculation against these medians. They are not EPA-issued scores and are labelled as estimates wherever they appear. Only an EPA-verified score obtained through Portfolio Manager carries certification weight.',
          verified: '2026-09-17',
        },
        {
          name: 'EIA Commercial Buildings Energy Consumption Survey (CBECS)',
          edition: '2018 microdata; Tables C4, E1-E11',
          url: 'https://www.eia.gov/consumption/commercial/',
          backs: 'Census-region climate adjustment, size-band correction, and the heating / cooling / baseload end-use shares used in weather normalization.',
          verified: '2026-09-17',
        },
        {
          name: 'DOE / NREL Commercial Reference Buildings',
          edition: 'EnergyPlus prototype models, post-1980 vintage',
          url: 'https://www.energy.gov/eere/buildings/commercial-reference-buildings',
          backs: 'End-use breakdown by ASHRAE climate zone, and the zone-to-zone ratio used to correct a median EUI from the state default to the building’s own climate zone.',
          verified: '2026-09-17',
        },
        {
          name: 'DOE Buildings Performance Database',
          url: 'https://bpd.lbl.gov/',
          backs: 'National peer counts by primary activity.',
          note: 'State shares are Beacon estimates derived from commercial floor-area distribution, not BPD-published figures.',
          verified: '2026-09-17',
        },
      ],
    },
    {
      group: 'Emissions factors',
      blurb: 'How consumption becomes carbon.',
      items: [
        {
          name: 'EPA eGRID — State Output Emission Rates',
          edition: 'eGRID2023, Revision 2 (March 2025)',
          url: 'https://www.epa.gov/egrid/summary-data',
          backs: 'Scope 2 grid emissions: state-level total-output CO₂e per kWh.',
          verified: '2026-09-17',
        },
        {
          name: 'EPA Emission Factors for Greenhouse Gas Inventories',
          edition: 'Natural gas: 53.07 kg CO₂ per MMBtu (5.307 kg per therm)',
          url: 'https://www.epa.gov/climateleadership/ghg-emission-factors-hub',
          backs: 'Scope 1 emissions from on-site natural gas combustion.',
          verified: '2026-09-17',
        },
        {
          name: 'EPA Greenhouse Gas Equivalencies Calculator',
          edition: '4.6 t/vehicle/yr · 10,500 kWh/home/yr · 0.84 t sequestered per acre of U.S. forest/yr · 8.887 × 10⁻³ t per gallon of gasoline',
          url: 'https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator',
          backs: 'The cars / homes / forest acres / gallons equivalencies.',
          verified: '2026-09-17',
        },
      ],
    },
    {
      group: 'Energy prices and market data',
      blurb: 'What energy costs, and what it is trading at.',
      items: [
        {
          name: 'EIA Form EIA-861 — Average Retail Price by State',
          edition: '2024 commercial sector, Table 4',
          url: 'https://www.eia.gov/electricity/sales_revenue_price/pdf/table_4.pdf',
          backs: 'State commercial-average electricity rate, used wherever a building’s own contracted rate is not on file.',
          note: 'When a signed supply rate IS on file, Beacon shows that rate and uses it; the state average is the fallback and is labelled as such.',
          verified: '2026-09-17',
        },
        {
          name: 'NREL Utility Rate Database (URDB)',
          url: 'https://openei.org/wiki/Utility_Rate_Database',
          backs: 'Rate structure, time-of-use and demand-charge flags by utility.',
          verified: '2026-09-17',
        },
        {
          name: 'EIA Natural Gas Weekly Storage Report',
          edition: 'Series NW2_EPG0_SWO_R48_BCF',
          url: 'https://ir.eia.gov/ngs/ngs.html',
          backs: 'Lower-48 working gas in storage.',
          verified: '2026-09-17',
        },
        {
          name: 'EIA Henry Hub spot price and Short-Term Energy Outlook',
          edition: 'Series RNGWHHD (spot, ~5 business-day lag); STEO published monthly, second Tuesday',
          url: 'https://www.eia.gov/outlooks/steo/',
          backs: 'Henry Hub spot and forward view; the commercial electricity price forecast (series ESCMUUS).',
          verified: '2026-09-17',
        },
        {
          name: 'GridStatus.io real-time LMP feeds',
          edition: 'PJM · NYISO · ISO-NE · CAISO · MISO · ERCOT',
          url: 'https://www.gridstatus.io/',
          backs: 'Wholesale locational marginal pricing by ISO.',
          verified: '2026-09-17',
        },
      ],
    },
    {
      group: 'Weather and climate',
      blurb: 'Why a Phoenix office and a Minneapolis office at the same EUI are not performing the same.',
      items: [
        {
          name: 'NOAA NCEI U.S. Climate Normals',
          edition: '1991–2020 product suite',
          url: 'https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals',
          backs: 'Station-level heating and cooling degree days (base 65°F) for weather normalization.',
          verified: '2026-09-17',
        },
        {
          name: 'ANSI/ASHRAE Standard 169 — Climatic Data for Building Design',
          edition: '169-2021',
          url: 'https://www.ashrae.org/technical-resources/standards-and-guidelines',
          backs: 'Climate zone assignment (1A–8) per station.',
          verified: '2026-09-17',
        },
      ],
    },
    {
      group: 'Measurement & verification',
      blurb: 'The tests a savings claim has to pass before Beacon will show it.',
      items: [
        {
          name: 'ASHRAE Guideline 14 — Measurement of Energy, Demand and Water Savings',
          edition: 'Guideline 14-2023',
          url: 'https://www.ashrae.org/technical-resources/standards-and-guidelines',
          backs: 'Model acceptance thresholds for weather-normalized savings: CV(RMSE) ≤ 15% and |NMBE| ≤ 5% on monthly data.',
          note: 'A regression that fails these is not shown as a savings figure.',
          verified: '2026-09-17',
        },
        {
          name: 'Bonneville Power Administration — Regression for M&V Reference Guide',
          edition: '§5.1.1',
          url: 'https://www.bpa.gov/energy-and-services/efficiency/measurement-and-verification',
          backs: 'Minimum model fit of R² ≥ 0.75 for a degree-day regression.',
          verified: '2026-09-17',
        },
      ],
    },
    {
      group: 'Regulation and incentives',
      blurb: 'What each jurisdiction actually requires, and what is available to offset it.',
      items: [
        {
          name: 'Building Performance Standards — primary jurisdiction sources',
          edition: 'NYC Local Law 97 / LL84 · Boston BERDO · Chicago Energy Benchmarking · Denver Energize · Seattle BEPS · Washington Clean Buildings · St. Paul · Montgomery County BEPS',
          url: 'https://www.energycodes.gov/BPS',
          backs: 'Emissions caps, thresholds, penalty rates and compliance deadlines by jurisdiction.',
          note: 'Where a jurisdiction has not published a penalty schedule, or has published caps that do not cover a given property type, Beacon reports that exposure as pending rather than as $0. A dollar figure is never shown for a penalty we cannot compute.',
          verified: '2026-09-17',
        },
        {
          name: 'FERC Order 2222 — Distributed Energy Resource participation in wholesale markets',
          url: 'https://www.ferc.gov/media/ferc-order-no-2222-fact-sheet',
          backs: 'The basis for the virtual power plant / demand response value range.',
          note: 'That range applies typical ISO capacity and energy rates to load flexibility estimated from monthly load factors — not from metered interval demand. It is an opportunity to explore, not a quote. Firming it up requires interval data.',
          verified: '2026-09-17',
        },
        {
          name: 'DSIRE — Database of State Incentives for Renewables & Efficiency',
          edition: 'Operated by the NC Clean Energy Technology Center, NC State University',
          url: 'https://www.dsireusa.org/',
          backs: 'Rebate, grant, loan and tax-credit programs by state and federal jurisdiction.',
          verified: '2026-09-17',
        },
      ],
    },
  ];

  // ── How Beacon labels its own numbers ───────────────────────────────────
  // Stated once, here, rather than repeated as prose under each tile. The
  // tiles carry a short chip; this explains what the chip means.
  window.BEACON_BASIS_NOTES = [
    {
      label: 'Metered',
      text: 'Calculated from consumption on file for this building — kWh and therms as reported on the portfolio, converted at 3.412 kBtu per kWh and 100 kBtu per therm.',
    },
    {
      label: 'Estimated',
      text: 'Derived rather than measured. Square footage back-solved from usage against a CBECS median carries a stated band of roughly 0.70× to 1.50×; energy back-solved from spend assumes a 65 / 35 electric-gas split of the bill. Anything estimated is marked, and a reported value always takes precedence over an estimate when both exist.',
    },
    {
      label: 'Partial',
      text: 'A portfolio total that deliberately excludes something we could not compute — a jurisdiction with no published penalty schedule, or a meter in a fuel we do not price. The count of what was excluded is shown alongside it.',
    },
  ];

  // ── Page renderer ────────────────────────────────────────────────────────
  // Builds the Sources page from the registry above. Nothing else in the app
  // should render a citation; adding an entry above is the whole job.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  window.renderSourcesPage = function () {
    var mount = document.getElementById('sp-sources-body');
    if (!mount) return;

    var html = '';

    (window.BEACON_SOURCES || []).forEach(function (g) {
      html += '<div class="src-group">' +
                '<div class="src-group-hd">' + esc(g.group) + '</div>' +
                (g.blurb ? '<div class="src-group-blurb">' + esc(g.blurb) + '</div>' : '');
      g.items.forEach(function (it) {
        html += '<div class="src-item">' +
                  '<div class="src-item-name">' +
                    (it.url
                      ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.name) + '</a>'
                      : esc(it.name)) +
                  '</div>' +
                  (it.edition ? '<div class="src-item-ed">' + esc(it.edition) + '</div>' : '') +
                  '<div class="src-item-backs"><span class="src-k">Used for</span> ' + esc(it.backs) + '</div>' +
                  (it.note ? '<div class="src-item-note">' + esc(it.note) + '</div>' : '') +
                '</div>';
      });
      html += '</div>';
    });

    html += '<div class="src-group"><div class="src-group-hd">How these numbers are labelled</div>';
    (window.BEACON_BASIS_NOTES || []).forEach(function (b) {
      html += '<div class="src-item">' +
                '<div class="src-item-name"><span class="src-chip">' + esc(b.label) + '</span></div>' +
                '<div class="src-item-backs">' + esc(b.text) + '</div>' +
              '</div>';
    });
    html += '</div>';

    var count = (window.BEACON_SOURCES || []).reduce(function (n, g) { return n + g.items.length; }, 0);
    html += '<div class="src-foot">' + count + ' primary sources · links verified 17 September 2026 · ' +
            'reviewed whenever a publishing agency issues a revision. ' +
            'Every figure in Beacon traces to one of the above or to consumption data supplied by the client. ' +
            'Where a figure is derived rather than measured, it is marked as such at the point it is shown.</div>';

    mount.innerHTML = html;
  };
})();
