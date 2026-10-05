/* ============================================================================
 * demo_bills.js — synthetic monthly bill history, DEMO ACCOUNTS ONLY
 *
 * WHY THIS EXISTS
 * Beacon holds annual usage totals. Two Pro capabilities need a monthly
 * billing history and therefore cannot run: Bill Anomaly Detection (needs 6+
 * months) and Weather-Normalized M&V (needs 12+, and 24 to compare a baseline
 * year against a reporting year). Real bills arrive with Phase 2's bill-parser.
 * Until then those tiles sit dark, which is honest but shows a prospect
 * nothing.
 *
 * WHAT THIS IS, SAID PLAINLY
 * Fabricated data. Every reading it produces carries bill_source:'synthetic'
 * and every consumer is expected to surface that. It exists so a demo can
 * exercise real math, not so anyone can quote a number from it.
 *
 * ── THE RULE THIS MODULE ENFORCES ──────────────────────────────────────────
 * Synthetic data may attach ONLY to an account whose customer is flagged
 * is_demo. generate() REFUSES otherwise and returns null — it does not warn
 * and proceed. The caller must pass isDemo explicitly; a missing or falsy
 * value is treated as "real", so forgetting to pass it fails safe.
 *
 * This mirrors the database-level guarantee: public.customers.is_demo and
 * beacon.clients.is_demo both default FALSE, and
 * beacon.reject_synthetic_on_real_client() refuses synthetic rows on any
 * client not flagged demo. Same rule, enforced in both places, because the
 * client should not be able to render what the database would refuse to store.
 *
 * ── WHAT MAKES THE MATH REAL EVEN THOUGH THE DATA IS NOT ───────────────────
 * The numbers are fabricated; the physics is not. Specifically:
 *
 *   · Degree days come from the REAL NOAA normals in climate_normals.js for
 *     the account's own state, then get distributed across the year on a
 *     seasonal curve. So a Minnesota warehouse gets Minnesota winters.
 *   · Consumption is built as baseload + heating_slope*HDD + cooling_slope*CDD,
 *     which is the same model weather_normalization.js fits. The regression is
 *     therefore recovering a relationship that genuinely is in the data rather
 *     than finding noise.
 *   · The 24 months SUM to the account's real annual_usage (12 per year), so
 *     the demo stays internally consistent with every other figure on screen.
 *   · Deterministic: seeded from store_code, so the same account always yields
 *     the same history and a demo is repeatable.
 *
 * Two deliberate plants, so the tiles have something true to find:
 *   · a modest efficiency gain in the reporting year, so M&V shows real
 *     weather-adjusted savings rather than zero
 *   · one usage excursion, also in the reporting year, so anomaly detection has
 *     an actual outlier to find against a clean baseline. It belongs there and
 *     not in the baseline year — see the long note at the plant itself.
 * ========================================================================= */

(function () {
  'use strict';

  // Seasonal distribution of annual degree days, Jan..Dec. Each array sums to
  // 1.0. Shape is a typical northern-hemisphere commercial profile — heating
  // concentrated Dec–Feb, cooling Jun–Aug.
  var HDD_SHAPE = [0.186, 0.157, 0.124, 0.070, 0.026, 0.004,
                   0.001, 0.002, 0.018, 0.068, 0.132, 0.212];
  var CDD_SHAPE = [0.002, 0.003, 0.012, 0.035, 0.093, 0.171,
                   0.221, 0.206, 0.132, 0.095, 0.025, 0.005];

  // Mulberry32 — small, fast, deterministic. Same seed, same sequence.
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFrom(str) {
    var h = 2166136261 >>> 0;
    var s = String(str || 'seed');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // Real annual normals for a state, via climate_normals.js.
  function normalsFor(state) {
    var st = String(state || '').toUpperCase();
    try {
      var principal = window.CLIMATE_PRINCIPAL_BY_STATE || {};
      var stations = window.CLIMATE_STATIONS || {};
      var s = stations[principal[st]];
      if (s && s.hdd != null && s.cdd != null) {
        return { hdd: Number(s.hdd), cdd: Number(s.cdd), station: s.id, zone: s.zone };
      }
    } catch (e) { /* fall through */ }
    // National fallback — still real NOAA figures, just not state-specific.
    return {
      hdd: Number(window.NATIONAL_HDD_65) || 4500,
      cdd: Number(window.NATIONAL_CDD_65) || 1300,
      station: null,
      zone: null,
    };
  }

  function monthEnd(y, m) { return new Date(Date.UTC(y, m + 1, 0)); }
  function iso(d) { return d.toISOString().slice(0, 10); }

  /**
   * Generate 24 months of synthetic bills for one account.
   *
   * @param {object} account  needs { store_code, state, type, annual_usage }
   * @param {object} opts     { isDemo: boolean (REQUIRED true), months, endDate }
   * @returns {Array|null}    null when refused
   */
  function generate(account, opts) {
    var o = opts || {};

    // ── The refusal. Fails safe on a missing flag. ──────────────────────
    if (o.isDemo !== true) {
      if (window.console && console.warn) {
        console.warn('[demo_bills] refused: synthetic bills may only be generated ' +
                     'for an account whose customer is flagged is_demo. Pass ' +
                     'opts.isDemo === true only for demo customers.');
      }
      return null;
    }
    if (!account) return null;

    var annual = Number(account.annual_usage != null ? account.annual_usage : account.annualUsage) || 0;
    if (annual <= 0) return null;

    var months = Number(o.months) || 24;
    var norm = normalsFor(account.state);
    var rnd = prng(seedFrom(account.store_code || account.id || account.name));
    var isGas = String(account.type || '').toLowerCase().indexOf('gas') === 0;

    // Split annual usage into a weather-independent baseload and a
    // weather-driven remainder. Gas is far more heating-dominated than
    // electricity, so the split differs by fuel.
    var baseloadShare = isGas ? 0.25 : 0.55;
    var baseMonthly = (annual * baseloadShare) / 12;
    var weatherAnnual = annual * (1 - baseloadShare);

    // Of the weather-driven part, how much is heating vs cooling.
    var heatShare = isGas ? 1.0 : 0.35;
    var hSlope = (norm.hdd > 0) ? (weatherAnnual * heatShare) / norm.hdd : 0;
    var cSlope = (norm.cdd > 0) ? (weatherAnnual * (1 - heatShare)) / norm.cdd : 0;

    // Plants. Chosen from the seed so they are stable per account.
    var effGain = 0.06 + rnd() * 0.07;               // 6–13% reporting-year gain
    var anomalyMult = 1.28 + rnd() * 0.22;           // +28% to +50%

    // The excursion MUST land in the reporting year, not the baseline.
    //
    // This was the bug in the first version of this generator. An excursion in
    // the baseline year does three bad things at once, and the test run showed
    // all three: it inflates the fitted baseline heating slope, so
    // normalizedAnnual overstates the baseline and M&V reports a 37–44%
    // "saving" that no retrofit produces; it drags the baseline regression
    // below ASHRAE Guideline 14 acceptance (3 of 4 scenarios failed CV(RMSE));
    // and because bill_anomaly.js scores each month against a rolling 12-month
    // reference window, an early excursion sits inside its own neighbours'
    // reference windows, raising their mean and standard deviation so it partly
    // masks itself (missed in 2 of 4) while tripping false positives around it.
    //
    // Putting it in the reporting year is also what actually happens: the
    // baseline is the clean pre-retrofit history, and the thing you are
    // watching for — a stuck valve, a failed schedule, a billing error — shows
    // up after. The excursion is placed at least 6 months into the reporting
    // half so bill_anomaly's window has settled by then.
    var repStart = Math.ceil(months / 2);
    var anomalyMonth = repStart + 6 + Math.floor(rnd() * Math.max(1, (months - repStart) - 7));

    var end = o.endDate ? new Date(o.endDate) : new Date();
    var bills = [];

    for (var k = months - 1; k >= 0; k--) {
      var d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - k, 1));
      var y = d.getUTCFullYear(), m = d.getUTCMonth();
      var idxFromStart = (months - 1) - k;           // 0 = oldest
      var isReporting = idxFromStart >= months / 2;  // second half

      var hdd = Math.round(norm.hdd * HDD_SHAPE[m]);
      var cdd = Math.round(norm.cdd * CDD_SHAPE[m]);

      var consumption = baseMonthly + hSlope * hdd + cSlope * cdd;
      if (isReporting) consumption *= (1 - effGain);

      // ±3% operational noise. Small on purpose: large noise would make the
      // regression fail its own acceptance criteria, which would be a
      // misleading demo of a module whose whole job is judging fit quality.
      consumption *= (0.97 + rnd() * 0.06);

      var flagged = false;
      if (idxFromStart === anomalyMonth) {
        consumption *= anomalyMult;
        flagged = true;
      }

      bills.push({
        period_start: iso(d),
        period_end: iso(monthEnd(y, m)),
        consumption: Math.round(consumption),
        consumption_unit: isGas ? 'therms' : 'kWh',
        hdd: hdd,
        cdd: cdd,
        // Provenance travels with every single reading.
        bill_source: 'synthetic',
        is_synthetic: true,
        _planted_excursion: flagged || undefined,
        _weather_station: norm.station || undefined,
      });
    }

    // Rescale so the 24 months total exactly 2x the stated annual usage. The
    // demo must not contradict the annual figure shown elsewhere on screen.
    var target = annual * (months / 12);
    var sum = bills.reduce(function (t, b) { return t + b.consumption; }, 0);
    if (sum > 0) {
      var f = target / sum;
      bills.forEach(function (b) { b.consumption = Math.round(b.consumption * f); });
    }

    return bills;
  }

  /** True if any reading in the set is fabricated. */
  function isSynthetic(bills) {
    if (!Array.isArray(bills)) return false;
    return bills.some(function (b) {
      return b && (b.is_synthetic === true || b.bill_source === 'synthetic');
    });
  }

  /**
   * Build a portfolio-wide history for a demo customer: every eligible
   * account, keyed by store_code, plus a flat merged series for
   * portfolio-level tiles.
   */
  function generatePortfolio(accounts, opts) {
    var o = opts || {};
    if (o.isDemo !== true) {
      if (window.console && console.warn) {
        console.warn('[demo_bills] refused: generatePortfolio requires opts.isDemo === true.');
      }
      return null;
    }
    if (!Array.isArray(accounts) || !accounts.length) return null;

    var byAccount = {};
    var merged = {};
    accounts.forEach(function (a) {
      var bills = generate(a, o);
      if (!bills) return;
      var key = a.store_code || a.id || ('acct' + Object.keys(byAccount).length);
      byAccount[key] = bills;
      bills.forEach(function (b) {
        var slot = merged[b.period_start];
        if (!slot) {
          slot = merged[b.period_start] = {
            period_start: b.period_start, period_end: b.period_end,
            consumption: 0, consumption_unit: b.consumption_unit,
            hdd: b.hdd, cdd: b.cdd,
            bill_source: 'synthetic', is_synthetic: true,
          };
        }
        slot.consumption += b.consumption;
      });
    });

    var keys = Object.keys(byAccount);
    if (!keys.length) return null;

    var series = Object.keys(merged).sort().map(function (k) { return merged[k]; });
    return { by_account: byAccount, portfolio: series, account_count: keys.length };
  }

  window.BeaconDemoBills = {
    generate: generate,
    generatePortfolio: generatePortfolio,
    isSynthetic: isSynthetic,
  };
})();
