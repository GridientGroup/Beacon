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
    var base = { address: inp.address, city: inp.city, state: inp.state, sqft: inp.sqft || 0,
                 property_type: null, status: 'Prospect', expiration: inp.expiration || '', exp: inp.expiration || '' };
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
    var st = String(inp.state || '').toLowerCase(), city = String(inp.city || '').toLowerCase().trim();
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
        current: bj && hasUsage ? bj.currentExposure : null,
        future: bj && hasUsage ? bj.futureExposure : null,
        amountKind: bj ? bj.amountKind : (j.penaltyType === 'per-ton' ? 'computed' : j.penaltyType === 'tbd' ? 'none' : 'max-fine'),
        computable: bj ? bj.computable : null, reason: bj ? bj.notComputableReason : null
      };
    });
  }

  function euiFor(inp) {
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
    if (s.state === 'unmatched') return { head: head, big: '—', sub: '“' + util + '” isn’t a ' + fuel.toLowerCase() + ' utility with retail choice in ' + s.a.state + ' in the catalog. Check the utility name.' };
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
      if (!b.current && !b.future) { big = '$0'; tone = 'good'; parts.push(b.computable === false ? 'No cap is published for this building type, so it could not be priced.' : 'At this usage the building is under its limits.'); }
    }
    if (b.next) parts.push('Next date: ' + fmtDate(b.next.date) + ' · ' + b.next.label + '.');
    return { name: name, big: big, unit: unit, tone: tone, sub: parts.join(' '), url: j.url };
  }
  function euiLine(R) {
    var e = R.eui;
    if (e.state === 'nosqft') return { big: '—', sub: 'Floor area not given, so energy use intensity can’t be computed.' };
    if (e.state === 'nousage') return { big: '—', sub: 'Needs 12 months of electric and gas usage (from bills or the utility’s usage history).' };
    if (e.state !== 'ok') return { big: '—', sub: 'Benchmarks not available.' };
    var b = e.b, s = 'Site EUI ' + b.actualEUI + ' kBtu/sq ft/yr vs a typical ' + b.btypeName.toLowerCase() + ' at ' + b.medianEUI + ' (' + b.btypeSource + ' median, adjusted for climate and size). ';
    s += b.euiVerdict + '.';
    if (e.city) s += ' Against ' + e.city.sampleCount.toLocaleString() + ' disclosed ' + e.city.city + ' buildings of this type (' + e.city.ordinance + ', ' + e.city.reportingYear + '), it sits at the ' + ordinal(e.city.customerPercentile) + ' percentile (lower uses less).';
    if (b.essEligible && b.essScore != null) s += ' Estimated ENERGY STAR score ' + b.essScore + ' (estimate, not a certified score).';
    if (e.electricOnly) s += ' Electricity only; add gas usage for the full figure.';
    if (e.gasOnly) s += ' Gas only; add electric usage for the full figure.';
    var pct = b.medianEUI ? Math.round((b.actualEUI / b.medianEUI - 1) * 100) : null;
    return { big: String(b.actualEUI), unit: 'kBtu / sq ft / yr', tone: pct > 15 ? 'bad' : pct < -15 ? 'good' : null, pct: pct, sub: s };
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
        (inp.prospect ? ' · prepared for ' + esc(inp.prospect) : '') + '</div></div>');
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
      parts.join('') +
      '<section><div class="eye">Next 120 days</div>' + evHtml + '</section>' +
      '<div class="foot">Supply comparisons cover the supply portion of the bill only, not delivery. Price to compare is the utility’s published default-service supply price for the class, refreshed monthly; figures marked estimate are not the utility’s price. ' +
        'Energy use benchmarks: CBECS 2018 medians adjusted for climate and size, and city benchmarking disclosure data where available. Building performance standard figures follow each ordinance’s published caps and penalties. ' +
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
        '<div class="ic-lbl">Building</div><div style="' + g + '">' +
          f('Prospect (company)', 'prospect', 'type="text" placeholder="e.g. Harbor Point Properties"') +
          f('Street address', 'address', 'type="text" placeholder="1200 K St NW"') +
          f('City', 'city', 'type="text" placeholder="Washington"') +
          sel('State', 'state', '<option value="">—</option>' + states) +
          sel('Building type', 'btype', types) +
          f('Floor area (sq ft)', 'sqft', 'type="text" inputmode="numeric" placeholder="80,000"') +
        '</div>' +
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
          '<span data-pre-msg class="loc-card-srcline"></span>' +
        '</div>' +
        '<div class="bm-basis">Usage comes from the prospect’s bills or the utility’s usage history. Anything left blank is left out of the report, never estimated. Nothing here is saved.</div>' +
      '</div><div data-pre-out></div>';
  }

  function read(root) {
    function v(k) { var el = root.querySelector('[data-pre="' + k + '"]'); return el ? String(el.value || '').trim() : ''; }
    return {
      prospect: v('prospect'), address: v('address'), city: v('city'), state: v('state').toUpperCase(), btype: v('btype') || 'office',
      sqft: num(v('sqft')), elecUtility: v('elecUtility'), elecAccount: v('elecAccount'), kwh: num(v('kwh')), elecRate: num(v('elecRate')), elecClass: v('elecClass'),
      gasUtility: v('gasUtility'), gasAccount: v('gasAccount'), therms: num(v('therms')), gasRate: num(v('gasRate')),
      expiration: v('expiration'), preparedBy: v('preparedBy')
    };
  }
  function validate(inp) {
    if (!inp.address || !inp.state) return 'Street address and state are required.';
    if (inp.elecRate != null && inp.elecRate < 1) return 'Electric rates are in cents per kWh (e.g. 8.9, not 0.089).';
    if (inp.elecRate != null && inp.elecRate >= 100) return 'Electric rate looks too high for cents per kWh.';
    if (inp.gasRate != null && inp.gasRate >= 20) return 'Gas rate is in $/therm (e.g. 0.65).';
    if (!inp.elecUtility && !inp.gasUtility && !inp.kwh && !inp.therms) return 'Enter at least one meter (utility or usage).';
    return null;
  }

  var _last = null;
  function mount() {
    var root = document.getElementById('pre-root');
    if (!root || root.getAttribute('data-mounted')) return;
    root.setAttribute('data-mounted', '1');
    root.innerHTML = formHtml();
    var msg = root.querySelector('[data-pre-msg]'), out = root.querySelector('[data-pre-out]'), pr = root.querySelector('[data-pre-print]');
    root.querySelector('[data-pre-run]').addEventListener('click', function () {
      var inp = read(root), err = validate(inp);
      if (err) { msg.textContent = err; msg.style.color = '#ef4444'; out.innerHTML = ''; _last = null; pr.disabled = true; pr.style.opacity = '.5'; return; }
      msg.textContent = 'Building…'; msg.style.color = '';
      build(inp).then(function (R) {
        _last = R;
        out.innerHTML = preview(R);
        msg.textContent = 'Ready. Check the preview, then save as PDF.';
        pr.disabled = false; pr.style.opacity = ''; pr.style.color = 'var(--lime)'; pr.style.borderColor = 'rgba(173,213,64,0.35)';
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
