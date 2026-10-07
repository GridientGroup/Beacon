/* ============================================================================
 * beacon_pro_renderer.js
 *
 * Renders Beacon Pro / Intelligence analytics as native .icard tiles inside
 * the existing Intelligence section. No branding, no marketing header — the
 * tiles just appear alongside the existing benchmarks, matching Beacon's
 * design system (dark cards, --lime accent, .ic-hero / .ic-data / .bm-cite).
 *
 * Reads Beacon's real account schema: type / annual_usage / sqft /
 * property_type / state / store_code.
 *
 * ── TIER MODEL (added 2026-09-16) ──────────────────────────────────────────
 *
 * Before this, `renderAll` accepted an `options` argument and never read it.
 * The only gate anywhere in the app was in index.html, deciding whether to
 * call this renderer at all — so Free saw nothing, and Pro and Intelligence
 * were identical. A prospect could not see what a tier bought them.
 *
 * Every tile now declares two things:
 *
 *   tier   'pro' | 'intelligence'   the plan that includes it
 *   needs  'annual' | 'monthly' | 'interval'   the data granularity it needs
 *
 * which resolves to one of three states:
 *
 *   ACTIVE    tier is sufficient AND the data exists  -> renders real numbers
 *   LOCKED    tier is too low                         -> shell + which plan
 *   AWAITING  tier is fine, the data is not there yet -> shell + what to upload
 *
 * LOCKED and AWAITING are deliberately DIFFERENT. "You need Beacon Pro" and
 * "you need to upload 12 months of bills" are not the same message, and
 * collapsing them would either oversell the plan or make the product look
 * broken. Keeping them apart is also the honest thing to show a prospect.
 *
 * NO FABRICATED NUMBERS. A locked or awaiting tile never shows a blurred or
 * placeholder figure. It shows its real label, a real description of what it
 * measures, its real data requirement and its real source. The only thing
 * withheld is the value, because the value genuinely is not known.
 * ========================================================================= */

(function () {
  'use strict';

  function _esc(s) {
    if (window._esc) return window._esc(s);
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString();
  }
  function fmtDollar(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n);
  }
  function fmtTonsShort(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1000) return Math.round(n / 1000) + 'K';
    return Math.round(n).toString();
  }

  // Read Beacon's real account fields.
  function acctType(a) { return String((a && a.type) || '').toLowerCase(); }
  function acctUsage(a) { return Number((a && (a.annual_usage != null ? a.annual_usage : a.annualUsage)) || 0); }
  function acctSqft(a) { return Number((a && a.sqft) || 0); }
  function acctState(a) { return (a && a.state) || ''; }
  // ── Property type resolution ─────────────────────────────────────────────
  // Beacon stores property type in two places and they use different
  // vocabularies:
  //
  //   accounts.property_type   per building. NULL on every row in the live
  //                            database today, so in practice unavailable.
  //   customers.type           per customer, surfaced as `btype`. Populated
  //                            for all 9 customers, but its values are
  //                            business categories (Manufacturing, Retail,
  //                            Hospitality, Healthcare) not DOE prototype
  //                            names (Retail Store, Hotel, Medical Office).
  //
  // Only Supermarket and Warehouse happen to match; even 'office' fails on
  // case alone. This crosswalk is what makes the customer-level value usable.
  //
  // Anything not in the crosswalk resolves to null and the building is
  // EXCLUDED from the reference comparison, not silently compared against
  // something else. Manufacturing is the honest example: DOE's Commercial
  // Reference Buildings are commercial prototypes and there is no industrial
  // one, so a manufacturing site genuinely cannot be benchmarked this way.
  var PROPERTY_TYPE_CROSSWALK = {
    'office': 'Office',
    'medical office': 'Medical Office',
    // Beacon's "Healthcare" means outpatient / medical office, NOT a hospital.
    // Mapping it to Hospital instead is a known, previously-made error that
    // moved a BPS limit by more than 4x.
    'healthcare': 'Medical Office',
    'hospital': 'Hospital',
    'retail': 'Retail Store',
    'retail store': 'Retail Store',
    'supermarket': 'Supermarket',
    'grocery': 'Supermarket',
    'warehouse': 'Warehouse',
    'distribution': 'Warehouse',
    'hospitality': 'Hotel',
    'hotel': 'Hotel',
    'k-12 school': 'K-12 School',
    'school': 'K-12 School',

    // ── EPA TARGET FINDER SPELLINGS (added 2026-09-17) ─────────────────────
    // THERE ARE TWO VOCABULARIES IN PLAY AND THEY ARE NOT THE SAME. This
    // crosswalk's OUTPUTS are DOE Commercial Reference Building prototype
    // names, because that is what the reference tile compares against. But
    // accounts.property_type is documented on its own column comment as an
    // EPA Target Finder value, because that is what energy-star-score's
    // TYPE_MAP requires — and three of EPA's eight spellings differ:
    //
    //   EPA                                       DOE
    //   Hospital (General Medical & Surgical)  ->  Hospital
    //   Supermarket/Grocery Store              ->  Supermarket
    //   Warehouse (Non-Refrigerated)           ->  Warehouse
    //
    // Without these three keys, backfilling the column with its own
    // documented values resolves to null here and every hospital,
    // supermarket and warehouse is silently EXCLUDED from the reference
    // comparison. No error, no empty tile — just buildings quietly missing
    // from a portfolio count. Verified before the backfill ran: 3 of the 8
    // EPA values returned null.
    //
    // Both spellings are accepted so ONE stored value serves both consumers.
    // Store the EPA form (it is the authoritative one and the API needs it
    // exactly); read it through here for anything DOE-based.
    'hospital (general medical & surgical)': 'Hospital',
    'supermarket/grocery store': 'Supermarket',
    'warehouse (non-refrigerated)': 'Warehouse',

    // Deliberately absent: manufacturing, industrial, senior living,
    // refrigerated warehouse, data center. No DOE commercial prototype
    // represents them, and EPA's eight-value list has no entry for them
    // either, so a building of one of these types is genuinely not
    // benchmarkable this way and is excluded rather than mis-compared.
  };

  function normalizePropertyType(raw) {
    if (!raw) return null;
    return PROPERTY_TYPE_CROSSWALK[String(raw).trim().toLowerCase()] || null;
  }

  // Customer-level fallback, set once per render from options.propertyType.
  var _fallbackPropertyType = null;

  // Returns null rather than guessing. This used to default to 'Office', and
  // because property_type is null on every account in the live database, that
  // meant every warehouse, hotel and retail site in a portfolio was being
  // benchmarked against the DOE OFFICE prototype. At a portfolio EUI of 47
  // kBtu/sqft that reads as -27% "Strong outperform" against Office and +22%
  // "Investigate" against Warehouse — a 49-point swing produced entirely by a
  // field nobody filled in. A flattering verdict nobody chose is worse than
  // no verdict, so callers must now handle null.
  function acctPropType(a) {
    return normalizePropertyType(a && a.property_type) || _fallbackPropertyType;
  }
  // The Supabase loader emits `storeCode`; the upload path emits `store_code`.
  // Reading only one of them returned '' for every Supabase-loaded account,
  // which is why store codes were blank in tile detail rows.
  function acctStore(a) {
    return (a && (a.store_code || a.storeCode || a.name)) || '';
  }

  // ── Building identity ────────────────────────────────────────────────────
  // A BUILDING is not a meter. A site with electricity and gas is two accounts
  // rows sharing one location and one floor area, and EUI is a per-building
  // figure: total site energy over that floor area, counted once.
  //
  // location_id is the real key. The store-code fallback exists because the
  // upload path does not carry one: the live convention pairs "VAN-MO060"
  // (electric) with "VAN-MO060-G" (gas), so stripping a trailing -G rejoins
  // them. If neither is available the meter stands alone, which is the
  // previous behaviour and no worse than it was.
  function acctBuildingKey(a) {
    if (a && a.location_id) return 'loc:' + a.location_id;
    var s = acctStore(a);
    if (s) return 'sc:' + s.replace(/-G$/i, '');
    return 'acct:' + ((a && a.id) || Math.random());
  }

  // Site-energy conversions. Electricity is billed in kWh, gas in therms, and
  // EUI is kBtu/sqft — so both have to be converted before they can be added.
  var KWH_TO_KBTU    = 3.412;
  var THERMS_TO_KBTU = 100;

  function acctIsGas(a) { return acctType(a).indexOf('gas') === 0; }

  function acctKbtu(a) {
    var u = acctUsage(a);
    if (!(u > 0)) return 0;
    return acctIsGas(a) ? u * THERMS_TO_KBTU : u * KWH_TO_KBTU;
  }

  // ── Tier ladder ──────────────────────────────────────────────────────────
  var TIER_RANK = { free: 0, pro: 1, intelligence: 2 };
  var TIER_LABEL = { free: 'Beacon Free', pro: 'Beacon Pro', intelligence: 'Beacon Intelligence' };
  var AMBER = '#f59e0b';

  function rank(t) {
    var r = TIER_RANK[String(t || 'free').toLowerCase()];
    return r == null ? 0 : r;
  }

  // ── Billing history resolution ───────────────────────────────────────────
  // Two tiles (Bill Anomaly, Weather-Normalized M&V) need a MONTHLY history.
  // Beacon holds annual totals today; real monthly bills arrive with Phase 2's
  // bill parser. Until then a DEMO customer can be given a synthetic history
  // so the tiles exercise the real math against something.
  //
  // The rule, and it is the whole reason this function exists rather than the
  // tiles calling the generator themselves: synthetic data is produced ONLY
  // when the caller passes isDemo === true, and when it is, every tile built
  // from it is badged as demo data on its face. A real ingested account gets
  // real bills or it gets an "awaiting data" shell. There is no third path.
  //
  // Accepts real history in either shape, so wiring the bill parser later does
  // not touch the tiles:
  //   { by_account: { '<store_code>': [bill, ...] } }
  //   [bill, ...]                       (single meter, or pre-merged)
  function resolveBillHistory(accounts, opts) {
    var o = opts || {};
    var byAccount = {};
    var count = 0;

    var real = o.billHistory;
    if (real && !Array.isArray(real) && real.by_account) {
      byAccount = real.by_account;
      count = Object.keys(byAccount).length;
    } else if (Array.isArray(real) && real.length) {
      byAccount[acctStore(accounts && accounts[0]) || 'portfolio'] = real;
      count = 1;
    }

    if (count > 0) {
      var syn = false;
      if (window.BeaconDemoBills) {
        Object.keys(byAccount).forEach(function (k) {
          if (window.BeaconDemoBills.isSynthetic(byAccount[k])) syn = true;
        });
      }
      return { by_account: byAccount, account_count: count, synthetic: syn };
    }

    // No real history. Synthesize only for a demo customer.
    if (o.isDemo !== true || !window.BeaconDemoBills) {
      return { by_account: {}, account_count: 0, synthetic: false };
    }
    var adapted = (accounts || []).map(function (a) {
      return {
        store_code: acctStore(a),
        state: acctState(a),
        type: acctType(a),
        annual_usage: acctUsage(a),
      };
    }).filter(function (a) { return a.annual_usage > 0; });

    var gen = window.BeaconDemoBills.generatePortfolio(adapted, { isDemo: true });
    if (!gen) return { by_account: {}, account_count: 0, synthetic: false };
    return {
      by_account: gen.by_account,
      account_count: gen.account_count,
      synthetic: true,
    };
  }

  // Longest history held on any single meter. That is the figure the tiles
  // gate on, because the math runs per meter, not on a pooled series.
  function maxMonthsHeld(hist) {
    var m = 0;
    Object.keys((hist && hist.by_account) || {}).forEach(function (k) {
      var n = (hist.by_account[k] || []).length;
      if (n > m) m = n;
    });
    return m;
  }

  // Badge shown on any tile whose numbers came out of the generator. Kept
  // visually distinct from the amber "awaiting"/"locked" shells — this tile
  // has real math and real output, it just does not have real bills.
  function demoRibbon() {
    return '<div class="bm-row" style="border-top:1px dashed rgba(245,158,11,.45);margin-top:6px;padding-top:7px">' +
      '<span class="bm-row-lbl" style="color:' + AMBER + '">Demo data</span>' +
      '<span class="bm-row-val" style="color:' + AMBER + ';font-weight:400;text-align:right">' +
      'synthetic bills · real NOAA normals + real regression · not quotable' +
      '</span></div>';
  }

  // demoCite() removed 2026-09-17. It printed a four-line block directly
  // beneath demoRibbon(), which already says the same thing in one line. The
  // only phrase in it doing real work was "not quotable", which moved into
  // the ribbon. Everything else was source credentials, now on the Sources
  // page. The DEMO DISCLOSURE ITSELF IS NOT A CITATION and must never be
  // removed from these tiles — synthetic numbers have to be labelled where
  // they are shown.

  // Long-run normals for a site, from climate_normals.js. Falls back to the
  // national figures rather than inventing a climate.
  function normalsFor(state) {
    var st = String(state || '').toUpperCase();
    try {
      var id = (window.CLIMATE_PRINCIPAL_BY_STATE || {})[st];
      var s = (window.CLIMATE_STATIONS || {})[id];
      if (s && s.hdd != null && s.cdd != null) {
        return { hdd: Number(s.hdd), cdd: Number(s.cdd), station: s.id, name: s.name };
      }
    } catch (e) { /* fall through */ }
    return {
      hdd: Number(window.NATIONAL_HDD_65) || 4197,
      cdd: Number(window.NATIONAL_CDD_65) || 1322,
      station: null,
      name: 'U.S. average',
    };
  }

  // What data do we actually hold right now?
  //   annual   — always true once a portfolio is uploaded
  //   monthly  — 6+ readings per meter; Bill Anomaly's own floor
  //   interval — 15-min or hourly; nothing in Beacon produces this yet
  function dataDepth(accounts, hist) {
    var months = maxMonthsHeld(hist);
    var typed = (accounts || []).filter(function (a) { return !!acctPropType(a); }).length;
    return {
      annual: !!(accounts && accounts.length),
      property_type: typed > 0,
      typedCount: typed,
      monthly: months >= 6,
      monthsHeld: months,
      interval: false,
    };
  }

  var NEEDS_LABEL = {
    property_type: 'a property type on each building',
    annual: 'annual usage totals',
    monthly: '12 months of bills per meter',
    interval: '15-minute or hourly interval data',
  };

  // ── Shell tiles: locked (wrong plan) and awaiting (missing data) ─────────
  function shellTile(o) {
    // o: { icon, title, unit, what, source, badge, badgeColor, reqLabel, reqValue, haveLabel, haveValue }
    var c = o.badgeColor;
    var html = '<div class="icard" style="opacity:.62">';
    html += '<div class="ic-lbl">' + o.icon + ' ' + _esc(o.title) + '</div>';
    html += '<div class="ic-cols">';
    html += '  <div class="ic-hero">';
    html += '    <div class="bm-bignum" style="color:var(--mu);font-weight:600">—</div>';
    html += '    <div class="ic-unit">' + _esc(o.unit) + '</div>';
    html += '    <div class="bm-verdict" style="background:rgba(' + o.badgeRgb + ',0.13);color:' + c +
            ';border:1px solid rgba(' + o.badgeRgb + ',0.38)">' + _esc(o.badge) + '</div>';
    html += '  </div>';
    html += '  <div class="ic-data">';
    html += '    <div class="bm-rows">';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Measures</span><span class="bm-row-val" style="font-weight:400;text-align:right">' + _esc(o.what) + '</span></div>';
    html += '      <div class="bm-row"><span class="bm-row-lbl">' + _esc(o.reqLabel) + '</span><span class="bm-row-val" style="color:' + c + '">' + _esc(o.reqValue) + '</span></div>';
    if (o.haveLabel) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">' + _esc(o.haveLabel) + '</span><span class="bm-row-val">' + _esc(o.haveValue) + '</span></div>';
    }
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function lockedTile(spec) {
    return shellTile({
      icon: spec.icon, title: spec.title, unit: spec.unit, what: spec.what, source: spec.source,
      badge: TIER_LABEL[spec.tier], badgeColor: AMBER, badgeRgb: '245,158,11',
      reqLabel: 'Included with', reqValue: TIER_LABEL[spec.tier],
    });
  }

  function awaitingTile(spec, depth) {
    var have = spec.needs === 'monthly'
      ? (depth.monthsHeld > 0 ? depth.monthsHeld + ' months held' : 'annual totals only')
      : spec.needs === 'property_type'
        ? (depth.typedCount > 0 ? depth.typedCount + ' buildings typed' : 'no building has one set')
        : 'not collected yet';
    // A tile with its own longer history requirement must say so, or the
    // shell contradicts itself: "needs 12 months / you have 12 months held"
    // on a tile that is actually waiting for 24.
    var need = spec.needs === 'monthly' && spec.minMonths
      ? spec.minMonths + ' months of bills per meter'
      : NEEDS_LABEL[spec.needs];

    return shellTile({
      icon: spec.icon, title: spec.title, unit: spec.unit, what: spec.what, source: spec.source,
      badge: 'Awaiting data', badgeColor: AMBER, badgeRgb: '245,158,11',
      reqLabel: 'Needs', reqValue: need,
      haveLabel: 'You have', haveValue: have,
    });
  }

  // Tier is sufficient AND the data is there, but the tile itself is not wired
  // yet. Saying "awaiting data" here would be a lie the user could catch — the
  // panel would read "needs 12 months of bills / you have 12 months held".
  function notBuiltTile(spec) {
    return shellTile({
      icon: spec.icon, title: spec.title, unit: spec.unit, what: spec.what, source: spec.source,
      badge: 'In development', badgeColor: AMBER, badgeRgb: '245,158,11',
      reqLabel: 'Status', reqValue: 'module built, panel not yet wired',
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Tile 1 — DOE Reference Building Comparison
  // ─────────────────────────────────────────────────────────────────
  function tileReferenceBuilding(accounts) {
    if (!window.BeaconReferenceBuildings) return '';

    // ── TWO BUGS FIXED HERE 2026-09-17 ─────────────────────────────────────
    //
    // 1. GAS WAS BEING THROWN AWAY. The loop opened with
    //        if (acctType(acct) !== 'electric') return;
    //    so a building's gas meter was skipped entirely while its electric
    //    meter supplied both the consumption AND the floor area. EUI is total
    //    SITE energy per square foot; dropping a fuel understates it, and it
    //    understates in one direction only, so every building with gas looked
    //    more efficient than it is. Measured on the live portfolio: mean EUI
    //    57.4 electric-only against 64.4 all-fuel, a 12.3% understatement
    //    across the portfolio and far worse on the 110 buildings that have
    //    gas. A heating-dominated site could read barely half its real EUI.
    //
    // 2. EXCLUSIONS WERE SILENT. A building with no DOE reference for its
    //    climate zone was dropped with a bare `return` and never counted.
    //    DOE publishes medium_office for all 15 zones but every other
    //    prototype for only 2A/4A/5A (+6A for some), so a warehouse in
    //    California or a supermarket in Georgia simply vanished from the
    //    comparison. 62 of 311 live locations sit in such a zone. The tile
    //    reported a confident portfolio number over an unstated subset.
    //
    // Now: meters are aggregated into BUILDINGS, all fuels are converted to
    // kBtu and summed, floor area is counted ONCE per building, and every
    // exclusion is counted and shown with its reason.

    var buildings = {};
    accounts.forEach(function (acct) {
      var key = acctBuildingKey(acct);
      var b = buildings[key];
      if (!b) {
        b = buildings[key] = {
          kbtu: 0, sqft: 0, state: '', pt: null, stores: [], fuels: {},
        };
      }
      b.kbtu += acctKbtu(acct);
      // Floor area is a property of the building, repeated on each meter —
      // max, never sum, or a two-meter site doubles its own area and halves
      // its EUI.
      b.sqft = Math.max(b.sqft, acctSqft(acct));
      if (!b.state) b.state = acctState(acct);
      if (!b.pt) b.pt = acctPropType(acct);
      b.fuels[acctIsGas(acct) ? 'gas' : 'electric'] = true;
      var sc = acctStore(acct);
      if (sc) b.stores.push(sc);
    });

    var totalKbtu = 0, totalSqft = 0, refTotalKbtu = 0, comparedCount = 0;
    var skippedNoType = 0, skippedNoReference = 0, skippedNoData = 0;
    var missingZones = {};
    var outliers = [];

    Object.keys(buildings).forEach(function (k) {
      var b = buildings[k];
      if (b.kbtu <= 0 || b.sqft < 100) { skippedNoData++; return; }
      if (!b.pt) { skippedNoType++; return; }

      var actualEUI = b.kbtu / b.sqft;
      var cmp = window.BeaconReferenceBuildings.compareToReference(actualEUI, b.pt, b.state);
      if (!cmp) {
        // Tier is fine and the data is there — DOE simply has no prototype
        // for this type in this climate zone.
        skippedNoReference++;
        var z = null;
        try { z = window.BeaconReferenceBuildings.climateZoneFor(b.state); } catch (e) {}
        var label = b.pt + (z ? ' in zone ' + z : '');
        missingZones[label] = (missingZones[label] || 0) + 1;
        return;
      }

      totalKbtu += b.kbtu;
      totalSqft += b.sqft;
      refTotalKbtu += cmp.reference_eui * b.sqft;
      comparedCount++;
      if (Math.abs(cmp.delta_pct) > 15) {
        outliers.push({ name: b.stores[0] || b.state, state: b.state, delta: cmp.delta_pct });
      }
    });

    var excluded = skippedNoType + skippedNoReference + skippedNoData;
    if (totalSqft === 0) return '';

    var pEUI = totalKbtu / totalSqft;
    var rEUI = refTotalKbtu / totalSqft;
    var delta = ((pEUI - rEUI) / rEUI) * 100;
    var verdictColor = delta < -5 ? '#22c55e' : delta < 5 ? '#add540' : AMBER;
    var verdictText = delta < -15 ? 'Strong outperform'
                    : delta < -5  ? 'Below reference'
                    : delta < 5   ? 'In line with reference'
                    : delta < 15  ? 'Above reference'
                                  : 'Investigate';
    var deltaStr = (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%';

    outliers.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    var topOutlier = outliers[0];

    // Coverage. A verdict over 60% of a portfolio is a different claim from a
    // verdict over all of it, and the tile should not let those look alike.
    var totalBuildings = comparedCount + excluded;
    var coveragePct = totalBuildings > 0 ? (comparedCount / totalBuildings) * 100 : 0;
    var thinCoverage = coveragePct < 90;

    var html = '<div class="icard">';
    html += '<div class="ic-lbl">\ud83c\udfdb\ufe0f Reference Building Comparison</div>';
    html += '<div class="ic-cols">';
    html += '  <div class="ic-hero">';
    html += '    <div class="bm-bignum" style="color:' + verdictColor + '">' + deltaStr + '</div>';
    html += '    <div class="ic-unit">vs DOE reference EUI</div>';
    html += '    <div class="bm-verdict" style="background:rgba(173,213,64,0.15);color:' + verdictColor + ';border:1px solid rgba(173,213,64,0.35)">' + _esc(verdictText) + '</div>';
    html += '  </div>';
    html += '  <div class="ic-data">';
    html += '    <div class="bm-rows">';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Portfolio EUI</span><span class="bm-row-val">' + pEUI.toFixed(1) + ' kBtu/sqft</span></div>';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Reference EUI</span><span class="bm-row-val">' + rEUI.toFixed(1) + ' kBtu/sqft</span></div>';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Buildings compared</span><span class="bm-row-val"' +
            (thinCoverage ? ' style="color:' + AMBER + '"' : '') + '>' + comparedCount + ' of ' + totalBuildings + '</span></div>';
    if (skippedNoReference > 0) {
      var zoneList = Object.keys(missingZones).sort(function (a, b) {
        return missingZones[b] - missingZones[a];
      }).slice(0, 2).join(', ');
      html += '      <div class="bm-row"><span class="bm-row-lbl">Excluded \u00b7 no DOE prototype</span>' +
              '<span class="bm-row-val" style="color:' + AMBER + '">' + skippedNoReference +
              (zoneList ? ' (' + _esc(zoneList) + ')' : '') + '</span></div>';
    }
    if (skippedNoType > 0) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">Excluded \u00b7 no property type</span><span class="bm-row-val" style="color:' + AMBER + '">' + skippedNoType + '</span></div>';
    }
    if (skippedNoData > 0) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">Excluded \u00b7 no usage or area</span><span class="bm-row-val">' + skippedNoData + '</span></div>';
    }
    if (topOutlier) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">Largest outlier</span><span class="bm-row-val" style="color:' + AMBER + '">' + _esc(topOutlier.name || topOutlier.state) + ' \u00b7 ' + (topOutlier.delta >= 0 ? '+' : '') + topOutlier.delta.toFixed(0) + '%</span></div>';
    }
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    // Source credentials (DOE prototypes, the kBtu conversion) moved to the
    // Sources page. What stays is the coverage caveat, which is not a
    // citation — it says this verdict does not describe the whole portfolio.
    if (thinCoverage) {
      html += '<div class="bm-basis" style="color:' + AMBER + '">Covers ' +
              Math.round(coveragePct) + '% of the portfolio \u00b7 excluded buildings listed above</div>';
    }
    html += '</div>';
    return html;
  }

  // ─────────────────────────────────────────────────────────────────
  // Tile 2 — Carbon Emissions (Scope 1 + 2)
  // ─────────────────────────────────────────────────────────────────
  function tileEmissions(accounts) {
    if (!window.BeaconEmissions) return '';

    var adapted = accounts.map(function (a) {
      return {
        account_type: acctType(a),
        state: acctState(a),
        annual_usage: acctUsage(a),
        store_code: acctStore(a),
      };
    }).filter(function (a) { return a.annual_usage > 0 && a.state; });

    var result = window.BeaconEmissions.portfolioEmissions(adapted);
    if (!result || result.account_count === 0) return '';

    var total = result.total_metric_tons_co2e;
    var scope2 = result.scope2_metric_tons_co2e;
    var scope1 = result.scope1_metric_tons_co2e;

    var stateList = Object.keys(result.by_state).map(function (s) {
      return { state: s, tons: result.by_state[s] };
    }).sort(function (a, b) { return b.tons - a.tons; }).slice(0, 3);

    var html = '<div class="icard">';
    html += '<div class="ic-lbl">🌱 Carbon Emissions</div>';
    html += '<div class="ic-cols">';
    html += '  <div class="ic-hero">';
    html += '    <div class="bm-bignum" style="color:var(--lime)">' + fmtTonsShort(total) + '</div>';
    html += '    <div class="ic-unit">tCO₂e per year · Scope 1 + 2</div>';
    html += '    <div class="bm-verdict" style="background:rgba(173,213,64,0.15);color:var(--lime);border:1px solid rgba(173,213,64,0.35)">' + result.account_count + ' meters</div>';
    html += '  </div>';
    html += '  <div class="ic-data">';
    html += '    <div class="bm-rows">';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Scope 2 (electric)</span><span class="bm-row-val">' + fmtNum(scope2) + ' tCO₂e</span></div>';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Scope 1 (natural gas)</span><span class="bm-row-val">' + fmtNum(scope1) + ' tCO₂e</span></div>';
    stateList.forEach(function (s, i) {
      var lbl = i === 0 ? 'Top state · ' + _esc(s.state) : _esc(s.state);
      html += '      <div class="bm-row"><span class="bm-row-lbl">' + lbl + '</span><span class="bm-row-val">' + fmtNum(s.tons) + ' tCO₂e</span></div>';
    });
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ─────────────────────────────────────────────────────────────────
  // Tile 3 — Grid Services / VPP Opportunity
  // ─────────────────────────────────────────────────────────────────
  function tileVPP(accounts) {
    if (!window.BeaconVPP) return '';

    var adapted = accounts.map(function (a) {
      return {
        account_type: acctType(a),
        state: acctState(a),
        annual_usage: acctUsage(a),
        // May be null. BeaconVPP applies its own default; this tile is already
        // badged directional, so the looser handling is acceptable here in a
        // way it is not for the reference comparison.
        property_type: acctPropType(a) || 'Office',
        sqft: acctSqft(a),
        store_code: acctStore(a),
      };
    });

    // bundle 130: meters with interval data are valued from their own load
    // (flexible kW = capacity tag or measured peak − measured base load, at the
    // ISO's published capacity price). Only the rest stay directional.
    var meas = window.BeaconLoad && window.BeaconLoad.measured ? window.BeaconLoad.measured(accounts) : null;
    if (meas) adapted = adapted.filter(function (x, i) { return !meas.ids[accounts[i].id]; });
    var result = adapted.length ? window.BeaconVPP.assessPortfolio(adapted) : null;
    if (meas) return tileVPPMeasured(meas, result);
    if (!result || result.eligible_account_count === 0) return '';

    var isoList = Object.keys(result.by_iso).map(function (i) {
      return { iso: i, rev: result.by_iso[i] };
    }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 3);

    var html = '<div class="icard">';
    html += '<div class="ic-lbl">⚡ Grid Services Revenue Opportunity</div>';
    html += '<div class="ic-cols">';
    html += '  <div class="ic-hero">';
    html += '    <div class="bm-bignum" style="color:' + AMBER + '">' + fmtDollar(result.total_annual_revenue) + '</div>';
    html += '    <div class="ic-unit">indicative range · VPP / DR</div>';
    html += '    <div class="bm-verdict" style="background:rgba(245,158,11,0.13);color:' + AMBER + ';border:1px solid rgba(245,158,11,0.38)">Directional — not a quote</div>';
    html += '  </div>';
    html += '  <div class="ic-data">';
    html += '    <div class="bm-rows">';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Flexible load</span><span class="bm-row-val">' + fmtNum(result.total_flexible_kw) + ' kW</span></div>';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Eligible sites</span><span class="bm-row-val">' + result.eligible_account_count + '</span></div>';
    isoList.forEach(function (i) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">' + _esc(i.iso) + '</span><span class="bm-row-val">' + fmtDollar(i.rev) + '/yr</span></div>';
    });
    html += '      <div class="bm-row"><span class="bm-row-lbl">To firm up</span><span class="bm-row-val" style="color:' + AMBER + '">interval data</span></div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function tileVPPMeasured(meas, rest) {
    var LIME = '#add540';
    var isoList = Object.keys(meas.byIso).map(function (i) { return { iso: i, rev: meas.byIso[i] }; }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 3);
    var html = '<div class="icard">';
    html += '<div class="ic-lbl">⚡ Grid Services Revenue Opportunity</div>';
    html += '<div class="ic-cols">';
    html += '  <div class="ic-hero">';
    html += '    <div class="bm-bignum" style="color:' + LIME + '">' + fmtDollar(meas.value) + '</div>';
    html += '    <div class="ic-unit">per year · capacity value of flexible load</div>';
    html += '    <div class="bm-verdict" style="background:rgba(173,213,64,0.12);color:' + LIME + ';border:1px solid rgba(173,213,64,0.35)">Measured · ' + meas.n + ' meter' + (meas.n === 1 ? '' : 's') + ' with interval data</div>';
    html += '  </div>';
    html += '  <div class="ic-data">';
    html += '    <div class="bm-rows">';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Flexible load (measured)</span><span class="bm-row-val">' + fmtNum(meas.kw) + ' kW</span></div>';
    isoList.forEach(function (i) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">' + _esc(i.iso) + '</span><span class="bm-row-val">' + fmtDollar(i.rev) + '/yr</span></div>';
    });
    if (rest && rest.eligible_account_count) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">Not yet measured</span><span class="bm-row-val" style="color:' + AMBER + '">' + rest.eligible_account_count + ' sites · ' + fmtDollar(rest.total_annual_revenue) + ' directional</span></div>';
    }
    html += '      <div class="bm-row"><span class="bm-row-lbl">Basis</span><span class="bm-row-val" style="text-align:right">tag or peak − base load × ISO capacity price · before aggregator share</span></div>';
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ─────────────────────────────────────────────────────────────────
  // Tile 4 — Bill Anomaly Detection
  // ─────────────────────────────────────────────────────────────────
  // Runs the production detector per meter: fit a degree-day model on that
  // meter's own history, then score each period's residual against a rolling
  // reference window. Both gates in bill_anomaly.js apply, so what surfaces
  // here is statistically unusual AND materially large.
  function tileAnomaly(accounts, ctx) {
    if (!window.BeaconBillAnomaly || !window.BeaconWeatherNorm) return '';
    var hist = ctx && ctx.history;
    if (!hist || !hist.account_count) return '';

    var flagged = [], metersRun = 0, metersFlagged = 0, screen = null;

    accounts.forEach(function (a) {
      var bills = hist.by_account[acctStore(a)] || hist.by_account["id:" + (a && a.id)];
      if (!bills || bills.length < 6) return;
      metersRun++;
      var model = window.BeaconWeatherNorm.fitModel(bills);
      var anoms = window.BeaconBillAnomaly.detectAnomalies(bills, model);
      if (anoms.length) metersFlagged++;
      anoms.forEach(function (x) {
        screen = screen || x.screen;
        flagged.push({
          store: acctStore(a),
          unit: bills[0].consumption_unit || (acctType(a).indexOf('gas') === 0 ? 'therms' : 'kWh'),
          period: x.period_start,
          z: x.z_score,
          dir: x.direction,
          severity: x.severity,
          excess: x.excess_consumption,
          excessPct: x.excess_pct,
          basis: x.basis,
        });
      });
    });

    if (!metersRun) return '';

    var high = flagged.filter(function (f) { return f.dir === 'high'; });
    var low = flagged.filter(function (f) { return f.dir === 'low'; });

    // Lead with the biggest overage — that is the one with money attached.
    var worst = high.slice().sort(function (p, q) {
      return Math.abs(q.excess || 0) - Math.abs(p.excess || 0);
    })[0];

    var verdictTxt, verdictCol, verdictRgb;
    if (!flagged.length) {
      verdictTxt = 'No exceptions'; verdictCol = 'var(--lime)'; verdictRgb = '173,213,64';
    } else if (high.length) {
      verdictTxt = high.length + ' overage' + (high.length === 1 ? '' : 's') + ' to investigate';
      verdictCol = AMBER; verdictRgb = '245,158,11';
    } else {
      verdictTxt = 'Sustained reductions only'; verdictCol = 'var(--lime)'; verdictRgb = '173,213,64';
    }

    var html = '<div class="icard">';
    html += '<div class="ic-lbl">📉 Bill Anomaly Detection</div>';
    html += '<div class="ic-cols">';
    html += '  <div class="ic-hero">';
    html += '    <div class="bm-bignum" style="color:' + (flagged.length ? AMBER : 'var(--lime)') + '">' + flagged.length + '</div>';
    html += '    <div class="ic-unit">flagged periods vs weather-adjusted baseline</div>';
    html += '    <div class="bm-verdict" style="background:rgba(' + verdictRgb + ',0.13);color:' + verdictCol +
            ';border:1px solid rgba(' + verdictRgb + ',0.38)">' + _esc(verdictTxt) + '</div>';
    html += '  </div>';
    html += '  <div class="ic-data">';
    html += '    <div class="bm-rows">';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Meters screened</span><span class="bm-row-val">' + metersRun + ' of ' + accounts.length + '</span></div>';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Meters with a flag</span><span class="bm-row-val">' + metersFlagged + '</span></div>';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Above expectation</span><span class="bm-row-val" style="color:' + (high.length ? AMBER : 'inherit') + '">' + high.length + '</span></div>';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Below expectation</span><span class="bm-row-val">' + low.length + '</span></div>';
    if (worst) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">Largest · ' + _esc(worst.store) + '</span>' +
              '<span class="bm-row-val" style="color:' + AMBER + '">+' + fmtNum(worst.excess) + ' ' + _esc(worst.unit) +
              ' (' + (worst.excessPct >= 0 ? '+' : '') + Math.round(worst.excessPct) + '%)</span></div>';
      html += '      <div class="bm-row"><span class="bm-row-lbl">Period</span><span class="bm-row-val">' + _esc(String(worst.period).slice(0, 7)) + '</span></div>';
    }
    if (screen) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">Screen applied</span><span class="bm-row-val" style="font-weight:400">|z| &gt; ' +
              screen.z_threshold + ' and &ge; ' + Math.round(screen.materiality_pct) + '% off expectation</span></div>';
    }
    if (hist.synthetic) html += demoRibbon();
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ─────────────────────────────────────────────────────────────────
  // Tile 5 — Weather-Normalized M&V
  // ─────────────────────────────────────────────────────────────────
  // Needs 24 months per meter: fit the first 12 as baseline, the second 12 as
  // reporting, express both at the site's long-run climate normals, and the
  // difference is savings with weather removed.
  //
  // Fuels are kept apart. kWh and therms are not summed and no site-level
  // conversion is invented, so the hero figure is a percentage and the
  // absolute figures are reported per fuel in their own units.
  function tileMV(accounts, ctx) {
    if (!window.BeaconWeatherNorm) return '';
    var hist = ctx && ctx.history;
    if (!hist || !hist.account_count) return '';

    var groups = {};   // unit -> { base, rep, meters, passing }
    var metersRun = 0, metersPassing = 0, tooShort = 0;

    accounts.forEach(function (a) {
      var bills = hist.by_account[acctStore(a)] || hist.by_account["id:" + (a && a.id)];
      if (!bills) return;
      if (bills.length < 24) { if (bills.length >= 6) tooShort++; return; }

      var half = Math.floor(bills.length / 2);
      var bm = window.BeaconWeatherNorm.fitModel(bills.slice(0, half));
      var rm = window.BeaconWeatherNorm.fitModel(bills.slice(half));
      if (!bm.valid || !rm.valid) return;

      var n = normalsFor(acctState(a));
      var cmp = window.BeaconWeatherNorm.compareBaselineToReporting(bm, rm, n.hdd, n.cdd);
      if (!cmp) return;

      metersRun++;
      if (bm.meets_ashrae_14) metersPassing++;

      var unit = bills[0].consumption_unit || (acctType(a).indexOf('gas') === 0 ? 'therms' : 'kWh');
      var g = groups[unit] || (groups[unit] = { base: 0, rep: 0, meters: 0, passing: 0 });
      g.base += cmp.baseline_normalized;
      g.rep += cmp.reporting_normalized;
      g.meters++;
      if (bm.meets_ashrae_14) g.passing++;
    });

    if (!metersRun) return '';

    // Hero = the fuel with the most meters behind it.
    var units = Object.keys(groups).sort(function (p, q) { return groups[q].meters - groups[p].meters; });
    var lead = groups[units[0]];
    var leadPct = lead.base > 0 ? ((lead.base - lead.rep) / lead.base) * 100 : 0;

    // Confidence is driven by baseline fit quality, not by the size of the
    // number. A large saving off a poor baseline is not a better result.
    var conf = metersPassing === metersRun ? 'high'
             : metersPassing > 0 ? 'mixed' : 'low';
    var confCol = conf === 'high' ? 'var(--lime)' : AMBER;
    var confRgb = conf === 'high' ? '173,213,64' : '245,158,11';
    var confTxt = conf === 'high' ? 'Meets ASHRAE G14'
                : conf === 'mixed' ? metersPassing + ' of ' + metersRun + ' meet ASHRAE G14'
                : 'Baseline fit below G14';

    var html = '<div class="icard">';
    html += '<div class="ic-lbl">📐 Weather-Normalized M&amp;V</div>';
    html += '<div class="ic-cols">';
    html += '  <div class="ic-hero">';
    html += '    <div class="bm-bignum" style="color:' + (leadPct > 0 ? 'var(--lime)' : AMBER) + '">' +
            (leadPct > 0 ? '−' : '+') + Math.abs(leadPct).toFixed(1) + '%</div>';
    html += '    <div class="ic-unit">' + _esc(units[0]) + ' · savings net of weather</div>';
    html += '    <div class="bm-verdict" style="background:rgba(' + confRgb + ',0.13);color:' + confCol +
            ';border:1px solid rgba(' + confRgb + ',0.38)">' + _esc(confTxt) + '</div>';
    html += '  </div>';
    html += '  <div class="ic-data">';
    html += '    <div class="bm-rows">';
    units.forEach(function (u) {
      var g = groups[u];
      var saved = g.base - g.rep;
      var p = g.base > 0 ? (saved / g.base) * 100 : 0;
      html += '      <div class="bm-row"><span class="bm-row-lbl">' + _esc(u) + ' saved · ' + g.meters + ' meter' + (g.meters === 1 ? '' : 's') + '</span>' +
              '<span class="bm-row-val" style="color:' + (saved > 0 ? 'var(--lime)' : AMBER) + '">' +
              fmtNum(Math.abs(saved)) + ' ' + _esc(u) + ' (' + (p >= 0 ? '−' : '+') + Math.abs(p).toFixed(1) + '%)</span></div>';
    });
    html += '      <div class="bm-row"><span class="bm-row-lbl">Baseline vs reporting</span><span class="bm-row-val">12 mo vs 12 mo</span></div>';
    html += '      <div class="bm-row"><span class="bm-row-lbl">Baselines meeting G14</span><span class="bm-row-val" style="color:' + confCol + '">' + metersPassing + ' of ' + metersRun + '</span></div>';
    if (tooShort) {
      html += '      <div class="bm-row"><span class="bm-row-lbl">Excluded · under 24 mo</span><span class="bm-row-val">' + tooShort + ' meter' + (tooShort === 1 ? '' : 's') + '</span></div>';
    }
    if (hist.synthetic) html += demoRibbon();
    html += '    </div>';
    html += '  </div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ── Tile registry ────────────────────────────────────────────────────────
  // Order here is the order they appear inside their theme group.
  var TILES = [
    { key: 'reference', group: 'physics', tier: 'pro', needs: 'property_type',
      icon: '🏛️', title: 'Reference Building Comparison',
      unit: 'vs DOE reference EUI',
      what: 'portfolio EUI against physics-based DOE prototypes by property type',
      source: 'DOE Commercial Reference Buildings · EnergyPlus prototypes',
      render: tileReferenceBuilding },

    { key: 'carbon', group: 'physics', tier: 'pro', needs: 'annual',
      icon: '🌱', title: 'Carbon Emissions',
      unit: 'tCO₂e per year · Scope 1 + 2',
      what: 'Scope 2 from eGRID subregion factors, Scope 1 from gas combustion',
      source: 'EPA eGRID2023 total output · GHG Protocol · AR5 GWP',
      render: tileEmissions },

    { key: 'vpp', group: 'physics', tier: 'pro', needs: 'annual',
      icon: '⚡', title: 'Grid Services Revenue Opportunity',
      unit: 'indicative range · VPP / DR',
      what: 'demand-response revenue potential from flexible load by ISO',
      source: 'FERC Order 2222 · typical ISO capacity + energy rates',
      render: tileVPP },

    { key: 'anomaly', group: 'mv', tier: 'pro', needs: 'monthly',
      icon: '📉', title: 'Bill Anomaly Detection',
      unit: 'flagged months vs baseline',
      what: 'bills that deviate from the meter’s own weather-adjusted baseline',
      source: 'per-meter statistical baseline · needs a billing history',
      render: tileAnomaly },

    { key: 'mv', group: 'mv', tier: 'pro', needs: 'monthly',
      icon: '📐', title: 'Weather-Normalized M&V',
      unit: 'savings net of weather',
      what: 'true savings after weather is removed, via degree-day regression',
      source: 'ASHRAE Guideline 14 · NOAA degree days',
      // 24 months per meter, not 6 — a baseline year and a reporting year.
      minMonths: 24,
      render: tileMV },

    { key: 'hourly', group: 'interval', tier: 'intelligence', needs: 'interval',
      icon: '🕒', title: 'Hourly Emissions Profile',
      unit: 'tCO₂e by hour of day',
      what: 'carbon by hour against the real-time grid mix, not an annual average',
      source: 'hourly marginal grid emissions · interval consumption' },

    { key: 'tariff', group: 'interval', tier: 'intelligence', needs: 'interval',
      icon: '🧮', title: 'Tariff Optimization',
      unit: 'annual savings from rate switch',
      what: 'your actual load shape re-priced against every eligible utility tariff',
      source: 'NREL URDB tariffs · interval consumption' },

    { key: 'dr', group: 'interval', tier: 'intelligence', needs: 'interval',
      icon: '📡', title: 'Real-Time DR Dispatch',
      unit: 'events dispatched · revenue earned',
      what: 'live demand-response participation and settled revenue per event',
      source: 'ISO DR programs · telemetry' },
  ];

  var GROUPS = [
    { key: 'physics', eye: 'Theme · Physics-Based Benchmarks',
      title: 'How does the portfolio compare with comparable buildings?', btitle: 'How does this client compare with comparable buildings?',
      sub: 'reference models · carbon accounting · grid opportunity' },
    { key: 'mv', eye: 'Theme · Measurement & Verification',
      title: 'Have your changes affected your bottom line?', btitle: 'Have this client\'s changes affected their bottom line?',
      sub: 'requires a billing history · weather-adjusted' },
    { key: 'interval', eye: 'Theme · Interval Intelligence',
      title: 'How is energy used across the day?', btitle: 'When does this client use energy, hour by hour?',
      sub: 'requires interval data · 15-minute or hourly' },
  ];

  // ── Tier switcher (broker-side only) ─────────────────────────────────────
  // Follows the app's existing pattern for the "View as" toggle: set a URL
  // param and reload, rather than introducing a second source of truth for
  // state. Suppressed in client view — an end client should never be shown a
  // plan switcher for their own account.
  function tierSwitcher(active) {
    var qp = new URLSearchParams(window.location.search);
    if (qp.get('view') === 'client') return '';

    var btn = function (t) {
      var on = (t === active);
      return '<button type="button" data-bp-tier="' + t + '" style="' +
        'background:' + (on ? 'rgba(173,213,64,.18)' : 'transparent') + ';' +
        'border:1px solid ' + (on ? 'rgba(173,213,64,.55)' : 'rgba(255,255,255,.18)') + ';' +
        'color:' + (on ? 'var(--lime,#add540)' : 'var(--mu,#9AA9C0)') + ';' +
        'padding:5px 12px;border-radius:6px;font:600 12px/1 inherit;cursor:pointer;' +
        'transition:background .15s,border-color .15s,color .15s">' +
        _esc(TIER_LABEL[t].replace('Beacon ', '')) + '</button>';
    };

    return '<div style="display:flex;align-items:center;gap:8px;margin:0 0 20px;flex-wrap:wrap">' +
      '<span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--mu,#9AA9C0)">Preview tier</span>' +
      btn('free') + btn('pro') + btn('intelligence') +
      '<span style="font-size:11px;color:var(--mu,#9AA9C0);opacity:.75">what a client on each plan sees</span>' +
      '</div>';
  }

  function wireSwitcher(container) {
    container.querySelectorAll('[data-bp-tier]').forEach(function (b) {
      b.addEventListener('click', function () {
        var url = new URL(window.location.href);
        url.searchParams.set('tier', b.getAttribute('data-bp-tier'));
        window.location.href = url.toString();
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────
  function renderAll(containerId, accounts, options) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var opts = options || {};
    // Customer-level property type (customers.type / btype), crosswalked.
    // Null if absent or not representable by a DOE prototype.
    _fallbackPropertyType = normalizePropertyType(opts.propertyType);
    var tier = String(opts.tier || 'pro').toLowerCase();
    if (TIER_RANK[tier] == null) tier = 'pro';

    if (!accounts || accounts.length === 0) { container.innerHTML = ''; return; }

    // Resolve the billing history once per render. Synthetic only for a demo
    // customer; see resolveBillHistory.
    var history = resolveBillHistory(accounts, opts);
    var depth = dataDepth(accounts, history);
    var ctx = { history: history, depth: depth, tier: tier };
    var myRank = rank(tier);

    // Resolve each tile to active / awaiting / locked.
    // A real end client should never be shown a tile they cannot have. Locked
    // tiles are a broker-side comparison aid; surfacing them in client view
    // would be subscription upsell copy inside the product, which Beacon does
    // not do. Client view therefore sees only what is active for them plus
    // what their own data would unlock.
    var isClientView = false;
    try {
      isClientView = new URLSearchParams(window.location.search).get('view') === 'client';
    } catch (e) { /* non-browser context */ }

    var built = {};
    TILES.forEach(function (spec) {
      var html = '';
      // A tile may need MORE history than the generic 'monthly' floor of 6.
      // M&V needs a baseline year and a reporting year, so 24. Checking it
      // here means the shell says "needs 24 months, you have 12" instead of
      // the tile rendering empty and falling through to a vaguer message.
      var depthOk = !!depth[spec.needs] &&
        (!spec.minMonths || depth.monthsHeld >= spec.minMonths);

      if (myRank < rank(spec.tier)) {
        if (isClientView) return;          // hide entirely, no upsell
        html = lockedTile(spec);
      } else if (!depthOk) {
        html = awaitingTile(spec, depth);
      } else if (typeof spec.render === 'function') {
        html = spec.render(accounts, ctx);
        // A renderer returning '' means its own preconditions failed (no
        // matching property types, no eligible sites). That is an awaiting
        // state, not a reason to silently drop the tile.
        if (!html) html = awaitingTile(spec, depth);
      } else {
        html = notBuiltTile(spec);
      }
      (built[spec.group] = built[spec.group] || []).push(html);
    });

    var html = tierSwitcher(tier);
    GROUPS.forEach(function (g) {
      var tiles = built[g.key] || [];
      if (!tiles.length) return;
      html += '<div class="igrid-theme-hd">';
      html += '  <div class="igrid-theme-eye">' + g.eye + '</div>';
      html += '  <div class="igrid-theme-title"' + (g.btitle ? ' data-aud-broker="' + g.btitle.replace(/"/g, '&quot;') + '"' : '') + '>' + g.title + '</div>';
      html += '  <div class="igrid-theme-sub">' + g.sub + '</div>';
      html += '</div>';
      html += '<div class="igrid igrid-' + Math.min(tiles.length, 3) + '">' + tiles.join('') + '</div>';
    });

    container.innerHTML = html;
    wireSwitcher(container);
  }

  window.BeaconProRenderer = { renderAll: renderAll };
})();
