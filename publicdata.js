/* ============================================================================
 * publicdata.js — Public building energy disclosure lookup (bundle 124)
 * ----------------------------------------------------------------------------
 * Finds a building in a city's published benchmarking disclosure so the
 * pre-engagement report can run without the prospect's bills. The broker
 * picks the matching building from a short list; nothing is matched
 * silently.
 *
 *   window.BeaconPublicData.sourceFor(state, city)  -> source | null
 *   window.BeaconPublicData.search(src, address)    -> Promise<[record]>
 *
 * Sources (add more as entries in SOURCES). Each was checked against live
 * rows on 2026-10-05 for field names and units:
 *   Chicago Energy Benchmarking — data.cityofchicago.org xq83-jr8c.
 *     electricity_use_kbtu kBtu (÷3.412 = kWh), natural_gas_use_kbtu kBtu
 *     (÷100 = therms), district_steam_use_kbtu, all_other_fuel_use_kbtu,
 *     site_eui_kbtu_sq_ft, gross_floor_area_buildings_sq_ft, data_year.
 *   Seattle Building Energy Benchmarking — data.seattle.gov teqw-tu6e.
 *     electricity_kwh kWh, naturalgas_therms therms, steamuse_kbtu,
 *     siteeui_kbtu_sf, energystarscore, propertygfabuildings (excl. parking),
 *     datayear.
 *   DC Building Energy Benchmarks — DC GIS ArcGIS FeatureServer
 *     Environment_Energy_WebMercator/45 (multi-year, REPORTINGYEAR).
 *     ELECTRICITYUSE_GRID_KWH kWh, NATURALGASUSE_THERMS therms,
 *     DISTRSTEAM_KBTU, FUELOILANDDIESELFUELUSEKBTU, SITEEUI_KBTU_FT,
 *     ENERGYSTARSCORE, REPORTEDBUILDINGGROSSFLOORAREA ft², ADDRESSOFRECORD.
 *   Philadelphia Large Building Energy Benchmarking 2024 — ArcGIS
 *     properties_reported_2024. electric_use_kbtu kBtu (÷3.412),
 *     natural_gas_use_kbtu (÷100), steam_use_kbtu, fuel_oil_02_use_kbtu,
 *     site_eui_kbtuft2, energy_star_score, total_floor_area_bld_pk_ft2 (often
 *     blank: then floor area = reported site energy ÷ site EUI, labelled).
 *   Not added: Boston BERDO (its portal blocks automated reads, so the field
 *   units could not be checked) and Denver (queryable data stops at 2021).
 * The NYC source:
 *   NYC Local Law 84 — NYC Open Data dataset 5zyy-y8am, "NYC Building Energy
 *   and Water Data Disclosure for Local Law 84 2023 to Present (Data for
 *   Calendar Year 2022-Present)". Read in the browser through the public
 *   SODA API (no key). Field units, checked against live rows 2026-10-05:
 *     electricity_use_grid_purchase_1   kWh   (…_purchase is the same in kBtu)
 *     natural_gas_use_kbtu              kBtu  (÷100 = therms)
 *     district_steam_use_kbtu, fuel_oil_*_use_kbtu, …   kBtu
 *     site_eui_kbtu_ft                  kBtu/ft²
 *     total_location_based_ghg          metric tCO2e
 *     property_gfa_self_reported        ft²
 *   "Not Available" is read as missing, never as zero.
 * ========================================================================== */
(function () {
  'use strict';

  var SOURCES = [{
    key: 'nyc_ll84',
    label: 'NYC Local Law 84 benchmarking disclosure',
    short: 'NYC LL84',
    state: 'NY',
    cities: /^(new york|new york city|nyc|manhattan|brooklyn|bronx|the bronx|queens|staten island|long island city|flushing|astoria|jamaica)$/i,
    api: 'https://data.cityofnewyork.us/resource/5zyy-y8am.json',
    page: 'https://data.cityofnewyork.us/d/5zyy-y8am',
    addr: 'address_1', year: 'report_year',
    note: 'Buildings under 25,000 sq ft are not required to report.',
    map: mapNyc
  }, {
    key: 'chicago_bench',
    label: 'Chicago Energy Benchmarking disclosure',
    short: 'Chicago benchmarking',
    state: 'IL',
    cities: /^chicago$/i,
    api: 'https://data.cityofchicago.org/resource/xq83-jr8c.json',
    page: 'https://data.cityofchicago.org/d/xq83-jr8c',
    addr: 'address', year: 'data_year',
    note: 'Buildings under 50,000 sq ft are not required to report.',
    map: mapChicago
  }, {
    key: 'seattle_bench',
    label: 'Seattle Building Energy Benchmarking disclosure',
    short: 'Seattle benchmarking',
    state: 'WA',
    cities: /^seattle$/i,
    api: 'https://data.seattle.gov/resource/teqw-tu6e.json',
    page: 'https://data.seattle.gov/d/teqw-tu6e',
    addr: 'address', year: 'datayear',
    note: 'Nonresidential and multifamily buildings under 20,000 sq ft are not required to report.',
    map: mapSeattle
  }];
  SOURCES.push({
    key: 'dc_bench', kind: 'arcgis',
    label: 'DC Building Energy Benchmarking disclosure', short: 'DC benchmarking',
    state: 'DC', cities: /^(washington|washington dc|washington, dc|dc|district of columbia)$/i,
    api: 'https://maps2.dcgis.dc.gov/DCGIS/rest/services/DCGIS_DATA/Environment_Energy_WebMercator/FeatureServer/45/query',
    page: 'https://opendata.dc.gov/content/dde606b4546341cd9c0e3087a8b476e6',
    addr: ['ADDRESSOFRECORD', 'REPORTEDADDRESS'], year: 'REPORTINGYEAR',
    note: 'Private buildings under 25,000 sq ft are not required to report.',
    map: mapDc
  }, {
    key: 'phl_bench', kind: 'arcgis',
    label: 'Philadelphia Large Building Energy Benchmarking disclosure', short: 'Philadelphia benchmarking',
    state: 'PA', cities: /^(philadelphia|philly)$/i,
    api: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/properties_reported_2024/FeatureServer/0/query',
    page: 'https://opendataphilly.org/datasets/large-building-energy-benchmarking-data/',
    addr: ['street_address'], year: 'data_year',
    note: 'Buildings under 50,000 sq ft are not required to report. Reporting year 2024.',
    map: mapPhl
  });
  var COVERAGE = 'New York City, Chicago, Seattle, Washington DC and Philadelphia';

  // Primary property type (ENERGY STAR names) → Beacon building type.
  var TYPE = {
    'office': 'office', 'financial office': 'office', 'multifamily housing': 'multifamily', 'hotel': 'hospitality',
    'retail store': 'retail', 'strip mall': 'retail', 'enclosed mall': 'retail', 'medical office': 'healthcare',
    'hospital (general medical & surgical)': 'hospital', 'other/specialty hospital': 'hospital', 'outpatient rehabilitation/physical therapy': 'healthcare', 'urgent care/clinic/other outpatient': 'healthcare', 'residence hall/dormitory': 'multifamily', 'wholesale club/supercenter': 'retail', 'senior living community': 'senior_care', 'senior care community': 'senior_care',
    'k-12 school': 'k12', 'college/university': 'college', 'supermarket/grocery store': 'supermarket',
    'non-refrigerated warehouse': 'warehouse', 'distribution center': 'warehouse', 'refrigerated warehouse': 'refrigerated_warehouse',
    'self-storage facility': 'self_storage', 'data center': 'data_center', 'laboratory': 'laboratory', 'bank branch': 'bank',
    'manufacturing/industrial plant': 'industrial', 'restaurant': 'restaurant', 'fast food restaurant': 'quick_service',
    'convenience store without gas station': 'convenience_store', 'convenience store with gas station': 'convenience_store'
  };

  function n(v) { if (v == null) return null; var x = Number(String(v).replace(/,/g, '')); return isFinite(x) ? x : null; }
  function sum(row, keys) {
    var t = 0, any = false;
    keys.forEach(function (k) { var v = n(row[k]); if (v != null) { t += v; any = true; } });
    return any ? t : null;
  }
  function mapNyc(r) {
    var type = r.primary_property_type_self && r.primary_property_type_self !== 'Not Available' ? r.primary_property_type_self
      : (r.largest_property_use_type && r.largest_property_use_type !== 'Not Available' ? r.largest_property_use_type : '');
    var gasKbtu = n(r.natural_gas_use_kbtu);
    return {
      source: 'nyc_ll84', year: n(r.report_year), propertyId: r.property_id || '', name: r.property_name || '',
      address: r.address_1 || '', zip: r.postal_code || '', borough: r.borough || r.city || '', bbl: String(r.nyc_borough_block_and_lot || '').replace(/-/g, ''),
      type: type, btype: TYPE[String(type).toLowerCase()] || null,
      sqft: n(r.property_gfa_self_reported) || n(r.property_gfa_calculated_2),
      siteEui: n(r.site_eui_kbtu_ft), wnEui: n(r.weather_normalized_site_eui), essScore: n(r.energy_star_score),
      kwh: n(r.electricity_use_grid_purchase_1),
      therms: gasKbtu != null ? gasKbtu / 100 : null,
      steamKbtu: n(r.district_steam_use_kbtu),
      oilKbtu: sum(r, ['fuel_oil_1_use_kbtu', 'fuel_oil_2_use_kbtu', 'fuel_oil_4_use_kbtu', 'fuel_oil_5_6_use_kbtu', 'diesel_2_use_kbtu', 'kerosene_use_kbtu', 'propane_use_kbtu']),
      ghgT: n(r.total_location_based_ghg),
      utility: r.electric_distribution_utility && r.electric_distribution_utility !== 'Not Available' ? r.electric_distribution_utility : ''
    };
  }

  function na(v) { return v == null || v === 'Not Available' || v === 'NA' ? null : v; }
  function mapChicago(r) {
    var type = na(r.primary_property_type) || '';
    var e = n(r.electricity_use_kbtu), g = n(r.natural_gas_use_kbtu);
    return {
      source: 'chicago_bench', year: n(r.data_year), propertyId: r.id || '', name: r.property_name || '',
      address: r.address || '', zip: r.zip_code || '', borough: r.community_area || '', bbl: '',
      type: type, btype: TYPE[String(type).toLowerCase()] || null,
      sqft: n(r.gross_floor_area_buildings_sq_ft),
      siteEui: n(r.site_eui_kbtu_sq_ft), wnEui: n(r.weather_normalized_site_eui_kbtu_sq_ft), essScore: n(r.energy_star_score),
      kwh: e != null ? e / 3.412 : null, therms: g != null ? g / 100 : null,
      steamKbtu: n(r.district_steam_use_kbtu), oilKbtu: n(r.all_other_fuel_use_kbtu),
      ghgT: n(r.total_ghg_emissions_metric_tons_co2e), utility: ''
    };
  }
  function mapSeattle(r) {
    var type = na(r.epapropertytype) || na(r.largestpropertyusetype) || '';
    return {
      source: 'seattle_bench', year: n(r.datayear), propertyId: r.osebuildingid || '', name: r.buildingname || '',
      address: r.address || '', zip: r.zipcode || '', borough: r.neighborhood || '', bbl: '',
      type: type, btype: TYPE[String(type).toLowerCase()] || null,
      sqft: n(r.propertygfabuildings) || n(r.propertygfatotal),
      siteEui: n(r.siteeui_kbtu_sf), wnEui: n(r.siteeuiwn_kbtu_sf), essScore: n(r.energystarscore),
      kwh: n(r.electricity_kwh), therms: n(r.naturalgas_therms),
      steamKbtu: n(r.steamuse_kbtu), oilKbtu: null,
      ghgT: n(r.totalghgemissions), utility: ''
    };
  }

  function mapDc(r) {
    var type = na(r.PRIMARYPROPERTYTYPE_SELFSELECT) || na(r.PRIMARYPROPERTYTYPE_EPACALC) || '';
    return {
      source: 'dc_bench', year: n(r.REPORTINGYEAR), propertyId: r.PMPROPERTYID || '', name: r.PROPERTYNAME || '',
      address: r.ADDRESSOFRECORD || r.REPORTEDADDRESS || '', zip: r.POSTALCODE || '', borough: r.WARD ? 'Ward ' + r.WARD : '', bbl: r.SSL || '',
      type: type, btype: TYPE[String(type).toLowerCase()] || null,
      sqft: n(r.REPORTEDBUILDINGGROSSFLOORAREA) || n(r.TAXRECORDFLOORAREA),
      siteEui: n(r.SITEEUI_KBTU_FT), wnEui: n(r.WEATHERNORMALZEDSITEEUI_KBTUFT), essScore: n(r.ENERGYSTARSCORE),
      kwh: n(r.ELECTRICITYUSE_GRID_KWH), therms: n(r.NATURALGASUSE_THERMS),
      steamKbtu: n(r.DISTRSTEAM_KBTU), oilKbtu: n(r.FUELOILANDDIESELFUELUSEKBTU),
      ghgT: n(r.TOTGHGEMISSIONS_METRICTONSCO2E), utility: '', status: r.REPORTSTATUS || ''
    };
  }
  function mapPhl(r) {
    var type = na(r.primary_prop_type_epa_calc) || '';
    var e = n(r.electric_use_kbtu), g = n(r.natural_gas_use_kbtu), st = n(r.steam_use_kbtu), oil = n(r.fuel_oil_02_use_kbtu), eui = n(r.site_eui_kbtuft2);
    var area = n(r.total_floor_area_bld_pk_ft2), derived = false;
    if (!area && eui) { var tot = (e || 0) + (g || 0) + (st || 0) + (oil || 0); if (tot > 0) { area = tot / eui; derived = true; } }
    return {
      source: 'phl_bench', year: n(r.data_year), propertyId: r.portfolio_manager_id ? String(r.portfolio_manager_id) : '', name: r.property_name || '',
      address: r.street_address || '', zip: r.postal_code || '', borough: '', bbl: '',
      type: type, btype: TYPE[String(type).toLowerCase()] || null,
      sqft: area, sqftDerived: derived,
      siteEui: eui, wnEui: n(r.weather_norm_site_eui_kbtuft2), essScore: n(r.energy_star_score),
      kwh: e != null ? e / 3.412 : null, therms: g != null ? g / 100 : null,
      steamKbtu: st, oilKbtu: oil, ghgT: n(r.total_ghg_emissions_mtco2e), utility: ''
    };
  }

  function sourceFor(state, city) {
    var st = String(state || '').toUpperCase(), c = String(city || '').trim();
    return SOURCES.filter(function (s) { return s.state === st && s.cities.test(c); })[0] || null;
  }

  // ── address normalising ─────────────────────────────────────────────────
  var DIR = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST', NORTH: 'NORTH', SOUTH: 'SOUTH', EAST: 'EAST', WEST: 'WEST',
    NW: 'NW', NE: 'NE', SW: 'SW', SE: 'SE', NORTHWEST: 'NW', NORTHEAST: 'NE', SOUTHWEST: 'SW', SOUTHEAST: 'SE' };
  var SUF = { ST: 'STREET', STREET: 'STREET', AVE: 'AVENUE', AV: 'AVENUE', AVENUE: 'AVENUE', BLVD: 'BOULEVARD', BOULEVARD: 'BOULEVARD',
    RD: 'ROAD', ROAD: 'ROAD', PL: 'PLACE', PLACE: 'PLACE', DR: 'DRIVE', DRIVE: 'DRIVE', LN: 'LANE', LANE: 'LANE', PKWY: 'PARKWAY', PARKWAY: 'PARKWAY',
    SQ: 'SQUARE', SQUARE: 'SQUARE', PLZ: 'PLAZA', PLAZA: 'PLAZA', TER: 'TERRACE', TERRACE: 'TERRACE', CT: 'COURT', COURT: 'COURT', HWY: 'HIGHWAY', BROADWAY: 'BROADWAY' };
  var ORD = ['', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH', 'ELEVENTH', 'TWELFTH'];
  function tokens(s) {
    return String(s || '').toUpperCase().replace(/[.,#]/g, ' ').trim().split(/\s+/).filter(Boolean).map(function (t) {
      if (DIR[t]) return DIR[t];
      if (SUF[t]) return SUF[t];
      var m = /^(\d+)(ST|ND|RD|TH)$/.exec(t); if (m) return m[1];
      var i = ORD.indexOf(t); if (i > 0) return String(i);
      return t;
    });
  }
  function parse(addr) {
    var t = tokens(addr);
    var num = t.length && /^\d[\dA-Z-]*$/.test(t[0]) ? t.shift() : '';
    var core = t.filter(function (w) { return !/^(NORTH|SOUTH|EAST|WEST|NW|NE|SW|SE)$/.test(w) && !SUF[w] || w === 'BROADWAY'; })[0] || t[0] || '';
    return { num: num, rest: t, core: core };
  }
  function score(a, rec) {
    var b = parse(rec.address);
    if (a.num && b.num !== a.num) return 0;
    var A = {}, B = {}, inter = 0, uni = 0, k;
    a.rest.forEach(function (w) { A[w] = 1; }); b.rest.forEach(function (w) { B[w] = 1; });
    for (k in A) { uni++; if (B[k]) inter++; }
    for (k in B) if (!A[k]) uni++;
    return uni ? inter / uni : 0;
  }
  function q(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  // ── search ───────────────────────────────────────────────────────────────
  function search(src, address) {
    var a = parse(address);
    if (!a.num || !a.core) return Promise.reject(new Error('Enter a street address with a building number, e.g. 250 W 55th St.'));
    var alts = [a.core];
    var i = Number(a.core);
    if (i > 0 && i < ORD.length) alts.push(ORD[i]);
    var fields = [].concat(src.addr), url;
    var where = '(' + alts.map(function (c) {
      return fields.map(function (f) { return (src.kind === 'arcgis' ? 'UPPER(' + f + ') LIKE ' : 'upper(' + f + ') like ') + q(a.num + ' %' + c + '%'); }).join(' OR ');
    }).join(' OR ') + ')';
    if (src.kind === 'arcgis') {
      url = src.api + '?where=' + encodeURIComponent(where) + '&outFields=*&orderByFields=' + encodeURIComponent(src.year + ' DESC') +
        '&resultRecordCount=60&returnGeometry=false&f=json';
    } else {
      url = src.api + '?$where=' + encodeURIComponent(where) + '&$order=' + encodeURIComponent(src.year + ' DESC') + '&$limit=60';
    }
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('The city data service answered ' + r.status + '.');
      return r.json();
    }).then(function (body) {
      if (body && body.error) throw new Error('The city data service answered: ' + (body.error.message || 'error'));
      var rows = src.kind === 'arcgis' ? ((body && body.features) || []).map(function (f) { return f.attributes || {}; }) : body;
      var best = {};
      (rows || []).map(src.map).forEach(function (rec) {
        rec.score = score(a, rec);
        if (!rec.score) return;
        var k = rec.propertyId || rec.bbl || rec.address;
        // keep the latest year that actually has energy data
        var cur = best[k], has = rec.siteEui != null;
        if (!cur || (has && (cur.siteEui == null || rec.year > cur.year))) best[k] = rec;
      });
      return Object.keys(best).map(function (k) { return best[k]; })
        .sort(function (x, y) { return y.score - x.score || (y.year || 0) - (x.year || 0); }).slice(0, 6);
    });
  }

  window.BeaconPublicData = { sourceFor: sourceFor, search: search, SOURCES: SOURCES, coverage: COVERAGE, _parse: parse, _map: mapNyc, _mapChicago: mapChicago, _mapSeattle: mapSeattle };
})();
