/* ============================================================================
 * Per-location analytics layer  (rev39 — 2026-06-02)
 * ----------------------------------------------------------------------------
 * These functions were CALLED throughout beacon-index but never defined, which
 * left the Footprint page's Carbon, Top-Problem-Buildings, Geographic-
 * Concentration and Contract-Calendar sections silently dark (each is guarded
 * by `typeof window.computePerLocation === 'function'`).
 *
 * All math here reuses the SAME formulas already in benchmarks.js
 * (computeBenchmarks) and bps_jurisdictions.js (computeBpsExposure) so the
 * numbers reconcile with every other page. No new/independent assumptions.
 *   • spend     : electric kWh × state rate (STATE_RATES_CENTS) + gas therms × $1.20
 *   • site EUI  : (kWh × 3.412 + therms × 100) / sqft        [kBtu/sqft/yr]
 *   • median    : CBECS_MEDIANS[btype] × REGION_ADJ × sizeAdj  (== computeBenchmarks)
 *   • savings   : max(0, actualEUI − median×0.55)/actualEUI × spend (== efficiencySavings)
 * ========================================================================== */
(function () {
  'use strict';

  var GAS_RATE_PER_THERM = 1.20;          // $/therm — app-wide gas convention
  var KWH_TO_KBTU        = 3.412;         // 1 kWh  = 3.412 kBtu
  var THERM_TO_KBTU      = 100;           // 1 therm = 100 kBtu
  var DEFAULT_RATE_CENTS = 12.75;         // fallback ¢/kWh (matches computeBenchmarks)

  function _norm(s) { return String(s == null ? '' : s).toLowerCase().trim(); }
  // One normalizer for building types (benchmarks.js) so 'Warehouse
  // (Non-Refrigerated)' and 'warehouse' resolve the same way here as on
  // every other screen.
  function _normBt(s) {
    return (typeof window.beaconNormalizeBtype === 'function')
      ? (window.beaconNormalizeBtype(s) || '') : _norm(s);
  }
  function _stateRate(st) {
    var c = (window.STATE_RATES_CENTS && window.STATE_RATES_CENTS[st]) || DEFAULT_RATE_CENTS;
    return c / 100;                       // $/kWh
  }
  function _usage(a) {
    var u = (a.usage != null) ? a.usage : a.annualUsage;
    return Number(u) || 0;
  }
  // Fuel classification. This used to return the raw lowercased type, and
  // every caller compared it to the literal 'gas' — so a meter typed
  // 'Natural Gas' fell into the else-branch and had its THERMS added to
  // electricKwh. 50,000 therms would be counted as 50,000 kWh: the building's
  // site energy drops from 5,000,000 kBtu of gas to 170,600, and its spend
  // from $60,000 to roughly $6,400. Current production data contains only
  // 'Electric' and 'Gas', so nothing is wrong on screen today — this is the
  // latent version of the same fault fixed in index.html's spend card.
  // Defer to the app-wide classifier when it is loaded; keep a local
  // equivalent so this module still stands alone.
  function _fuel(a) {
    if (typeof window.beaconMeterKind === 'function') {
      var k = window.beaconMeterKind(a);
      return (k === 'gas') ? 'gas' : (k === 'electric' ? 'electric' : k);
    }
    var t = _norm(a.type || a.accountType).replace(/[^a-z]/g, '');
    if (!t) return 'unknown';
    if (t.indexOf('gas') !== -1 || t === 'ng' || t.indexOf('therm') !== -1) return 'gas';
    if (t.indexOf('elec') !== -1 || t.indexOf('kwh') !== -1) return 'electric';
    return 'other';
  }

  // ── computePerLocation ─────────────────────────────────────────────────
  // Group accounts into physical buildings (one address = one location),
  // identical bucketing to computeBpsExposure, then attach spend + EUI object.
  window.computePerLocation = function (accounts, state, btype) {
    accounts = Array.isArray(accounts) ? accounts : [];
    btype = _normBt(btype) || 'office';

    var byAddr = {};
    accounts.forEach(function (a) {
      if (!a) return;
      // ── GROUPING KEY INCLUDES CITY + STATE (fixed 2026-09-17) ───────────
      // The key was the address string ALONE. "100 Main St, Dallas TX" and
      // "100 Main St, Boston MA" are different buildings and collapsed into
      // one. Usage was SUMMED across both while floor area was reduced to the
      // larger of the two (line below takes max), so the merged record showed
      // roughly double the real energy intensity, invented a gap against the
      // median, and converted that gap into an addressable-savings dollar
      // figure. The merged row also inherited the FIRST account's state, so
      // the other building's spend was priced at the wrong state's rate.
      //
      // Address collisions are a live condition in this data, not a
      // hypothetical — index.html notes four legitimate rows lost this way on
      // a real portfolio.
      //
      // computeBpsExposure was already safe because it filters to one
      // jurisdiction before bucketing; this function is called from ten
      // places and was not.
      var key = _norm(a.address)
                  ? (_norm(a.address) + '|' + _norm(a.city) + '|' + _norm(a.state))
                  : (_norm(a.serviceAddress)
                      ? (_norm(a.serviceAddress) + '|' + _norm(a.city) + '|' + _norm(a.state))
                      : ('__noaddr_' + (a.id || a.account || Math.random())));
      if (!byAddr[key]) {
        byAddr[key] = {
          address: a.address || a.serviceAddress || a.name || '',
          city:    a.city  || '',
          state:   a.state || '',
          sqft: 0, electricKwh: 0, gasTherms: 0, otherMeters: 0,
          // ── FIELDS THE RENDERERS READ (added 2026-09-17) ─────────────────
          // index.html reads SEVENTEEN fields off these objects; this
          // function emitted NINE. The other eight were silently undefined,
          // and because none of them threw, each degraded into a different
          // wrong thing on screen:
          //   totalKbtu       -> "NaNk" in the Total kBtu/yr column
          //   totalKbtu       -> $/MMBtu column permanently blank
          //   accounts        -> "undefined accounts"
          //   costPerSqft     -> $/sqft column permanently "—"
          //   electricUtility -> Rate-type column permanently "—", and the
          //                      URDB live-refresh had nothing to populate
          //   hasElectric /
          //   hasGas          -> the map's fuel filter matched ZERO sites
          //                      and rendered "0 / 12 MATCH"
          //   status          -> EVERY pin on the portfolio map drew blue,
          //                      making the status legend decorative
          // Same defect shape as computeEquivalencies returning 2 of 4.
          accounts: 0,
          hasElectric: false,
          hasGas: false,
          utilities: {},
          electricUtility: '',
          status: '',
          propertyType: ''
        };
      }
      var g  = byAddr[key];
      var sf = Number(a.sqft) || 0;
      if (sf > g.sqft) g.sqft = sf;        // a building's sqft = its largest reported meter sqft
      var u  = _usage(a);
      var ft = _fuel(a);
      // 'other' (water, steam, anything we cannot price or convert) is no
      // longer swept into electricKwh. Counting it as electricity would
      // inflate the building's kWh, its kBtu, its EUI and its Scope 2 carbon
      // all at once, from a meter we cannot even convert to kBtu. Counted
      // separately so a consumer can disclose it instead of silently
      // absorbing it.
      // A blank/unrecognised-but-empty type keeps its previous treatment
      // (counted as electric) so no existing portfolio's totals move; only a
      // type we positively identify as something else is held out.
      if (ft === 'gas')        g.gasTherms += u;
      else if (ft === 'other') g.otherMeters = (g.otherMeters || 0) + 1;
      else                     g.electricKwh += u;   // electric + unknown

      g.accounts += 1;
      if (ft === 'gas') g.hasGas = true; else if (ft !== 'other') g.hasElectric = true;
      var util = String(a.utility || '').trim();
      if (util) {
        g.utilities[util] = true;
        // The rate-type lookup is electricity-only, so remember the utility
        // that actually serves the electric meter rather than whichever row
        // happened to come last.
        if (ft !== 'gas' && !g.electricUtility) g.electricUtility = util;
      }
      // First non-empty status on the building wins; the renderer colours the
      // map pin from this.
      if (!g.status && a.status) g.status = String(a.status);
      // Per-building type (bundle 118, Matt's call 2026-10-05): the ENERGY
      // STAR property type on the meter row, when there is one.
      var pt = a.property_type || a.propertyType;
      if (pt && !g.propertyType) g.propertyType = String(pt);
    });

    var locs = Object.keys(byAddr).map(function (k) { return byAddr[k]; });

    locs.forEach(function (l) {
      var st = String(l.state || state || 'PA').toUpperCase();

      // Spend — same convention as the Footprint spend card.
      l.totalSpend = Math.round(l.electricKwh * _stateRate(st) + l.gasTherms * GAS_RATE_PER_THERM);

      // EUI object — only when we have measured sqft (else the renderer drops
      // into spend-mode). Mirrors computeBenchmarks exactly.
      l.eui = null;
      if (l.sqft > 0) {
        var totalKbtu = l.electricKwh * KWH_TO_KBTU + l.gasTherms * THERM_TO_KBTU;
        var actualEUI = totalKbtu / l.sqft;
        if (actualEUI > 0) {
          var regionAdj = (window.REGION_ADJ_BY_STATE && window.REGION_ADJ_BY_STATE[st]) || 1.0;
          var szAdj     = (typeof window.sizeAdj === 'function') ? window.sizeAdj(l.sqft) : 1.0;
          // Each building is judged against ITS OWN type when the portfolio
          // records one; the client-level type is only the fallback.
          var bt = (l.propertyType && _normBt(l.propertyType)) || btype;
          if (!(window.CBECS_MEDIANS && window.CBECS_MEDIANS[bt])) bt = btype;
          l.btype = bt;
          l.btypeSource = (bt !== btype || l.propertyType) ? 'building' : 'portfolio';
          var medianEUI = ((window.CBECS_MEDIANS && window.CBECS_MEDIANS[bt]) || 80) * regionAdj * szAdj;
          // Savings are sized to the shared efficiency target (the median
          // building since 2026-10-05), so this matches computeBenchmarks.
          var _tgt = (window.BEACON_OPP_RATES && Number(window.BEACON_OPP_RATES.efficiencyTarget) > 0)
                       ? Number(window.BEACON_OPP_RATES.efficiencyTarget) : 1.0;
          var targetEUI      = medianEUI * _tgt;
          var efficiencyGap  = Math.max(0, actualEUI - targetEUI);
          var addressableSavings = Math.round((efficiencyGap / Math.max(actualEUI, 1)) * l.totalSpend);
          l.eui = {
            actualEUI:          Math.round(actualEUI),
            medianEUI:          Math.round(medianEUI),
            deltaPct:           Math.round((actualEUI / medianEUI - 1) * 100),
            addressableSavings: addressableSavings
          };
        }
      }
      // Emitted unconditionally, not only when sqft exists — the kBtu column
      // and the $/MMBtu column are meaningful for a building with no floor
      // area on file, and returning undefined there is what produced "NaNk".
      l.totalKbtu   = Math.round(l.electricKwh * KWH_TO_KBTU + l.gasTherms * THERM_TO_KBTU);
      l.costPerSqft = (l.sqft > 0) ? Math.round((l.totalSpend / l.sqft) * 100) / 100 : null;
      l.utilities   = Object.keys(l.utilities || {});
      l.addressable = !!(l.eui && l.eui.addressableSavings > 0);
    });

    return locs;
  };

  // ── summarizePerLocation ───────────────────────────────────────────────
  // index.html:15215 calls window.summarizePerLocation(locations, btype).
  // IT WAS NEVER DEFINED — anywhere, in any loaded script. The call threw a
  // TypeError before the line that unhides the section, and the caller's
  // try/catch sent it to the console, so the ENTIRE Per-Location Distribution
  // section — summary strip, EUI distribution chart and hit-list table —
  // never appeared for any portfolio. #pl-sec ships display:none, so there
  // was not even an empty state to notice.
  //
  // Contract reconstructed from every summary.* read in index.html:
  //   total, withData, withoutData, bestEUI, medianEUI, worstEUI,
  //   btypeMedian, totalSpend, totalAddressableSavings
  // `mode` is chosen by `summary.withData > 0`, so withData must count
  // buildings that produced an EUI, not merely buildings that exist.
  window.summarizePerLocation = function (locations, btype) {
    var locs = Array.isArray(locations) ? locations : [];
    var withEui = locs.filter(function (l) { return l && l.eui && l.eui.actualEUI > 0; });
    var euis    = withEui.map(function (l) { return l.eui.actualEUI; })
                         .sort(function (a, b) { return a - b; });

    var median = null;
    if (euis.length) {
      var mid = Math.floor(euis.length / 2);
      median = (euis.length % 2) ? euis[mid]
                                 : Math.round((euis[mid - 1] + euis[mid]) / 2);
    }

    return {
      total:       locs.length,
      withData:    withEui.length,
      withoutData: locs.length - withEui.length,
      bestEUI:     euis.length ? euis[0] : null,                  // lower is better
      medianEUI:   median,
      worstEUI:    euis.length ? euis[euis.length - 1] : null,
      btypeMedian: Math.round((window.CBECS_MEDIANS && window.CBECS_MEDIANS[btype]) || 0) || null,
      totalSpend:  locs.reduce(function (t, l) { return t + (Number(l && l.totalSpend) || 0); }, 0),
      totalAddressableSavings: locs.reduce(function (t, l) {
        return t + ((l && l.eui && Number(l.eui.addressableSavings)) || 0);
      }, 0)
    };
  };

  // ── computeEquivalencies ───────────────────────────────────────────────
  // Carbon → relatable equivalents. EPA factors:
  //   passenger vehicle ≈ 4.6 tCO2e/yr ; avg US home electricity ≈ 10,500 kWh/yr
  window.computeEquivalencies = function (totalCO2Tonnes, totalKwh) {
    var co2 = Number(totalCO2Tonnes) || 0;
    var kwh = Number(totalKwh) || 0;
    // FOUR equivalencies, not two. index.html reads eq.forestAcres and
    // eq.gallonsGas (13198-13199) and this function never returned them, so
    // fmtBig(undefined) threw and the render aborted after the first two
    // tiles — leaving #eq-forest and #eq-gallons showing their placeholder
    // dashes forever, under a header promising all four.
    //
    // Constants are EPA's published GHG Equivalencies factors, the same
    // source as the two that were already here (4.6 t/vehicle/yr, 10,500
    // kWh/home/yr):
    //   forest    0.84 metric tons CO2 sequestered per acre of US forest/yr
    //   gasoline  8.887 x 10^-3 metric tons CO2 per gallon burned
    return {
      carsOffRoad:  Math.round(co2 / 4.6),
      homesPowered: Math.round(kwh / 10500),
      forestAcres:  Math.round(co2 / 0.84),
      gallonsGas:   Math.round(co2 / 0.008887)
    };
  };

  // ── computeContractCalendar ────────────────────────────────────────────
  // Bucket accounts by contract expiration into mutually-exclusive tiers.
  // Each item carries the full account plus expDate / daysUntil / annualSpend
  // / urgency so the modal + CSV can render without re-deriving anything.
  window.computeContractCalendar = function (accounts) {
    accounts = Array.isArray(accounts) ? accounts : [];

    function spendOf(a) {
      var st = String(a.state || 'PA').toUpperCase();
      var u  = _usage(a);
      return Math.round(_fuel(a) === 'gas' ? u * GAS_RATE_PER_THERM : u * _stateRate(st));
    }
    function parseExp(raw) {
      if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
      var s = String(raw == null ? '' : raw).trim();
      if (!s) return null;
      var d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }

    var now = new Date();
    var res = {
      totalContracts: 0,
      expired: [], critical: [], soon: [], withinYear: [], beyond: [], unknown: [],
      totalExpiredSpend: 0, totalNext90Spend: 0, totalWithinYearOnlySpend: 0, totalBeyondSpend: 0
    };

    accounts.forEach(function (a) {
      if (!a) return;
      var raw = (a.expiration != null && a.expiration !== '') ? a.expiration : a.exp;
      if (raw == null || raw === '') return;     // no contract tracked → not counted
      res.totalContracts++;

      var spend = spendOf(a);
      var d     = parseExp(raw);
      var item  = Object.assign({}, a, { expDate: d, exp: String(raw), annualSpend: spend });

      // index.html reads `daysUntilExp` (14811, 14841, 14920); this function
      // set `daysUntil`. fmtDays(undefined) hits its `d == null` guard and
      // returns "date unknown", so every contract row printed a correct
      // expiry date and a correct urgency badge with "date unknown" directly
      // beneath it, and the CSV export's Days Until Expiration column was
      // empty on every row. Both names are emitted rather than renaming one
      // and breaking the other reader.
      if (!d) { item.daysUntil = null; item.daysUntilExp = null; item.urgency = 'unknown'; res.unknown.push(item); return; }

      var days = Math.round((d.getTime() - now.getTime()) / 86400000);
      item.daysUntil = days;
      item.daysUntilExp = days;
      if (days < 0)        { item.urgency = 'expired';     res.expired.push(item);    res.totalExpiredSpend         += spend; }
      else if (days <= 30) { item.urgency = 'critical';    res.critical.push(item);   res.totalNext90Spend          += spend; }
      else if (days <= 90) { item.urgency = 'soon';        res.soon.push(item);       res.totalNext90Spend          += spend; }
      else if (days <= 365){ item.urgency = 'within-year'; res.withinYear.push(item); res.totalWithinYearOnlySpend  += spend; }
      else                 { item.urgency = 'beyond';      res.beyond.push(item);     res.totalBeyondSpend          += spend; }
    });

    return res;
  };

})();
