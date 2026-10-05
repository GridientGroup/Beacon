// =============================================================================
//  openei.js — OpenEI / NLR (formerly NREL) API client
// =============================================================================
//  Provides client-side access to:
//    - URDB (Utility Rate Database): real utility rate structures for 3,700+
//      US utilities, with full detail for the ~150 utilities covering 70% of
//      US electricity load. Free, JSON, CORS-enabled.
//    - PVWatts v8: per-location solar production estimates. Free, JSON.
//
//  All responses are cached in localStorage for 30 days. URDB rates update
//  annually; PVWatts results are deterministic for a given location.
//
//  ─── API KEY ────────────────────────────────────────────────────────────
//  NLR API keys are designed to be publicly embeddable (similar to Google
//  Maps client keys). They are rate-limited per key (1,000 requests/hour)
//  and per IP (10,000/day), not secret-protected.
//
//  To rotate: get a new key from https://developer.nlr.gov/signup (60 sec
//  signup) and replace the constant below. No other changes needed.
// =============================================================================

window.openei = (function () {
  'use strict';

  var API_KEY      = 'AnFVGFbBkN8AJwGgTlNlWovwgdQPzoaT3llJrZt5';
  var URDB_BASE    = 'https://api.openei.org/utility_rates';
  var PVWATTS_BASE = 'https://developer.nlr.gov/api/pvwatts/v8.json';

  // 30 days — URDB rates update annually, this is conservative
  var CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  // PVWatts state yields don't change. Cache for a year.
  var PVWATTS_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

  // ── State-representative coordinates ─────────────────────────────────────
  // For PVWatts portfolio rollups, we don't need per-site coordinates —
  // solar resource is roughly homogeneous across a state at the portfolio
  // scale (the NSRDB grid is 4km, but state-level variation is single-digit
  // percent). Using major-commercial-city coordinates gives a more realistic
  // proxy than geographic centroids, which often land in rural areas.
  var STATE_COORDS = {
    AL: [33.52, -86.81], AK: [61.22, -149.90], AZ: [33.45, -112.07], AR: [34.75, -92.29],
    CA: [34.05, -118.24], CO: [39.74, -104.99], CT: [41.77, -72.67], DE: [39.74, -75.55],
    DC: [38.91, -77.04], FL: [27.95, -82.46], GA: [33.75, -84.39], HI: [21.31, -157.86],
    ID: [43.62, -116.20], IL: [41.88, -87.63], IN: [39.77, -86.16], IA: [41.59, -93.62],
    KS: [39.05, -94.59], KY: [38.25, -85.76], LA: [29.95, -90.07], ME: [43.66, -70.26],
    MD: [39.29, -76.61], MA: [42.36, -71.06], MI: [42.33, -83.05], MN: [44.98, -93.27],
    MS: [32.30, -90.18], MO: [38.63, -90.20], MT: [45.79, -108.50], NE: [41.26, -95.94],
    NV: [36.17, -115.14], NH: [42.99, -71.46], NJ: [40.74, -74.17], NM: [35.08, -106.65],
    NY: [40.71, -74.01], NC: [35.23, -80.84], ND: [46.88, -96.79], OH: [39.96, -82.99],
    OK: [35.47, -97.52], OR: [45.52, -122.68], PA: [39.95, -75.17], RI: [41.82, -71.41],
    SC: [32.78, -79.93], SD: [43.55, -96.73], TN: [36.16, -86.78], TX: [29.76, -95.37],
    UT: [40.76, -111.89], VT: [44.48, -73.21], VA: [37.54, -77.43], WA: [47.61, -122.33],
    WV: [38.35, -81.63], WI: [43.04, -87.91], WY: [41.14, -104.82],
  };

  // ── Rooftop solar sizing constant ────────────────────────────────────────
  // Industry rule of thumb for commercial rooftop solar:
  //   - 50% of building sqft is usable roof area (HVAC, setbacks, parapets,
  //     skylights, structural limits typically consume the other half)
  //   - 11 W of DC capacity per usable roof sqft for crystalline silicon
  //   - Combined: 0.0055 kW DC per sqft of building footprint
  // Conservative; real projects can push 12-14 W/sqft on optimized roofs.
  var ROOFTOP_KW_PER_SQFT = 0.0055;

  // ── Solar economics defaults ─────────────────────────────────────────────
  // Commercial solar installed cost (2024-2026 range: $1.50-$2.10/W).
  // Using $1.75/W as a representative figure for portfolio-scale estimating.
  var INSTALL_COST_PER_WATT = 1.75;

  // ── Utility name normalization ─────────────────────────────────────────
  // Real-world portfolio data has utility names like "PECO", "PECO Energy",
  // "Exelon - PECO Energy Co"; URDB has its own canonical name. This map
  // translates the most common aliases to the URDB search string.
  //
  // When a utility isn't in this map, we fall back to a fuzzy search via
  // URDB's free-text query and pick the best-matching active commercial rate.
  var UTILITY_ALIASES = {
    'peco':                    'PECO Energy Co',
    'peco energy':             'PECO Energy Co',
    'pgw':                     'Philadelphia Gas Works',
    'duquesne':                'Duquesne Light Co',
    'duquesne light':          'Duquesne Light Co',
    'ppl':                     'PPL Electric Utilities Corp',
    'pse&g':                   'Public Service Electric and Gas Co',
    'pseg':                    'Public Service Electric and Gas Co',
    'jcp&l':                   'Jersey Central Power & Light Co',
    'orange and rockland':     'Orange and Rockland Utilities Inc',
    'con edison':              'Consolidated Edison Co-NY Inc',
    'coned':                   'Consolidated Edison Co-NY Inc',
    'national grid':           'Niagara Mohawk Power Corp',
    'nyseg':                   'New York State Electric & Gas Corp',
    'rg&e':                    'Rochester Gas & Electric Corp',
    'xcel':                    'Northern States Power Co - Minnesota',
    'centerpoint':             'CenterPoint Energy Houston Electric LLC',
    'oncor':                   'Oncor Electric Delivery Co LLC',
    'pg&e':                    'Pacific Gas & Electric Co',
    'sce':                     'Southern California Edison Co',
    'sdg&e':                   'San Diego Gas & Electric Co',
    'aps':                     'Arizona Public Service Co',
    'srp':                     'Salt River Project',
    'tep':                     'Tucson Electric Power Co',
    'duke energy':             'Duke Energy Carolinas LLC',
    'duke energy progress':    'Duke Energy Progress LLC',
    'dominion':                'Virginia Electric & Power Co',
    'dominion energy':         'Virginia Electric & Power Co',
    'ohio edison':             'Ohio Edison Co',
    'cleveland electric':      'Cleveland Electric Illuminating Co',
    'firstenergy':             'Ohio Edison Co',
    'aep':                     'AEP Ohio',
    'aep ohio':                'AEP Ohio',
    'georgia power':           'Georgia Power Co',
    'florida power & light':   'Florida Power & Light Co',
    'fpl':                     'Florida Power & Light Co',
    'tampa electric':          'Tampa Electric Co',
    'teco':                    'Tampa Electric Co',
    'eversource':              'Connecticut Light and Power Co',
    'national grid ny':        'Niagara Mohawk Power Corp',
    'national grid ma':        'Massachusetts Electric Co',
    'ngrid':                   'Niagara Mohawk Power Corp',
    'constellation newenergy': null,   // Constellation is a SUPPLIER, not a utility — no URDB record
    'engie':                   null,
    'direct energy':           null,
    'shell energy':            null,
    'nrg':                     null,
  };

  // Words to strip when normalizing utility names for matching
  var STRIP_SUFFIXES = [
    /\bcorp\b\.?/i, /\bco\b\.?/i, /\bcompany\b/i, /\bllc\b\.?/i,
    /\binc\b\.?/i, /\benergy\b/i, /\belectric\b/i, /\bgas\b/i,
    /\bpower\b/i, /\butilities\b/i, /\butility\b/i, /\band\b/i, /\b&\b/,
    /\bof\b/i, /\bservices\b/i, /\bservice\b/i,
  ];

  function normalizeKey(name) {
    if (!name) return '';
    var s = String(name).toLowerCase().trim();
    // Try direct alias hit first (exact, normalized)
    if (UTILITY_ALIASES.hasOwnProperty(s)) return s;
    // Try stripping common suffixes for fuzzy matching against the alias map
    var stripped = s;
    STRIP_SUFFIXES.forEach(function (re) { stripped = stripped.replace(re, ''); });
    stripped = stripped.replace(/[^\w\s&]/g, '').replace(/\s+/g, ' ').trim();
    if (UTILITY_ALIASES.hasOwnProperty(stripped)) return stripped;
    return s;  // Return original normalized form for use as cache key + search query
  }

  // Returns the URDB-canonical name to query, or null if this isn't a
  // distribution utility (e.g. it's a competitive supplier like Constellation
  // or Direct Energy — those don't have URDB rate records).
  function resolveUtility(rawName) {
    var key = normalizeKey(rawName);
    if (UTILITY_ALIASES.hasOwnProperty(key)) {
      return UTILITY_ALIASES[key];   // may be null for known suppliers
    }
    // Not in alias map — try the raw name as-is against URDB
    return rawName;
  }

  // ── localStorage cache helpers ─────────────────────────────────────────
  function cacheKey(prefix, val) { return 'openei:' + prefix + ':' + String(val).toLowerCase(); }

  function cacheGet(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var rec = JSON.parse(raw);
      if (!rec || !rec.t || (Date.now() - rec.t) > CACHE_TTL_MS) {
        localStorage.removeItem(key);
        return null;
      }
      return rec.v;
    } catch (e) { return null; }
  }

  function cacheSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); }
    catch (e) {/* quota exceeded — drop silently */}
  }

  // ── URDB response simplifier ───────────────────────────────────────────
  // Reduces the rich-but-noisy URDB response to the fields Beacon actually
  // displays. Picks the headline energy rate (first tier of first period),
  // captures demand and fixed charges, and flags whether the rate has TOU
  // or tiered structure.
  function simplifyRate(item) {
    if (!item) return null;

    var energyCharge = null;
    var hasTiers     = false;
    var hasTOU       = false;
    try {
      var ers = item.energyratestructure || [];
      hasTOU = ers.length > 1;
      hasTiers = ers.some(function (period) { return Array.isArray(period) && period.length > 1; });
      if (ers.length && Array.isArray(ers[0]) && ers[0].length) {
        var rate = Number(ers[0][0] && ers[0][0].rate);
        if (isFinite(rate)) energyCharge = rate;
      }
    } catch (e) {}

    var demandCharge = null;
    try {
      // Try flat demand first (simpler), then time-varying demand
      var fds = item.flatdemandstructure || [];
      if (fds.length && Array.isArray(fds[0]) && fds[0].length) {
        var d = Number(fds[0][0] && fds[0][0].rate);
        if (isFinite(d) && d > 0) demandCharge = d;
      }
      if (demandCharge == null) {
        var dds = item.demandratestructure || [];
        if (dds.length && Array.isArray(dds[0]) && dds[0].length) {
          var d2 = Number(dds[0][0] && dds[0][0].rate);
          if (isFinite(d2) && d2 > 0) demandCharge = d2;
        }
      }
    } catch (e) {}

    var structureType = 'Flat';
    if (hasTOU && hasTiers)       structureType = 'TOU + Tiered';
    else if (hasTOU)              structureType = 'Time-of-Use';
    else if (hasTiers)            structureType = 'Tiered';
    if (demandCharge != null && demandCharge > 0) {
      structureType = structureType === 'Flat' ? 'Demand + Energy' : structureType + ' + Demand';
    }

    return {
      label:             item.label || null,
      name:              item.name || 'Unnamed rate',
      utility:           item.utility || null,
      sector:            item.sector || null,
      energyCharge:      energyCharge,     // $/kWh, headline (first-tier, first-period)
      demandCharge:      demandCharge,     // $/kW or $/kVA, or null
      fixedMonthlyCharge: Number(item.fixedmonthlycharge || 0) || null,
      hasTOU:            hasTOU,
      hasTiers:          hasTiers,
      structureType:     structureType,
      startDate:         item.startdate ? new Date(item.startdate * 1000).toISOString().slice(0, 10) : null,
      endDate:           item.enddate   ? new Date(item.enddate   * 1000).toISOString().slice(0, 10) : null,
      url:               item.uri || null,
    };
  }

  // ── Pick the best representative commercial rate from a list ───────────
  // Heuristic: prefer "General Service" rates, then any commercial rate
  // that's currently active (no expiration or expires after today), then
  // any commercial rate by most recent start date. We avoid lighting-only,
  // irrigation, and small standby rates which are common edge cases.
  function pickRepresentativeRate(items) {
    if (!items || !items.length) return null;

    var today = Date.now() / 1000;
    var SKIP_PATTERNS = /(\blight|\bstreet|\birrigat|\bstandby|\bagri|\bschool\b|\boff[-\s]?peak)/i;
    var PREFER_PATTERNS = /\bgs\b|\bgeneral service\b|\bsmall commercial\b|\bmedium\b|\bsmall general\b/i;

    // Score each: higher is better
    var scored = items.map(function (it) {
      var score = 0;
      var name  = String(it.name || '');
      var sect  = String(it.sector || '').toLowerCase();
      var ed    = Number(it.enddate);
      var sd    = Number(it.startdate);

      if (sect === 'commercial')        score += 50;
      else if (sect === 'industrial')   score += 20;
      else                              return null;   // Skip residential/other

      if (SKIP_PATTERNS.test(name))     score -= 30;
      if (PREFER_PATTERNS.test(name))   score += 25;

      // Active rates get a big boost
      if (!ed || ed === 0)              score += 30;   // no expiration
      else if (ed > today)              score += 20;
      else                              score -= 40;   // expired

      // More recent start = better
      if (sd > 0) score += Math.min(20, (sd - 1500000000) / 10000000);  // bias toward recent

      // Rate must have an actual energy charge defined
      try {
        var ers = it.energyratestructure || [];
        if (!(ers.length && ers[0] && ers[0][0] && Number(ers[0][0].rate) > 0)) {
          score -= 50;  // no usable energy charge
        }
      } catch (e) { score -= 50; }

      return { item: it, score: score };
    }).filter(function (x) { return x !== null; });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.length ? scored[0].item : null;
  }

  // ── Fetch utility rates ─────────────────────────────────────────────────
  // Returns a simplified rate object (or { notInURDB: true } when the
  // utility couldn't be matched). Cached for 30 days.
  function fetchUtilityRate(utilityName) {
    var key = cacheKey('rate', normalizeKey(utilityName));
    var cached = cacheGet(key);
    if (cached) return Promise.resolve(cached);

    var canonical = resolveUtility(utilityName);
    if (canonical === null) {
      // Known supplier (not a distribution utility) — don't bother calling URDB
      var supplierResult = { notInURDB: true, reason: 'supplier', originalName: utilityName };
      cacheSet(key, supplierResult);
      return Promise.resolve(supplierResult);
    }

    var url = URDB_BASE
      + '?version=8'
      + '&format=json'
      + '&detail=full'
      + '&sector=Commercial'
      + '&limit=40'
      + '&ratesforutility=' + encodeURIComponent(canonical)
      + '&api_key=' + API_KEY;

    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('URDB HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        if (!items.length) {
          var noMatchResult = { notInURDB: true, reason: 'no-match', originalName: utilityName, canonicalTried: canonical };
          cacheSet(key, noMatchResult);
          return noMatchResult;
        }
        var picked = pickRepresentativeRate(items);
        if (!picked) {
          var noActiveResult = { notInURDB: true, reason: 'no-active-commercial', originalName: utilityName, canonicalTried: canonical, totalRates: items.length };
          cacheSet(key, noActiveResult);
          return noActiveResult;
        }
        var simplified = simplifyRate(picked);
        simplified.originalName    = utilityName;
        simplified.canonicalName   = canonical;
        simplified.totalRatesAtUtility = items.length;
        cacheSet(key, simplified);
        return simplified;
      })
      .catch(function (err) {
        // Don't cache errors — let the next attempt retry
        return { error: true, message: err.message || 'fetch failed', originalName: utilityName };
      });
  }

  // ── Fetch rates for many utilities in parallel ─────────────────────────
  // Pass an array of utility names; returns Promise<Array<rateInfo>> in the
  // same order. Failures don't fail the whole batch — they come back as
  // { error: true, ... } in the result array.
  function fetchUtilityRatesBulk(utilityNames) {
    if (!Array.isArray(utilityNames) || !utilityNames.length) return Promise.resolve([]);
    return Promise.all(utilityNames.map(fetchUtilityRate));
  }

  // ── Helpers exposed for the renderer ───────────────────────────────────
  // Extract the unique distribution utilities from a portfolio of accounts,
  // with a count of accounts at each. Filters out blanks and very obvious
  // supplier names (suppliers don't have rate records in URDB).
  function summarizePortfolioUtilities(accounts) {
    if (!Array.isArray(accounts) || !accounts.length) return [];
    var counts = {};
    var states = {};
    accounts.forEach(function (a) {
      var u = String(a && a.utility || '').trim();
      if (!u) return;
      if (!counts[u]) { counts[u] = 0; states[u] = {}; }
      counts[u]++;
      if (a.state) states[u][String(a.state).toUpperCase()] = true;
    });
    return Object.keys(counts).map(function (u) {
      return {
        utility: u,
        accountCount: counts[u],
        states: Object.keys(states[u]),
      };
    }).sort(function (a, b) { return b.accountCount - a.accountCount; });
  }

  // ── Clear cache (handy for dev/testing) ────────────────────────────────
  function clearCache() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('openei:') === 0) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
      return keys.length;
    } catch (e) { return 0; }
  }

  // ── Synchronous cache read for a utility's rate data ────────────────────
  // Returns the simplified rate object if it's already cached (URDB section
  // populated the cache earlier in this session), or null if not yet cached.
  // Used by the per-location hit list to surface rate structure data
  // alongside each building without firing its own fetches.
  function getCachedRate(utilityName) {
    if (!utilityName) return null;
    var key = cacheKey('rate', normalizeKey(utilityName));
    var cached = cacheGet(key);
    if (!cached) return null;
    // Caller doesn't care about the supplier/no-match objects — only return
    // a rate when we actually have rate data
    if (cached.notInURDB || cached.error) return null;
    return cached;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PVWatts v8 — solar production estimation
  // ═══════════════════════════════════════════════════════════════════════

  // ── Fetch annual kWh produced by a 1 kW DC system at given coordinates ──
  // We always query with system_capacity=1 so the result is a portable
  // per-kW yield (kWh per kW DC per year) that scales linearly to whatever
  // capacity the portfolio actually represents. Caches the result.
  //
  // Defaults match typical commercial rooftop install:
  //   - array_type = 1 (fixed roof mount)
  //   - module_type = 0 (standard crystalline silicon)
  //   - tilt = 20° (common commercial flat-roof tilt)
  //   - azimuth = 180° (south-facing)
  //   - losses = 14% (NREL default — soiling, shading, wiring, mismatch)
  function fetchSolarYieldByLatLon(lat, lon) {
    var key = cacheKey('pvwatts', lat.toFixed(2) + ',' + lon.toFixed(2));
    var cached = cacheGet(key);
    if (cached) return Promise.resolve(cached);

    var url = PVWATTS_BASE
      + '?api_key='        + API_KEY
      + '&lat='            + encodeURIComponent(lat)
      + '&lon='            + encodeURIComponent(lon)
      + '&system_capacity=1'
      + '&array_type=1'
      + '&module_type=0'
      + '&tilt=20'
      + '&azimuth=180'
      + '&losses=14';

    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('PVWatts HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.outputs || typeof data.outputs.ac_annual !== 'number') {
          throw new Error('PVWatts: unexpected response shape');
        }
        var result = {
          annualKwhPerKw:  Number(data.outputs.ac_annual),
          capacityFactor:  Number(data.outputs.capacity_factor) || null,
          solradAnnual:    Number(data.outputs.solrad_annual)   || null,
          stationCity:     data.station_info && data.station_info.city  || null,
          stationState:    data.station_info && data.station_info.state || null,
          stationDistance: data.station_info && data.station_info.distance || null,
        };
        // PVWatts yields are essentially static — cache for a year
        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: result })); }
        catch (e) {}
        return result;
      })
      .catch(function (err) {
        return { error: true, message: err.message || 'PVWatts fetch failed' };
      });
  }

  // ── Fetch solar yield for every state in a portfolio ────────────────────
  // Takes an array of state codes (deduped), returns a Promise<{state: result}>.
  // Uses STATE_COORDS to pick a representative location. Parallel fetches.
  function fetchSolarYieldsByState(stateCodes) {
    if (!Array.isArray(stateCodes) || !stateCodes.length) return Promise.resolve({});
    var unique = {};
    stateCodes.forEach(function (s) { unique[String(s || '').toUpperCase()] = true; });
    var states = Object.keys(unique).filter(function (s) { return STATE_COORDS[s]; });

    return Promise.all(states.map(function (s) {
      var coords = STATE_COORDS[s];
      return fetchSolarYieldByLatLon(coords[0], coords[1]).then(function (result) {
        return { state: s, yield: result };
      });
    })).then(function (results) {
      var out = {};
      results.forEach(function (r) { out[r.state] = r.yield; });
      return out;
    });
  }

  // ── Portfolio-level solar opportunity rollup ───────────────────────────
  // Given a portfolio's accounts (already-grouped per-location is fine, or
  // raw accounts with sqft/state), groups by state, sizes a system per
  // state based on usable roof area, fetches per-state yields, and rolls
  // up to portfolio totals.
  //
  // Returns:
  //   {
  //     totalSqft, totalSystemKw, totalAnnualKwh,
  //     totalAvoidedSpend, totalInstallCost, paybackYears,
  //     totalPortfolioKwh,        // sum of electric usage for offset %
  //     offsetPct,                // production / portfolio usage × 100
  //     sqftSource,               // 'reported' | 'estimated-from-sites' | 'mixed'
  //     byState: [{ state, sqft, sites, systemKw, annualKwh, avoidedSpend, perKwYield, ... }],
  //     errors: [{ state, message }]
  //   }
  function computeSolarOpportunity(accounts, btype, perStateYields) {
    accounts = Array.isArray(accounts) ? accounts : [];
    btype    = btype || 'healthcare';
    perStateYields = perStateYields || {};

    // Group by state, collecting per-state sqft and electric usage
    var byState = {};
    var anyReported   = false;
    var anyEstimated  = false;
    var totalPortfolioKwh = 0;

    accounts.forEach(function (a) {
      if (!a) return;
      var st = String(a.state || '').toUpperCase();
      if (!st) return;
      if (!byState[st]) {
        byState[st] = {
          state: st, sqft: 0, sites: 0, sqftReported: 0, addresses: {}, electricKwh: 0,
        };
      }
      var g = byState[st];

      // ── FLOOR AREA IS PER BUILDING, NOT PER METER (fixed 2026-09-17) ─────
      // `sites` was deduped by address; `sqftReported` was not — it summed
      // every account row. A building with an electric AND a gas meter is two
      // rows carrying the SAME sqft (the upload template instructs exactly
      // that: "If a single building has both Electric and Gas meters, put the
      // SAME Property Type and operational fields on BOTH rows"), so its area
      // was counted twice.
      //
      // Everything downstream is linear in sqft, so a dual-fuel portfolio
      // reported roughly DOUBLE its real solar capacity, production and
      // avoided spend, and offsetPct could exceed 100%. Payback was the only
      // figure that survived, because cost and savings scale together.
      //
      // Area is now recorded per address and taken as the LARGEST meter's
      // value at that address, matching how perloc.js resolves the same
      // question. Meters with no address fall back to a per-row key so they
      // are still counted once each rather than dropped.
      var addr = String(a.address || '').toLowerCase().trim();
      var akey = addr || ('__noaddr_' + (a.id || a.account || g.sites + '_' + Math.random()));
      if (!g.addresses[akey]) {
        g.addresses[akey] = 0;
        g.sites++;
      }
      var sf = Number(a.sqft) || 0;
      if (sf > 0) {
        if (sf > g.addresses[akey]) g.addresses[akey] = sf;
        anyReported = true;
      }
      if (String(a.type || '').toLowerCase() === 'electric') {
        var u = Number(a.usage) || 0;
        g.electricKwh += u;
        totalPortfolioKwh += u;
      }
    });

    // For each state, finalize sqft (use reported if any, otherwise estimate
    // from site count × CBECS_TYPICAL_SQFT[btype])
    var typicalSqft = (window.CBECS_TYPICAL_SQFT && window.CBECS_TYPICAL_SQFT[btype]) || 20000;
    Object.keys(byState).forEach(function (st) {
      var g = byState[st];
      // Sum the per-address maxima — one area per building, counted once.
      g.sqftReported = Object.keys(g.addresses).reduce(function (t, k) {
        return t + (Number(g.addresses[k]) || 0);
      }, 0);
      if (g.sqftReported > 0) {
        g.sqft = g.sqftReported;
        g.sqftSource = 'reported';
      } else if (g.sites > 0) {
        g.sqft = g.sites * typicalSqft;
        g.sqftSource = 'estimated-from-sites';
        anyEstimated = true;
      } else {
        g.sqft = 0;
        g.sqftSource = 'none';
      }
      delete g.addresses;
      delete g.sqftReported;
    });

    // For each state, compute system size, annual production, avoided spend
    var totalSqft         = 0;
    var totalSystemKw     = 0;
    var totalAnnualKwh    = 0;
    var totalAvoidedSpend = 0;
    var errors            = [];

    var states = Object.keys(byState);
    states.forEach(function (st) {
      var g = byState[st];
      g.systemKw = Math.round(g.sqft * ROOFTOP_KW_PER_SQFT);

      var y = perStateYields[st];
      if (!y || y.error) {
        g.annualKwh     = 0;
        g.avoidedSpend  = 0;
        g.perKwYield    = null;
        if (y && y.error) errors.push({ state: st, message: y.message });
      } else {
        g.perKwYield   = Math.round(y.annualKwhPerKw);
        g.annualKwh    = Math.round(g.systemKw * y.annualKwhPerKw);
        var stateRate  = ((window.STATE_RATES_CENTS && window.STATE_RATES_CENTS[st]) || 12.75) / 100;
        g.avoidedSpend = Math.round(g.annualKwh * stateRate);
        g.stationCity  = y.stationCity;
      }

      totalSqft         += g.sqft;
      totalSystemKw     += g.systemKw;
      totalAnnualKwh    += g.annualKwh;
      totalAvoidedSpend += g.avoidedSpend;
    });

    var totalInstallCost = totalSystemKw * 1000 * INSTALL_COST_PER_WATT;  // kW → W → $
    var paybackYears = totalAvoidedSpend > 0 ? totalInstallCost / totalAvoidedSpend : null;
    var offsetPct    = totalPortfolioKwh > 0 ? (totalAnnualKwh / totalPortfolioKwh) * 100 : null;

    var sqftSource = anyReported && anyEstimated ? 'mixed'
                   : anyReported                 ? 'reported'
                   : 'estimated-from-sites';

    // Sort states by avoided spend desc (procurement-target order)
    var byStateArr = Object.keys(byState).map(function (k) { return byState[k]; })
                           .sort(function (a, b) { return b.avoidedSpend - a.avoidedSpend; });

    return {
      totalSqft:          totalSqft,
      totalSystemKw:      totalSystemKw,
      totalAnnualKwh:     totalAnnualKwh,
      totalAvoidedSpend:  totalAvoidedSpend,
      totalInstallCost:   Math.round(totalInstallCost),
      paybackYears:       paybackYears,
      totalPortfolioKwh:  totalPortfolioKwh,
      offsetPct:          offsetPct,
      sqftSource:         sqftSource,
      byState:            byStateArr,
      errors:             errors,
      assumptions: {
        roofUtilization:    0.50,
        kwPerSqft:          ROOFTOP_KW_PER_SQFT,
        installCostPerWatt: INSTALL_COST_PER_WATT,
        tiltDegrees:        20,
        azimuthDegrees:     180,
        lossesPct:          14,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ONE ROOFTOP SOLAR ENGINE FOR EVERY SCREEN (bundle 118, 2026-10-05)
  // ═══════════════════════════════════════════════════════════════════════
  // The Location page used to run its own "v1" model — 0.006 kW/sqft, a
  // hardcoded state production table, $1.85/W and a 30% ITC baked into
  // payback — while the portfolio screens used this file's 0.0055 kW/sqft,
  // PVWatts and $1.75/W. On the live portfolio the two disagreed by 27.9 MW
  // and $4.8M/yr. Matt's call: this engine everywhere, and NO tax credit
  // anywhere (§48E for commercial solar now requires construction to start
  // by July 4, 2026 / be in service by end of 2027, so most new prospects
  // cannot get it).
  //
  // Building-type roof utilisation is applied by the patch in index.html
  // (ROOF_UTIL, NREL Rooftop Solar Technical Potential Study) for the
  // portfolio rollup; this per-building function asks the same table via
  // window.beaconSolarRoofUtil so both scale identically.
  //
  // Production: the cached PVWatts per-kW yield for the building's state
  // (same representative coordinates the portfolio rollup uses). If it is
  // not cached yet, a state-average table is used AND labelled as such, and
  // a fetch is started so the next render uses PVWatts.
  var STATE_PROD_FALLBACK = {
    AZ:1700, NM:1700, CA:1600, NV:1700, TX:1500, FL:1450, OK:1500,
    CO:1600, UT:1600, KS:1500, GA:1400, NC:1400, SC:1400, AL:1400, AR:1400,
    LA:1350, MS:1400, TN:1350, VA:1350, MD:1300, DE:1300, NJ:1250, KY:1300,
    MO:1350, IL:1300, IN:1300, OH:1250, MI:1200, WI:1250, IA:1300, NE:1450,
    SD:1400, ND:1350, MN:1250, MT:1450, ID:1400, OR:1200, WA:1100,
    NY:1200, CT:1250, MA:1250, RI:1250, NH:1200, VT:1200, ME:1200, PA:1250,
    WV:1250, HI:1700, AK:1000, DC:1300, WY:1500
  };
  function cachedStateYield(st) {
    var c = STATE_COORDS[st];
    if (!c) return null;
    try {
      var raw = localStorage.getItem(cacheKey('pvwatts', c[0].toFixed(2) + ',' + c[1].toFixed(2)));
      if (!raw) return null;
      var rec = JSON.parse(raw);
      if (!rec || !rec.v || rec.v.error || (Date.now() - rec.t) > PVWATTS_CACHE_TTL_MS) return null;
      return rec.v;
    } catch (e) { return null; }
  }
  function solarForBuilding(state, sqft, btype) {
    var st = String(state || '').toUpperCase();
    sqft = Number(sqft) || 0;
    var util = (typeof window.beaconSolarRoofUtil === 'function') ? window.beaconSolarRoofUtil(btype) : 0.50;
    var kwPerSqft = ROOFTOP_KW_PER_SQFT * (util / 0.50);
    var systemKw = sqft * kwPerSqft;
    var y = cachedStateYield(st);
    var perKw, basis;
    if (y && y.annualKwhPerKw) { perKw = Number(y.annualKwhPerKw); basis = 'pvwatts'; }
    else {
      perKw = STATE_PROD_FALLBACK[st] || 1300; basis = 'state_average';
      if (STATE_COORDS[st]) { try { fetchSolarYieldsByState([st]); } catch (e) {} }
    }
    var annualKwh = systemKw * perKw;
    var rate = ((window.STATE_RATES_CENTS && window.STATE_RATES_CENTS[st]) || 12.75) / 100;
    var avoided = annualKwh * rate;
    var install = systemKw * 1000 * INSTALL_COST_PER_WATT;
    return {
      systemKw: systemKw, annualKwh: annualKwh, perKwYield: perKw, productionBasis: basis,
      avoidedSpend: avoided, installCost: install,
      paybackYears: avoided > 0 ? install / avoided : null,
      roofUtilization: util, kwPerSqft: kwPerSqft, installCostPerWatt: INSTALL_COST_PER_WATT,
      rate: rate, stationCity: y && y.stationCity || null,
    };
  }

  return {
    solarForBuilding:            solarForBuilding,
    STATE_PROD_FALLBACK:         STATE_PROD_FALLBACK,
    fetchUtilityRate:            fetchUtilityRate,
    fetchUtilityRatesBulk:       fetchUtilityRatesBulk,
    summarizePortfolioUtilities: summarizePortfolioUtilities,
    normalizeKey:                normalizeKey,
    resolveUtility:              resolveUtility,
    getCachedRate:               getCachedRate,
    clearCache:                  clearCache,
    fetchSolarYieldByLatLon:     fetchSolarYieldByLatLon,
    fetchSolarYieldsByState:     fetchSolarYieldsByState,
    computeSolarOpportunity:     computeSolarOpportunity,
    STATE_COORDS:                STATE_COORDS,
    _internal: {
      simplifyRate:           simplifyRate,
      pickRepresentativeRate: pickRepresentativeRate,
    },
  };
})();
