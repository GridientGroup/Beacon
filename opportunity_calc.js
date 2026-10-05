/* ════════════════════════════════════════════════════════════════════
   opportunity_calc.js — Beacon · profile-level opportunity engine
   ────────────────────────────────────────────────────────────────────
   Defines window.calcOpportunityValues(spend, sqft, btype, state, states).

   This is the PROFILE-level calculator: it sizes addressable program
   value from a portfolio's aggregate profile (total annual spend, total
   sqft, primary state) — as opposed to the per-meter portfolio engine
   (_oppEstimatedValue / _oppLocAddressable in index.html) which needs a
   full account list. The report and the Opportunities scorecard call
   this version because demo / unboarded clients only have profile params.

   ── Rate basis (confirmed with STS, May 2026) ──────────────────────
   Percentage programs apply to SUPPLY spend. The `spend` input is the
   all-in utility bill (supply + delivery + demand + taxes), so a supply
   factor of 0.65 is applied before the supply-based percentages.
   Efficiency is a whole-bill measure and takes no haircut.

     (bundle 118: every rate below is read from window.BEACON_OPP_RATES in
      benchmarks.js — one table for every screen. Procurement is 8%.)
     Procurement    8% of supply spend   — deregulated states only
     Demand Resp.   4% of supply spend   — any grid
     Efficiency    EUI gap to the median building when sqft is known (computeBenchmarks);
                   20% of all-in spend only as the fallback
     Community Solar 8% of supply spend  — solar-program states only
     Cost Recovery  2% × 3-year lookback — one-time; spend > $50k
     Rebates        $8,500 per location  — sites estimated from sqft if 0
     BPS            $12,000 per location — BPS-jurisdiction portfolios
     RECs           qualitative ($0)     — always available
     ESG            qualitative ($0)     — large portfolios

   ── Output contract ────────────────────────────────────────────────
   Returns {
     totalAnnualized : number,   // sum of recurring annual values
     totalOneTime    : number,   // sum of one-time values (recovery)
     totalBpsRisk    : number,   // sum of bps_dynamic values
     perProgram      : { [pid]: ProgramValue }
   }
   ProgramValue = {
     value         : number,     // the headline $ (0 for qualitative)
     displayText   : string,     // formatted for the UI cell
     method        : string,     // 'pct_supply' | 'pct_allin' |
                                 //   'flat_per_loc' | 'bps_dynamic' |
                                 //   'qualitative'
     source        : string,     // short rate-basis citation
     isCost        : boolean,    // true → program is a cost line, not savings
     isOneTime     : boolean,    // true → one-time, not annualized
     isQualitative : boolean,    // true → no $ figure
     isDereg       : boolean,    // true → this state is deregulated
     requiresDereg : boolean     // true → program needs a dereg market
   }
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Confirmed rate constants ───────────────────────────────────────
  // Read from the shared table so this engine can never drift from the
  // others again; the literals are only a fallback if benchmarks.js failed
  // to load.
  var _R = window.BEACON_OPP_RATES || {};
  var SUPPLY_FACTOR = _R.supplyFactor || 0.65;
  var RATE = {
    procurement: _R.procurement != null ? _R.procurement : 0.08,  // of supply spend
    dr:          _R.dr          != null ? _R.dr          : 0.04,  // of supply spend
    efficiency:  _R.efficiency  != null ? _R.efficiency  : 0.20,  // all-in, fallback only
    solar:       _R.solar       != null ? _R.solar       : 0.08,  // of supply spend
    recovery:    _R.recovery    != null ? _R.recovery    : 0.02   // all-in, per year audited
  };
  var RECOVERY_YEARS    = _R.recoveryYears || 3;
  var REBATE_PER_LOC    = 8500;    // $ per location
  var BPS_PER_LOC       = 12000;   // $ per location
  var RECOVERY_MIN_SPEND = 50000;  // recovery only worthwhile above this
  var SQFT_PER_SITE     = 50000;   // estimate sites from sqft when sites=0
  var ESG_LARGE_SQFT    = 1000000; // "large portfolio" threshold for ESG

  // Deregulated electric markets — kept in sync with index.html DEREG_STATES.
  var DEREG = _R.dereg || ['PA','NY','NJ','MA','CT','RI','NH','MD','OH','IL','TX','DC','ME','DE','MI'];
  // States with active community-solar programs.
  var SOLAR = _R.solarStates || ['NY','MA','NJ','IL','MN','CO','MD','PA','RI','CT','DC','DE','VA','NM','OR'];

  // ── Formatting ─────────────────────────────────────────────────────
  function fmt$(n) {
    if (n == null || isNaN(n) || n <= 0) return '$0';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
    return '$' + Math.round(n);
  }

  // ── Site-count resolution ──────────────────────────────────────────
  // Many profiles arrive with sites:0 (sqft known, site count not yet
  // entered). Flat-per-location programs (rebates, BPS) would otherwise
  // compute $0. Estimate from floor area; floor of 1 site.
  function resolveSites(sites, sqft) {
    var s = Number(sites) || 0;
    if (s > 0) return { count: s, estimated: false };
    var sf = Number(sqft) || 0;
    if (sf <= 0) return { count: 1, estimated: true };
    return { count: Math.max(1, Math.round(sf / SQFT_PER_SITE)), estimated: true };
  }

  // ── Main entry point ───────────────────────────────────────────────
  //   calcOpportunityValues(spend, sqft, btype, state, states, sites)
  // `states` is the per-program enrollment-state map (accepted for
  // call-site compatibility). `sites` is the portfolio location count;
  // when 0 or omitted it is estimated from sqft (resolveSites).
  window.calcOpportunityValues = function (spend, sqft, btype, state, states, sites) {
    spend = Number(spend) || 0;
    sqft  = Number(sqft)  || 0;
    state = String(state || '').toUpperCase().trim();
    states = states || {};

    var supplySpend = spend * SUPPLY_FACTOR;
    var isDereg = DEREG.indexOf(state) !== -1;
    var isSolar = SOLAR.indexOf(state) !== -1;
    var siteInfo = resolveSites(sites, sqft);

    var per = {};

    // ── Energy Procurement — 8% of supply spend, dereg only ──────────
    (function () {
      var val = isDereg ? supplySpend * RATE.procurement : 0;
      per.procurement = {
        value: val,
        displayText: isDereg ? fmt$(val) + '/yr'
                             : 'Not available — regulated market',
        method: 'pct_supply',
        source: Math.round(RATE.procurement * 100) + '% of supply spend · deregulated markets',
        isCost: false, isOneTime: false, isQualitative: false,
        isDereg: isDereg, requiresDereg: true
      };
    })();

    // ── Demand Response — 4% of supply spend, any grid ───────────────
    (function () {
      var val = supplySpend * RATE.dr;
      per.dr = {
        value: val,
        displayText: fmt$(val) + '/yr',
        method: 'pct_supply',
        source: '4% of supply spend · PJM 2025/26 BRA',
        isCost: false, isOneTime: false, isQualitative: false,
        isDereg: isDereg, requiresDereg: false
      };
    })();

    // ── Energy Efficiency / EaaS ─────────────────────────────────────
    // Primary: the EUI gap to the median building from computeBenchmarks — the same
    // figure the Footprint savings card shows. Fallback, only when floor area
    // is unknown: the flat published rate (bundle 118).
    (function () {
      var val, method, src;
      var bm = null;
      if (sqft > 0 && typeof window.computeBenchmarks === 'function') {
        try { bm = window.computeBenchmarks(state, btype, sqft, spend); } catch (e) { bm = null; }
      }
      if (bm && bm.efficiencyBasis === 'eui_gap') {
        // Same 35%-of-spend ceiling computeBenchmarks applies to total
        // savings, so the opportunity hero can never claim more than the
        // Footprint savings card does for the same portfolio.
        val = Math.min(Number(bm.efficiencySavings) || 0, spend * 0.35);
        method = 'eui_gap';
        src = 'EUI gap to the median building of this type' +
              ((Number(bm.efficiencySavings) || 0) > spend * 0.35 ? ' · capped at 35% of spend' : '');
      } else {
        val = spend * RATE.efficiency;
        method = 'pct_allin';
        src = Math.round(RATE.efficiency * 100) + '% of total spend · used because floor area is unknown';
      }
      per.efficiency = {
        value: val,
        displayText: fmt$(val) + '/yr',
        method: method,
        source: src,
        isCost: false, isOneTime: false, isQualitative: false,
        isDereg: isDereg, requiresDereg: false
      };
    })();

    // ── Community Solar — 8% of supply spend, solar states only ──────
    (function () {
      var val = isSolar ? supplySpend * RATE.solar : 0;
      per.solar = {
        value: val,
        displayText: isSolar ? fmt$(val) + '/yr'
                             : 'No community-solar program in ' + (state || 'this state'),
        method: 'pct_supply',
        source: '8% subscriber discount · NREL',
        isCost: false, isOneTime: false, isQualitative: false,
        isDereg: isDereg, requiresDereg: false
      };
    })();

    // ── Utility Cost Recovery — 2% × 3-year, one-time ────────────────
    (function () {
      var eligible = spend > RECOVERY_MIN_SPEND;
      var val = eligible ? spend * RATE.recovery * RECOVERY_YEARS : 0;
      per.recovery = {
        value: val,
        displayText: eligible ? fmt$(val) + ' one-time'
                              : 'Below audit threshold',
        method: 'pct_allin',
        source: '2% of spend × 3-year audit lookback',
        isCost: false, isOneTime: true, isQualitative: false,
        isDereg: isDereg, requiresDereg: false
      };
    })();

    // ── Rebates & Incentives — $8,500 per location ───────────────────
    (function () {
      var val = siteInfo.count * REBATE_PER_LOC;
      per.rebates = {
        value: val,
        displayText: fmt$(val) + '/yr',
        method: 'flat_per_loc',
        source: '$' + REBATE_PER_LOC.toLocaleString() + '/location addressable · DSIRE'
                + (siteInfo.estimated ? ' · sites estimated from sqft' : ''),
        isCost: false, isOneTime: false, isQualitative: false,
        isDereg: isDereg, requiresDereg: false
      };
    })();

    // ── Building Performance Standards — $12,000 per location ────────
    // Profile-level: we can't see which exact buildings sit in a BPS
    // jurisdiction, so this is sized as exposure per location. The report
    // only renders the BPS page when d.bpsExposed is non-empty, so this
    // value surfaces only for genuinely BPS-exposed portfolios.
    (function () {
      var val = siteInfo.count * BPS_PER_LOC;
      per.bps = {
        value: val,
        displayText: fmt$(val) + ' exposure',
        method: 'bps_dynamic',
        source: '$' + BPS_PER_LOC.toLocaleString() + '/location avoided-penalty exposure',
        isCost: true, isOneTime: false, isQualitative: false,
        isDereg: isDereg, requiresDereg: false
      };
    })();

    // ── RECs — qualitative ───────────────────────────────────────────
    per.recs = {
      value: 0,
      displayText: 'Scope 2 reduction',
      method: 'qualitative',
      source: 'Voluntary REC procurement · PJM-GATS / NEPOOL-GIS',
      isCost: false, isOneTime: false, isQualitative: true,
      isDereg: isDereg, requiresDereg: false
    };

    // ── ESG & Sustainability — qualitative ───────────────────────────
    per.esg = {
      value: 0,
      displayText: sqft >= ESG_LARGE_SQFT ? 'RFP & investor value' : 'Disclosure-readiness',
      method: 'qualitative',
      source: 'CDP / SBTi / GHG Protocol disclosure-readiness',
      isCost: false, isOneTime: false, isQualitative: true,
      isDereg: isDereg, requiresDereg: false
    };

    // ── Round every per-program value ────────────────────────────────
    // Percentage math leaves floating-point tails (…494.531). Round each
    // headline value to whole dollars so anything reading `.value`
    // directly gets a clean integer.
    Object.keys(per).forEach(function (pid) {
      per[pid].value = Math.round(per[pid].value) || 0;
    });

    // ── Totals — Option C (no additive stacking) ─────────────────────
    // The per-program values above are each an INDEPENDENT sizing of one
    // program against the whole portfolio. Procurement (switch supplier),
    // Efficiency (cut consumption) and Solar (offset supply) partly act
    // on the SAME dollars, so summing them triple-counts and produces a
    // headline no client would believe.
    //
    // Instead:
    //   • headlineAnnualized = the single largest recurring program.
    //     It is a defensible "biggest single opportunity" figure.
    //   • totalAnnualized is kept as an alias of headlineAnnualized so
    //     existing report/scorecard code that reads `totalAnnualized`
    //     shows the credible number, not the inflated sum.
    //   • rawSumAnnualized is the old additive total, retained only for
    //     internal reference / debugging — never shown as a headline.
    var rawSumAnnualized = 0, totalOneTime = 0, totalBpsRisk = 0;
    var headlineAnnualized = 0, headlineProgram = null;
    Object.keys(per).forEach(function (pid) {
      var p = per[pid];
      if (p.isQualitative || !p.value) return;
      if (p.method === 'bps_dynamic') { totalBpsRisk += p.value; return; }
      if (p.isOneTime)                { totalOneTime  += p.value; return; }
      rawSumAnnualized += p.value;
      if (p.value > headlineAnnualized) {
        headlineAnnualized = p.value;
        headlineProgram = pid;
      }
    });

    // ── Enrollment-aware figures (A4, bundle 118) ────────────────────
    // `states` (pid → new|eligible|enrolled|active|results) was accepted and
    // never read, so a client already enrolled in a program was still shown
    // that program's dollars as their headline opportunity — a fully-sold
    // client saw "$480,000 · 0 addressable programs". These fields leave the
    // old ones untouched and add the honest version; the hero reads these.
    // BPS is deliberately NOT filtered: enrolling means STS is working the
    // problem, not that the building stopped exceeding its cap.
    var SOLD = { enrolled: 1, active: 1, results: 1 };
    var addressableAnnualized = 0, addressableProgram = null, addressableOneTime = 0;
    var addressableCount = 0, quantifiedCount = 0, enrolledCount = 0;
    Object.keys(per).forEach(function (pid) {
      var p = per[pid];
      var st = String(states[pid] || 'new').toLowerCase();
      p.isEnrolled = !!SOLD[st];
      p.isAddressable = !p.isEnrolled && !p.isQualitative && p.value > 0 && p.method !== 'bps_dynamic';
      if (p.isQualitative || !p.value || p.method === 'bps_dynamic') return;
      quantifiedCount++;
      if (p.isEnrolled) { enrolledCount++; return; }
      addressableCount++;
      if (p.isOneTime) { addressableOneTime += p.value; return; }
      if (p.value > addressableAnnualized) { addressableAnnualized = p.value; addressableProgram = pid; }
    });

    return {
      // Enrollment-aware headline (preferred by the hero and reports).
      addressableAnnualized: addressableAnnualized,
      addressableProgram:    addressableProgram,
      addressableOneTime:    addressableOneTime,
      addressableCount:      addressableCount,
      quantifiedCount:       quantifiedCount,
      enrolledCount:         enrolledCount,
      allProgramsActive:     quantifiedCount > 0 && addressableCount === 0,
      // Headline figure — the largest single recurring program. This is
      // what the cover KPI and the opportunity hero should display.
      totalAnnualized:    headlineAnnualized,
      headlineAnnualized: headlineAnnualized,
      headlineProgram:    headlineProgram,
      totalOneTime:       totalOneTime,
      totalBpsRisk:       totalBpsRisk,
      rawSumAnnualized:   rawSumAnnualized,  // internal only — do not display
      perProgram:         per,
      _meta: {
        btypeUsed:      'efficiency only (EUI gap); no program is gated on building type',
        supplyFactor:   SUPPLY_FACTOR,
        sitesUsed:      siteInfo.count,
        sitesEstimated: siteInfo.estimated,
        deregMarket:    isDereg,
        solarMarket:    isSolar
      }
    };
  };

  // Expose the site resolver so callers that DO know the real site count
  // can pass it through cleanly (the report wrapper uses this).
  window.calcOpportunityValues._resolveSites = resolveSites;

})();
