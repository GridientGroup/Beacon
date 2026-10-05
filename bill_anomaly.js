/* ============================================================================
 * bill_anomaly.js
 *
 * Detects unusual utility bills and generates plain-English explanations.
 *
 * Works from monthly bill history (Tier 2). No AI/LLM dependency — uses
 * statistical anomaly detection with hand-crafted explanation templates that
 * read naturally.
 *
 * DETECTION APPROACH:
 *   - Weather-normalize each bill (if 12+ months of history available)
 *   - Compute z-score of normalized consumption vs. rolling mean/stddev
 *   - Flag bills with |z| > 1.5 (~13% of bills — enough to be useful,
 *     not so many that clients tune us out)
 *
 * EXPLANATION APPROACH:
 *   - Attribute delta to weather (via HDD/CDD change) vs. non-weather
 *   - If non-weather delta is significant, walk through likely causes
 *     ordered by probability given the client's characteristics
 *
 * ========================================================================= */

(function () {
  'use strict';

  /**
   * Compute z-score of a value against a distribution.
   */
  function zScore(value, values) {
    if (!values || values.length < 3) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
    const stddev = Math.sqrt(variance);
    if (stddev < 0.001) return 0;
    return (value - mean) / stddev;
  }

  /**
   * Format a percent delta for narrative.
   */
  function fmtPctDelta(pct) {
    if (pct == null) return '—';
    const sign = pct >= 0 ? '+' : '';
    return sign + Math.round(pct) + '%';
  }

  // ── EXCEPTION-REPORT GATES ────────────────────────────────────────────────
  // Two gates, and a flag must clear BOTH. This is deliberate.
  //
  // Z_THRESHOLD is statistical: how unusual is this period. It was 1.5, which
  // on a roughly normal residual distribution flags about 13% of all periods
  // by chance alone — more than one month a year, every year, on a building
  // where nothing happened. 2.0 is ~4.6%, which is a defensible rate for a
  // report a human is expected to act on.
  //
  // MATERIALITY_PCT is operational: is it big enough to care about. A z-score
  // is scale-free, so when a building's residuals are tight, a 3%-off month
  // scores z=2.2 and gets reported. Statistically true, operationally
  // worthless — nobody opens a work order over a 3% bill variance. Requiring
  // the deviation to also exceed 10% of predicted consumption removes that
  // class of finding entirely.
  //
  // Neither number comes from a standard; IPMVP and ASHRAE G14 cover
  // savings determination, not exception-report tuning. 10% is the common
  // utility bill-audit convention. Both are overridable per call so a
  // customer who wants a tighter or looser screen can have one, and both
  // travel on every result so a report can state the screen it applied.
  var Z_THRESHOLD = 2.0;
  var MATERIALITY_PCT = 0.10;

  /**
   * Detect anomalies across a series of bills.
   *
   * @param {Array<object>} bills - [{period_start, period_end, consumption, cost, hdd, cdd}]
   * @param {object} weatherNormModel - optional, from weather_normalization.js
   * @param {object} [opts] - { zThreshold, materialityPct }
   * @returns {Array<object>} - one anomaly record per flagged bill
   */
  function detectAnomalies(bills, weatherNormModel, opts) {
    if (!bills || bills.length < 6) return [];

    const o = opts || {};
    const zGate = o.zThreshold != null ? Number(o.zThreshold) : Z_THRESHOLD;
    const matGate = o.materialityPct != null ? Number(o.materialityPct) : MATERIALITY_PCT;

    // If we have a weather normalization model, use weather-normalized
    // consumption for anomaly detection. Otherwise use raw consumption.
    const normalized = bills.map(function (b) {
      if (weatherNormModel && weatherNormModel.valid && b.hdd != null && b.cdd != null) {
        const predicted = window.BeaconWeatherNorm.predict(weatherNormModel, b.hdd, b.cdd);
        return { bill: b, predicted: predicted, actual: b.consumption };
      }
      return { bill: b, predicted: null, actual: b.consumption };
    });

    // ── WHAT GETS SCORED, AND WHY IT CHANGED 2026-09-17 ────────────────────
    // This loop used to z-score RAW consumption against a rolling window of
    // raw consumption, ignoring the weather-normalized prediction it had just
    // computed on the line above. That makes the detector measure the wrong
    // thing: in any building with a heating or cooling load, January is
    // legitimately far from the annual mean, so seasonality itself reads as
    // anomalous. Measured on four demo accounts with one excursion planted in
    // each, the old form returned 2–5 false positives per account and missed
    // the planted excursion in 3 of 4 — it flagged the winter peaks instead.
    //
    // A degree-day model is exactly the tool for this. When one is available
    // we score the RESIDUAL (actual − weather-predicted), which is what is
    // left after weather is accounted for: equipment faults, schedule
    // changes, occupancy shifts, billing errors. Seasonality is already in
    // the prediction, so it no longer trips the detector.
    //
    // With no valid model we fall back to raw consumption, which is weak for
    // the reason above. That path is flagged on every result via `basis` so a
    // report can say how the judgement was reached rather than implying a
    // weather-adjusted finding it did not make.
    const useResidual = !!(weatherNormModel && weatherNormModel.valid);
    const basis = useResidual ? 'weather_normalized_residual' : 'raw_consumption';
    const score = function (n) {
      return useResidual && n.predicted != null ? (n.actual - n.predicted) : n.actual;
    };

    // Rolling window: up to the 12 periods prior are the reference.
    const anomalies = [];
    for (let i = 6; i < normalized.length; i++) {
      const referenceWindow = normalized.slice(Math.max(0, i - 12), i).map(score);
      const z = zScore(score(normalized[i]), referenceWindow);

      // Materiality. Measured against the weather-adjusted prediction when we
      // have one, and against the reference mean when we do not, so the gate
      // means the same thing on both paths.
      const pred = normalized[i].predicted;
      const refMeanRaw = normalized.slice(Math.max(0, i - 12), i)
        .reduce(function (t, n) { return t + n.actual; }, 0) /
        Math.max(1, Math.min(12, i));
      const compareTo = (useResidual && pred > 0) ? pred : refMeanRaw;
      const deviation = compareTo > 0
        ? Math.abs(bills[i].consumption - compareTo) / compareTo
        : 0;

      if (Math.abs(z) > zGate && deviation >= matGate) {
        const refMean = referenceWindow.reduce((a, b) => a + b, 0) / referenceWindow.length;
        anomalies.push({
          period_start: bills[i].period_start,
          period_end: bills[i].period_end,
          consumption: bills[i].consumption,
          cost: bills[i].cost,
          predicted_consumption: normalized[i].predicted,
          // How far this period sits from what weather alone predicts. This is
          // the number a client narrative should quote, not the raw z.
          excess_consumption: normalized[i].predicted != null
            ? bills[i].consumption - normalized[i].predicted
            : null,
          excess_pct: normalized[i].predicted > 0
            ? ((bills[i].consumption - normalized[i].predicted) / normalized[i].predicted) * 100
            : null,
          z_score: z,
          basis: basis,
          deviation_pct: deviation * 100,
          // The screen that produced this finding, so a report can state it.
          screen: { z_threshold: zGate, materiality_pct: matGate * 100 },
          reference_mean: refMean,
          reference_n: referenceWindow.length,
          direction: z > 0 ? 'high' : 'low',
          severity: Math.abs(z) > 2.5 ? 'severe' : Math.abs(z) > 2 ? 'high' : 'moderate',
          bill: bills[i],
        });
      }
    }

    return anomalies;
  }

  /**
   * Generate a plain-English explanation of an anomaly.
   */
  function explainAnomaly(anomaly, priorBill, buildingContext) {
    if (!anomaly) return null;

    const parts = [];
    const b = anomaly.bill;
    const consumptionDelta = b.consumption - anomaly.reference_mean;
    const pctDelta = (consumptionDelta / anomaly.reference_mean) * 100;

    // Opening line
    if (anomaly.severity === 'severe') {
      parts.push('This bill is significantly different from your typical pattern.');
    } else if (anomaly.severity === 'high') {
      parts.push('This bill is notably different from your recent history.');
    } else {
      parts.push('This bill is somewhat unusual compared to your recent pattern.');
    }

    parts.push(
      'Consumption of ' + Math.round(b.consumption).toLocaleString() +
      ' units is ' + fmtPctDelta(pctDelta) + ' vs. your recent average of ' +
      Math.round(anomaly.reference_mean).toLocaleString() + ' units.'
    );

    // Weather attribution if we have HDD/CDD
    let weatherExplained = false;
    if (priorBill && b.hdd != null && b.cdd != null && priorBill.hdd != null && priorBill.cdd != null) {
      const hddDelta = b.hdd - priorBill.hdd;
      const cddDelta = b.cdd - priorBill.cdd;

      if (anomaly.direction === 'high') {
        if (hddDelta > 100 && cddDelta > 100) {
          parts.push('Heating degree days were up ' + Math.round(hddDelta) + ' and cooling degree days were up ' + Math.round(cddDelta) + ' vs. the prior period, suggesting a large portion of the increase is weather-driven.');
          weatherExplained = true;
        } else if (hddDelta > 100) {
          parts.push('Heating degree days were up ' + Math.round(hddDelta) + ' vs. the prior period. If this is a heating-heavy building, that likely explains a substantial portion of the increase.');
          weatherExplained = true;
        } else if (cddDelta > 100) {
          parts.push('Cooling degree days were up ' + Math.round(cddDelta) + ' vs. the prior period. If this is a cooling-heavy building, that likely explains a substantial portion of the increase.');
          weatherExplained = true;
        }
      } else if (anomaly.direction === 'low') {
        if (hddDelta < -100 || cddDelta < -100) {
          parts.push('Weather was noticeably milder than the prior period, which likely accounts for some of the decrease.');
          weatherExplained = true;
        }
      }
    }

    // Non-weather causes
    if (!weatherExplained || Math.abs(anomaly.z_score) > 2) {
      if (anomaly.direction === 'high') {
        const causes = [];
        causes.push('a rate change or new pass-through charge on the bill');
        causes.push('an HVAC control issue causing equipment to run when it shouldn\'t');
        if (buildingContext && buildingContext.property_type === 'Office') {
          causes.push('an occupancy change (new tenants, extended hours)');
        }
        if (buildingContext && buildingContext.property_type === 'Retail Store') {
          causes.push('a refrigeration or cooling system fault');
        }
        causes.push('a meter reading error (worth verifying the meter number and read date on the bill)');

        parts.push('Non-weather causes worth investigating: ' + causes.join('; ') + '.');
      } else if (anomaly.direction === 'low') {
        parts.push('Non-weather causes worth investigating: reduced occupancy or operating hours; an equipment shutdown; a billing period that was shorter than usual; or a meter reading issue.');
      }
    }

    return {
      title: anomaly.severity === 'severe' ? 'Bill anomaly — investigate' : 'Bill unusual — review',
      severity: anomaly.severity,
      direction: anomaly.direction,
      z_score: anomaly.z_score,
      pct_delta: pctDelta,
      narrative: parts.join(' '),
      period_start: anomaly.period_start,
      period_end: anomaly.period_end,
    };
  }

  /**
   * Full pipeline: run detection and generate explanations for a portfolio account.
   */
  function analyzeAccount(bills, buildingContext) {
    if (!bills || bills.length < 6) {
      return { has_history: false, anomalies: [] };
    }

    // Try to fit a weather-norm model
    let model = null;
    if (window.BeaconWeatherNorm) {
      model = window.BeaconWeatherNorm.fitModel(bills);
    }

    const anomalies = detectAnomalies(bills, model);

    const explained = anomalies.map(function (a, idx) {
      const priorIdx = bills.findIndex(function (b) { return b.period_start === a.period_start; }) - 1;
      const priorBill = priorIdx >= 0 ? bills[priorIdx] : null;
      return explainAnomaly(a, priorBill, buildingContext);
    });

    return {
      has_history: true,
      bills_analyzed: bills.length,
      weather_model_valid: !!(model && model.valid),
      weather_model_r2: model ? model.r2 : null,
      anomaly_count: anomalies.length,
      anomalies: explained,
    };
  }

  window.BeaconBillAnomaly = {
    zScore: zScore,
    detectAnomalies: detectAnomalies,
    explainAnomaly: explainAnomaly,
    analyzeAccount: analyzeAccount,
  };
})();
