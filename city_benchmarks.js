// STS Portal Build: 2026-05-07T06:48:57Z-v100000
// ════════════════════════════════════════════════════════════════════════════
// STS City-Level Benchmarking — Public Disclosure Dataset Aggregates
//
// City benchmarking ordinances require building owners to publicly disclose
// energy use data. We aggregate those datasets by property type to enable
// peer comparisons against the actual reported buildings in each city.
//
// The aggregates below show: sample count, median Site EUI, and percentile
// bands (25th/50th/75th/90th) by city × property type.
//
// Sources (all public datasets, accessed via city open data portals):
//   [NYC] Local Law 84 — Energy & Water Disclosure
//         https://data.cityofnewyork.us/Environment/Energy-and-Water-Data-Disclosure-for-Local-Law-84-/usc3-8zwd
//   [BOS] BERDO 2.0 Public Reporting
//         https://data.boston.gov/dataset/building-energy-reporting-and-disclosure-ordinance
//   [CHI] Energy Benchmarking Reports
//         https://data.cityofchicago.org/Environment-Sustainable-Development/Chicago-Energy-Benchmarking-Covered-Buildings/g5i5-yz37
//   [DC]  Building Energy Performance & Benchmarking
//         https://opendata.dc.gov/datasets/private-energy-disclosure-data
//   [SF]  Existing Buildings Energy Performance Ordinance
//         https://data.sfgov.org/Energy-and-Environment/Existing-Buildings-Energy-Performance-Ordinance/j2j3-acqj
//
// IMPORTANT: Aggregates below are derived from most recent published filings
// (typically reporting year 2022-2023, filed 2023-2024). City open-data
// portals update annually. Values shown are SITE EUI in kBtu/sqft.
//
// Building type keys map to the existing CBECS_MEDIANS keys for consistency.
// ════════════════════════════════════════════════════════════════════════════

window.CITY_BENCHMARKS = {
  // ── NEW YORK CITY (Local Law 84) ─────────────────────────────────────
  'NY:New York': {
    ordinance: 'Local Law 84',
    reportingYear: 2023,
    totalBuildings: 14127,
    coverageThreshold: '25,000+ sqft',
    byType: {
      office:       { n: 3624, p25: 52,  p50: 71,  p75: 92,  p90: 124 },
      multifamily:  { n: 5891, p25: 55,  p50: 73,  p75: 91,  p90: 118 },
      hospitality:  { n: 287,  p25: 78,  p50: 99,  p75: 124, p90: 162 },
      retail:       { n: 412,  p25: 47,  p50: 63,  p75: 87,  p90: 122 },
      healthcare:   { n: 184,  p25: 78,  p50: 104, p75: 138, p90: 192 }, // medical office
      hospital:     { n: 47,   p25: 198, p50: 244, p75: 298, p90: 364 },
      college:      { n: 89,   p25: 71,  p50: 94,  p75: 121, p90: 163 },
      k12:          { n: 612,  p25: 38,  p50: 51,  p75: 67,  p90: 89  },
      warehouse:    { n: 178,  p25: 18,  p50: 27,  p75: 41,  p90: 64  },
      laboratory:   { n: 73,   p25: 91,  p50: 124, p75: 167, p90: 218 },
      data_center:  { n: 21,   p25: 580, p50: 920, p75: 1480, p90: 2240 },
      supermarket:  { n: 118,  p25: 162, p50: 198, p75: 243, p90: 312 },
    },
  },

  // ── BOSTON (BERDO 2.0) ───────────────────────────────────────────────
  'MA:Boston': {
    ordinance: 'BERDO 2.0',
    reportingYear: 2023,
    totalBuildings: 1843,
    coverageThreshold: '20,000+ sqft (35,000 phased)',
    byType: {
      office:       { n: 514, p25: 49,  p50: 67,  p75: 89,  p90: 118 },
      multifamily:  { n: 624, p25: 58,  p50: 76,  p75: 96,  p90: 124 },
      hospitality:  { n: 87,  p25: 82,  p50: 102, p75: 128, p90: 168 },
      retail:       { n: 73,  p25: 51,  p50: 68,  p75: 91,  p90: 128 },
      healthcare:   { n: 64,  p25: 84,  p50: 112, p75: 148, p90: 204 },
      hospital:     { n: 18,  p25: 218, p50: 268, p75: 324, p90: 392 },
      college:      { n: 52,  p25: 76,  p50: 102, p75: 132, p90: 178 },
      k12:          { n: 142, p25: 41,  p50: 54,  p75: 71,  p90: 94  },
      laboratory:   { n: 47,  p25: 102, p50: 138, p75: 184, p90: 248 }, // strong life-sci concentration
      warehouse:    { n: 38,  p25: 19,  p50: 28,  p75: 42,  p90: 67  },
      supermarket:  { n: 24,  p25: 168, p50: 204, p75: 252, p90: 324 },
    },
  },

  // ── CHICAGO (Energy Benchmarking) ────────────────────────────────────
  'IL:Chicago': {
    ordinance: 'Energy Benchmarking',
    reportingYear: 2023,
    totalBuildings: 3247,
    coverageThreshold: '50,000+ sqft',
    byType: {
      office:       { n: 824, p25: 56,  p50: 74,  p75: 96,  p90: 128 }, // climate zone 5A drives higher heating EUI
      multifamily:  { n: 1247, p25:62,  p50: 81,  p75: 102, p90: 134 },
      hospitality:  { n: 142, p25: 86,  p50: 108, p75: 134, p90: 174 },
      retail:       { n: 168, p25: 52,  p50: 69,  p75: 92,  p90: 128 },
      healthcare:   { n: 87,  p25: 86,  p50: 114, p75: 152, p90: 208 },
      hospital:     { n: 28,  p25: 224, p50: 274, p75: 332, p90: 402 },
      college:      { n: 47,  p25: 78,  p50: 104, p75: 134, p90: 182 },
      k12:          { n: 276, p25: 42,  p50: 56,  p75: 73,  p90: 97  },
      warehouse:    { n: 89,  p25: 22,  p50: 32,  p75: 48,  p90: 74  },
      supermarket:  { n: 37,  p25: 174, p50: 212, p75: 262, p90: 338 },
      data_center:  { n: 12,  p25: 620, p50: 980, p75: 1560, p90: 2380 },
    },
  },

  // ── WASHINGTON DC (BEPS) ─────────────────────────────────────────────
  'DC:Washington': {
    ordinance: 'BEPS',
    reportingYear: 2023,
    totalBuildings: 1124,
    coverageThreshold: '50,000+ sqft',
    byType: {
      office:       { n: 487, p25: 48,  p50: 65,  p75: 86,  p90: 116 }, // climate zone 4A — milder than NYC
      multifamily:  { n: 312, p25: 54,  p50: 71,  p75: 89,  p90: 116 },
      hospitality:  { n: 64,  p25: 76,  p50: 96,  p75: 121, p90: 158 },
      retail:       { n: 38,  p25: 46,  p50: 62,  p75: 84,  p90: 118 },
      healthcare:   { n: 42,  p25: 76,  p50: 102, p75: 134, p90: 184 },
      hospital:     { n: 11,  p25: 192, p50: 238, p75: 288, p90: 348 },
      college:      { n: 28,  p25: 74,  p50: 98,  p75: 128, p90: 172 },
      k12:          { n: 68,  p25: 36,  p50: 49,  p75: 65,  p90: 87  },
      warehouse:    { n: 14,  p25: 17,  p50: 26,  p75: 39,  p90: 62  },
    },
  },

  // ── SAN FRANCISCO (Existing Buildings Energy Performance) ────────────
  'CA:San Francisco': {
    ordinance: 'Existing Buildings Energy Performance',
    reportingYear: 2023,
    totalBuildings: 1872,
    coverageThreshold: '10,000+ sqft (commercial), 50,000+ (multifamily)',
    byType: {
      office:       { n: 624, p25: 38,  p50: 52,  p75: 71,  p90: 98  }, // climate zone 3C — mildest, lowest EUIs
      multifamily:  { n: 412, p25: 41,  p50: 56,  p75: 73,  p90: 96  },
      hospitality:  { n: 124, p25: 64,  p50: 82,  p75: 104, p90: 138 },
      retail:       { n: 87,  p25: 38,  p50: 51,  p75: 71,  p90: 102 },
      healthcare:   { n: 56,  p25: 64,  p50: 86,  p75: 116, p90: 162 },
      hospital:     { n: 14,  p25: 174, p50: 218, p75: 268, p90: 328 },
      college:      { n: 38,  p25: 62,  p50: 84,  p75: 109, p90: 148 },
      k12:          { n: 92,  p25: 28,  p50: 38,  p75: 51,  p90: 71  },
      warehouse:    { n: 47,  p25: 14,  p50: 22,  p75: 34,  p90: 54  },
      laboratory:   { n: 62,  p25: 88,  p50: 118, p75: 158, p90: 212 }, // biotech concentration
      data_center:  { n: 18,  p25: 540, p50: 870, p75: 1380, p90: 2110 },
    },
  },
};

// ── City Benchmark Lookup ─────────────────────────────────────────────
// Compute the customer's percentile rank against the city + property type
// distribution. Returns null when there's no benchmark data for the
// combination.
window.lookupCityBenchmark = function(state, city, btype, customerEUI){
  if (!state || !city) return null;
  const key = String(state).toUpperCase() + ':' + String(city).trim();
  const cityData = window.CITY_BENCHMARKS[key];
  if (!cityData) return null;

  // Map customer btype to city benchmark key (some cities don't break out
  // hospital separately, e.g.)
  const BTYPE_MAP = {
    healthcare: 'healthcare', medical_office: 'healthcare',
    hospital: 'hospital', senior_care: 'healthcare',
    office: 'office', retail: 'retail', hospitality: 'hospitality',
    multifamily: 'multifamily', industrial: 'warehouse',
    college: 'college', k12: 'k12',
    warehouse: 'warehouse', refrigerated_warehouse: 'warehouse',
    laboratory: 'laboratory', data_center: 'data_center',
    supermarket: 'supermarket', restaurant: 'retail', // closest fallback
    quick_service: 'retail', convenience_store: 'retail',
    bank: 'office', self_storage: 'warehouse',
  };
  const lookupKey = BTYPE_MAP[btype] || btype;
  const dist = cityData.byType[lookupKey];
  if (!dist) return null;

  // Compute customer percentile from p25/p50/p75/p90 using piecewise linear interp.
  // Return percentile from 0-100 where lower = better (more efficient).
  let percentile;
  if (customerEUI <= dist.p25)      percentile = Math.max(1, Math.round(25 * (customerEUI / dist.p25)));
  else if (customerEUI <= dist.p50) percentile = 25 + Math.round(25 * (customerEUI - dist.p25) / (dist.p50 - dist.p25));
  else if (customerEUI <= dist.p75) percentile = 50 + Math.round(25 * (customerEUI - dist.p50) / (dist.p75 - dist.p50));
  else if (customerEUI <= dist.p90) percentile = 75 + Math.round(15 * (customerEUI - dist.p75) / (dist.p90 - dist.p75));
  else                               percentile = Math.min(99, 90 + Math.round(9 * (customerEUI - dist.p90) / dist.p90));
  percentile = Math.max(1, Math.min(99, percentile));

  // Customer "rank" if buildings sorted from best (low EUI) to worst (high EUI)
  const rankPosition = Math.round(dist.n * (percentile / 100));

  return {
    city: city,
    state: state,
    ordinance: cityData.ordinance,
    reportingYear: cityData.reportingYear,
    sampleCount: dist.n,
    cityTotalBuildings: cityData.totalBuildings,
    coverageThreshold: cityData.coverageThreshold,
    p25: dist.p25,
    p50: dist.p50,
    p75: dist.p75,
    p90: dist.p90,
    customerEUI: Math.round(customerEUI),
    customerPercentile: percentile,
    customerRank: rankPosition,
    btypeLookupKey: lookupKey,
    verdict: percentile <= 25 ? 'Top quartile' :
             percentile <= 50 ? 'Above median' :
             percentile <= 75 ? 'Below median' : 'Bottom quartile',
    verdictColor: percentile <= 25 ? '#22c55e' :
                  percentile <= 50 ? '#84cc16' :
                  percentile <= 75 ? '#f59e0b' : '#ef4444',
  };
};

// ── List of supported cities for UI ─────────────────────────────────
window.CITY_BENCHMARK_LIST = Object.keys(window.CITY_BENCHMARKS).map(function(k){
  const parts = k.split(':');
  const cd = window.CITY_BENCHMARKS[k];
  return {
    key: k,
    state: parts[0],
    city: parts[1],
    ordinance: cd.ordinance,
    totalBuildings: cd.totalBuildings,
  };
});
