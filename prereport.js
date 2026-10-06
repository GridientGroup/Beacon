/* ============================================================================
 * prereport.js — Pre-engagement report (bundle 123)
 * ----------------------------------------------------------------------------
 * Admin tab (brokers only) → "Prospecting · Pre-engagement report".
 * A broker types in a prospect's building (address, type, floor area) and
 * what they know about its meters (utility, account number, 12-month usage
 * from a bill or the utility's usage history, contracted rate, contract
 * end). Beacon runs its existing engines on that one building and lays the
 * results out as a report the broker can save as PDF and send:
 *
 *   Supply vs price to compare   ptc.js (same match as the location cards)
 *   Contract position             expiration, days left, what it rolls onto
 *   Next 120 days                 triggers.js build() on this building
 *   Building performance standard bps_jurisdictions.js (coverage, $, dates)
 *   Energy use vs peers           benchmarks.js + city disclosure data
 *
 * Nothing is invented for a missing input. No usage → no EUI and no BPS
 * dollars (coverage and dates still show). No floor area → no EUI and BPS
 * coverage can't be decided. No contracted rate → the price to compare is
 * shown alone. Every estimate is labelled. Reads only; saves nothing.
 *
 *   window.BeaconPreReport.mount()          draw the form (runs on load)
 *   window.BeaconPreReport.build(input)     -> Promise<report model>
 * ========================================================================== */
(function () {
  'use strict';

  var GAS_RATE = 1.20;                       // $/therm, app-wide convention (perloc.js)
  var DAY = 86400000;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n) { return '$' + Math.abs(Math.round(n)).toLocaleString(); }
  function signedMoney(n) { return (n >= 0 ? '+' : '−') + money(n); }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/[, $]/g, '')); return isFinite(n) && n > 0 ? n : null; }
  function P() { return window.BeaconPTC || null; }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDate(d) { return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function mask(acct) { var s = String(acct || '').replace(/\s+/g, ''); return s ? (s.length > 4 ? '••••' + s.slice(-4) : s) : ''; }
  function fmtRate(v, unit) { var p = P(); return p && p._fmt ? p._fmt(v, unit) : String(v); }

  // ── model ────────────────────────────────────────────────────────────────
  function accountsFrom(inp) {
    var base = { address: inp.address, city: bpsCity(inp), state: inp.state, sqft: inp.sqft || 0,
                 property_type: inp.pub && inp.pub.type ? inp.pub.type : null,
                 steamKbtu: inp.pub ? inp.pub.steamKbtu || 0 : 0, oilKbtu: inp.pub ? inp.pub.oilKbtu || 0 : 0, status: 'Prospect', expiration: inp.expiration || '', exp: inp.expiration || '' };
    var out = [];
    if (inp.elecUtility || inp.kwh || inp.elecRate) {
      out.push(Object.assign({}, base, {
        id: 'pre_e', type: 'Electric', utility: inp.elecUtility || '', account: inp.elecAccount || '',
        usage: inp.kwh || 0, annualUsage: inp.kwh || 0,
        supplyRate: inp.elecRate, supplyRateUnit: inp.elecRate != null ? 'cents_per_kwh' : null,
        rateCents: inp.elecRate, tariffCode: inp.elecClass || null
      }));
    }
    if (inp.gasUtility || inp.therms || inp.gasRate) {
      out.push(Object.assign({}, base, {
        id: 'pre_g', type: 'Gas', utility: inp.gasUtility || '', account: inp.gasAccount || '',
        usage: inp.therms || 0, annualUsage: inp.therms || 0,
        supplyRate: inp.gasRate, supplyRateUnit: inp.gasRate != null ? 'dollars_per_therm' : null,
        tariffCode: inp.gasClass || null
      }));
    }
    return out;
  }

  // NYC disclosure rows cover all five boroughs; LL97 is matched on the city
  // name "New York", so a Brooklyn or Queens address must read as New York.
  function bpsCity(inp) { return inp.pub && inp.pub.source === 'nyc_ll84' ? 'New York' : inp.city; }

  function supplyFor(a) {
    var p = P();
    if (!p) return Promise.resolve({ a: a, state: 'unavailable' });
    var st = String(a.state || '').toUpperCase();
    if (p.DEREG.indexOf(st) === -1) return Promise.resolve({ a: a, state: 'regulated' });
    return p.match(a).then(function (m) {
      if (!m) return { a: a, state: 'nocatalog' };
      if (m.unmatched) return { a: a, state: 'unmatched' };
      var pv = p._ptcValue(m.row), c = p._contracted(a), r = { a: a, m: m, p: pv, c: c, state: 'ok' };
      if (pv && pv.kind !== 'none' && c && c.unit === pv.unit && isFinite(c.v)) {
        r.d = c.v - pv.v; r.pct = pv.v ? r.d / pv.v * 100 : null;
        var u = Number(a.usage) || 0;
        r.yr = u ? (pv.unit === 'cents_per_kwh' ? r.d / 100 : r.d) * u : null;
      }
      return r;
    }, function () { return { a: a, state: 'unavailable' }; });
  }

  function bpsFor(inp, accts) {
    var J = window.BPS_JURISDICTIONS || [];
    var st = String(inp.state || '').toLowerCase(), city = String(bpsCity(inp) || '').toLowerCase().trim();
    var here = J.filter(function (j) {
      return String(j.state).toLowerCase() === st && (j.statewide || (city && city.indexOf(String(j.city).toLowerCase()) !== -1));
    });
    var ex = null;
    if (accts.length && typeof window.computeBpsExposure === 'function') {
      try { ex = window.computeBpsExposure(accts, inp.btype || 'office'); } catch (e) { console.warn('[prereport] bps', e); }
    }
    var hasUsage = !!(inp.kwh || inp.therms);
    var t0 = today(), dates = (window.BeaconTriggers && window.BeaconTriggers._bpsDates) || function () { return []; };
    return here.map(function (j) {
      var bj = ex && (ex.byJurisdiction || []).filter(function (b) { return b.jurisdiction === j; })[0];
      var next = dates(j, t0).filter(function (d) { return d.date >= t0; }).sort(function (a, b) { return a.date - b.date; })[0] || null;
      var li = bj && bj.lineItems && bj.lineItems[0];
      return {
        j: j, covered: inp.sqft ? inp.sqft >= j.threshold : null, threshold: j.threshold,
        bj: bj || null, hasUsage: hasUsage, next: next,
        firstYear: li ? li.firstYear : (bj ? bj.firstYear : null),
        otherUnpriced: li ? !!li.otherFuelUnpriced : false,
        current: bj && hasUsage ? bj.currentExposure : null,
        future: bj && hasUsage ? bj.futureExposure : null,
        amountKind: bj ? bj.amountKind : (j.penaltyType === 'per-ton' ? 'computed' : j.penaltyType === 'tbd' ? 'none' : 'max-fine'),
        computable: bj ? bj.computable : null, reason: bj ? bj.notComputableReason : null,
        otherFuel: inp.pub ? { steam: inp.pub.steamKbtu || 0, oil: inp.pub.oilKbtu || 0,
          share: (inp.pub.siteEui && inp.pub.sqft) ? ((inp.pub.steamKbtu || 0) + (inp.pub.oilKbtu || 0)) / (inp.pub.siteEui * inp.pub.sqft) : null } : null
      };
    });
  }

  function euiFor(inp) {
    var pub = inp.pub;
    if (pub && pub.siteEui != null && typeof window.computeBenchmarks === 'function') {
      var b0 = window.computeBenchmarks(inp.state, inp.btype, pub.sqft || inp.sqft, 1, inp.city, { electricKwh: pub.kwh || 0, gasTherms: pub.therms || 0 });
      var city0 = (typeof window.lookupCityBenchmark === 'function') ? window.lookupCityBenchmark(inp.state, bpsCity(inp), b0.btype, pub.siteEui) : null;
      return { state: 'ok', b: b0, city: city0, pub: pub };
    }
    if (!inp.sqft) return { state: 'nosqft' };
    if (!inp.kwh && !inp.therms) return { state: 'nousage' };
    if (typeof window.computeBenchmarks !== 'function') return { state: 'unavailable' };
    var rate = ((window.STATE_RATES_CENTS && window.STATE_RATES_CENTS[inp.state]) || 12.75) / 100;
    var spend = (inp.kwh || 0) * rate + (inp.therms || 0) * GAS_RATE;
    var b = window.computeBenchmarks(inp.state, inp.btype, inp.sqft, spend, inp.city, { electricKwh: inp.kwh || 0, gasTherms: inp.therms || 0 });
    var city = (typeof window.lookupCityBenchmark === 'function') ? window.lookupCityBenchmark(inp.state, inp.city, b.btype, b.actualEUI) : null;
    return { state: 'ok', b: b, city: city, electricOnly: !inp.therms && !!inp.kwh, gasOnly: !inp.kwh && !!inp.therms };
  }

  function build(inp) {
    var accts = accountsFrom(inp);
    var t0 = today();
    var exp = parseDate(inp.expiration);
    var contract = exp ? { date: exp, days: Math.round((exp - t0) / DAY) } : null;
    var trig = (window.BeaconTriggers && accts.length) ? window.BeaconTriggers.build(accts, { btype: inp.btype }) : Promise.resolve(null);
    return Promise.all([Promise.all(accts.map(supplyFor)), trig]).then(function (r) {
      var supply = r[0], tr = r[1];
      // the 120-day list, without contract rows (the contract has its own section)
      var events = tr ? tr.events.filter(function (e) { return e.kind !== 'contract' && e.days >= -45; }) : [];
      var roll = tr ? tr.events.filter(function (e) { return e.kind === 'contract'; })[0] : null;
      return {
        input: inp, asOf: t0, accts: accts, supply: supply, contract: contract, roll: roll,
        events: events, bps: bpsFor(inp, accts), eui: euiFor(inp)
      };
    });
  }

  // ── shared wording (used by both the in-app preview and the PDF) ────────
  function supplyLines(s) {
    var fuel = s.a.type === 'Gas' ? 'Gas' : 'Electric', util = s.a.utility || 'Utility not given';
    var head = fuel + ' · ' + util + (s.a.account ? ' · acct ' + mask(s.a.account) : '');
    if (s.state === 'regulated') return { head: head, big: '—', sub: s.a.state + ' has no retail choice for commercial supply, so there is no default-service price to compare against.' };
    if (s.state === 'unmatched' && !s.a.utility) return { head: head, big: '—', sub: 'Add the ' + fuel.toLowerCase() + ' utility to compare against its default-service price.' };
    if (s.state === 'unmatched') return { head: head, big: '—', sub: '“' + util + '” isn’t ' + (fuel === 'Gas' ? 'a gas' : 'an electric') + ' utility with retail choice in ' + s.a.state + ' in the catalog. Check the utility name.' };
    if (s.state !== 'ok') return { head: head, big: '—', sub: 'No price to compare on file for this meter.' };
    var p = s.p, row = s.m.row;
    var label = !p || p.kind === 'none' ? (row.price_type === 'hourly_index' ? 'hourly priced' : 'not published')
      : p.kind === 'estimate' ? 'estimate' : (row.status === 'current' ? 'published' : 'unconfirmed');
    var ptcTxt = (p && p.kind !== 'none') ? fmtRate(p.v, p.unit) : '—';
    var sub = s.m.utility + ' · ' + row.service_class + ' · price to compare ' + ptcTxt + ' (' + label + ')';
    if (s.d != null) {
      sub += '. Contracted ' + fmtRate(s.c.v, s.c.unit) + ' is ' + fmtRate(Math.abs(s.d), s.c.unit) + ' (' + Math.abs(Math.round(s.pct)) + '%) ' + (s.d > 0 ? 'above' : 'below') + ' it' +
        (s.yr != null ? ', about ' + money(s.yr) + '/yr ' + (s.d > 0 ? 'more' : 'less') + ' at this usage' : '') + '.';
      return { head: head, big: s.yr != null ? signedMoney(s.yr) + '/yr' : (s.d > 0 ? '+' : '−') + fmtRate(Math.abs(s.d), s.c.unit), unit: 'contract vs default service', tone: s.d > 0 ? 'bad' : 'good', sub: sub, src: row.source_url || row.proxy_source_url };
    }
    if (p && p.kind === 'none') sub += row.price_type === 'hourly_index' ? '. Default service for this class is priced hourly; there is no single price to compare.' : '.';
    else sub += '. No contracted rate given, so no gap is shown.';
    return { head: head, big: ptcTxt, unit: 'price to compare', sub: sub, src: row.source_url || row.proxy_source_url };
  }
  function contractLine(R) {
    var c = R.contract;
    if (!c) return { big: '—', sub: 'Contract end date not given.' };
    var s = c.days < 0 ? 'Ended ' + Math.abs(c.days) + ' days ago (' + fmtDate(c.date) + '). The account is likely on default or holdover pricing now.'
      : 'Ends ' + fmtDate(c.date) + ', ' + c.days + ' days from now.';
    // What it rolls onto if nothing is signed: each meter's price to compare,
    // and the change vs its contract at the stated usage.
    var rolls = R.supply.filter(function (x) { return x.state === 'ok' && x.p && x.p.kind !== 'none'; });
    if (c.days >= 0 && rolls.length) {
      s += ' If nothing is signed, it rolls to default service: ' + rolls.map(function (x) {
        return x.m.utility + ' at ' + fmtRate(x.p.v, x.p.unit) + (x.p.kind === 'estimate' ? ' (estimate)' : '') +
          (x.yr != null ? ', ' + signedMoney(-x.yr) + '/yr vs the contract' : '');
      }).join('; ') + '.';
    }
    return { big: c.days < 0 ? 'Expired' : c.days + ' days', tone: c.days < 0 || c.days <= 120 ? 'bad' : null, sub: s };
  }
  function eventLine(e) {
    if (e.kind === 'rate') {
      if (e.sub === 'reset') return { date: e.date, what: e.title.replace(/\s*\(.*?\)\s*/g, ' ').trim(), detail: 'Current default price ' + fmtRate(e.from.v, e.from.unit) + ' ends; the next price is not published yet.' };
      return { date: e.date, what: e.title.replace(/\s*\(.*?\)\s*/g, ' ').trim(),
        detail: fmtRate(e.from.v, e.from.unit) + ' → ' + fmtRate(e.to.v, e.to.unit) + ' (' + (e.pct > 0 ? '+' : '') + e.pct.toFixed(1) + '%) ' + (e.sub === 'announced' ? 'from ' : 'since ') + fmtDate(e.date) +
          (e.yr != null ? ', ' + signedMoney(e.yr) + '/yr on default at this usage' : '') + (e.estimate ? ' (estimate)' : '') + '.' };
    }
    return { date: e.date, what: e.title, detail: e.what + (e.amount ? ' · ' + money(e.amount) + (e.amountKind === 'max-fine' ? ' maximum fine' : '/yr estimated penalty') : '') + '.' };
  }
  function bpsLine(b) {
    var j = b.j, name = (j.statewide ? j.state + ' ' : j.city + ' ') + j.ordinance;
    if (b.covered === false) return { name: name, big: 'Not covered', sub: 'Applies to buildings of ' + j.threshold.toLocaleString() + ' sq ft and up; this building is ' + Math.round(b.input_sqft || 0).toLocaleString() + ' sq ft.' };
    if (b.covered == null) return { name: name, big: 'Check size', sub: 'Applies to buildings of ' + j.threshold.toLocaleString() + ' sq ft and up. Floor area not given.' };
    var parts = ['Covered (' + j.threshold.toLocaleString() + ' sq ft and up). ' + (j.currentPhaseLabel || '') + '.'];
    var yr = new Date().getFullYear(), nd = parseDate(j.nextDeadline);
    if (b.firstYear && b.firstYear > yr) parts.push('Money can first be charged for this building in ' + b.firstYear + '.');
    var big = '—', tone = null, unit = null;
    var of = b.otherFuel, ofShare = of && of.share != null ? of.share : 0;
    if (b.hasUsage && b.otherUnpriced && ofShare > 0.10) {
      // Steam or oil is a large part of this building's energy and the BPS
      // math counts electricity and gas only: a $ figure would be wrong.
      parts.push(Math.round(ofShare * 100) + '% of this building’s reported energy is ' + (of.steam > 0 ? 'district steam' : 'fuel oil') + (of.steam > 0 && of.oil > 0 ? ' and fuel oil' : '') +
        ', which Beacon’s BPS calculation does not include yet, so no dollar figure is shown.');
      if (b.next) parts.push('Next date: ' + fmtDate(b.next.date) + ' · ' + b.next.label + '.');
      return { name: name, big: 'Not priced', unit: 'steam / oil not modelled yet', tone: null, sub: parts.join(' '), url: j.url };
    }
    if (!b.hasUsage) parts.push('Exposure needs 12 months of usage.');
    else if (b.amountKind === 'none') { parts.push('The penalty schedule is not quantified, so no dollar figure.'); big = 'Covered'; }
    else {
      var kind = b.amountKind === 'max-fine' ? 'maximum fine' : 'estimated penalty per year';
      if (b.current) { big = money(b.current); tone = 'bad'; unit = 'now · ' + kind; parts.push('Now: ' + money(b.current) + ' ' + kind + '.'); }
      else if (b.future && b.bj && b.bj.sitesPriced) parts.push('Under the current limit at this usage.');
      if (b.future) {
        parts.push((nd ? 'From ' + fmtDate(nd) + ' (' + (j.nextPhaseLabel || 'next phase') + ')' : (j.nextPhaseLabel || 'Next phase')) + ': ' + money(b.future) + ' ' + kind + '.');
        if (!b.current) { big = money(b.future); tone = 'bad'; unit = (nd ? 'from ' + nd.getFullYear() : 'next phase') + ' · ' + kind; }
      }
      if (!b.current && !b.future && b.computable === false) { big = 'Not priced'; tone = null; unit = 'no published limit for this type'; parts.push('No limit is published for this building type, so it could not be priced.'); }
      else if (!b.current && !b.future) { big = '$0'; tone = 'good'; parts.push(b.computable === false ? 'No cap is published for this building type, so it could not be priced.' : 'At this usage the building is under its limits.'); }
    }
    if (b.hasUsage && !b.otherUnpriced && b.otherFuel && (b.otherFuel.steam > 0 || b.otherFuel.oil > 0)) {
      parts.push('Counts the ' + [b.otherFuel.steam > 0 ? 'district steam' : '', b.otherFuel.oil > 0 ? 'fuel oil' : ''].filter(Boolean).join(' and ') + ' the building reports, at the ordinance’s own coefficients.');
    } else if (b.hasUsage && b.otherUnpriced && b.otherFuel && (b.otherFuel.steam > 0 || b.otherFuel.oil > 0)) {
      parts.push('The building also reports ' + [b.otherFuel.steam > 0 ? Math.round(b.otherFuel.steam / 1000).toLocaleString() + ' MMBtu of district steam' : '',
        b.otherFuel.oil > 0 ? Math.round(b.otherFuel.oil / 1000).toLocaleString() + ' MMBtu of fuel oil' : ''].filter(Boolean).join(' and ') +
        ', which this calculation does not include, so the figure is a lower bound.');
    }
    if (b.next) parts.push('Next date: ' + fmtDate(b.next.date) + ' · ' + b.next.label + '.');
    return { name: name, big: big, unit: unit, tone: tone, sub: parts.join(' '), url: j.url };
  }
  function euiLine(R) {
    var e = R.eui;
    if (e.state === 'nosqft') return { big: '—', sub: 'Floor area not given, so energy use intensity can’t be computed.' };
    if (e.state === 'nousage') return { big: '—', sub: 'Needs 12 months of electric and gas usage (from bills or the utility’s usage history).' };
    if (e.state !== 'ok') return { big: '—', sub: 'Benchmarks not available.' };
    var b = e.b, eui = e.pub ? Math.round(e.pub.siteEui * 10) / 10 : b.actualEUI;
    var s = (e.pub ? 'Site EUI ' + eui + ' kBtu/sq ft/yr as reported to the city for ' + e.pub.year + ', vs a typical ' : 'Site EUI ' + b.actualEUI + ' kBtu/sq ft/yr vs a typical ') + b.btypeName.toLowerCase() + ' at ' + b.medianEUI + ' (' + b.btypeSource + ' median, adjusted for climate and size). ';
    var verdict = e.pub ? (eui < b.medianEUI * 0.85 ? 'Better than median' : eui < b.medianEUI * 1.15 ? 'At median' : 'Above median') : b.euiVerdict;
    s += verdict + '.';
    if (e.city) s += ' Against ' + e.city.sampleCount.toLocaleString() + ' disclosed ' + e.city.city + ' buildings of this type (' + e.city.ordinance + ', ' + e.city.reportingYear + '), it sits at the ' + ordinal(e.city.customerPercentile) + ' percentile (lower uses less).';
    if (e.pub && e.pub.type && !e.pub.btype) s += ' The city lists it as “' + e.pub.type + '”, which has no Beacon peer group, so it is compared as ' + b.btypeName.toLowerCase() + '; change Building type if another fits better.';
    if (e.pub) { if (e.pub.essScore != null) s += ' ENERGY STAR score ' + e.pub.essScore + ' as reported to the city (Portfolio Manager).'; }
    else if (b.essEligible && b.essScore != null) s += ' Estimated ENERGY STAR score ' + b.essScore + ' (estimate, not a certified score).';
    if (e.pub && ((e.pub.steamKbtu || 0) > 0 || (e.pub.oilKbtu || 0) > 0)) s += ' The city figure covers every fuel the building reports, including steam and oil.';
    if (!e.pub && e.electricOnly) s += ' Electricity only; add gas usage for the full figure.';
    if (!e.pub && e.gasOnly) s += ' Gas only; add electric usage for the full figure.';
    var pct = b.medianEUI ? Math.round((eui / b.medianEUI - 1) * 100) : null;
    return { big: String(eui), unit: 'kBtu / sq ft / yr', tone: pct > 15 ? 'bad' : pct < -15 ? 'good' : null, pct: pct, sub: s };
  }
  function pubLine(inp) {
    var p = inp.pub; if (!p) return '';
    var src = (window.BeaconPublicData && window.BeaconPublicData.SOURCES || []).filter(function (s) { return s.key === p.source; })[0];
    return 'Energy use and floor area from the ' + (src ? src.label : 'public disclosure') + ', calendar year ' + p.year +
      (p.propertyId ? ' (property ' + p.propertyId + (p.bbl ? (p.source === 'dc_bench' ? ', SSL ' : ', BBL ') + p.bbl : '') + ')' : '') + '.' +
      (p.sqftDerived ? ' The city record has no floor area, so it is derived from reported energy ÷ site EUI.' : '') +
      (p.status && /incomplete/i.test(p.status) ? ' The city lists this filing as incomplete.' : '');
  }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  // ── in-app preview (Beacon tiles) ────────────────────────────────────────
  var TONE = { bad: 'var(--amber)', good: '#22c55e' };
  function tile(lbl, big, unit, tone, body, extra) {
    return '<div class="icard" style="min-width:0"><div class="ic-lbl">' + lbl + '</div>' +
      '<div class="bm-bignum" style="color:' + (TONE[tone] || 'var(--w)') + ';font-size:26px">' + esc(big) + '</div>' +
      (unit ? '<div class="ic-unit">' + esc(unit) + '</div>' : '') +
      '<div class="loc-card-sub" style="margin-top:6px">' + body + '</div>' + (extra || '') + '</div>';
  }
  function preview(R) {
    var inp = R.input, out = [];
    out.push('<div class="igrid-theme-hd" style="margin-top:14px"><div class="igrid-theme-eye">Preview</div>' +
      '<div class="igrid-theme-title">' + esc(inp.address) + (inp.city ? ', ' + esc(inp.city) : '') + ' ' + esc(inp.state) + '</div>' +
      '<div class="igrid-theme-sub">' + esc((window.BTYPE_LABELS && window.BTYPE_LABELS[inp.btype]) || inp.btype) + (inp.sqft ? ' · ' + Math.round(inp.sqft).toLocaleString() + ' sq ft' : '') +
        (inp.prospect ? ' · prepared for ' + esc(inp.prospect) : '') + (inp.pub ? ' · ' + esc(pubLine(inp)) : '') + '</div></div>');
    var tiles = [];
    R.supply.forEach(function (s) {
      var L = supplyLines(s);
      tiles.push(tile('⇄ Supply vs price to compare · ' + esc(L.head), L.big, L.unit, L.tone, esc(L.sub) + (L.src ? ' · <a class="lk" href="' + esc(L.src) + '" target="_blank" rel="noopener">source</a>' : '')));
    });
    if (!R.supply.length) tiles.push(tile('⇄ Supply vs price to compare', '—', null, null, 'No meter entered.'));
    var C = contractLine(R);
    tiles.push(tile('⏱ Contract', C.big, null, C.tone, esc(C.sub)));
    var E = euiLine(R);
    tiles.push(tile('◐ Energy use vs peers', E.big, E.unit, E.tone, esc(E.sub)));
    if (R.bps.length) R.bps.forEach(function (b) {
      b.input_sqft = inp.sqft; var B = bpsLine(b);
      tiles.push(tile('⚖ ' + esc(B.name), B.big, B.unit, B.tone, esc(B.sub) + (B.url ? ' · <a class="lk" href="' + esc(B.url) + '" target="_blank" rel="noopener">ordinance</a>' : '')));
    });
    else tiles.push(tile('⚖ Building performance standard', 'None', null, 'good', 'No building performance standard applies in ' + esc(inp.city || inp.state) + ' in Beacon’s catalogue.'));
    out.push('<div class="igrid">' + tiles.join('') + '</div>');
    var ev = R.events.map(eventLine);
    out.push('<div class="icard" style="margin-top:13px;min-width:0"><div class="ic-lbl">☰ Next 120 days</div>' +
      (ev.length ? '<div class="bm-rows">' + ev.map(function (x) {
        return '<div class="bm-row" style="align-items:flex-start;gap:12px"><span class="bm-row-lbl" style="flex:0 0 96px">' + esc(fmtDate(x.date)) + '</span>' +
          '<span class="loc-card-sub" style="flex:1;font-size:11.5px"><strong style="color:#fff">' + esc(x.what) + '</strong> · ' + esc(x.detail) + '</span></div>';
      }).join('') + '</div>' : '<div class="loc-card-sub">No default-rate moves or BPS deadlines in the next 120 days.</div>') + '</div>');
    return out.join('');
  }

  // ── printable report (light, prospect-facing) ────────────────────────────
  function printHtml(R) {
    var inp = R.input;
    var bt = (window.BTYPE_LABELS && window.BTYPE_LABELS[inp.btype]) || inp.btype;
    function sec(title, big, tone, body, unit) {
      return '<section><div class="eye">' + esc(title) + '</div><div class="row"><div class="big ' + (tone || '') + '">' + esc(big) +
        (unit ? '<div class="u">' + esc(unit) + '</div>' : '') + '</div><div class="body">' + body + '</div></div></section>';
    }
    var parts = [];
    R.supply.forEach(function (s) { var L = supplyLines(s); parts.push(sec('Supply vs price to compare · ' + L.head, L.big, L.tone, esc(L.sub), L.unit)); });
    var C = contractLine(R); parts.push(sec('Contract', C.big, C.tone, esc(C.sub)));
    R.bps.forEach(function (b) { b.input_sqft = inp.sqft; var B = bpsLine(b); parts.push(sec(B.name, B.big, B.tone, esc(B.sub), B.unit)); });
    if (!R.bps.length) parts.push(sec('Building performance standard', 'None', 'good', 'No building performance standard applies here in our catalogue.'));
    var E = euiLine(R); parts.push(sec('Energy use vs peers', E.big, E.tone, esc(E.sub), E.unit));
    var ev = R.events.map(eventLine);
    var evHtml = ev.length ? '<table>' + ev.map(function (x) { return '<tr><td class="d">' + esc(fmtDate(x.date)) + '</td><td><b>' + esc(x.what) + '</b> · ' + esc(x.detail) + '</td></tr>'; }).join('') + '</table>'
      : '<p class="muted">No default-rate changes or BPS deadlines in the next 120 days.</p>';
    var css = 'body{font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827;margin:32px 40px;font-size:12.5px;line-height:1.5}' +
      'h1{font-size:22px;margin:0 0 2px}.meta{color:#6b7280;margin-bottom:18px}.eye{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:4px}' +
      'section{border-top:1px solid #e5e7eb;padding:12px 0}.row{display:flex;gap:18px;align-items:flex-start}.big{flex:0 0 150px;font-size:20px;font-weight:800;color:#111827}' +
      '.big .u{font-size:10.5px;font-weight:500;color:#6b7280;margin-top:2px}.big.bad{color:#b45309}.big.good{color:#15803d}.body{flex:1}table{border-collapse:collapse;width:100%}td{padding:5px 0;border-top:1px solid #f3f4f6;vertical-align:top}td.d{width:110px;color:#6b7280}' +
      '.muted{color:#6b7280}.foot{margin-top:18px;border-top:1px solid #e5e7eb;padding-top:10px;color:#6b7280;font-size:10.5px}@media print{body{margin:18mm 16mm}}';
    return '<!doctype html><html><head><meta charset="utf-8"><title>Energy position · ' + esc(inp.address) + '</title><style>' + css + '</style></head><body>' +
      '<h1>' + esc(inp.address) + (inp.city ? ', ' + esc(inp.city) : '') + ' ' + esc(inp.state) + '</h1>' +
      '<div class="meta">' + esc(bt) + (inp.sqft ? ' · ' + Math.round(inp.sqft).toLocaleString() + ' sq ft' : '') +
        (inp.prospect ? ' · Prepared for ' + esc(inp.prospect) : '') + (inp.preparedBy ? ' · Prepared by ' + esc(inp.preparedBy) : '') + ' · ' + esc(fmtDate(R.asOf)) + '</div>' +
      (inp.pub ? '<div class="meta" style="margin-top:-12px">' + esc(pubLine(inp)) + '</div>' : '') +
      parts.join('') +
      '<section><div class="eye">Next 120 days</div>' + evHtml + '</section>' +
      '<div class="foot">Supply comparisons cover the supply portion of the bill only, not delivery. Price to compare is the utility’s published default-service supply price for the class, refreshed monthly; figures marked estimate are not the utility’s price. ' +
        'Energy use benchmarks: CBECS 2018 medians adjusted for climate and size, and city benchmarking disclosure data where available' + (inp.pub ? '; this building’s own figures are as its owner reported them to the city' : '') + '. Building performance standard figures follow each ordinance’s published caps and penalties. ' +
        'Dollar figures use the usage stated above. This is an assessment, not a price quote.</div>' +
      '</body></html>';
  }

  // ── form ─────────────────────────────────────────────────────────────────
  var INP = 'background:rgba(255,255,255,0.04);border:1px solid var(--b1);color:#fff;border-radius:6px;padding:7px 9px;font-size:12px;width:100%;box-sizing:border-box';
  function f(lbl, key, attrs, wide) {
    return '<label style="display:block;min-width:0' + (wide ? ';grid-column:1/-1' : '') + '"><div class="loc-card-eye" style="margin:0 0 4px">' + lbl + '</div>' +
      '<input data-pre="' + key + '" style="' + INP + '" ' + (attrs || '') + '></label>';
  }
  function sel(lbl, key, opts) {
    return '<label style="display:block;min-width:0"><div class="loc-card-eye" style="margin:0 0 4px">' + lbl + '</div><select data-pre="' + key + '" style="' + INP + '">' + opts + '</select></label>';
  }
  function formHtml() {
    var states = Object.keys(window.STATE_NAMES_BM || {}).sort().map(function (k) { return '<option value="' + k + '">' + k + ' · ' + esc(window.STATE_NAMES_BM[k]) + '</option>'; }).join('');
    var types = (window.BTYPE_ORDER || ['office']).map(function (k) { return '<option value="' + k + '">' + esc((window.BTYPE_LABELS || {})[k] || k) + '</option>'; }).join('');
    var g = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px 12px';
    return '<div class="igrid-theme-hd" style="margin-top:0"><div class="igrid-theme-eye">Prospecting · Brokers only</div>' +
        '<div class="igrid-theme-title">Pre-engagement report</div>' +
        '<div class="igrid-theme-sub">one building · supply vs price to compare · contract · BPS exposure · energy use vs peers · next 120 days</div></div>' +
      '<div class="icard" style="min-width:0">' +
        '<div data-sv-row style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">' +
          '<span class="ic-lbl" style="margin:0">Saved reports</span>' +
          '<select data-sv-list style="' + INP + ';width:auto;min-width:260px;max-width:100%"><option value="">—</option></select>' +
          '<button type="button" data-sv-load style="background:transparent;color:var(--lime);border:1px solid rgba(173,213,64,0.35);border-radius:6px;padding:5px 11px;font-size:11px;cursor:pointer">Open</button>' +
          '<button type="button" data-sv-del style="background:transparent;color:var(--mu);border:1px solid var(--b1);border-radius:6px;padding:5px 11px;font-size:11px;cursor:pointer">Delete</button>' +
          '<span data-sv-msg class="loc-card-srcline"></span>' +
        '</div>' +
        '<div class="ic-lbl">Building</div><div style="' + g + '">' +
          f('Prospect (company)', 'prospect', 'type="text" placeholder="e.g. Harbor Point Properties"') +
          f('Street address', 'address', 'type="text" placeholder="1200 K St NW"') +
          f('City', 'city', 'type="text" placeholder="Washington"') +
          sel('State', 'state', '<option value="">—</option>' + states) +
          sel('Building type', 'btype', types) +
          f('Floor area (sq ft)', 'sqft', 'type="text" inputmode="numeric" placeholder="80,000"') +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px">' +
          '<button type="button" data-pub-find style="background:transparent;color:var(--lime);border:1px solid rgba(173,213,64,0.35);border-radius:6px;padding:6px 12px;font-size:11.5px;cursor:pointer">Find in public energy data</button>' +
          '<span data-pub-msg class="loc-card-srcline">Fills floor area and 12-month usage from the city’s benchmarking disclosure (New York City, Chicago, Seattle, Washington DC and Philadelphia for now).</span>' +
        '</div><div data-pub-list></div>' +
        '<div class="ic-lbl" style="margin-top:14px">Electric</div><div style="' + g + '">' +
          f('Utility', 'elecUtility', 'type="text" placeholder="Pepco"') +
          f('Account number', 'elecAccount', 'type="text"') +
          f('Annual usage (kWh)', 'kwh', 'type="text" inputmode="numeric" placeholder="12 months"') +
          f('Contracted supply rate (¢/kWh)', 'elecRate', 'type="text" inputmode="decimal" placeholder="8.9"') +
          f('Utility rate class (optional)', 'elecClass', 'type="text" placeholder="e.g. GS, SC-9"') +
        '</div>' +
        '<div class="ic-lbl" style="margin-top:14px">Gas (optional)</div><div style="' + g + '">' +
          f('Utility', 'gasUtility', 'type="text"') +
          f('Account number', 'gasAccount', 'type="text"') +
          f('Annual usage (therms)', 'therms', 'type="text" inputmode="numeric"') +
          f('Contracted supply rate ($/therm)', 'gasRate', 'type="text" inputmode="decimal"') +
        '</div>' +
        '<div class="ic-lbl" style="margin-top:14px">Contract &amp; report</div><div style="' + g + '">' +
          f('Contract end date', 'expiration', 'type="date"') +
          f('Prepared by (shown on the report)', 'preparedBy', 'type="text" placeholder="Your name · company"') +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px">' +
          '<button type="button" data-pre-run style="background:#add540;color:#0a0e1a;border:0;border-radius:6px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer">Build report</button>' +
          '<button type="button" data-pre-print disabled style="background:transparent;color:var(--mu);border:1px solid var(--b1);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;opacity:.5">Save as PDF / print</button>' +
          '<button type="button" data-sv-save disabled style="background:transparent;color:var(--mu);border:1px solid var(--b1);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;opacity:.5">Save report</button>' +
          '<span data-pre-msg class="loc-card-srcline"></span>' +
        '</div>' +
        '<div class="bm-basis">Usage comes from the prospect’s bills, the utility’s usage history, or the city’s public data. Anything left blank is left out of the report, never estimated. Save report keeps the inputs so the report can be rebuilt later with current prices; saved reports are shared with your organization’s brokers.</div>' +
      '</div><div data-pre-out></div>';
  }

  // ── public disclosure lookup ────────────────────────────────────────────
  var _pub = null;
  var PUB_FIELDS = ['address', 'city', 'state', 'sqft', 'kwh', 'therms'];
  function setVal(root, k, v) { var el = root.querySelector('[data-pre="' + k + '"]'); if (el) el.value = v; }
  function pubBadge(root) {
    var m = root.querySelector('[data-pub-msg]');
    if (!_pub) return;
    m.innerHTML = '<span class="loc-pill green">Public data</span> ' + esc(_pub.address) + ' · ' + esc(_pub.short || 'NYC LL84') + ' calendar year ' + esc(_pub.year) +
      (_pub.propertyId ? ' · property ' + esc(_pub.propertyId) : '') + ' · <a href="#" class="lk" data-pub-clear>clear</a>';
    m.style.color = '';
    var c = m.querySelector('[data-pub-clear]');
    if (c) c.addEventListener('click', function (ev) { ev.preventDefault(); clearPub(root, 'Public data cleared. The usage fields keep what was filled in; edit them as needed.'); });
  }
  function clearPub(root, text) {
    if (!_pub) return;
    _pub = null;
    var m = root.querySelector('[data-pub-msg]'); m.textContent = text || ''; m.style.color = '';
  }
  function usePub(root, rec, src) {
    setVal(root, 'address', rec.address.replace(/\s+/g, ' ').trim());
    if (rec.sqft) setVal(root, 'sqft', Math.round(rec.sqft).toLocaleString());
    setVal(root, 'kwh', rec.kwh != null ? Math.round(rec.kwh).toLocaleString() : '');
    setVal(root, 'therms', rec.therms != null ? Math.round(rec.therms).toLocaleString() : '');
    if (rec.btype) setVal(root, 'btype', rec.btype);
    var eu = root.querySelector('[data-pre="elecUtility"]');
    if (eu && !eu.value && rec.utility) eu.value = /consolidated edison/i.test(rec.utility) ? 'Con Ed' : rec.utility;
    // The City of Chicago is entirely ComEd electric territory; Seattle is City Light (no retail choice).
    if (eu && !eu.value && rec.source === 'chicago_bench') eu.value = 'ComEd';
    if (eu && !eu.value && rec.source === 'seattle_bench') eu.value = 'Seattle City Light';
    // DC is entirely Pepco electric; the City of Philadelphia is entirely PECO electric (gas is PGW).
    if (eu && !eu.value && rec.source === 'dc_bench') eu.value = 'Pepco';
    if (eu && !eu.value && rec.source === 'phl_bench') eu.value = 'PECO';
    _pub = Object.assign({}, rec, { short: src.short });
    root.querySelector('[data-pub-list]').innerHTML = '';
    pubBadge(root);
  }
  var _pendingBuild = null;   // set when Build report started a lookup; runs the report once a building is picked
  function findPub(root) {
    var m = root.querySelector('[data-pub-msg]'), list = root.querySelector('[data-pub-list]');
    var inp = read(root), PD = window.BeaconPublicData;
    var src = PD && PD.sourceFor(inp.state, inp.city);
    list.innerHTML = '';
    if (!src) { m.textContent = 'Public building energy data covers ' + ((PD && PD.coverage) || 'New York City') + ' for now.'; m.style.color = '#f59e0b'; return Promise.resolve(null); }
    m.textContent = 'Searching ' + src.label + '…'; m.style.color = '';
    return PD.search(src, inp.address).then(function (recs) {
      if (!recs.length) { m.textContent = 'No building at that address in the ' + src.label + '. ' + (src.note || '') + ' Try the address as the city writes it.'; m.style.color = '#f59e0b'; return recs; }
      m.textContent = recs.length + ' match' + (recs.length > 1 ? 'es' : '') + ' in the ' + src.label + '. Pick the building:'; m.style.color = '';
      list.innerHTML = '<div class="bm-rows" style="margin-top:8px">' + recs.map(function (r, i) {
        var fuels = [r.kwh != null ? Math.round(r.kwh).toLocaleString() + ' kWh' : '', r.therms != null ? Math.round(r.therms).toLocaleString() + ' therms' : '',
          r.steamKbtu ? 'steam' : '', r.oilKbtu ? 'oil' : ''].filter(Boolean).join(' · ');
        return '<div class="bm-row" style="align-items:center;gap:10px;padding:6px 0;border-top:1px solid rgba(255,255,255,0.05)">' +
          '<span class="bm-row-lbl" style="flex:1;min-width:0;font-size:11.5px"><strong style="color:#fff">' + esc(r.address) + '</strong>' + (r.zip ? ' ' + esc(r.zip) : '') +
            (r.name && r.name.toUpperCase() !== r.address.toUpperCase() ? ' · ' + esc(r.name) : '') + '<br>' +
            esc(r.type || 'type not given') + ' · ' + (r.sqft ? Math.round(r.sqft).toLocaleString() + ' sq ft' : 'area not given') +
            ' · ' + (r.siteEui != null ? 'EUI ' + r.siteEui : 'no energy data') + (r.essScore != null ? ' · ENERGY STAR ' + r.essScore : '') +
            ' · CY' + esc(r.year) + (fuels ? ' · ' + esc(fuels) : '') + (r.status && /incomplete/i.test(r.status) ? ' · filing incomplete' : '') + '</span>' +
          '<button type="button" data-pub-use="' + i + '" style="background:#add540;color:#0a0e1a;border:0;border-radius:6px;padding:5px 11px;font-weight:700;font-size:11px;cursor:pointer"' +
            (r.siteEui == null ? ' disabled title="No energy data reported"' : '') + '>Use</button></div>';
      }).join('') + '</div><div class="bm-basis">Source: <a class="lk" href="' + esc(src.page) + '" target="_blank" rel="noopener">' + esc(src.label) + '</a>. Figures are as the owner reported them to the city.</div>';
      Array.prototype.forEach.call(list.querySelectorAll('[data-pub-use]'), function (b) {
        b.addEventListener('click', function () {
          usePub(root, recs[Number(b.getAttribute('data-pub-use'))], src);
          if (_pendingBuild) { var go = _pendingBuild; _pendingBuild = null; go(); }
        });
      });
      // One exact address match with energy data: use it without asking.
      var exact = recs.filter(function (r) { return r.score === 1 && r.siteEui != null; });
      if (_pendingBuild && recs.length === 1 && exact.length === 1) {
        usePub(root, exact[0], src);
        var go = _pendingBuild; _pendingBuild = null; go();
      } else if (_pendingBuild) {
        m.textContent = recs.length + ' possible buildings in the ' + src.label + '. Click Use on the right one and the report builds.'; m.style.color = '';
      }
      return recs;
    }, function (e) { m.textContent = 'Lookup failed: ' + ((e && e.message) || e); m.style.color = '#ef4444'; _pendingBuild = null; return null; });
  }

  function read(root) {
    function v(k) { var el = root.querySelector('[data-pre="' + k + '"]'); return el ? String(el.value || '').trim() : ''; }
    return {
      prospect: v('prospect'), address: v('address'), city: v('city'), state: v('state').toUpperCase(), btype: v('btype') || 'office',
      sqft: num(v('sqft')), elecUtility: v('elecUtility'), elecAccount: v('elecAccount'), kwh: num(v('kwh')), elecRate: num(v('elecRate')), elecClass: v('elecClass'),
      gasUtility: v('gasUtility'), gasAccount: v('gasAccount'), therms: num(v('therms')), gasRate: num(v('gasRate')),
      expiration: v('expiration'), preparedBy: v('preparedBy'), pub: _pub
    };
  }
  function validate(inp) {
    if (!inp.address || !inp.state) return 'Street address and state are required.';
    if (inp.elecRate != null && inp.elecRate < 1) return 'Electric rates are in cents per kWh (e.g. 8.9, not 0.089).';
    if (inp.elecRate != null && inp.elecRate >= 100) return 'Electric rate looks too high for cents per kWh.';
    if (inp.gasRate != null && inp.gasRate >= 20) return 'Gas rate is in $/therm (e.g. 0.65).';
    if (!inp.elecUtility && !inp.gasUtility && !inp.kwh && !inp.therms) return 'Enter the electric utility or 12 months of usage (or, in a city with public building data, click Find in public energy data).';
    return null;
  }

  // ── saved reports (bundle 126) ──────────────────────────────────────────
  function sbc() { return window._beaconSb || window.sb || null; }
  var _saved = [], _svOk = false;
  function svMsg(root, t, bad) { var m = root.querySelector('[data-sv-msg]'); m.textContent = t || ''; m.style.color = bad ? '#ef4444' : ''; }
  function refreshSaved(root, selectId) {
    var c = sbc(), sel = root.querySelector('[data-sv-list]');
    if (!c || !c.auth) { root.querySelector('[data-sv-row]').style.display = 'none'; return Promise.resolve(); }
    return c.auth.getSession().then(function (r) {
      if (!(r && r.data && r.data.session)) { _svOk = false; sel.disabled = true; svMsg(root, 'Sign in to save and reopen reports.'); return; }
      _svOk = true;
      return c.from('prereports').select('id, prospect, address, city, state, updated_at, created_by').order('updated_at', { ascending: false }).limit(100).then(function (q) {
        if (q.error) { svMsg(root, 'Saved reports unavailable: ' + q.error.message, true); return; }
        _saved = q.data || [];
        sel.innerHTML = '<option value="">' + (_saved.length ? _saved.length + ' saved — pick one' : 'None saved yet') + '</option>' + _saved.map(function (x) {
          return '<option value="' + esc(x.id) + '"' + (x.id === selectId ? ' selected' : '') + '>' + esc((x.prospect ? x.prospect + ' · ' : '') + x.address + (x.city ? ', ' + x.city : '') + ' ' + (x.state || '') + ' · ' + String(x.updated_at).slice(0, 10)) + '</option>';
        }).join('');
      });
    });
  }
  function summaryOf(R) {
    var sup = R.supply.filter(function (x) { return x.yr != null; }).map(function (x) { return { fuel: x.a.type, yr: Math.round(x.yr) }; });
    return { asOf: R.asOf.toISOString().slice(0, 10), events: R.events.length, eui: R.eui && R.eui.state === 'ok' ? (R.eui.pub ? R.eui.pub.siteEui : R.eui.b.actualEUI) : null,
      supply: sup, bps: R.bps.map(function (b) { return { name: b.j.ordinance, current: b.current, future: b.future }; }) };
  }
  function saveReport(root) {
    var c = sbc(); if (!c || !_last) return;
    var inp = _last.input, id = root.getAttribute('data-sv-current') || null;
    var row = { prospect: inp.prospect || null, address: inp.address, city: inp.city || null, state: inp.state || null,
      input: inp, summary: summaryOf(_last), updated_at: new Date().toISOString() };
    svMsg(root, 'Saving…');
    var q = id ? c.from('prereports').update(row).eq('id', id).select('id') : c.from('prereports').insert(row).select('id');
    q.then(function (r) {
      if (r.error || !r.data || !r.data.length) { svMsg(root, 'Not saved: ' + ((r.error && r.error.message) || 'no permission'), true); return; }
      root.setAttribute('data-sv-current', r.data[0].id);
      svMsg(root, id ? 'Updated.' : 'Saved.');
      refreshSaved(root, r.data[0].id);
    });
  }
  function openSaved(root) {
    var c = sbc(), id = root.querySelector('[data-sv-list]').value;
    if (!c || !id) return;
    svMsg(root, 'Opening…');
    c.from('prereports').select('id, input').eq('id', id).maybeSingle().then(function (r) {
      if (r.error || !r.data) { svMsg(root, 'Could not open: ' + ((r.error && r.error.message) || 'not found'), true); return; }
      var inp = r.data.input || {};
      Array.prototype.forEach.call(root.querySelectorAll('[data-pre]'), function (el) {
        var k = el.getAttribute('data-pre'), v = inp[k];
        el.value = v == null ? '' : (typeof v === 'number' && k !== 'elecRate' && k !== 'gasRate' ? Math.round(v).toLocaleString() : v);
      });
      _pub = inp.pub || null;
      if (_pub) pubBadge(root); else { var m = root.querySelector('[data-pub-msg]'); m.textContent = ''; }
      root.setAttribute('data-sv-current', id);
      svMsg(root, 'Opened. Rebuilt with today’s prices; Save report updates it.');
      root.querySelector('[data-pre-run]').click();
    });
  }
  function deleteSaved(root) {
    var c = sbc(), sel = root.querySelector('[data-sv-list]'), id = sel.value;
    if (!c || !id) return;
    var x = _saved.filter(function (s) { return s.id === id; })[0];
    if (!window.confirm('Delete the saved report for ' + (x ? (x.prospect || x.address) : 'this building') + '?')) return;
    c.from('prereports').delete().eq('id', id).select('id').then(function (r) {
      if (r.error || !r.data || !r.data.length) { svMsg(root, 'Not deleted: ' + ((r.error && r.error.message) || 'only the author or a manager can delete'), true); return; }
      if (root.getAttribute('data-sv-current') === id) root.removeAttribute('data-sv-current');
      svMsg(root, 'Deleted.'); refreshSaved(root);
    });
  }

  var _last = null;
  function mount() {
    var root = document.getElementById('pre-root');
    if (!root || root.getAttribute('data-mounted')) return;
    root.setAttribute('data-mounted', '1');
    root.innerHTML = formHtml();
    var msg = root.querySelector('[data-pre-msg]'), out = root.querySelector('[data-pre-out]'), pr = root.querySelector('[data-pre-print]');
    root.querySelector('[data-pub-find]').addEventListener('click', function () { findPub(root); });
    var sv = root.querySelector('[data-sv-save]');
    sv.addEventListener('click', function () { saveReport(root); });
    root.querySelector('[data-sv-load]').addEventListener('click', function () { openSaved(root); });
    root.querySelector('[data-sv-del]').addEventListener('click', function () { deleteSaved(root); });
    refreshSaved(root);
    // Typing over a field that came from the public record detaches it, so the
    // report never labels the broker's own numbers as the city's.
    PUB_FIELDS.forEach(function (k) {
      var el = root.querySelector('[data-pre="' + k + '"]');
      if (el) el.addEventListener('input', function () { clearPub(root, 'Edited by hand, so the report no longer cites the public record.'); });
    });
    root.querySelector('[data-pre-run]').addEventListener('click', function () {
      var inp = read(root);
      // No usage typed and the city publishes building data: look it up first.
      var PD = window.BeaconPublicData;
      if (!inp.pub && !inp.kwh && !inp.therms && inp.address && PD && PD.sourceFor(inp.state, inp.city)) {
        msg.textContent = 'No usage entered, so looking the building up in public data first…'; msg.style.color = '';
        _pendingBuild = function () { root.querySelector('[data-pre-run]').click(); };
        findPub(root).then(function (recs) {
          if (recs && !recs.length) { _pendingBuild = null; msg.textContent = 'Not in the public data. Enter 12 months of usage from the bills to build the report.'; msg.style.color = '#f59e0b'; }
        });
        return;
      }
      var err = validate(inp);
      if (err) { msg.textContent = err; msg.style.color = '#ef4444'; out.innerHTML = ''; _last = null; pr.disabled = true; pr.style.opacity = '.5'; return; }
      msg.textContent = 'Building…'; msg.style.color = '';
      build(inp).then(function (R) {
        _last = R;
        out.innerHTML = preview(R);
        msg.textContent = 'Ready. Check the preview, then save as PDF.';
        pr.disabled = false; pr.style.opacity = ''; pr.style.color = 'var(--lime)'; pr.style.borderColor = 'rgba(173,213,64,0.35)';
        if (_svOk) sv.disabled = false; sv.style.opacity = _svOk ? '' : '.5'; sv.style.color = 'var(--lime)'; sv.style.borderColor = 'rgba(173,213,64,0.35)';
      }, function (e) { console.warn('[prereport] build failed', e); msg.textContent = 'Report could not be built (see console).'; msg.style.color = '#ef4444'; });
    });
    pr.addEventListener('click', function () {
      if (!_last) return;
      var w = window.open('', '_blank');
      if (!w) { msg.textContent = 'Allow pop-ups for this site to save the PDF.'; msg.style.color = '#ef4444'; return; }
      w.document.open(); w.document.write(printHtml(_last)); w.document.close();
      setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 400);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.BeaconPreReport = { mount: mount, build: build, _printHtml: printHtml, _preview: preview, last: function () { return _last; } };
})();
