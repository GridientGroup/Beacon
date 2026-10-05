// =============================================================================
//  bps_jurisdictions.js — Building Performance Standards exposure
// =============================================================================
//  Tracks every US jurisdiction with an active Building Performance Standard
//  (BPS), the penalty regime, building-type-specific emission caps where
//  available, and computes portfolio-level dollar exposure given a portfolio
//  of accounts with sqft + electric/gas usage.
//
//  REVISED 2026-10-05 (bundle 118) — see "DATED RULES" below. Four penalty
//  regimes are handled; each jurisdiction also says WHEN its money starts
//  (firstYear / firstYearBySize) so the "current" column only carries amounts
//  that can actually be charged this year.
//
//  Original notes:
//  Three penalty regimes are handled:
//    'per-ton' — penalty in $/tCO₂e over the cap (NYC LL97, Boston BERDO,
//                Seattle BEPS, etc.). Requires cap data per building type
//                to calculate excess emissions.
//    'per-sqft' — penalty as $/sqft non-compliance fine (Denver, Boulder,
//                Washington Clean Buildings). Used as a worst-case maximum
//                exposure since these are typically capped fines, not pure
//                per-ton math.
//    'tbd'     — penalty schedule not yet quantified by the jurisdiction
//                (DC BEPS uses Alternative Compliance Payments that vary
//                widely). Exposure is flagged but not dollarized.
//
//  Sources cited inline per jurisdiction.
// =============================================================================

// ── BPS Jurisdiction catalogue ──────────────────────────────────────────────
window.BPS_JURISDICTIONS = [
  {
    key: 'NY:New York',
    city: 'New York',
    state: 'NY',
    ordinance: 'Local Law 97',
    ordinanceFull: 'NYC Local Law 97 of 2019',
    severity: 'high',
    threshold: 25000,           // sqft minimum for coverage
    currentPhaseLabel: 'Period 1 · 2024–2029',
    nextPhaseLabel: 'Period 2 · 40-50% tighter caps',
    nextDeadline: '2030-01-01',
    deadline: 'May 1 annual filing',
    penaltyType: 'per-ton',
    penaltyPerTon: 268,
    penaltyLabel: '$268/tCO₂e over cap, annually',
    // The "up to 70% offset via RECs" figure that used to sit here had no
    // published basis — NYC DOB's LL97 REC policy and REC FAQ state no
    // percentage. What the rules DO say is narrower, so the field is now a
    // description of the instrument, not a number (removed 2026-10-05).
    recRule: {
      instrument: 'Tier 4 RECs only (NYC-delivered renewable generation)',
      availability: 'First supply via CHPE (2026) and Clean Path NY (2027)',
      scope: 'Electricity emissions only — no offset for on-site gas',
      caveats: [
        'Generic/national RECs do not qualify.',
        'Buildings on the good-faith-efforts decarbonization plan may not use RECs in Period 1 (2024–2029).',
      ],
    },
    gasOffsetAllowed: false,    // RECs don't help with stationary gas
    // Period 1 (2024-2029) caps in kg CO2e per sqft, by building type
    // Period 2 (2030+) caps shown alongside
    caps: {
      office:           { p1: 8.46,  p2: 4.53 },
      healthcare:       { p1: 23.81, p2: 11.93 },
      hospital:         { p1: 23.81, p2: 11.93 },
      medical_office:   { p1: 11.93, p2: 4.96 },
      hospitality:      { p1: 9.87,  p2: 5.26 },
      retail:           { p1: 11.81, p2: 5.50 },
      warehouse:        { p1: 4.20,  p2: 1.10 },
      multifamily:      { p1: 6.75,  p2: 4.07 },
      laboratory:       { p1: 17.13, p2: 9.28 },
    },
    url: 'https://www.nyc.gov/site/buildings/codes/ll97-greenhouse-gas-emissions-reporting.page',
  },
  {
    key: 'MA:Boston',
    city: 'Boston',
    state: 'MA',
    ordinance: 'BERDO 2.0',
    ordinanceFull: 'Boston Emissions Reduction & Disclosure Ordinance 2.0',
    severity: 'high',
    threshold: 20000,
    currentPhaseLabel: 'Period 1 · 2025–2029',
    nextPhaseLabel: 'Period 2 · 2030–2039 caps',
    nextDeadline: '2030-01-01',
    deadline: 'May 15 annual filing',
    penaltyType: 'per-ton',
    penaltyPerTon: 234,
    // $234/t is Boston's Alternative Compliance Payment rate (paid into the
    // Equitable Emissions Investment Fund), not a fine — relabelled 2026-10-05.
    penaltyLabel: '$234/tCO₂e Alternative Compliance Payment over cap, annually',
    recRule: {
      instrument: 'Massachusetts Class I RECs or qualifying renewable PPAs',
      availability: 'Available now',
      scope: 'Electricity emissions only',
      caveats: [],
    },
    gasOffsetAllowed: false,
    // Boston BERDO 2.0 caps in kg CO2e per sqft (representative — full table at city.gov/berdo)
    caps: {
      office:           { p1: 5.34,  p2: 2.66 },
      healthcare:       { p1: 14.96, p2: 7.48 },
      hospital:         { p1: 14.96, p2: 7.48 },
      medical_office:   { p1: 7.40,  p2: 3.70 },
      hospitality:      { p1: 6.20,  p2: 3.10 },
      retail:           { p1: 7.43,  p2: 3.70 },
      warehouse:        { p1: 2.64,  p2: 0.70 },
      multifamily:      { p1: 4.24,  p2: 2.55 },
      laboratory:       { p1: 10.75, p2: 5.82 },
    },
    url: 'https://www.boston.gov/departments/environment/building-emissions-reduction-and-disclosure',
  },
  {
    key: 'DC:Washington',
    city: 'Washington',
    state: 'DC',
    ordinance: 'BEPS',
    ordinanceFull: 'DC Building Energy Performance Standards',
    severity: 'high',
    threshold: 50000,           // Cycle 1: privately owned ≥ 50,000 sqft
    // DATED RULE (2026-10-05). Cycle 1 runs 2021–2026 and ends Dec 31, 2026;
    // the FY2027 Budget Support Act moved Cycle 2 (and the 25–50k cohort) to
    // 2029 but did NOT delay Cycle 1. The alternative compliance penalty is a
    // MAXIMUM of $10 per sqft of gross floor area, capped at $7.5M per
    // building, reduced in proportion to progress toward the pathway target.
    // Beacon cannot see pathway progress, so this is the worst case and is
    // labelled as such. Sources: DOEE BEPS Compliance Guidebook (Aug 2021);
    // D.C. Code § 8-1772.21; Building Innovation Hub on the FY27 BSA.
    currentPhaseLabel: 'Cycle 1 · ends Dec 31, 2026',
    nextPhaseLabel: 'Cycle 2 · starts 2029',
    nextDeadline: '2029-01-01',
    deadline: 'April 1 annual benchmarking',
    penaltyType: 'max-fine',
    maxFinePerSqft: 10,
    maxFineFixed: 0,
    maxFineCap: 7500000,
    firstYear: 2026,
    penaltyLabel: 'Up to $10/sqft at end of cycle (max $7.5M per building), reduced for partial progress',
    caps: null,
    url: 'https://doee.dc.gov/service/building-energy-performance-standards-beps',
  },
  {
    key: 'CO:Denver',
    city: 'Denver',
    state: 'CO',
    ordinance: 'Energize Denver',
    ordinanceFull: 'Denver Building Performance Policy',
    severity: 'medium',
    threshold: 25000,
    currentPhaseLabel: '2024 baseline year',
    nextPhaseLabel: '2027 interim target',
    nextDeadline: '2027-01-01',
    deadline: 'June 1 annual filing',
    penaltyType: 'per-sqft',
    penaltyPerSqft: 0.50,       // Up to $0.50/sqft for non-compliance
    penaltyLabel: 'Up to $0.50/sqft/yr for non-compliance',
    caps: null,
    url: 'https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Climate-Action-Sustainability-Resiliency/High-Performance-Buildings-and-Homes/Energize-Denver-Hub',
  },
  {
    key: 'CO:Boulder',
    city: 'Boulder',
    state: 'CO',
    ordinance: 'Building Performance Ordinance',
    ordinanceFull: 'Boulder Building Performance Ordinance',
    severity: 'medium',
    threshold: 20000,
    currentPhaseLabel: '2025 baseline',
    nextPhaseLabel: '2030 first compliance target',
    nextDeadline: '2030-01-01',
    deadline: 'June 1',
    penaltyType: 'per-sqft',
    penaltyPerSqft: 0.10,
    penaltyLabel: '$0.10/sqft/yr for non-compliance',
    caps: null,
    url: 'https://bouldercolorado.gov/services/building-performance',
  },
  {
    key: 'WA:Seattle',
    city: 'Seattle',
    state: 'WA',
    ordinance: 'Building Emissions Performance Standard',
    ordinanceFull: 'Seattle BEPS',
    severity: 'medium',
    threshold: 20000,
    // These two were the wrong way round, verified against the City's own BEPS
    // Policy Guide (Jan 2026): 2027 is the first REPORTING deadline, 2031 the
    // first COMPLIANCE deadline. As written, Beacon told a Seattle owner they
    // had to comply four years before they do. Deadlines stagger by size —
    // >220,001 sqft reports 2027 / complies 2031; 20,001-30,000 sqft reports
    // 2030 / complies 2035 — so these labels describe the largest tier.
    currentPhaseLabel: '2027 first reporting deadline',
    nextPhaseLabel: '2031 first GHGI target compliance',
    nextDeadline: '2031-01-01',
    deadline: 'Annual',
    // DATED RULE (2026-10-05). Replaces an unsourced "$10/tCO2e" and an
    // empty cap table.
    //   Targets: GHGI targets for 2031–2035 by building activity type, in
    //     kgCO2e per sqft of gross floor area (Seattle OSE factsheet, Jan 2026).
    //   Emissions factors: Seattle's own, NOT eGRID. City Light electricity
    //     is 0.0029 kgCO2e/kBtu for 2031–2035 (= 0.009895 kg/kWh); PSE gas is
    //     0.053 kgCO2e/kBtu (= 5.3 kg/therm). Using the WA eGRID factor here
    //     would overstate electric emissions roughly 12x.
    //   Money: Alternative Compliance Payment of $190/tCO2e for 2031–2035
    //     (SMC 22.925.100, Ord. 126959): annual excess × 5 × $190, paid per
    //     5-year interval — shown here annualized as excess × $190.
    //     The alternative, a noncompliance penalty of $10/sqft per interval
    //     (nonresidential), is larger and is described in the label only.
    //   Timing: first target year depends on size (> 220k sqft 2031, then
    //     2032 / 2033 / 2034 / 2035 for 90k / 50k / 30k / 20k), so nothing is
    //     due today — it all lands in the future column.
    penaltyType: 'per-ton',
    penaltyPerTon: 190,
    penaltyLabel: '$190/tCO₂e Alternative Compliance Payment (2031–2035), else up to $10/sqft per interval',
    emissionFactors: { kgPerKwh: 0.0029 * 3.412, kgPerTherm: 5.3 },
    futureUses: 'p1',
    firstYearBySize: [[220000, 2031], [90000, 2032], [50000, 2033], [30000, 2034], [20000, 2035]],
    gasOffsetAllowed: false,
    caps: {
      office:                 { p1: 0.81 },
      warehouse:              { p1: 0.77 },
      refrigerated_warehouse: { p1: 0.98 },
      retail:                 { p1: 1.03 },
      supermarket:            { p1: 3.42 },
      medical_office:         { p1: 2.11 },
      k12:                    { p1: 0.95 },
      hospitality:            { p1: 2.06 },
      hospital:               { p1: 4.68 },
      restaurant:             { p1: 5.73 },
      data_center:            { p1: 1.43 },
      self_storage:           { p1: 0.31 },
      multifamily:            { p1: 0.89 },
      college:                { p1: 2.69 },
      laboratory:             { p1: 6.30 },
      senior_living:          { p1: 2.11 },
    },
    url: 'https://www.seattle.gov/environment/climate-change/buildings-and-energy/building-emissions-performance-standard',
  },
  {
    key: 'WA:_STATE',
    city: '',
    state: 'WA',
    ordinance: 'Clean Buildings Performance Standard',
    ordinanceFull: 'Washington State Clean Buildings (HB 1257)',
    severity: 'medium',
    threshold: 50000,
    // DATED RULE (2026-10-05). The old "$0.30/sqft/yr" matched nothing in the
    // rule. WAC 194-50-150: up to $5,000 plus $1 per sqft per year of
    // continuing violation, capped at 18 months of accrual — which Commerce
    // states as a maximum of $5,000 + $1.50/sqft. (The reduced rate for owners
    // with a mitigation plan is 30% of $5,000 + $0.20/sqft/yr.) Tier 1 dates by
    // size: > 220k sqft June 1 2026, 90–220k June 1 2027, 50–90k June 1 2028.
    currentPhaseLabel: 'Tier 1 · > 220k sqft due Jun 2026',
    nextPhaseLabel: 'Tier 1 · 90–220k Jun 2027, 50–90k Jun 2028',
    nextDeadline: '2027-06-01',
    deadline: 'Annual benchmarking',
    penaltyType: 'max-fine',
    maxFinePerSqft: 1.50,
    maxFineFixed: 5000,
    maxFineCap: 0,
    firstYearBySize: [[220000, 2026], [90000, 2027], [50000, 2028]],
    penaltyLabel: 'Up to $5,000 + $1/sqft per year, capped at 18 months ($5,000 + $1.50/sqft)',
    caps: null,
    statewide: true,            // Applies to whole state, not just one city
    url: 'https://www.commerce.wa.gov/growing-the-economy/energy/buildings/',
  },
  {
    key: 'MD:Montgomery',
    city: 'Montgomery',
    state: 'MD',
    ordinance: 'BEPS',
    ordinanceFull: 'Montgomery County Building Energy Performance Standards',
    severity: 'medium',
    threshold: 25000,
    currentPhaseLabel: '2024 baseline',
    nextPhaseLabel: '2027 first target',
    nextDeadline: '2027-01-01',
    deadline: 'Annual',
    penaltyType: 'tbd',
    penaltyLabel: 'Penalty schedule pending finalization',
    caps: null,
    url: 'https://www.montgomerycountymd.gov/dep/energy/index.html',
  },
  {
    key: 'MD:_STATE',
    city: '',
    state: 'MD',
    ordinance: 'BEPS',
    ordinanceFull: 'Maryland Building Energy Performance Standards (SB 528)',
    severity: 'medium',
    threshold: 35000,
    // DATED RULE (2026-10-05).
    //   Standards: net DIRECT emissions only — on-site fuel combustion; grid
    //     electricity is not counted (COMAR 26.28.01.02; MDE BEPS FAQ). 2030–2034
    //     standards in kgCO2e/sqft/yr by property type (COMAR 26.28.03.02).
    //   Gas factor: MD uses ENERGY STAR Portfolio Manager factors — natural gas
    //     53.11 kgCO2e/MMBtu = 5.311 kg/therm.
    //   Money: alternative compliance fee $230/tCO2e in 2030, +$4/yr, in 2020
    //     dollars, CPI-adjusted (COMAR 26.28.04.01). Chapter 844 of 2025 (HB 49)
    //     bars MDE from collecting fees or penalties until 2032, so the first
    //     collectible year is 2032 at $238/t (2020 $). Shown in 2020 dollars.
    //   Coverage: ≥ 35,000 sqft; Ch. 844 removed hospitals and buildings ≥ 50%
    //     manufacturing. K-12 schools and restaurants carry no standard.
    //   Not modelled: buildings in Montgomery County follow the county
    //     program instead; Beacon matches on state, so check those by hand.
    currentPhaseLabel: 'Benchmarking · standards from 2030',
    nextPhaseLabel: 'Fees collectible from 2032',
    nextDeadline: '2032-01-01',
    deadline: 'Annual benchmarking',
    penaltyType: 'per-ton',
    emissionsBasis: 'direct',
    penaltyPerTon: 238,
    penaltyLabel: 'Alternative compliance fee $230/tCO₂e (2020 $) +$4/yr, collectible from 2032',
    emissionFactors: { kgPerTherm: 5.311 },
    futureUses: 'p1',
    firstYear: 2032,
    excludeTypes: ['hospital', 'industrial', 'k12', 'restaurant', 'quick_service'],
    caps: {
      office:                 { p1: 0.22 },
      warehouse:              { p1: 0.09 },
      refrigerated_warehouse: { p1: 1.37 },
      distribution_center:    { p1: 0.58 },
      retail:                 { p1: 0.60 },
      supermarket:            { p1: 2.25 },
      medical_office:         { p1: 0.18 },
      hospitality:            { p1: 1.47 },
      multifamily:            { p1: 0.82 },
      data_center:            { p1: 1.26 },
      self_storage:           { p1: 0.19 },
      senior_living:          { p1: 1.43 },
      financial_office:       { p1: 0.32 },
      bank_branch:            { p1: 1.01 },
    },
    statewide: true,
    url: 'https://mde.maryland.gov/programs/air/ClimateChange/Pages/Building-Energy-Performance-Standards.aspx',
  },
  {
    key: 'OR:_STATE',
    city: '',
    state: 'OR',
    ordinance: 'Climate-Friendly Buildings',
    ordinanceFull: 'Oregon Climate-Friendly Buildings (SB 1518)',
    severity: 'low',
    threshold: 35000,
    // 2026-10-05: ODOE fact sheet BPS 010 sets Tier 1 penalties at up to
    // $5,000 + $1/sqft per year of continuing violation, but publishes no cap
    // on how long that can run, so there is no maximum to show. Left
    // undollarized on purpose and labelled with what IS known.
    currentPhaseLabel: 'Tier 1 · ≥ 200k sqft due Jun 2028',
    nextPhaseLabel: '90–200k Jun 2029 · 35–90k Jun 2030',
    nextDeadline: '2028-06-01',
    deadline: 'Annual',
    penaltyType: 'tbd',
    penaltyLabel: 'Up to $5,000 + $1/sqft per year of violation (Tier 1, from 2028) — no maximum published',
    caps: null,
    statewide: true,
    url: 'https://www.oregon.gov/energy/policy/Pages/index.aspx',
  },
];

// ── BPS Exposure Computation ────────────────────────────────────────────────
// Given a portfolio of accounts (with city, state, sqft, type, usage) and a
// btype string, computes per-jurisdiction dollar exposure.
//
// For NYC LL97 and Boston BERDO (which have building-type-specific caps),
// computes the exact penalty as:
//
//     actual_tCO2e   = (electric_kWh × eGRID_factor + gas_therms × 5.31) / 1000
//     cap_tCO2e      = cap_kg_per_sqft × sqft / 1000
//     excess         = max(0, actual − cap)
//     penalty $/yr   = excess × $/tCO2e
//
// For per-sqft jurisdictions (Denver, Boulder, WA Clean Buildings):
//   "Maximum exposure" = sqft_in_scope × $/sqft
//   (this is the worst case if the building is found non-compliant)
//
// For 'tbd' jurisdictions: marks coverage but doesn't dollarize.
//
// Returns:
//   {
//     totalCurrentExposure,     // sum $ exposure across all jurisdictions, current phase
//     totalFutureExposure,      // sum $ exposure under P2 caps (NYC + Boston)
//     totalSitesInScope,        // distinct addresses across all jurisdictions
//     totalSqftInScope,         // sum sqft across all in-scope locations
//     byJurisdiction: [{
//       jurisdiction,           // full jurisdiction object
//       sites,                  // count of in-scope locations
//       sqft,                   // sum of in-scope sqft
//       currentExposure,        // $/yr current phase
//       futureExposure,         // $/yr 2030+ phase (where data permits)
//       currentExcessTonnes,    // tCO2 over cap, current phase
//       futureExcessTonnes,     // tCO2 over cap, 2030+
//       penaltyType,            // 'per-ton' | 'per-sqft' | 'tbd'
//       computable,             // true if we can dollarize
//       gasShareWarning,        // true if portfolio uses gas in a no-gas-offset jurisdiction
//       locations: [...],       // per-location detail
//     }]
//   }
window.computeBpsExposure = function (accounts, btype, opts) {
  accounts = Array.isArray(accounts) ? accounts : [];
  btype = String(btype || 'office').toLowerCase();
  opts = opts || {};
  // The year "current" means. A jurisdiction whose money starts later than
  // this lands in the future column only.
  var THIS_YEAR = Number(opts.asOfYear) || new Date().getFullYear();

  var BTYPE_TO_CAP_KEY = {
    healthcare: 'healthcare',
    hospital: 'hospital',
    senior_care: 'healthcare',
    medical_office: 'medical_office',
    office: 'office',
    hospitality: 'hospitality',
    retail: 'retail',
    warehouse: 'warehouse',
    refrigerated_warehouse: 'warehouse',
    multifamily: 'multifamily',
    laboratory: 'laboratory',
    quick_service: 'retail',
    restaurant: 'retail',
    supermarket: 'retail',
    // Aliases added 2026-09-17. A btype with no cap key dollarized to $0 while
    // still being counted in scope, so the site count and the dollar figure
    // described different portfolios. `supermarket` mapped but `grocery` did
    // not — an alias gap, not a cap gap.
    retail_store: 'retail',
    grocery: 'retail',
    grocery_store: 'retail',
    supermarket_grocery_store: 'retail',
    convenience_store: 'retail',
    warehouse_non_refrigerated: 'warehouse',
    warehouse_refrigerated: 'warehouse',
    distribution_center: 'warehouse',
    hotel: 'hospitality',
    apartment: 'multifamily',
    residential: 'multifamily',
    clinic: 'medical_office',
    urgent_care: 'medical_office',
    senior_living: 'healthcare',
    lab: 'laboratory',
    // EPA display labels normalize to snake_case before lookup, so map those
    // forms onto the same key their slug uses. Without this, 'K-12 School'
    // became 'k_12_school' and 'k12' stayed 'k12' — two spellings of one
    // building type taking two different paths through the cap table.
    k_12_school: 'k12',
    college_university: 'college',
    university: 'college',
    hospital_general_medical_surgical: 'hospital',
    self_storage_facility: 'self_storage',
    quick_service_restaurant: 'retail',
    full_service_restaurant: 'retail',
    multifamily_housing: 'multifamily',
    financial_office: 'office',
    bank_branch: 'office',
    data_center: 'data_center',
  };
  // The only building-type vocabulary in the database is the ENERGY STAR
  // display-label set ("Warehouse (Non-Refrigerated)", "Supermarket/Grocery
  // Store", "K-12 School"). This function only lower-cased btype, so of those
  // labels only "Office" resolved to a cap — every other one fell through to
  // $0. Normalizing to snake_case first is a no-op for callers already passing
  // slugs and cheap insurance against a label ever reaching here.
  function _btypeKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // ── FINE KEYS (2026-10-05) ─────────────────────────────────────────────
  // BTYPE_TO_CAP_KEY above was written for NYC's nine-row cap table, so it
  // folds refrigerated warehouses into warehouse, grocery into retail and so
  // on. Seattle and Maryland publish separate targets for those types, so a
  // building resolves to a FINE key first and only falls back to the coarse
  // key when a jurisdiction has no row for it. For NYC and Boston every fine
  // key either equals the coarse key or is absent from their tables, so their
  // results are unchanged.
  var FINE_KEY = {
    supermarket: 'supermarket', grocery: 'supermarket', grocery_store: 'supermarket',
    supermarket_grocery_store: 'supermarket',
    refrigerated_warehouse: 'refrigerated_warehouse', warehouse_refrigerated: 'refrigerated_warehouse',
    distribution_center: 'distribution_center',
    restaurant: 'restaurant', quick_service: 'quick_service',
    quick_service_restaurant: 'quick_service', full_service_restaurant: 'restaurant',
    fast_food_restaurant: 'quick_service', food_service: 'restaurant',
    k12: 'k12', k_12_school: 'k12',
    data_center: 'data_center',
    self_storage: 'self_storage', self_storage_facility: 'self_storage',
    senior_living: 'senior_living', senior_care: 'senior_living', senior_living_community: 'senior_living',
    college: 'college', college_university: 'college', university: 'college',
    financial_office: 'financial_office', bank_branch: 'bank_branch',
    industrial: 'industrial', manufacturing: 'industrial',
    manufacturing_industrial_plant: 'industrial',
    hospital: 'hospital', hospital_general_medical_surgical: 'hospital',
    laboratory: 'laboratory', lab: 'laboratory',
  };
  function _btypeKey(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
  function resolveType(raw) {
    var lc = String(raw || '').toLowerCase();
    var k = _btypeKey(raw);
    // Prefer the app's single normalizer when it is loaded (benchmarks.js),
    // so a label resolves the same way here as on every other screen.
    var slug = '';
    if (typeof window.beaconNormalizeBtype === 'function') {
      try { slug = _btypeKey(window.beaconNormalizeBtype(raw) || ''); } catch (e) { slug = ''; }
    }
    // 'Warehouse (Non-Refrigerated)' strips its parenthesis to 'warehouse',
    // but 'Warehouse (Refrigerated)' must not — read the parenthesis first.
    if (/refrigerated\)/.test(lc) && !/non-refrigerated/.test(lc)) k = 'refrigerated_warehouse';
    var coarse = BTYPE_TO_CAP_KEY[lc] || BTYPE_TO_CAP_KEY[k] || BTYPE_TO_CAP_KEY[slug] || k || lc;
    var fine = FINE_KEY[k] || FINE_KEY[slug] || FINE_KEY[lc] || coarse;
    return { coarse: coarse, fine: fine };
  }
  var portfolioType = resolveType(btype);
  var capKey = portfolioType.coarse;

  // Helper: normalize for case-insensitive city matching
  function _norm(s) { return String(s || '').toLowerCase().trim(); }

  // Meter fuel. Uses the app's one classifier when present so "Natural Gas"
  // and "Electricity" are counted here exactly as on every other screen.
  function _fuel(a) {
    if (typeof window.beaconMeterKind === 'function') return window.beaconMeterKind(a);
    var t = String(a.type || '').toLowerCase();
    return t === 'electric' ? 'electric' : t === 'gas' ? 'gas' : 'other';
  }

  // For each jurisdiction, find matching locations (grouped by physical address)
  function findMatches(j) {
    var byAddr = {};
    accounts.forEach(function (a) {
      if (!a) return;
      var st = _norm(a.state);
      if (st !== _norm(j.state)) return;
      if (!j.statewide) {
        if (_norm(a.city).indexOf(_norm(j.city)) < 0) return;
      }
      var addrKey = _norm(a.address) || ('__noaddr_' + (a.id || Math.random()));
      if (!byAddr[addrKey]) {
        byAddr[addrKey] = {
          address: a.address || '',
          city: a.city || '',
          state: a.state || '',
          sqft: 0, electricKwh: 0, gasTherms: 0,
          propertyType: '',
        };
      }
      var g = byAddr[addrKey];
      var sf = Number(a.sqft) || 0;
      if (sf > 0 && sf > g.sqft) g.sqft = sf;
      // Per-building type (2026-10-05): each meter row can carry the
      // building's ENERGY STAR property type. When it does, the building is
      // judged against ITS OWN type's cap rather than one portfolio-wide type.
      var pt = a.property_type || a.propertyType || '';
      if (pt && !g.propertyType) g.propertyType = String(pt);
      var kind = _fuel(a);
      var u = Number(a.usage != null ? a.usage : a.annualUsage) || 0;
      if (kind === 'electric') g.electricKwh += u;
      else if (kind === 'gas') g.gasTherms += u;
    });
    return Object.keys(byAddr).map(function (k) { return byAddr[k]; })
                              .filter(function (g) { return g.sqft >= j.threshold; });
  }

  // First year a building's money can be charged.
  function firstYearFor(j, sqft) {
    if (Array.isArray(j.firstYearBySize)) {
      for (var i = 0; i < j.firstYearBySize.length; i++) {
        if (sqft > j.firstYearBySize[i][0]) return j.firstYearBySize[i][1];
      }
      return j.firstYearBySize[j.firstYearBySize.length - 1][1];
    }
    return j.firstYear || null;
  }

  var totalCurrentExposure = 0, totalFutureExposure = 0;
  // Split by KIND of number (2026-10-05). A computed per-ton excess and a
  // statutory maximum fine are different things; the headline sums them but
  // the sub-line has to be able to say how much of the sum is which.
  var totalCurrentComputed = 0, totalCurrentMaxFine = 0;
  var totalFutureComputed  = 0, totalFutureMaxFine  = 0;

  // Building ledger, resolved after the loop (see the 2026-09-17 notes in
  // git history): one physical building counts once across overlapping
  // ordinances, and is "priced" if ANY jurisdiction dollarized it.
  var buildingLedger = {};
  function noteBuilding(l, dollarized) {
    var bkey = _norm(l.address) + '|' + _norm(l.city) + '|' + _norm(l.state);
    if (!buildingLedger[bkey]) {
      buildingLedger[bkey] = { sqft: Number(l.sqft) || 0, dollarized: false };
    }
    if (dollarized) buildingLedger[bkey].dollarized = true;
  }
  var byJurisdiction = [];

  window.BPS_JURISDICTIONS.forEach(function (j) {
    var matches = findMatches(j);

    // Resolve each building's type, then drop the ones this jurisdiction
    // does not cover at all (e.g. Maryland excludes hospitals and plants).
    matches.forEach(function (l) {
      var t = l.propertyType ? resolveType(l.propertyType) : portfolioType;
      l.capKey = t.coarse; l.fineKey = t.fine;
      l.typeSource = l.propertyType ? 'building' : 'portfolio';
    });
    if (Array.isArray(j.excludeTypes) && j.excludeTypes.length) {
      matches = matches.filter(function (l) {
        return j.excludeTypes.indexOf(l.fineKey) < 0 && j.excludeTypes.indexOf(l.capKey) < 0;
      });
    }
    if (matches.length === 0) return;

    var co2Factor = (j.emissionFactors && j.emissionFactors.kgPerKwh != null)
      ? j.emissionFactors.kgPerKwh
      : ((window.EGRID_KG_PER_KWH && window.EGRID_KG_PER_KWH[j.state]) || 0.348);
    var gasFactor = (j.emissionFactors && j.emissionFactors.kgPerTherm != null)
      ? j.emissionFactors.kgPerTherm : 5.31;
    var directOnly = j.emissionsBasis === 'direct';

    var sites = matches.length;
    var sqft  = matches.reduce(function (s, l) { return s + l.sqft; }, 0);
    var currentExposure = 0, futureExposure = 0;
    var currentExcessTonnes = 0, futureExcessTonnes = 0;
    var anyGas = matches.some(function (l) { return l.gasTherms > 0; });
    var lineItems = [];
    var nDollarized = 0;
    var reasons = {};
    var amountKind = (j.penaltyType === 'per-ton') ? 'computed'
                   : (j.penaltyType === 'tbd') ? 'none' : 'max-fine';
    var minFirstYear = null;

    // notComputableReason values (unchanged meaning from 2026-09-17):
    //   'no-cap-table' / 'no-cap-for-btype' / 'no-penalty-rate' /
    //   'no-penalty-schedule'. Now decided per BUILDING, because with
    //   per-building types one building can have a cap while its neighbour
    //   does not. The jurisdiction is computable if any building is.
    matches.forEach(function (l) {
      var fy = firstYearFor(j, l.sqft);
      if (fy != null && (minFirstYear == null || fy < minFirstYear)) minFirstYear = fy;
      var due = (fy == null) || fy <= THIS_YEAR;
      var tonnes = ((directOnly ? 0 : l.electricKwh * co2Factor) + l.gasTherms * gasFactor) / 1000;
      var eui = l.sqft > 0 ? Math.round((l.electricKwh * 3.412 + l.gasTherms * 100) / l.sqft) : 0;
      var li = {
        address: l.address, city: l.city, sqft: l.sqft,
        propertyType: l.propertyType || '', typeSource: l.typeSource,
        actualEui: eui, actualTonnes: Math.round(tonnes),
        targetTonnes: null, gapTonnes: null,
        currentDollars: 0, futureDollars: 0,
        basis: directOnly ? 'cap-direct' : 'cap',
        firstYear: fy, dueNow: due, dollarized: false, reason: '',
      };

      if (j.penaltyType === 'per-ton') {
        var caps = j.caps ? (j.caps[l.fineKey] || j.caps[l.capKey]) : null;
        if (!j.caps)              li.reason = 'no-cap-table';
        else if (!caps)           li.reason = 'no-cap-for-btype';
        else if (!j.penaltyPerTon) li.reason = 'no-penalty-rate';
        if (!li.reason) {
          var capP1_t = (caps.p1 * l.sqft) / 1000;
          var useP2 = j.futureUses !== 'p1' && caps.p2 != null;
          var capF_t  = useP2 ? (caps.p2 * l.sqft) / 1000 : capP1_t;
          var excessP1 = Math.max(0, tonnes - capP1_t);
          var excessF  = Math.max(0, tonnes - capF_t);
          var cur = due ? excessP1 * j.penaltyPerTon : 0;
          var fut = excessF * j.penaltyPerTon;
          if (due) currentExcessTonnes += excessP1;
          futureExcessTonnes  += excessF;
          currentExposure += cur;
          futureExposure  += fut;
          li.targetTonnes = Math.round(capP1_t);
          li.gapTonnes = Math.round(tonnes - capP1_t);
          li.currentDollars = Math.round(cur);
          li.futureDollars = Math.round(fut);
          li.dollarized = true;
        }
      } else if (j.penaltyType === 'per-sqft' && j.penaltyPerSqft) {
        // Worst-case maximum exposure = sqft × $/sqft (annual).
        var f1 = l.sqft * j.penaltyPerSqft;
        currentExposure += f1; futureExposure += f1;
        li.basis = 'sqft'; li.currentDollars = Math.round(f1); li.futureDollars = Math.round(f1);
        li.dollarized = true;
      } else if (j.penaltyType === 'max-fine' && (j.maxFinePerSqft || j.maxFineFixed)) {
        // Statutory maximum for one compliance event — not an annual figure.
        var fine = (j.maxFineFixed || 0) + (j.maxFinePerSqft || 0) * l.sqft;
        if (j.maxFineCap) fine = Math.min(fine, j.maxFineCap);
        var c2 = due ? fine : 0;
        currentExposure += c2; futureExposure += fine;
        li.basis = 'sqft'; li.currentDollars = Math.round(c2); li.futureDollars = Math.round(fine);
        li.dollarized = true;
      } else {
        li.reason = 'no-penalty-schedule';
      }

      if (li.dollarized) nDollarized += 1;
      else reasons[li.reason] = (reasons[li.reason] || 0) + 1;
      noteBuilding(l, li.dollarized);
      lineItems.push(li);
    });

    var computable = nDollarized > 0;
    // Most common reason among the buildings that could not be priced.
    var notComputableReason = '';
    if (!computable) {
      notComputableReason = Object.keys(reasons).sort(function (a, b) { return reasons[b] - reasons[a]; })[0] || 'no-penalty-schedule';
    }
    if (!computable) { currentExposure = 0; futureExposure = 0; }

    totalCurrentExposure += currentExposure;
    totalFutureExposure  += futureExposure;
    if (amountKind === 'computed') { totalCurrentComputed += currentExposure; totalFutureComputed += futureExposure; }
    else { totalCurrentMaxFine += currentExposure; totalFutureMaxFine += futureExposure; }

    byJurisdiction.push({
      jurisdiction:          j,
      sites:                 sites,
      sqft:                  sqft,
      currentExposure:       Math.round(currentExposure),
      futureExposure:        Math.round(futureExposure),
      currentExcessTonnes:   Math.round(currentExcessTonnes),
      futureExcessTonnes:    Math.round(futureExcessTonnes),
      penaltyType:           j.penaltyType,
      amountKind:            amountKind,          // 'computed' | 'max-fine'
      computable:            computable,
      notComputableReason:   notComputableReason,
      sitesPriced:           nDollarized,
      sitesNotPriced:        sites - nDollarized,
      firstYear:             minFirstYear,         // earliest year money is due
      dueNow:                minFirstYear == null || minFirstYear <= THIS_YEAR,
      gasShareWarning:       anyGas && j.gasOffsetAllowed === false,
      locations:             matches,
      lineItems:             lineItems,
    });
  });

  byJurisdiction.sort(function (a, b) {
    if (b.currentExposure !== a.currentExposure) return b.currentExposure - a.currentExposure;
    if (b.futureExposure  !== a.futureExposure)  return b.futureExposure  - a.futureExposure;
    return b.sites - a.sites;
  });

  var totalSitesInScope = 0, totalSqftInScope = 0;
  var sitesNotDollarized = 0, sqftNotDollarized = 0;
  Object.keys(buildingLedger).forEach(function (k) {
    var b = buildingLedger[k];
    totalSitesInScope += 1;
    totalSqftInScope  += b.sqft;
    if (!b.dollarized) { sitesNotDollarized += 1; sqftNotDollarized += b.sqft; }
  });

  return {
    totalCurrentExposure: Math.round(totalCurrentExposure),
    totalFutureExposure:  Math.round(totalFutureExposure),
    totalCurrentComputed: Math.round(totalCurrentComputed),
    totalCurrentMaxFine:  Math.round(totalCurrentMaxFine),
    totalFutureComputed:  Math.round(totalFutureComputed),
    totalFutureMaxFine:   Math.round(totalFutureMaxFine),
    totalSitesInScope:    totalSitesInScope,
    totalSqftInScope:     totalSqftInScope,
    sitesNotDollarized:   sitesNotDollarized,
    sqftNotDollarized:    sqftNotDollarized,
    exposureIsPartial:    sitesNotDollarized > 0,
    asOfYear:             THIS_YEAR,
    byJurisdiction:       byJurisdiction,
    btype:                btype,
    capKey:               capKey,
  };
};
