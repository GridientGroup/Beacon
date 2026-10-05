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
 * Sources (add more as entries in SOURCES):
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
    map: mapNyc
  }];

  // Primary property type (ENERGY STAR names) → Beacon building type.
  var TYPE = {
    'office': 'office', 'financial office': 'office', 'multifamily housing': 'multifamily', 'hotel': 'hospitality',
    'retail store': 'retail', 'strip mall': 'retail', 'enclosed mall': 'retail', 'medical office': 'healthcare',
    'hospital (general medical & surgical)': 'hospital', 'senior living community': 'senior_care', 'senior care community': 'senior_care',
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

  function sourceFor(state, city) {
    var st = String(state || '').toUpperCase(), c = String(city || '').trim();
    return SOURCES.filter(function (s) { return s.state === st && s.cities.test(c); })[0] || null;
  }

  // ── address normalising ─────────────────────────────────────────────────
  var DIR = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST', NORTH: 'NORTH', SOUTH: 'SOUTH', EAST: 'EAST', WEST: 'WEST' };
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
    var core = t.filter(function (w) { return !/^(NORTH|SOUTH|EAST|WEST)$/.test(w) && !SUF[w] || w === 'BROADWAY'; })[0] || t[0] || '';
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
    var where = '(' + alts.map(function (c) { return 'upper(address_1) like ' + q(a.num + ' %' + c + '%'); }).join(' OR ') + ')';
    var url = src.api + '?$where=' + encodeURIComponent(where) + '&$order=' + encodeURIComponent('report_year DESC') + '&$limit=60';
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('The city data service answered ' + r.status + '.');
      return r.json();
    }).then(function (rows) {
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

  window.BeaconPublicData = { sourceFor: sourceFor, search: search, SOURCES: SOURCES, _parse: parse, _map: mapNyc };
})();
