// STS Portal Build: 2026-05-04T17:34:03Z-v100000
// ════════════════════════════════════════════════════════════════════════════
// STS Portfolio Benchmarking — Public Data Reference Tables
// All values verified against primary source publications. Updated quarterly.
//
// Sources:
//   [1] EPA ENERGY STAR Portfolio Manager — U.S. National Median Reference Values
//       for All Portfolio Manager Property Types, Aug 2024.
//       Site EUI values verified against the EPA published reference table.
//       Properties marked with * have a 1–100 ENERGY STAR Score available.
//       https://portfoliomanager.energystar.gov/pdf/reference/US%20National%20Median%20Table.pdf
//
//   [2] EPA eGRID2023 Summary Tables (March 2025) — State output emission
//       rates (CO2e), lb/MWh, converted to kg/kWh (× 0.4536 / 1000).
//       https://www.epa.gov/egrid/summary-data
//
//   [3] EIA Form 861 — 2024 Total Electric Industry, Average Retail Price
//       by State, Commercial column (cents/kWh).
//       https://www.eia.gov/electricity/sales_revenue_price/pdf/table_4.pdf
//
//   [4] DOE Buildings Performance Database — National peer counts by
//       primary building activity. Approximate state shares derived from
//       commercial real estate stock distribution.
//       https://bpd.lbl.gov/
// ════════════════════════════════════════════════════════════════════════════

// ── ONE OPPORTUNITY RATE TABLE (bundle 118, 2026-10-05) ─────────────────────
// Before this, three engines each carried their own savings rates and they
// disagreed: procurement was 8% of supply here, 10% of supply in
// opportunity_calc.js and 4% of supply in the per-meter drill-down (OPP_META
// in index.html) — three different numbers for one portfolio depending on the
// screen. Every engine now reads THIS table. Change a rate here and every
// screen moves together.
//
// Matt's calls: procurement 8% of supply (top of the documented 3-8% range,
// 2026-09-17, reconfirmed 2026-10-05); the per-meter drill-down's halved rates
// were not intentional (2026-10-05). Efficiency's 20% is a FALLBACK only —
// the primary efficiency figure is each building's EUI gap to the median building,
// used whenever square footage is known (2026-10-05).
window.BEACON_OPP_RATES = {
  supplyFactor:   0.65,   // supply (commodity) share of an all-in commercial bill
  procurement:    0.08,   // of SUPPLY spend — deregulated markets only
  dr:             0.04,   // of SUPPLY spend
  solar:          0.08,   // of SUPPLY spend — community-solar states only
  efficiency:     0.20,   // of ALL-IN spend — fallback when sqft is unknown
  recovery:       0.02,   // of ALL-IN spend per year audited
  recoveryYears:  3,      // one-time, three-year lookback
  // Efficiency savings are sized as the gap from a building's EUI down to
  // this TARGET, as a multiple of its type's median EUI. 1.0 = the median
  // building (Matt's call, 2026-10-05 — conservative and defensible). 0.55
  // would be best-in-class, the previous basis. Best-in-class is still SHOWN
  // as a reference on the tiles; it is no longer what savings are sized to.
  efficiencyTarget: 1.0,
  dereg: ['PA','NY','NJ','MA','CT','RI','NH','MD','OH','IL','TX','DC','ME','DE','MI'],
  solarStates: ['NY','MA','NJ','IL','MN','CO','MD','PA','RI','CT','DC','DE','VA','NM','OR'],
};
// Kept for anything still reading the old global name.
window.OPP_SUPPLY_FACTOR = window.BEACON_OPP_RATES.supplyFactor;

// ── [1] Site EUI medians (kBtu / sq ft / yr) — EPA Aug 2024 Reference Table ──
window.CBECS_MEDIANS = {
  office: 52.9, retail: 51.4, hospitality: 63.0, healthcare: 97.7,
  multifamily: 59.6, industrial: 80.0,
  hospital: 234.3, senior_care: 99.0,
  restaurant: 325.6, quick_service: 402.7, supermarket: 196.0, convenience_store: 350.9,
  bank: 88.3,
  data_center: 1500.0, laboratory: 115.3, refrigerated_warehouse: 84.1,
  warehouse: 22.7, self_storage: 20.2,
  college: 84.3, k12: 48.5,
};

window.CBECS_SOURCE = {
  office: 'CBECS 2018 · Office', retail: 'CBECS 2018 · Retail Store',
  hospitality: 'CBECS 2018 · Hotel', healthcare: 'EPA Industry Survey · Medical Office',
  multifamily: 'Fannie Mae Industry Survey · Multifamily',
  industrial: 'CBECS 2018 · Industrial (estimate — no published median)',
  hospital: 'EPA Industry Survey · Hospital (General Medical & Surgical)',
  senior_care: 'EPA Industry Survey · Senior Living Community',
  restaurant: 'CBECS 2018 · Restaurant/Cafeteria', quick_service: 'CBECS 2018 · Fast Food',
  supermarket: 'CBECS 2018 · Grocery Store', convenience_store: 'EPA Industry Survey · Convenience Store',
  bank: 'CBECS 2018 · Bank/Financial', data_center: 'EPA Data Center Survey · PUE 1.82 median',
  laboratory: 'CBECS 2018 · Laboratory', refrigerated_warehouse: 'CBECS 2018 · Refrigerated Warehouses',
  warehouse: 'CBECS 2018 · Distribution Center / Warehouse',
  self_storage: 'CBECS 2018 · Self-Storage Facility',
  college: 'CBECS 2018 · College/University', k12: 'CBECS 2018 · K-12 School',
};

window.BTYPE_ESS_ELIGIBLE = {
  office: true, retail: true, hospitality: true, healthcare: true, multifamily: true,
  industrial: false, hospital: true, senior_care: true,
  restaurant: false, quick_service: false, supermarket: true, convenience_store: true,
  bank: true, data_center: true, laboratory: false, refrigerated_warehouse: true,
  warehouse: true, self_storage: false, college: false, k12: true,
};

// ── BUILDING-TYPE NORMALIZER (added 2026-09-17) ───────────────────────────
// btype reaches the math as `customers.type` (via meta.btype) or as a ?btype=
// query param, and the only normalisation anywhere was .toLowerCase().
//
// Production `customers.type` values are capitalised display words:
// Healthcare, Hospitality, Manufacturing, Retail, Supermarket, Warehouse,
// plus one lowercase 'office'. Six of the seven lowercase straight onto a
// valid slug. One does not: **'Manufacturing' -> 'manufacturing', which is not
// a slug at all.** The correct slug is 'industrial', whose own display label
// is literally "Manufacturing/Industrial".
//
// The EUI median survives that by luck — an unknown type falls back to 80,
// and industrial's median IS 80 — but the ENERGY STAR tile does not, and that
// failure is the serious one. See the eligibility note below.
//
// Aliases cover the spellings that actually reach us: production
// customers.type values, the EPA/ENERGY STAR property-type display labels
// (which are the only building-type vocabulary in the database), and the
// obvious synonyms. Unknown input is returned lowercased and unchanged rather
// than guessed at, so it stays visible as unknown instead of being silently
// mapped to something plausible.
var BTYPE_ALIASES = {
  manufacturing: 'industrial', factory: 'industrial', plant: 'industrial',
  'manufacturing/industrial': 'industrial', 'industrial/manufacturing': 'industrial',
  'retail store': 'retail', 'retail store (non-mall)': 'retail', store: 'retail',
  'supermarket/grocery store': 'supermarket', grocery: 'supermarket',
  'grocery store': 'supermarket', 'food sales': 'supermarket',
  'warehouse (non-refrigerated)': 'warehouse', 'non-refrigerated warehouse': 'warehouse',
  'distribution center': 'warehouse', 'warehouse (refrigerated)': 'refrigerated_warehouse',
  'refrigerated warehouse': 'refrigerated_warehouse',
  'hospital (general medical & surgical)': 'hospital', 'medical office': 'healthcare',
  'outpatient': 'healthcare', clinic: 'healthcare',
  hotel: 'hospitality', 'hotel/motel': 'hospitality', lodging: 'hospitality', motel: 'hospitality',
  'k-12 school': 'k12', 'k12 school': 'k12', school: 'k12', 'primary school': 'k12',
  'secondary school': 'k12', 'college/university': 'college', university: 'college',
  'senior care community': 'senior_care', 'senior living': 'senior_care',
  'senior living community': 'senior_care', 'assisted living': 'senior_care',
  'data center': 'data_center', datacenter: 'data_center',
  'self-storage facility': 'self_storage', 'self storage': 'self_storage',
  'convenience store': 'convenience_store', 'convenience store with gas station': 'convenience_store',
  'quick service restaurant': 'quick_service', 'fast food': 'quick_service',
  'full service restaurant': 'restaurant', dining: 'restaurant',
  'multifamily housing': 'multifamily', apartment: 'multifamily', 'apartments': 'multifamily',
  'financial office': 'bank', 'bank branch': 'bank',
  'medical lab': 'laboratory', lab: 'laboratory', 'research': 'laboratory',
};

window.beaconNormalizeBtype = function (v) {
  var t = String(v == null ? '' : v).toLowerCase().trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (BTYPE_ALIASES[t]) return BTYPE_ALIASES[t];
  var snake = t.replace(/[\s\/-]+/g, '_');
  if (BTYPE_ALIASES[snake]) return BTYPE_ALIASES[snake];
  if (window.CBECS_MEDIANS && window.CBECS_MEDIANS[snake] !== undefined) return snake;
  return t;
};

// Is this a building type EPA will score at all? Previously asked as
//     window.BTYPE_ESS_ELIGIBLE[btype] !== false
// which FAILS OPEN: an unrecognised slug yields undefined, undefined !== false
// is true, and the building is treated as ENERGY STAR eligible. Combined with
// the normalisation gap above, a customer typed 'Manufacturing' was shown an
// estimated ENERGY STAR score of 67 — for a building type EPA does not score.
// Under the correct slug 'industrial' the table says false and the tile
// correctly shows nothing. A fabricated score on a certification-adjacent
// number is the worst error this product can make, so this now fails CLOSED:
// unknown type means no score, same as the property_type trigger's convention.
window.beaconEssEligible = function (btype) {
  var b = window.beaconNormalizeBtype(btype);
  return window.BTYPE_ESS_ELIGIBLE[b] === true;
};

window.DC_PUE_MEDIAN = 1.82;

window.REGION_ADJ_BY_STATE = {
  CT:1.05, ME:1.05, MA:1.05, NH:1.05, NJ:1.05, NY:1.05, PA:1.05, RI:1.05, VT:1.05,
  IL:1.10, IN:1.10, IA:1.10, KS:1.10, MI:1.10, MN:1.10, MO:1.10, NE:1.10, ND:1.10,
  OH:1.10, SD:1.10, WI:1.10,
  AL:0.95, AR:0.95, DE:0.95, DC:0.95, FL:0.95, GA:0.95, KY:0.95, LA:0.95, MD:0.95,
  MS:0.95, NC:0.95, OK:0.95, SC:0.95, TN:0.95, TX:0.95, VA:0.95, WV:0.95,
  AK:0.95, AZ:0.90, CA:0.90, CO:0.95, HI:0.85, ID:1.00, MT:1.05, NV:0.90,
  NM:0.90, OR:0.90, UT:1.00, WA:0.90, WY:1.05,
};
window.sizeAdj = function (sqft) {
  if (sqft <  10000) return 1.15;
  if (sqft < 100000) return 1.05;
  if (sqft < 500000) return 1.00;
  return 0.92;
};

window.EGRID_KG_PER_KWH = {
  AK:0.369, AL:0.324, AR:0.453, AZ:0.313, CA:0.179,
  CO:0.495, CT:0.245, DC:0.179, DE:0.319, FL:0.358,
  GA:0.325, HI:0.633, IA:0.288, ID:0.142, IL:0.215,
  IN:0.665, KS:0.333, KY:0.792, LA:0.346, MA:0.376,
  MD:0.237, ME:0.144, MI:0.362, MN:0.341, MO:0.660,
  MS:0.376, MT:0.483, NC:0.284, ND:0.589, NE:0.465,
  NH:0.125, NJ:0.213, NM:0.351, NV:0.292, NY:0.212,
  OH:0.485, OK:0.294, OR:0.166, PA:0.294, RI:0.381,
  SC:0.254, SD:0.152, TN:0.300, TX:0.350, UT:0.645,
  VA:0.245, VT:0.024, WA:0.121, WI:0.528, WV:0.893, WY:0.832,
};

window.STATE_RATES_CENTS = {
  AL:13.64, AK:21.57, AZ:12.23, AR:10.24, CA:25.54,
  CO:11.71, CT:21.21, DE:12.20, DC:17.07, FL:10.99,
  GA:10.87, HI:38.18, ID: 9.17, IL:11.81, IN:12.44,
  IA:10.22, KS:11.19, KY:11.50, LA:10.46, ME:18.22,
  MD:12.96, MA:20.90, MI:14.01, MN:12.15, MS:12.32,
  MO:11.58, MT:12.41, NE:10.40, NV:10.31, NH:18.65,
  NJ:15.92, NM:11.65, NY:18.16, NC:10.29, ND: 9.94,
  OH:11.42, OK:10.06, OR:11.29, PA:11.45, RI:18.01,
  SC:11.91, SD: 9.97, TN:12.41, TX:10.43, UT: 9.00,
  VT:18.84, VA:10.71, WA: 9.73, WV:10.78, WI:12.53, WY: 9.78,
};

window.PEER_NATIONAL = {
  office: 38000, retail: 12000, hospitality: 3200, healthcare: 6800,
  multifamily: 21000, industrial: 8500, hospital: 6000, senior_care: 12000,
  restaurant: 60000, quick_service: 90000, supermarket: 38000, convenience_store: 120000,
  bank: 75000, data_center: 5000, laboratory: 8000, refrigerated_warehouse: 1200,
  warehouse: 80000, self_storage: 50000, college: 4300, k12: 130000,
};

window.PEER_STATE_SHARE = {
  AL:0.014, AK:0.003, AZ:0.022, AR:0.010, CA:0.119,
  CO:0.020, CT:0.013, DE:0.004, DC:0.008, FL:0.066,
  GA:0.034, HI:0.005, ID:0.006, IL:0.044, IN:0.022,
  IA:0.011, KS:0.010, KY:0.014, LA:0.014, ME:0.005,
  MD:0.020, MA:0.026, MI:0.030, MN:0.018, MS:0.009,
  MO:0.020, MT:0.004, NE:0.007, NV:0.010, NH:0.005,
  NJ:0.029, NM:0.007, NY:0.062, NC:0.033, ND:0.003,
  OH:0.038, OK:0.013, OR:0.014, PA:0.041, RI:0.004,
  SC:0.015, SD:0.003, TN:0.020, TX:0.085, UT:0.011,
  VT:0.003, VA:0.026, WA:0.024, WV:0.006, WI:0.018, WY:0.002,
};

window.STATE_NAMES_BM = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'District of Columbia',
  FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois',
  IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
  ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
  MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
  NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
  NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
  OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
  SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
};

window.BTYPE_LABELS = {
  office: 'Office', retail: 'Retail Store', hospitality: 'Hotel',
  healthcare: 'Medical Office', multifamily: 'Multifamily Housing',
  industrial: 'Manufacturing/Industrial', hospital: 'Hospital', senior_care: 'Senior Living',
  restaurant: 'Restaurant', quick_service: 'Fast Food / QSR',
  supermarket: 'Supermarket / Grocery', convenience_store: 'Convenience Store',
  bank: 'Bank Branch', data_center: 'Data Center', laboratory: 'Laboratory',
  refrigerated_warehouse: 'Refrigerated Warehouse', warehouse: 'Distribution / Warehouse',
  self_storage: 'Self-Storage', college: 'College / University', k12: 'K-12 School',
};

window.BTYPE_ORDER = [
  'office','retail','hospitality','healthcare','multifamily','industrial',
  'hospital','senior_care','restaurant','quick_service','supermarket',
  'convenience_store','bank','data_center','laboratory','refrigerated_warehouse',
  'warehouse','self_storage','college','k12',
];

// ── ENERGY FROM USAGE WHEN WE HAVE IT (added 2026-09-17) ───────────────────
// This function back-solves energy from DOLLARS. That is a reasonable
// fallback when only spend is known, but it was being used even by callers
// holding real metered kWh and therms, and it is badly wrong for gas.
//
// Converting the whole bill at the electric rate values a therm at
// (gasRate * 3.412 / stateRate) kBtu instead of 100 — about 29 kBtu at
// 12.75c, 43 at 8.66c, 14 at 26.8c. Gas enters at 14-43% of its real energy
// content. For a 1,000,000 kWh + 50,000 therm building, true site energy is
// 8.41M kBtu and this produced 4.88M — EUI understated 42%, worse on
// heating-dominated buildings. Because the shortfall is multiplicative, the
// result was almost always below 0.85 x median, so such buildings printed a
// green "Better than median" verdict essentially by construction. perloc.js
// does it correctly, which is why the Portfolio Map and the Location page
// showed DIFFERENT EUIs for the same building.
//
// There was a second, independent contradiction. The EUI line treated 100% of
// spend as electric; the carbon line 30 lines below used 70%. Two different
// fuel splits inside one function, both rendered side by side, so carbon
// intensity read ~30% below the energy intensity printed next to it.
//
// Both are resolved the same way: accept an optional `usage` of
// {electricKwh, gasTherms}. When present, energy and carbon both come from
// the real meters and no split is assumed at all. When absent, ONE named
// constant is used for both, so they can no longer disagree.
var ELECTRIC_SHARE_OF_SPEND = 0.70;   // fallback only, used by BOTH paths

// ── THE `city` ARGUMENT WAS ACCEPTED AND NEVER READ (fixed 2026-09-17) ─────
// The Location page passes prime.city as the 5th argument, and the comment at
// that call site says it lets computeBenchmarks "pick the ASHRAE
// climate-zone-aware EUI adjustment instead of the coarser state-level
// bucket." Nothing in this function ever touched `city`. The median EUI was
// adjusted by REGION_ADJ_BY_STATE alone — one number for the whole state —
// so San Diego and Redding, Miami and Tallahassee, Seattle and Spokane were
// all held to the same expectation. The comment described behaviour that did
// not exist, which is worse than the coarse bucket: it invited trust in a
// precision the number never had.
//
// Implemented rather than deleted, because the data to do it properly is
// already shipped. weather_norm.js resolves a city to its NOAA station and
// ASHRAE 169 zone; reference_buildings.js holds DOE prototype total EUI per
// zone. When the building's CITY zone differs from its STATE default zone,
// scale the median by the ratio of the DOE reference totals for those two
// zones. Same dataset, same building type, only the climate changes — so the
// ratio isolates the climate effect and nothing else.
//
// Deliberately conservative:
//   - collapses to exactly the old behaviour (x1.0) when the city resolves to
//     the state's own zone, when no station matches, or when the building type
//     has no DOE prototype;
//   - reuses reference_buildings' own documented same-number/either-letter
//     fallback (4A -> 4B) rather than inventing a second one;
//   - clamped to 0.75-1.35. A climate correction outside that band means the
//     lookup went wrong, not that the building is in an extraordinary place.
// The basis is returned as climateBasis/climateZone so a panel can say which
// one it used instead of implying zone precision on a state-level number.
var BTYPE_TO_DOE = {
  office: 'medium_office', retail: 'stand_alone_retail', hospitality: 'small_hotel',
  healthcare: 'outpatient_healthcare', hospital: 'hospital', multifamily: 'mid_rise_apartment',
  warehouse: 'warehouse', supermarket: 'supermarket', restaurant: 'full_service_restaurant',
  quick_service: 'quick_service_restaurant', k12: 'primary_school', college: 'secondary_school',
  refrigerated_warehouse: 'warehouse', self_storage: 'warehouse',
  convenience_store: 'stand_alone_retail', bank: 'small_office',
};

function _zoneTotalEUI(doeType, zone) {
  var RB = window.BeaconReferenceBuildings;
  if (!RB || !RB.DATA || !RB.DATA[doeType] || !zone) return null;
  var tbl = RB.DATA[doeType];
  var hit = tbl[zone];
  if (!hit) {
    var num = String(zone).replace(/[A-C]/, '');
    var cand = Object.keys(tbl).filter(function (z) { return z.indexOf(num) === 0; });
    if (cand.length) hit = tbl[cand[0]];
  }
  return (hit && hit.total > 0) ? hit.total : null;
}

// Returns { adj, basis, zone } — adj is 1.0 and basis 'state' whenever the
// city-level correction cannot be made honestly.
window.climateAdjForCity = function (state, city, btype) {
  var out = { adj: 1.0, basis: 'state', zone: null };
  var RB = window.BeaconReferenceBuildings;
  if (!RB || !city || !state) return out;

  var stateZone = RB.climateZoneFor(state);
  out.zone = stateZone;
  if (!stateZone) return out;

  var ctx = null;
  try {
    if (window.WeatherNorm && typeof window.WeatherNorm.getClimateContext === 'function') {
      ctx = window.WeatherNorm.getClimateContext(state, city);
    }
  } catch (e) { ctx = null; }
  // getStationForLocation falls back to the state's PRINCIPAL station when the
  // city name isn't in the index, and still returns a zone. Taking that zone
  // would hand a Tallahassee building Miami's 1A and label it 'city_zone' —
  // a state-level number wearing a zone-precise badge, which is the exact
  // failure this whole fix exists to remove. Only a real city match counts.
  if (!ctx || ctx.matchType !== 'city') return out;

  var cityZone = ctx.zone;
  if (!cityZone || cityZone === stateZone) return out;

  var doeType = BTYPE_TO_DOE[btype];
  if (!doeType) return out;

  var cityEUI  = _zoneTotalEUI(doeType, cityZone);
  var stateEUI = _zoneTotalEUI(doeType, stateZone);
  if (!cityEUI || !stateEUI) return out;

  var ratio = cityEUI / stateEUI;
  if (!isFinite(ratio) || ratio < 0.75 || ratio > 1.35) return out;

  out.adj = ratio;
  out.basis = 'city_zone';
  out.zone = cityZone;
  return out;
};

window.computeBenchmarks = function (state, btype, sqft, annualSpend, city, usage) {
  state = (state || 'PA').toUpperCase();
  // Normalise once, here, so every lookup below (CBECS median, ESS
  // eligibility, peer counts, labels, the DOE prototype map) sees the same
  // canonical slug. Previously each of those lower-cased independently, which
  // is why 'Manufacturing' reached them as a slug that exists nowhere.
  btype = window.beaconNormalizeBtype(btype) || 'healthcare';
  // Remember whether floor area was actually supplied BEFORE defaulting it —
  // the efficiency figure below is only meaningful against a real area.
  var sqftKnown = Number(sqft) > 0;
  sqft = Number(sqft) || 1250000;
  annualSpend = Number(annualSpend) || 2400000;

  var stateRate  = (window.STATE_RATES_CENTS[state] || 12.75) / 100;
  var co2Factor  = window.EGRID_KG_PER_KWH[state] || 0.348;
  var regionAdj  = window.REGION_ADJ_BY_STATE[state] || 1.0;
  // City-level ASHRAE zone correction on top of the state bucket. x1.0 and
  // basis 'state' whenever it can't be made honestly — see climateAdjForCity.
  var _cl = (typeof window.climateAdjForCity === 'function')
    ? window.climateAdjForCity(state, city, btype)
    : { adj: 1.0, basis: 'state', zone: null };
  regionAdj = regionAdj * _cl.adj;
  var szAdj      = window.sizeAdj(sqft);
  var costPerKbtu = stateRate / 3.412;

  // Real metered usage beats anything derived from dollars.
  var uKwh    = Number(usage && usage.electricKwh) || 0;
  var uTherms = Number(usage && usage.gasTherms)   || 0;
  var haveUsage = (uKwh > 0 || uTherms > 0);

  var totalKbtu, totalKWhEst, energyBasis;
  if (haveUsage) {
    totalKbtu   = uKwh * 3.412 + uTherms * 100;   // true site energy, both fuels
    totalKWhEst = uKwh;                            // Scope 2 uses real electric only
    energyBasis = 'metered';
  } else {
    totalKbtu   = annualSpend / costPerKbtu;
    totalKWhEst = (annualSpend * ELECTRIC_SHARE_OF_SPEND) / stateRate;
    energyBasis = 'estimated_from_spend';
  }
  var actualEUI = totalKbtu / sqft;

  var medianEUI = (window.CBECS_MEDIANS[btype] || 80) * regionAdj * szAdj;
  var bestInClassEUI = medianEUI * 0.55;

  var euiSigma = medianEUI * 0.30;
  var percentile = Math.round(50 + ((actualEUI - medianEUI) / euiSigma) * 25);
  percentile = Math.max(1, Math.min(99, percentile));
  var euiVerdict, euiColor;
  if (actualEUI < medianEUI * 0.85) { euiVerdict='Better than median'; euiColor='#22c55e'; }
  else if (actualEUI < medianEUI * 1.15) { euiVerdict='At median'; euiColor='#f59e0b'; }
  else { euiVerdict='Above median'; euiColor='#ef4444'; }

  var costPerSqft = annualSpend / sqft;
  var expectedCostPerSqft = medianEUI * costPerKbtu;
  var costDelta = (costPerSqft / expectedCostPerSqft - 1) * 100;
  var costColor, costVerdict;
  if (costDelta < -5)  { costColor='#22c55e'; costVerdict='Below regional average — efficient'; }
  else if (costDelta < 5) { costColor='#f59e0b'; costVerdict='In line with regional benchmarks'; }
  else                 { costColor='#ef4444'; costVerdict='Above regional average — opportunity'; }

  var R = window.BEACON_OPP_RATES;
  // Efficiency: the EUI gap to the target (the median building — see
  // BEACON_OPP_RATES.efficiencyTarget) is the primary method — it is
  // the only one that looks at the actual building. When floor area was not
  // supplied the gap would be computed against a made-up 1.25M sqft, so the
  // published flat rate is used instead and the basis says so.
  var efficiencyTargetEUI = medianEUI * (Number(R.efficiencyTarget) > 0 ? Number(R.efficiencyTarget) : 1.0);
  var efficiencyGap = Math.max(0, actualEUI - efficiencyTargetEUI);
  var efficiencySavings, efficiencyBasis;
  if (sqftKnown) {
    efficiencySavings = (efficiencyGap / Math.max(actualEUI, 1)) * annualSpend;
    efficiencyBasis = 'eui_gap';
  } else {
    efficiencySavings = annualSpend * R.efficiency;
    efficiencyBasis = 'flat_rate';
  }
  // ── PROCUREMENT SAVINGS: 8% OF SUPPLY, NOT 12% OF THE WHOLE BILL ─────────
  // This was `annualSpend * 0.12` — 12% of the customer's ENTIRE energy bill.
  // A broker can only move the supply (commodity) portion; delivery,
  // transmission, capacity and taxes are not negotiable. index.html already
  // holds OPP_SUPPLY_FACTOR = 0.65 for exactly this split, and the documented
  // capture range is 3-8% of supply.
  //
  // 12% of all-in works out to roughly 18% of supply — more than double the
  // top of the defensible range. On a $480,000 customer that was $57,600
  // claimed against $29,952 at the top of the range.
  //
  // Matt's call (2026-09-17): use the TOP of the range. 8% of supply.
  //   0.65 x 0.08 = 0.052 of all-in spend.
  // Reads from window.OPP_SUPPLY_FACTOR when index.html has defined it so the
  // two can never drift; falls back to the same 0.65 standalone.
  // (bundle 118) Rates now come from window.BEACON_OPP_RATES. And a supplier
  // switch is only possible in a deregulated market: a regulated-state client
  // was shown a procurement figure here while their own report said "Not
  // available — regulated market". Now $0, with the basis recorded.
  var SUPPLY_SHARE        = R.supplyFactor;
  var PROCUREMENT_CAPTURE = R.procurement;
  var isDereg = R.dereg.indexOf(String(state || '').toUpperCase()) !== -1;
  var procurementSavings = isDereg ? annualSpend * SUPPLY_SHARE * PROCUREMENT_CAPTURE : 0;
  var procurementBasis = isDereg ? 'supply_share' : 'regulated_market';
  // Keep the uncapped sum so a split bar can divide components by the total
  // they actually add up to (B8: dividing by the CAPPED total made the two
  // segments sum to as much as 319%).
  var savingsUncapped = Math.round(efficiencySavings + procurementSavings);
  var savingsCap = Math.round(annualSpend * 0.35);
  var totalSavings = Math.min(savingsUncapped, savingsCap);
  var savingsCapApplied = savingsUncapped > savingsCap;
  var savingsPct = Math.round((totalSavings / annualSpend) * 100);

  // totalKWhEst was set above — from real meters when available, otherwise
  // from ELECTRIC_SHARE_OF_SPEND, the SAME constant the EUI path uses.
  //
  // Scope 1 is now included. The Carbon methodology modal shown to the user
  // states outright that "Natural gas combustion (Scope 1) is also included
  // where gas usage is reported" and that therms are multiplied by EPA's
  // 53.07 kg CO2 per MMBtu — and there was no therm term anywhere in this
  // function. On a 50,000-therm building that is 265 tCO2 simply missing,
  // enough to flip the carbon verdict from red to green.
  var GAS_KG_CO2_PER_THERM = 5.307;               // 53.07 kg/MMBtu x 0.1 MMBtu/therm
  var scope1CO2   = haveUsage ? (uTherms * GAS_KG_CO2_PER_THERM) : 0;
  var totalCO2    = (totalKWhEst * co2Factor) + scope1CO2;
  var co2PerSqft  = totalCO2 / sqft;
  var gridAvgCO2PerSqft = (medianEUI * ELECTRIC_SHARE_OF_SPEND / 3.412) * co2Factor;
  var carbonDelta = (co2PerSqft / Math.max(gridAvgCO2PerSqft, 0.01) - 1) * 100;
  var carbonColor;
  if (carbonDelta < -10) carbonColor = '#22c55e';
  else if (carbonDelta < 10) carbonColor = '#f59e0b';
  else carbonColor = '#ef4444';

  var nationalCount = window.PEER_NATIONAL[btype] || 10000;
  var stateShare    = window.PEER_STATE_SHARE[state] || 0.02;
  var peerCount     = Math.max(20, Math.round(nationalCount * stateShare));
  var rankPosition  = Math.round((percentile / 100) * peerCount);
  var topPercent    = Math.round(percentile);

  // Fails closed now — see beaconEssEligible. An unknown type gets no score
  // rather than an invented one.
  var essEligible = window.beaconEssEligible(btype);
  var essScore = null;
  if (essEligible) {
    essScore = Math.round(100 - percentile);
    essScore = Math.max(1, Math.min(100, essScore));
  }

  return {
    // Provenance, so a panel can say whether this came from meters or from
    // dollars rather than implying precision it does not have.
    energyBasis:        energyBasis,
    scope1TCO2:         Math.round((scope1CO2 / 1000) * 10) / 10,
    // 'city_zone' means the median was corrected to this building's own ASHRAE
    // zone; 'state' means the coarse state bucket. Don't claim zone precision
    // in copy unless this says city_zone.
    climateBasis:       _cl.basis,
    climateZone:        _cl.zone,
    climateAdj:         Math.round(_cl.adj * 1000) / 1000,
    state, btype, sqft, annualSpend,
    stateName: window.STATE_NAMES_BM[state] || state,
    btypeName: window.BTYPE_LABELS[btype] || btype,
    btypeSource: window.CBECS_SOURCE[btype] || 'CBECS 2018',
    actualEUI: Math.round(actualEUI),
    medianEUI: Math.round(medianEUI),
    bestInClassEUI: Math.round(bestInClassEUI),
    efficiencyTargetEUI: Math.round(efficiencyTargetEUI),
    percentile, euiVerdict, euiColor,
    costPerSqft: costPerSqft.toFixed(2),
    expectedCostPerSqft: expectedCostPerSqft.toFixed(2),
    costDelta: Math.round(costDelta),
    costVerdict, costColor,
    stateRate: stateRate.toFixed(4),
    stateRateCents: (stateRate*100).toFixed(2),
    totalSavings, savingsPct,
    savingsUncapped: savingsUncapped,
    savingsCapApplied: savingsCapApplied,
    procurementSavings: Math.round(procurementSavings),
    procurementBasis: procurementBasis,
    efficiencySavings: Math.round(efficiencySavings),
    efficiencyBasis: efficiencyBasis,
    co2PerSqft: co2PerSqft.toFixed(1),
    gridAvgCO2PerSqft: gridAvgCO2PerSqft.toFixed(1),
    carbonDelta: Math.round(carbonDelta),
    carbonColor,
    co2Factor: co2Factor.toFixed(3),
    peerCount, rankPosition, topPercent,
    essScore,
    essEligible,
    certifiable: essEligible && essScore !== null && essScore >= 75,
    pointsFromCert: essEligible && essScore !== null ? Math.max(0, 75 - essScore) : null,
    isDataCenter: btype === 'data_center',
    dcPUEMedian: window.DC_PUE_MEDIAN,
  };
};

window.fmtMoney = function (n) {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n);
};
