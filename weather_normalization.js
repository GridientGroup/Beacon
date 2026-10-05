/* ============================================================================
 * weather_normalization.js
 *
 * Weather-normalizes utility bill data using ASHRAE Guideline 14 methodology.
 *
 * Approach: variable-base degree day regression.
 *   consumption = baseload + heating_slope * HDD(base) + cooling_slope * CDD(base)
 *
 * Requires at least 12 months of historical bill data with matching HDD/CDD
 * from a nearby weather station. Recommended: 24 months to enable
 * baseline-period vs reporting-period comparison.
 *
 * OUTPUT: for any given period, we can express the actual consumption in
 * "weather-normalized" terms — what it would have been if weather had matched
 * a long-term average (TMY3 climate normals).
 *
 * This is the foundation of legitimate M&V. Without weather normalization,
 * a client who did nothing efficiency-wise but had a mild year looks like
 * a hero, and a client who did a good retrofit but had an extreme year
 * looks like they wasted money.
 *
 * ── STATISTICAL ACCEPTANCE CRITERIA (corrected 2026-09-16) ────────────────
 *
 * This block previously claimed "ASHRAE Guideline 14: R² > 0.75, CV(RMSE)
 * < 20%", computed CV(RMSE) with the wrong denominator, and did not compute
 * NMBE at all. All three are fixed. What is used now, and where each actually
 * comes from:
 *
 *   CV(RMSE) ≤ 15%   ASHRAE Guideline 14 monthly calibration criterion.
 *   |NMBE|   ≤  5%   ASHRAE Guideline 14 monthly calibration criterion.
 *   R²       ≥ 0.75  NOT from Guideline 14. This threshold comes from the
 *                    Bonneville Power Administration "Regression for M&V
 *                    Reference Guide" §5.1.1. It was previously mis-attributed
 *                    to ASHRAE here.
 *
 * [UNVERIFIED] The G14 clause numbers usually cited for the two criteria above
 * (5.3.2.4.f and 5.3.2.1.b) could not be checked — the standard is paywalled.
 * The VALUES are corroborated by multiple independent sources; the clause
 * references are not. Do not print a clause number in client-facing output.
 *
 * NOTE ON PROVENANCE: the 15% / 5% pair are Guideline 14's criteria for
 * CALIBRATED SIMULATION. Applying them to a degree-day regression is a common
 * industry extension, not a literal reading of the standard. Stated here so
 * nobody later mistakes it for a direct citation.
 *
 * ── TWO MATH CORRECTIONS ──────────────────────────────────────────────────
 *
 * 1. CV(RMSE) now divides by (n − p), not n. With 12 bills and 3 parameters
 *    the old form understated the error by about 15%.
 * 2. Leave-one-out CV(RMSE) is now reported alongside the in-sample figure.
 *    This matters: in-sample NMBE is ~0 BY CONSTRUCTION for any OLS fit with
 *    an intercept, so on the baseline period it validates nothing and would
 *    pass every time. It is retained because it is a required reporting
 *    statistic and becomes meaningful in the REPORTING period. The honest
 *    out-of-sample number is loo_cv_rmse.
 *
 * BEHAVIOUR CHANGE: the threshold drop (20% → 15%) and the (n − p) correction
 * compound. Any 12-month fit whose corrected CV(RMSE) lands between 15% and
 * roughly 17.3% flips from PASS to FAIL. Anything previously reported as
 * meeting Guideline 14 must be re-run before it is quoted again.
 *
 *   - Base temperature typically 55-65°F for both HDD and CDD, but let the
 *     regression choose the best base rather than fixing it
 *
 * ========================================================================= */

(function () {
  'use strict';

  /**
   * Calculate HDD or CDD given daily temps and a base.
   * @param {Array<number>} dailyTemps - daily average temps (°F)
   * @param {number} base - base temperature (°F)
   * @param {string} mode - 'heating' or 'cooling'
   */
  function degreeDays(dailyTemps, base, mode) {
    let sum = 0;
    for (let i = 0; i < dailyTemps.length; i++) {
      const diff = mode === 'heating' ? (base - dailyTemps[i]) : (dailyTemps[i] - base);
      if (diff > 0) sum += diff;
    }
    return sum;
  }

  /**
   * Simple linear regression (least squares).
   * y = a + b1*x1 + b2*x2
   * Returns {intercept, slope1, slope2, r2, rmse}
   */
  function multiRegression(xs1, xs2, ys) {
    const n = ys.length;
    if (n < 4) return null; // need at least a few data points

    // Compute means
    const meanX1 = xs1.reduce((a, b) => a + b, 0) / n;
    const meanX2 = xs2.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;

    // Compute sums for normal equations
    let s11 = 0, s22 = 0, s12 = 0, s1y = 0, s2y = 0;
    for (let i = 0; i < n; i++) {
      const dx1 = xs1[i] - meanX1;
      const dx2 = xs2[i] - meanX2;
      const dy = ys[i] - meanY;
      s11 += dx1 * dx1;
      s22 += dx2 * dx2;
      s12 += dx1 * dx2;
      s1y += dx1 * dy;
      s2y += dx2 * dy;
    }

    const det = s11 * s22 - s12 * s12;
    if (Math.abs(det) < 1e-9) return null; // singular

    const b1 = (s22 * s1y - s12 * s2y) / det;
    const b2 = (s11 * s2y - s12 * s1y) / det;
    const a = meanY - b1 * meanX1 - b2 * meanX2;

    // Compute R²
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      const pred = a + b1 * xs1[i] + b2 * xs2[i];
      const resid = ys[i] - pred;
      ssRes += resid * resid;
      ssTot += (ys[i] - meanY) * (ys[i] - meanY);
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    // p = 3 estimated parameters: intercept + heating slope + cooling slope.
    const P_PARAMS = 3;
    const dof = n - P_PARAMS;
    if (dof <= 0) return null;   // cannot estimate error with no spare degrees of freedom

    // CV(RMSE) on (n − p). Dividing by n understates the error — on 12 bills
    // with 3 parameters, by about 15%.
    const rmse = Math.sqrt(ssRes / dof);
    const cvRmse = meanY > 0 ? rmse / meanY : 999;

    // NMBE, same (n − p) convention. On the fitting period this is ~0 by
    // construction; see the header note. Reported, not relied on.
    let sumResid = 0;
    for (let i = 0; i < n; i++) {
      sumResid += ys[i] - (a + b1 * xs1[i] + b2 * xs2[i]);
    }
    const nmbe = meanY > 0 ? sumResid / (dof * meanY) : 999;

    // Leave-one-out CV(RMSE) via the hat-matrix diagonal. For a centred
    // two-predictor OLS fit the leverage has a closed form, so this costs one
    // extra pass rather than n refits:
    //   h_ii = 1/n + (s22·dx1² − 2·s12·dx1·dx2 + s11·dx2²) / det
    // and the leave-one-out residual is simply resid_i / (1 − h_ii).
    let looSse = 0;
    let looUsable = true;
    for (let i = 0; i < n; i++) {
      const dx1 = xs1[i] - meanX1;
      const dx2 = xs2[i] - meanX2;
      const hii = 1 / n + (s22 * dx1 * dx1 - 2 * s12 * dx1 * dx2 + s11 * dx2 * dx2) / det;
      const denom = 1 - hii;
      if (!(denom > 1e-6)) { looUsable = false; break; }  // point fully determines the fit
      const resid = ys[i] - (a + b1 * xs1[i] + b2 * xs2[i]);
      const looResid = resid / denom;
      looSse += looResid * looResid;
    }
    const looCvRmse = (looUsable && meanY > 0) ? Math.sqrt(looSse / n) / meanY : null;

    return {
      intercept: a, slope1: b1, slope2: b2,
      r2: r2, rmse: rmse, cv_rmse: cvRmse, nmbe: nmbe,
      loo_cv_rmse: looCvRmse, n: n, p: P_PARAMS, dof: dof,
    };
  }

  /**
   * Infer how many billing periods make up a year, from the bill dates.
   * Falls back to 12 (monthly) when the dates are missing or unusable, which
   * is the overwhelmingly common case for the utility data Beacon ingests.
   */
  function inferPeriodsPerYear(bills) {
    var lengths = [];
    (bills || []).forEach(function (b) {
      if (!b || !b.period_start || !b.period_end) return;
      var s = new Date(b.period_start), e = new Date(b.period_end);
      if (isNaN(s) || isNaN(e)) return;
      var days = (e - s) / 86400000;
      if (days >= 20 && days <= 200) lengths.push(days);
    });
    if (!lengths.length) return 12;
    lengths.sort(function (a, b) { return a - b; });
    var mid = Math.floor(lengths.length / 2);
    var median = lengths.length % 2
      ? lengths[mid]
      : (lengths[mid - 1] + lengths[mid]) / 2;
    // Snap to the real-world billing cadences rather than reporting a
    // fractional period count, which would only add noise.
    var candidates = [12, 6, 4];
    var best = 12, bestErr = Infinity;
    candidates.forEach(function (c) {
      var err = Math.abs(median - (365.25 / c));
      if (err < bestErr) { bestErr = err; best = c; }
    });
    return best;
  }

  /**
   * Fit weather normalization model to monthly bill data.
   *
   * @param {Array<object>} bills - [{period_start, period_end, consumption, hdd, cdd}]
   *   consumption in kWh or therms, hdd/cdd for the same period
   * @returns {object} - model {baseload, heating_slope, cooling_slope, r2, cv_rmse, valid, bills_used}
   */
  function fitModel(bills) {
    if (!bills || bills.length < 6) {
      return { valid: false, reason: 'insufficient_data', bills_used: bills ? bills.length : 0 };
    }

    const xs1 = [], xs2 = [], ys = [];
    bills.forEach(b => {
      if (b.consumption > 0 && b.hdd != null && b.cdd != null) {
        xs1.push(b.hdd);
        xs2.push(b.cdd);
        ys.push(b.consumption);
      }
    });

    if (ys.length < 6) {
      return { valid: false, reason: 'insufficient_clean_data', bills_used: ys.length };
    }

    const reg = multiRegression(xs1, xs2, ys);
    if (!reg) {
      return { valid: false, reason: 'regression_failed', bills_used: ys.length };
    }

    // How many billing periods make up a year? The intercept is per-period,
    // so normalizedAnnual() needs this to annualize correctly. Inferred from
    // the bill dates rather than assumed, because some commercial accounts are
    // billed bimonthly or quarterly. Median period length is used so one
    // short or long stub period does not skew it.
    const periodsPerYear = inferPeriodsPerYear(bills);

    // Statistical acceptance. See the header block for where each threshold
    // actually comes from — they are not all from the same standard.
    const goodR2 = reg.r2 >= 0.75;                      // BPA M&V guide §5.1.1
    const goodCVRMSE = reg.cv_rmse <= 0.15;             // G14 monthly
    const goodNMBE = Math.abs(reg.nmbe) <= 0.05;        // G14 monthly

    return {
      valid: true,
      baseload: reg.intercept,
      heating_slope: reg.slope1,
      cooling_slope: reg.slope2,
      r2: reg.r2,
      cv_rmse: reg.cv_rmse,
      nmbe: reg.nmbe,
      loo_cv_rmse: reg.loo_cv_rmse,
      n: reg.n,
      dof: reg.dof,
      periods_per_year: periodsPerYear,

      // Compound criterion. Components are exposed so a report can say WHICH
      // test failed rather than only that the fit was rejected.
      meets_ashrae_14: goodR2 && goodCVRMSE && goodNMBE,
      criteria: {
        r2:       { value: reg.r2,       threshold: 0.75, pass: goodR2,
                    source: 'BPA Regression for M&V Reference Guide §5.1.1' },
        cv_rmse:  { value: reg.cv_rmse,  threshold: 0.15, pass: goodCVRMSE,
                    source: 'ASHRAE Guideline 14, monthly' },
        nmbe:     { value: reg.nmbe,     threshold: 0.05, pass: goodNMBE,
                    source: 'ASHRAE Guideline 14, monthly',
                    note: 'in-sample NMBE is ~0 by construction; see loo_cv_rmse' },
      },
      bills_used: ys.length,
    };
  }

  /**
   * Predict consumption given HDD and CDD using a fitted model.
   */
  function predict(model, hdd, cdd) {
    if (!model || !model.valid) return null;
    return model.baseload + model.heating_slope * hdd + model.cooling_slope * cdd;
  }

  /**
   * Compute weather-normalized ANNUAL consumption using climate-normal HDD/CDD.
   *
   * ── UNIT BUG, FOUND AND FIXED 2026-09-17 ─────────────────────────────────
   * This function used to be `return predict(model, normalHDD, normalCDD)`,
   * which is wrong, and wrong in a direction that manufactures savings.
   *
   * The model is fit on BILLING PERIODS. Its intercept is therefore the
   * baseload for ONE period (one month, typically), while normalHDD/normalCDD
   * are ANNUAL degree-day totals. The old form added one month of baseload to
   * a full year of weather-driven load, so it discarded 11/12 of the baseload
   * — the part of the load that does not change with weather.
   *
   * That does not merely scale the answer. Because baseline and reporting
   * regressions split load between intercept and slopes differently, dropping
   * most of the intercept corrupts the two figures unequally, and the
   * savings percentage computed from them is garbage. Measured on a demo
   * account with a known 8% efficiency gain planted in it:
   *
   *   old form:  baseline 791,271  reporting 436,452  →  "44.8% savings"
   *   corrected: baseline 1,512,178 reporting 1,388,519 →  "8.2% savings"
   *   actual 12-month bill sums:    1,511,743 and 1,388,258
   *
   * The corrected form lands within 0.03% of the real metered totals and
   * recovers the planted gain. The old form would have put a fabricated 45%
   * savings claim in front of a client.
   *
   * periods_per_year is inferred from the bill dates in fitModel, so a
   * bimonthly or quarterly billing cycle annualizes correctly too.
   *
   * @param {object} model
   * @param {number} normalHDD - long-term average ANNUAL HDD for the location
   * @param {number} normalCDD - long-term average ANNUAL CDD for the location
   * @returns {number|null} - normalized annual consumption
   */
  function normalizedAnnual(model, normalHDD, normalCDD) {
    if (!model || !model.valid) return null;
    var periods = Number(model.periods_per_year) || 12;
    return (model.baseload * periods)
         + (model.heating_slope * normalHDD)
         + (model.cooling_slope * normalCDD);
  }

  /**
   * Compare baseline period to reporting period.
   * Both are weather-normalized using the same climate normals.
   * @returns {object} - {baseline_normalized, reporting_normalized, savings_pct, savings_absolute}
   */
  function compareBaselineToReporting(baselineModel, reportingModel, normalHDD, normalCDD) {
    const b = normalizedAnnual(baselineModel, normalHDD, normalCDD);
    const r = normalizedAnnual(reportingModel, normalHDD, normalCDD);
    if (b == null || r == null) return null;
    const savingsAbsolute = b - r;
    const savingsPct = b > 0 ? (savingsAbsolute / b) * 100 : 0;
    return {
      baseline_normalized: b,
      reporting_normalized: r,
      savings_absolute: savingsAbsolute,
      savings_pct: savingsPct,
      baseline_confidence: baselineModel.meets_ashrae_14 ? 'high' : 'medium',
      reporting_confidence: reportingModel.meets_ashrae_14 ? 'high' : 'medium',
    };
  }

  /**
   * Given consumption and typical HDD/CDD, generate a short narrative
   * describing what portion of the change is weather vs. operations.
   */
  function narrativeExplanation(model, thisPeriodConsumption, thisPeriodHDD, thisPeriodCDD, priorPeriodConsumption, priorPeriodHDD, priorPeriodCDD) {
    if (!model || !model.valid) return null;

    const thisPredicted = predict(model, thisPeriodHDD, thisPeriodCDD);
    const priorPredicted = predict(model, priorPeriodHDD, priorPeriodCDD);

    const actualDelta = thisPeriodConsumption - priorPeriodConsumption;
    const weatherDelta = thisPredicted - priorPredicted;
    const operationsDelta = actualDelta - weatherDelta;

    const actualPct = priorPeriodConsumption > 0 ? (actualDelta / priorPeriodConsumption) * 100 : 0;
    const weatherPct = priorPeriodConsumption > 0 ? (weatherDelta / priorPeriodConsumption) * 100 : 0;
    const operationsPct = priorPeriodConsumption > 0 ? (operationsDelta / priorPeriodConsumption) * 100 : 0;

    return {
      actual_delta: actualDelta,
      actual_pct: actualPct,
      weather_attributable: weatherDelta,
      weather_attributable_pct: weatherPct,
      operations_attributable: operationsDelta,
      operations_attributable_pct: operationsPct,
    };
  }

  window.BeaconWeatherNorm = {
    degreeDays: degreeDays,
    fitModel: fitModel,
    predict: predict,
    normalizedAnnual: normalizedAnnual,
    compareBaselineToReporting: compareBaselineToReporting,
    narrativeExplanation: narrativeExplanation,
  };
})();
