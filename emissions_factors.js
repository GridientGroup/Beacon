/* ============================================================================
 * emissions_factors.js
 *
 * EPA eGRID emission factors for Scope 2 emissions reporting.
 *
 * Source: EPA eGRID 2023 data (published 2025)
 *   https://www.epa.gov/egrid
 *
 * Values are output emission rates for CO2, CH4, N2O and CO2-equivalent
 * (CO2e using AR5 100-year GWPs) in lb per MWh of generation, by eGRID
 * subregion. eGRID subregions align to NERC assessment areas but are
 * finer-grained (26 US subregions).
 *
 * Beacon Pro uses these to compute Scope 2 emissions for every client
 * account, per the GHG Protocol Scope 2 Guidance.
 *
 * COMPUTATION:
 *   annual_kwh × eGRID CO2e factor (lb/MWh) / 1000 (MWh/kWh) × 0.000453592 (metric tons/lb)
 *     = metric tons CO2e per year
 *
 * For natural gas (Scope 1 on-site combustion, but we compute it here for
 * portfolio-wide carbon reporting):
 *   annual_therms × 5.311 kg CO2e/therm / 1000 = metric tons CO2e/year
 *   (Per EPA Emission Factors Hub, 2024)
 *
 * ========================================================================= */

(function () {
  'use strict';

  // ── State to eGRID subregion mapping ──────────────────────────────────
  // For states split across multiple subregions, the largest by population
  // is used. See EPA eGRID docs for full state-to-subregion detail.
  const STATE_TO_EGRID = {
    'AL': 'SRSO', 'AK': 'AKGD', 'AZ': 'AZNM', 'AR': 'SRMV', 'CA': 'CAMX',
    'CO': 'RMPA', 'CT': 'NEWE', 'DE': 'RFCE', 'DC': 'RFCE', 'FL': 'FRCC',
    'GA': 'SRSO', 'HI': 'HIOA', 'ID': 'NWPP', 'IL': 'SRMW', 'IN': 'RFCW',
    'IA': 'MROW', 'KS': 'SPNO', 'KY': 'SRTV', 'LA': 'SRMV', 'ME': 'NEWE',
    'MD': 'RFCE', 'MA': 'NEWE', 'MI': 'RFCM', 'MN': 'MROW', 'MS': 'SRMV',
    'MO': 'SRMW', 'MT': 'NWPP', 'NE': 'MROW', 'NV': 'NWPP', 'NH': 'NEWE',
    'NJ': 'RFCE', 'NM': 'AZNM', 'NY': 'NYUP', 'NC': 'SRVC', 'ND': 'MROW',
    'OH': 'RFCW', 'OK': 'SPSO', 'OR': 'NWPP', 'PA': 'RFCE', 'RI': 'NEWE',
    'SC': 'SRVC', 'SD': 'MROW', 'TN': 'SRTV', 'TX': 'ERCT', 'UT': 'NWPP',
    'VT': 'NEWE', 'VA': 'SRVC', 'WA': 'NWPP', 'WV': 'RFCW', 'WI': 'MROE',
    'WY': 'RMPA', 'PR': 'PRMS',
  };

  // ── eGRID emission factors by subregion ───────────────────────────────
  // SOURCE: EPA eGRID2023, Summary Tables Rev 2 (released 2025-06-12),
  //   Table 1 "Subregion Output Emission Rates".
  //   https://www.epa.gov/system/files/documents/2025-06/summary_tables_rev2.xlsx
  //
  // These are TOTAL OUTPUT rates, in lb/MWh, with AR5 100-year GWPs
  // (CH4 = 28, N2O = 265). Total output is the series the GHG Protocol
  // requires for LOCATION-BASED Scope 2 accounting, and EPA's own eGRID
  // Technical Guide states that non-baseload rates "should not be used
  // for ... carbon-footprinting."
  //
  // HISTORY — why this block was rewritten on 2026-09-16:
  //   The previous table was NOT EPA data. It was internally inconsistent in
  //   a way real eGRID data cannot be: AKGD and SRSO both carried 998.5, and
  //   MROE and SRMW both carried 1385.5. Real eGRID subregions have no
  //   duplicate rates. The header also claimed "non-baseload emission rate
  //   shown", which is the wrong series for Scope 2 even had the numbers
  //   been genuine. Both problems are fixed here.
  //
  // VALIDATION performed before these values were committed:
  //   1. Cross-checked against a second independent publication of eGRID2023
  //      Rev 2 — 26 of 27 CO2e values identical, HIOA differing by 0.1 from
  //      rounding (EPA's 1498.9 kept).
  //   2. Every row reconstructs: co2 + ch4*28 + n2o*265 == co2e to within
  //      0.127 lb/MWh across all 27 subregions. AR4 GWPs fit measurably
  //      worse, confirming AR5.
  //   3. No duplicate CO2e values anywhere in the table.
  //
  // Update annually when EPA publishes the next eGRID edition.
  const EGRID_FACTORS = {
    'AKGD': { name: 'ASCC Alaska Grid',                 co2e_lb_per_mwh: 905.1  , co2_lb_per_mwh: 899.6  , ch4_lb_per_mwh: 0.086 , n2o_lb_per_mwh: 0.012 },
    'AKMS': { name: 'ASCC Miscellaneous',               co2e_lb_per_mwh: 522.4  , co2_lb_per_mwh: 520.5  , ch4_lb_per_mwh: 0.026 , n2o_lb_per_mwh: 0.004 },
    'AZNM': { name: 'WECC Southwest',                   co2e_lb_per_mwh: 706.2  , co2_lb_per_mwh: 703.7  , ch4_lb_per_mwh: 0.039 , n2o_lb_per_mwh: 0.005 },
    'CAMX': { name: 'WECC California',                  co2e_lb_per_mwh: 430.0  , co2_lb_per_mwh: 428.5  , ch4_lb_per_mwh: 0.025 , n2o_lb_per_mwh: 0.003 },
    'ERCT': { name: 'ERCOT All',                        co2e_lb_per_mwh: 736.6  , co2_lb_per_mwh: 733.9  , ch4_lb_per_mwh: 0.043 , n2o_lb_per_mwh: 0.006 },
    'FRCC': { name: 'FRCC All',                         co2e_lb_per_mwh: 784.8  , co2_lb_per_mwh: 782.3  , ch4_lb_per_mwh: 0.041 , n2o_lb_per_mwh: 0.005 },
    'HIOA': { name: 'HICC Oahu',                        co2e_lb_per_mwh: 1498.9 , co2_lb_per_mwh: 1489.5 , ch4_lb_per_mwh: 0.134 , n2o_lb_per_mwh: 0.021 },
    'HIMS': { name: 'HICC Miscellaneous',               co2e_lb_per_mwh: 1133.3 , co2_lb_per_mwh: 1123.4 , ch4_lb_per_mwh: 0.146 , n2o_lb_per_mwh: 0.022 },
    'MROE': { name: 'MRO East',                         co2e_lb_per_mwh: 1405.0 , co2_lb_per_mwh: 1397.3 , ch4_lb_per_mwh: 0.116 , n2o_lb_per_mwh: 0.017 },
    'MROW': { name: 'MRO West',                         co2e_lb_per_mwh: 926.6  , co2_lb_per_mwh: 920.1  , ch4_lb_per_mwh: 0.097 , n2o_lb_per_mwh: 0.014 },
    'NEWE': { name: 'NPCC New England',                 co2e_lb_per_mwh: 543.2  , co2_lb_per_mwh: 539.3  , ch4_lb_per_mwh: 0.063 , n2o_lb_per_mwh: 0.008 },
    'NWPP': { name: 'WECC Northwest',                   co2e_lb_per_mwh: 635.3  , co2_lb_per_mwh: 631.7  , ch4_lb_per_mwh: 0.054 , n2o_lb_per_mwh: 0.008 },
    'NYCW': { name: 'NPCC NYC/Westchester',             co2e_lb_per_mwh: 865.7  , co2_lb_per_mwh: 864.5  , ch4_lb_per_mwh: 0.022 , n2o_lb_per_mwh: 0.002 },
    'NYLI': { name: 'NPCC Long Island',                 co2e_lb_per_mwh: 1189.3 , co2_lb_per_mwh: 1180.7 , ch4_lb_per_mwh: 0.14  , n2o_lb_per_mwh: 0.018 },
    'NYUP': { name: 'NPCC Upstate NY',                  co2e_lb_per_mwh: 242.8  , co2_lb_per_mwh: 242.1  , ch4_lb_per_mwh: 0.011 , n2o_lb_per_mwh: 0.001 },
    'PRMS': { name: 'Puerto Rico Miscellaneous',        co2e_lb_per_mwh: 1548.5 , co2_lb_per_mwh: 1543.1 , ch4_lb_per_mwh: 0.077 , n2o_lb_per_mwh: 0.012 },
    'RFCE': { name: 'RFC East',                         co2e_lb_per_mwh: 599.2  , co2_lb_per_mwh: 596.9  , ch4_lb_per_mwh: 0.036 , n2o_lb_per_mwh: 0.005 },
    'RFCM': { name: 'RFC Michigan',                     co2e_lb_per_mwh: 976.0  , co2_lb_per_mwh: 970.6  , ch4_lb_per_mwh: 0.082 , n2o_lb_per_mwh: 0.012 },
    'RFCW': { name: 'RFC West',                         co2e_lb_per_mwh: 916.1  , co2_lb_per_mwh: 911.4  , ch4_lb_per_mwh: 0.071 , n2o_lb_per_mwh: 0.01 },
    'RMPA': { name: 'WECC Rockies',                     co2e_lb_per_mwh: 1042.5 , co2_lb_per_mwh: 1036.6 , ch4_lb_per_mwh: 0.09  , n2o_lb_per_mwh: 0.013 },
    'SPNO': { name: 'SPP North',                        co2e_lb_per_mwh: 867.7  , co2_lb_per_mwh: 862.0  , ch4_lb_per_mwh: 0.087 , n2o_lb_per_mwh: 0.012 },
    'SPSO': { name: 'SPP South',                        co2e_lb_per_mwh: 875.6  , co2_lb_per_mwh: 872.0  , ch4_lb_per_mwh: 0.054 , n2o_lb_per_mwh: 0.008 },
    'SRMV': { name: 'SERC Mississippi Valley',          co2e_lb_per_mwh: 741.7  , co2_lb_per_mwh: 739.7  , ch4_lb_per_mwh: 0.032 , n2o_lb_per_mwh: 0.004 },
    'SRMW': { name: 'SERC Midwest',                     co2e_lb_per_mwh: 1248.6 , co2_lb_per_mwh: 1239.8 , ch4_lb_per_mwh: 0.132 , n2o_lb_per_mwh: 0.019 },
    'SRSO': { name: 'SERC South',                       co2e_lb_per_mwh: 846.0  , co2_lb_per_mwh: 842.3  , ch4_lb_per_mwh: 0.056 , n2o_lb_per_mwh: 0.008 },
    'SRTV': { name: 'SERC Tennessee Valley',            co2e_lb_per_mwh: 903.3  , co2_lb_per_mwh: 898.1  , ch4_lb_per_mwh: 0.079 , n2o_lb_per_mwh: 0.011 },
    'SRVC': { name: 'SERC Virginia/Carolinas',          co2e_lb_per_mwh: 596.3  , co2_lb_per_mwh: 593.4  , ch4_lb_per_mwh: 0.045 , n2o_lb_per_mwh: 0.006 },
  };

  // ── Non-electric emission factors ──────────────────────────────────────
  const NON_ELECTRIC_FACTORS = {
    // Natural gas — EPA Emission Factors Hub 2024
    natural_gas_kg_co2e_per_therm: 5.311,
    natural_gas_kg_co2e_per_mmbtu: 53.11,
    // Fuel oil #2
    fuel_oil_kg_co2e_per_gallon: 10.21,
    // Propane
    propane_kg_co2e_per_gallon: 5.72,
  };

  // Conversion constants
  const LB_TO_METRIC_TON = 0.000453592;
  const KG_TO_METRIC_TON = 0.001;

  /**
   * Get eGRID subregion for a state.
   */
  function egridSubregionFor(stateCode) {
    if (!stateCode) return null;
    return STATE_TO_EGRID[String(stateCode).toUpperCase()] || null;
  }

  /**
   * Get emission factor for a state's grid.
   * @param {string} stateCode
   * @returns {object|null} - {subregion, name, co2e_lb_per_mwh, ...}
   */
  function factorFor(stateCode) {
    const subregion = egridSubregionFor(stateCode);
    if (!subregion) return null;
    const f = EGRID_FACTORS[subregion];
    if (!f) return null;
    return Object.assign({ subregion: subregion }, f);
  }

  /**
   * Compute Scope 2 emissions from electric consumption.
   * @param {number} annualKwh
   * @param {string} stateCode
   * @returns {object|null} - {metric_tons_co2e, subregion, name, factor_lb_per_mwh}
   */
  function scope2Emissions(annualKwh, stateCode) {
    const f = factorFor(stateCode);
    if (!f || !annualKwh || annualKwh <= 0) return null;
    const mwh = annualKwh / 1000;
    const lbCO2e = mwh * f.co2e_lb_per_mwh;
    const metricTonsCO2e = lbCO2e * LB_TO_METRIC_TON;
    return {
      metric_tons_co2e: metricTonsCO2e,
      subregion: f.subregion,
      subregion_name: f.name,
      factor_lb_per_mwh: f.co2e_lb_per_mwh,
      annual_kwh: annualKwh,
    };
  }

  /**
   * Compute Scope 1 emissions from natural gas consumption.
   * @param {number} annualTherms
   * @returns {object|null}
   */
  function scope1EmissionsGas(annualTherms) {
    if (!annualTherms || annualTherms <= 0) return null;
    const kgCO2e = annualTherms * NON_ELECTRIC_FACTORS.natural_gas_kg_co2e_per_therm;
    const metricTonsCO2e = kgCO2e * KG_TO_METRIC_TON;
    return {
      metric_tons_co2e: metricTonsCO2e,
      fuel_type: 'natural_gas',
      annual_therms: annualTherms,
      factor_kg_per_therm: NON_ELECTRIC_FACTORS.natural_gas_kg_co2e_per_therm,
    };
  }

  /**
   * Compute total portfolio emissions (Scope 1 + Scope 2).
   * @param {Array} accounts - [{account_type, state, annual_usage, annual_usage_unit}]
   * @returns {object} - aggregated portfolio emissions
   */
  function portfolioEmissions(accounts) {
    let scope2Total = 0;
    let scope1Total = 0;
    const byState = {};
    const byAccount = [];

    (accounts || []).forEach(function (acct) {
      if (!acct) return;
      const state = acct.state;
      const type = (acct.account_type || '').toLowerCase();
      const usage = Number(acct.annual_usage) || 0;
      if (usage <= 0) return;

      let result = null;
      if (type === 'electric') {
        result = scope2Emissions(usage, state);
        if (result) scope2Total += result.metric_tons_co2e;
      } else if (type === 'gas' || type === 'natural gas') {
        result = scope1EmissionsGas(usage);
        if (result) scope1Total += result.metric_tons_co2e;
      }

      if (result) {
        byState[state] = (byState[state] || 0) + result.metric_tons_co2e;
        byAccount.push({
          store_code: acct.store_code,
          state: state,
          type: type,
          metric_tons_co2e: result.metric_tons_co2e,
          detail: result,
        });
      }
    });

    return {
      scope1_metric_tons_co2e: scope1Total,
      scope2_metric_tons_co2e: scope2Total,
      total_metric_tons_co2e: scope1Total + scope2Total,
      by_state: byState,
      by_account: byAccount,
      account_count: byAccount.length,
    };
  }

  // Format a metric-tons number for display
  function fmtTons(tons) {
    if (tons == null || isNaN(tons)) return '\u2014';
    if (tons >= 10000) return (tons / 1000).toFixed(1) + 'k tCO\u2082e';
    if (tons >= 1000)  return Math.round(tons).toLocaleString() + ' tCO\u2082e';
    if (tons >= 100)   return Math.round(tons) + ' tCO\u2082e';
    if (tons >= 10)    return tons.toFixed(1) + ' tCO\u2082e';
    return tons.toFixed(2) + ' tCO\u2082e';
  }

  window.BeaconEmissions = {
    STATE_TO_EGRID: STATE_TO_EGRID,
    EGRID_FACTORS: EGRID_FACTORS,
    NON_ELECTRIC_FACTORS: NON_ELECTRIC_FACTORS,
    egridSubregionFor: egridSubregionFor,
    factorFor: factorFor,
    scope2Emissions: scope2Emissions,
    scope1EmissionsGas: scope1EmissionsGas,
    portfolioEmissions: portfolioEmissions,
    fmtTons: fmtTons,
  };
})();
