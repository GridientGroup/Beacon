// Beacon · Weather Normalization Engine
// Build: 2026-05-14 · rev25 (initial ship)
// ════════════════════════════════════════════════════════════════════════════
// CBECS-SLOPE NORMALIZATION METHOD
//
// Each building type has a "typical" national EUI (CBECS_MEDIANS) and a
// CBECS-published split into heating / cooling / base energy use. From those,
// we derive per-degree-day consumption SLOPES:
//
//   heat_slope = (btype_median × heat_share_avg) / NATIONAL_HDD
//   cool_slope = (btype_median × cool_share_avg) / NATIONAL_CDD
//   base_eui   = btype_median × base_share_avg          (climate-independent)
//
// Slopes describe "how much energy a typical building of this type uses per
// HDD/CDD" — independent of where the building is located.
//
// For a location with degree-days (HDD_loc, CDD_loc), the EXPECTED EUI is:
//
//   typical_for_climate = base_eui + heat_slope × HDD_loc + cool_slope × CDD_loc
//
// A typical office is 53 EUI nationally; in Phoenix (low HDD, high CDD) the
// expected typical office EUI is ~73; in Minneapolis (high HDD, low CDD) it
// is ~57. These are the climate-adjusted peer benchmarks.
//
// To normalize a SPECIFIC building's actualEUI, we scale by how it compares
// to its climate-adjusted peer:
//
//   norm_eui = btype_median × (actualEUI / typical_for_climate)
//
// Phoenix office at 80 EUI → 80 / 73 = 1.10 × 53 = 58 normalized.
// Minneapolis office at 80 EUI → 80 / 57 = 1.40 × 53 = 74 normalized.
//
// This is the math ENERGY STAR Portfolio Manager uses (with property-type-
// specific regression coefficients instead of CBECS-derived slopes; the
// shape of the calculation is identical).
//
// CO₂ normalization piggy-backs on the EUI ratio, since climate-driven energy
// is climate-driven emissions:
//
//   norm_co2 = actual_co2 × (norm_eui / actual_eui)
//
// ════════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Building-type end-use shares (CBECS 2018 Table E1/E5/E6) ────────────
  // heat + cool + base = 1.0. Base = lighting, plug, equipment, water heat,
  // refrigeration, ventilation, computing, cooking, other. For property types
  // not in CBECS, values are estimated from comparable types (marked /* est */).

  var BTYPE_SHARES = {
    office:                 { heat: 0.22, cool: 0.21 },
    retail:                 { heat: 0.18, cool: 0.22 },
    hospitality:            { heat: 0.27, cool: 0.17 },
    healthcare:             { heat: 0.22, cool: 0.21 },
    multifamily:            { heat: 0.32, cool: 0.12 },
    industrial:             { heat: 0.30, cool: 0.10 /* est */ },
    hospital:               { heat: 0.24, cool: 0.20 },
    senior_care:            { heat: 0.32, cool: 0.16 },
    restaurant:             { heat: 0.10, cool: 0.15 },
    quick_service:          { heat: 0.09, cool: 0.16 },
    supermarket:            { heat: 0.11, cool: 0.21 },
    convenience_store:      { heat: 0.10, cool: 0.22 /* est */ },
    bank:                   { heat: 0.21, cool: 0.22 },
    data_center:            { heat: 0.04, cool: 0.42 },
    laboratory:             { heat: 0.26, cool: 0.26 },
    refrigerated_warehouse: { heat: 0.06, cool: 0.52 },
    warehouse:              { heat: 0.28, cool: 0.06 },
    self_storage:           { heat: 0.16, cool: 0.06 /* est */ },
    college:                { heat: 0.31, cool: 0.16 },
    k12:                    { heat: 0.36, cool: 0.11 },
  };

  // ── Lookup helpers ──────────────────────────────────────────────────────

  function _normCity(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\.,]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '');
  }

  function getStationForLocation(state, city) {
    if (!window.CLIMATE_STATIONS) return null;
    state = String(state || '').toUpperCase();
    if (!state) return null;

    var c = _normCity(city);
    if (c && window.CLIMATE_CITY_INDEX) {
      var key = state + '|' + c;
      var hit = window.CLIMATE_CITY_INDEX[key];
      if (hit && window.CLIMATE_STATIONS[hit]) {
        return Object.assign({ matchType: 'city' }, window.CLIMATE_STATIONS[hit]);
      }
    }
    var pid = window.CLIMATE_PRINCIPAL_BY_STATE && window.CLIMATE_PRINCIPAL_BY_STATE[state];
    if (pid && window.CLIMATE_STATIONS[pid]) {
      return Object.assign({ matchType: 'state' }, window.CLIMATE_STATIONS[pid]);
    }
    return null;
  }

  function getClimateContext(state, city) {
    var station = getStationForLocation(state, city);
    if (!station) return null;

    var nationalHDD = window.NATIONAL_HDD_65 || 4197;
    var nationalCDD = window.NATIONAL_CDD_65 || 1322;
    var hddRatio = station.hdd / nationalHDD;
    var cddRatio = station.cdd / nationalCDD;

    var heatVerdict = hddRatio < 0.5 ? 'much milder winters'
                    : hddRatio < 0.85 ? 'milder winters'
                    : hddRatio < 1.15 ? 'average winters'
                    : hddRatio < 1.5 ? 'colder winters'
                    : 'much colder winters';
    var coolVerdict = cddRatio < 0.4 ? 'much cooler summers'
                    : cddRatio < 0.8 ? 'cooler summers'
                    : cddRatio < 1.2 ? 'average summers'
                    : cddRatio < 2.0 ? 'hotter summers'
                    : 'much hotter summers';

    return {
      station: station,
      hdd: station.hdd,
      cdd: station.cdd,
      hddVsNational: hddRatio,
      cddVsNational: cddRatio,
      zone: station.zone,
      zoneLabel: (window.ASHRAE_ZONE_LABELS && window.ASHRAE_ZONE_LABELS[station.zone]) || station.zone,
      heatVerdict: heatVerdict,
      coolVerdict: coolVerdict,
      summary: heatVerdict + ' · ' + coolVerdict,
      matchType: station.matchType,
    };
  }

  // ── CBECS-slope computation ─────────────────────────────────────────────

  var _slopeCache = {};

  function _getSlopes(btype) {
    if (_slopeCache[btype]) return _slopeCache[btype];

    var shares = BTYPE_SHARES[btype] || BTYPE_SHARES.office;
    var btypeMedian = (window.CBECS_MEDIANS && window.CBECS_MEDIANS[btype]) || 53;
    var nationalHDD = window.NATIONAL_HDD_65 || 4197;
    var nationalCDD = window.NATIONAL_CDD_65 || 1322;

    var heatEUI = btypeMedian * shares.heat;
    var coolEUI = btypeMedian * shares.cool;
    var baseEUI = btypeMedian * (1 - shares.heat - shares.cool);

    var slopes = {
      heatSlope: heatEUI / nationalHDD,
      coolSlope: coolEUI / nationalCDD,
      baseEUI:   baseEUI,
      btypeMedian: btypeMedian,
      shares: shares,
    };
    _slopeCache[btype] = slopes;
    return slopes;
  }

  function typicalEUIForClimate(btype, station) {
    if (!station) return null;
    var sl = _getSlopes(btype);
    return sl.baseEUI + sl.heatSlope * station.hdd + sl.coolSlope * station.cdd;
  }

  // ── Core normalization ──────────────────────────────────────────────────

  function weatherNormalizeEUI(actualEUI, btype, station) {
    if (!actualEUI || actualEUI <= 0 || !station) return null;
    var sl = _getSlopes(btype);
    var typicalForLoc = sl.baseEUI + sl.heatSlope * station.hdd + sl.coolSlope * station.cdd;
    if (typicalForLoc <= 0) return null;

    var perfRatio = actualEUI / typicalForLoc;
    var normEUI = sl.btypeMedian * perfRatio;

    return {
      actualEUI: actualEUI,
      normalizedEUI: normEUI,
      typicalForLocation: typicalForLoc,
      btypeMedian: sl.btypeMedian,
      performanceRatio: perfRatio,
      deltaEUI: normEUI - actualEUI,
      deltaPct: ((normEUI - actualEUI) / actualEUI) * 100,
      heatSlope: sl.heatSlope,
      coolSlope: sl.coolSlope,
      baseEUI: sl.baseEUI,
    };
  }

  function weatherNormalizeCO2(actualCO2, eui_result) {
    if (!actualCO2 || actualCO2 <= 0 || !eui_result || !eui_result.actualEUI) return null;
    var ratio = eui_result.normalizedEUI / eui_result.actualEUI;
    return {
      actualCO2: actualCO2,
      normalizedCO2: actualCO2 * ratio,
      deltaCO2: actualCO2 * (ratio - 1),
      deltaPct: (ratio - 1) * 100,
    };
  }

  // ── Convenience wrapper ─────────────────────────────────────────────────

  function augmentBenchmarks(d, state, city) {
    if (!d) return d;
    var ctx = getClimateContext(state || d.state, city);
    if (!ctx) {
      d.weatherNorm = { available: false, reason: 'no station match' };
      return d;
    }

    var eR = weatherNormalizeEUI(d.actualEUI, d.btype, ctx.station);
    var carbonNum = parseFloat(d.co2PerSqft);
    var cR = isFinite(carbonNum) ? weatherNormalizeCO2(carbonNum, eR) : null;

    var rawMedian = eR ? eR.btypeMedian : d.medianEUI;
    var normVerdict, normColor;
    if (eR) {
      if (eR.normalizedEUI < rawMedian * 0.85) { normVerdict = 'Better than national'; normColor = '#22c55e'; }
      else if (eR.normalizedEUI < rawMedian * 1.15) { normVerdict = 'At national median'; normColor = '#f59e0b'; }
      else { normVerdict = 'Above national median'; normColor = '#ef4444'; }
    }

    d.weatherNorm = {
      available: true,
      context: ctx,
      eui: eR,
      co2: cR,
      normalizedEUI:    eR ? Math.round(eR.normalizedEUI) : null,
      typicalForLocation: eR ? Math.round(eR.typicalForLocation) : null,
      performanceRatio: eR ? eR.performanceRatio : null,
      normalizedCO2:    cR ? +cR.normalizedCO2.toFixed(1) : null,
      euiDeltaPct:      eR ? Math.round(eR.deltaPct) : null,
      co2DeltaPct:      cR ? Math.round(cR.deltaPct) : null,
      normalizedMedian: rawMedian,
      normalizedVerdict: normVerdict,
      normalizedColor: normColor,
    };
    return d;
  }

  // ── Public API ──────────────────────────────────────────────────────────
  window.WeatherNorm = {
    version: '2026-05-14-rev25',
    getStationForLocation: getStationForLocation,
    getClimateContext: getClimateContext,
    typicalEUIForClimate: typicalEUIForClimate,
    weatherNormalizeEUI: weatherNormalizeEUI,
    weatherNormalizeCO2: weatherNormalizeCO2,
    augmentBenchmarks: augmentBenchmarks,
    BTYPE_SHARES: BTYPE_SHARES,
  };
})();
