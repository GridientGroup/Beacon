/* ============================================================================
 * ptc.js — Price to Compare (bundle 119)
 * ----------------------------------------------------------------------------
 * Compares each meter's CONTRACTED supply rate with the utility's default-
 * service "price to compare" for that commercial class, from the
 * public.price_to_compare catalog (built 2026-10-05, refreshed monthly).
 *
 *   window.BeaconPTC.renderLocation(accts, prime)   location page section
 *   window.BeaconPTC.match(acct)                    -> Promise<match|null>
 *
 * Rules this file keeps:
 *   - A published price and an estimate are never shown the same way. Rows
 *     with price=null carry proxy_price; those render with an ESTIMATE badge
 *     and their basis, never as the utility's price.
 *   - needs_review rows render with an UNCONFIRMED badge.
 *   - Units are converted, never assumed. Gas compares in $/therm
 *     (1 ccf = 1.037 therm, 1 Mcf = 10.37 therm, 1 Dth = 10 therm).
 *   - No fabricated rates. A meter with no contracted rate shows the price to
 *     compare alone and an "Add rate" control (brokers only).
 *   - Broker-only: the section is hidden in the customer deep-link flow
 *     (no Supabase session). Edits write to public.accounts under the
 *     broker's own RLS.
 * ========================================================================== */
(function () {
  'use strict';

  var CACHE = {};          // state -> Promise<rows[]>
  var UNIT_LABEL = {
    cents_per_kwh: '¢/kWh', dollars_per_therm: '$/therm', dollars_per_ccf: '$/ccf',
    dollars_per_mcf: '$/Mcf', dollars_per_dth: '$/Dth'
  };
  var TO_THERM = { dollars_per_therm: 1, dollars_per_ccf: 1 / 1.037, dollars_per_mcf: 1 / 10.37, dollars_per_dth: 1 / 10 };
  var DEREG_PTC = ['PA','OH','IL','MA','NY','NJ','MD','DC','DE','CT','RI','NH','ME','MI','TX'];

  function sb() { return window._beaconSb || window.sb || null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ── catalog fetch (per state, cached for the session) ─────────────────
  var COLS = 'state,utility_name,fuel,service_class,service_class_desc,customer_size,price_type,price,unit,' +
             'components,effective_start,effective_end,source_url,source_kind,status,verified,last_checked,' +
             'proxy_price,proxy_unit,proxy_basis,proxy_period_start,proxy_period_end,proxy_source_url,proxy_verified';
  function loadState(st) {
    st = String(st || '').toUpperCase();
    if (!st) return Promise.resolve([]);
    if (CACHE[st]) return CACHE[st];
    var c = sb();
    if (!c) return Promise.resolve([]);
    CACHE[st] = c.from('price_to_compare').select(COLS).eq('state', st).neq('status', 'superseded')
      .then(function (r) {
        if (r.error) { console.warn('[ptc] catalog read failed', st, r.error.message); delete CACHE[st]; return []; }
        return r.data || [];
      }, function (e) { console.warn('[ptc] catalog read threw', e); delete CACHE[st]; return []; });
    return CACHE[st];
  }

  // ── utility name matching ─────────────────────────────────────────────
  // Generic words carry no identity ("gas", "power", "company"); they only
  // count when nothing else is left. Aliases expand the short names brokers
  // type into the words the catalog uses.
  var GENERIC = { the:1, of:1, and:1, co:1, company:1, corp:1, corporation:1, inc:1, llc:1, dba:1, d:1, b:1, a:1,
    gas:1, electric:1, power:1, energy:1, light:1, utilities:1, utility:1, service:1, services:1, systems:1,
    division:1, distribution:1, delivery:1, natural:1, inc_:1 };
  var ALIAS = [
    [/\bcon\s*ed(ison)?\b|\bconed\b/, 'consolidated edison'],
    [/\bcomed\b/, 'commonwealth edison comed'],
    [/\bbge\b/, 'baltimore bge'],
    [/\bpse\s*&?\s*g\b|\bpseg\b/, 'pseg public service'],
    [/\bjcp\s*&?\s*l\b|\bjcpl\b/, 'jersey central jcpl'],
    [/\bace\b|\batlantic city\b/, 'atlantic city ace'],
    [/\bpepco\b/, 'potomac pepco'],
    [/\bnimo\b/, 'niagara mohawk'],
    [/\bnyseg\b|\bny state electric\b/, 'nyseg'],
    [/\brg\s*&?\s*e\b|\brge\b/, 'rochester'],
    [/\bo\s*&\s*r\b|\boru\b/, 'orange rockland'],
    [/\bcen\s*hud\b/, 'central hudson'],
    [/\bcmp\b/, 'central maine'],
    [/\bpsnh\b/, 'new hampshire psnh'],
    [/\bui\b/, 'united illuminating'],
    [/\baep\s*ohio\b/, 'aep ohio'],
    [/\bdp\s*&?\s*l\b|\bdayton\b/, 'aes ohio dayton'],
    [/\bcei\b|\billuminating\b/, 'cleveland illuminating'],
    [/\bmet\s*-?\s*ed\b/, 'met ed metropolitan'],
    [/\bppl\b/, 'ppl'],
    [/\bpgw\b/, 'philadelphia'],
    [/\bdominion\b|\benbridge\b/, 'east ohio enbridge'],
    [/\bnicor\b/, 'nicor'],
    [/\btnmp\b/, 'texas new mexico tnmp'],
    [/\bcenterpoint\b/, 'centerpoint'],
    [/\bwmeco\b|\bwestern mass/, 'western massachusetts wma'],
    [/\bnstar\b/, 'nstar']
  ];
  function tokens(s) {
    var t = String(s || '').toLowerCase().replace(/(\w)\s*&\s*(\w)/g, '$1$2').replace(/d\/b\/a/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
    return t ? t.split(/\s+/) : [];
  }
  function expand(name) {
    var low = String(name || '').toLowerCase(), extra = [];
    ALIAS.forEach(function (p) { if (p[0].test(low)) extra.push(p[1]); });
    return tokens(name + ' ' + extra.join(' '));
  }
  function sig(arr) { return arr.filter(function (w) { return !GENERIC[w]; }); }

  // Eastern vs Western MA Eversource: the catalog splits them; the account
  // only says "Eversource". Western MA towns (WMECo service area, partial).
  var WMA = /springfield|pittsfield|westfield|greenfield|agawam|chicopee|holyoke|west springfield|east longmeadow|longmeadow|ludlow|northampton|amherst|palmer|wilbraham|southwick|north adams|lenox|great barrington/i;

  function pickUtility(acct, rows, fuel) {
    var cands = {};
    rows.forEach(function (r) {
      if (r.fuel !== fuel) return;
      if (/^all\s/i.test(r.utility_name)) return;           // pooled rows (e.g. ERCOT POLR) never auto-match
      (cands[r.utility_name] = cands[r.utility_name] || []).push(r);
    });
    var names = Object.keys(cands);
    if (!names.length) return null;
    if (acct.ptcUtility && cands[acct.ptcUtility]) return { name: acct.ptcUtility, rows: cands[acct.ptcUtility], how: 'override' };
    var at = expand(acct.utility), as = sig(at);
    if (!at.length) return null;
    var best = null;
    names.forEach(function (n) {
      var ct = expand(n), cs = sig(ct);
      var base = as.length ? as : at, pool = as.length ? cs : ct;
      var hit = base.filter(function (w) { return pool.indexOf(w) !== -1; }).length;
      var score = hit / base.length;
      if (!score) return;
      // Eversource MA electric: steer by town.
      if (/western massachusetts/i.test(n)) score += WMA.test(acct.city || '') ? 0.2 : -0.2;
      var priced = cands[n].filter(function (r) { return r.price != null || r.proxy_price != null; }).length;
      if (!best || score > best.score || (score === best.score && priced > best.priced)) best = { name: n, score: score, priced: priced };
    });
    if (!best || best.score < 0.5) return null;
    return { name: best.name, rows: cands[best.name], how: 'auto' };
  }

  // Size bucket from annual usage. Electric: <300 MWh small (roughly under
  // 100 kW), <2 GWh medium, else large. Gas: <30k therms small, <300k medium.
  function sizeOf(fuel, usage) {
    var u = Number(usage) || 0;
    if (!u) return null;
    if (fuel === 'electric') return u < 300000 ? 'small' : (u < 2000000 ? 'medium' : 'large');
    return u < 30000 ? 'small' : (u < 300000 ? 'medium' : 'large');
  }
  var RANK = { small: 0, medium: 1, large: 2 };

  function pickClass(acct, util, fuel) {
    var rows = util.rows;
    if (acct.ptcServiceClass) {
      var o = rows.filter(function (r) { return r.service_class === acct.ptcServiceClass; });
      if (o.length) return { row: newest(o), how: 'override' };
    }
    if (acct.tariffCode) {
      var tc = String(acct.tariffCode).toLowerCase().replace(/[^a-z0-9]/g, '');
      var t = rows.filter(function (r) { return String(r.service_class).toLowerCase().replace(/[^a-z0-9]/g, '').indexOf(tc) !== -1; });
      if (t.length) return { row: best(t), how: 'tariff' };
    }
    var sz = sizeOf(fuel, acct.usage || acct.annualUsage);
    var scored = rows.map(function (r) {
      var s = 0;
      if (sz && r.customer_size === sz) s += 10;
      else if (r.customer_size === 'all') s += 7;
      // A medium meter with no "medium" row sits closer to large: the
      // catalog's small classes are mostly capped near 100 kW, which a
      // 300 MWh+/yr building usually exceeds.
      else if (sz && RANK[r.customer_size] != null) s += 6 - 3 * Math.abs(RANK[r.customer_size] - RANK[sz]) - (sz === 'medium' && r.customer_size === 'small' ? 1.5 : 0);
      if (r.price != null) s += 3; else if (r.proxy_price != null) s += 1.5;
      if (r.status === 'current') s += 1;
      if (/off-?peak/i.test(r.service_class)) s -= 2;        // prefer the all-hours or peak line
      return { r: r, s: s };
    });
    scored.sort(function (a, b) { return b.s - a.s || String(b.r.effective_start || '').localeCompare(String(a.r.effective_start || '')); });
    return scored.length ? { row: scored[0].r, how: 'size', size: sz } : null;
  }
  function newest(rs) { return rs.slice().sort(function (a, b) { return String(b.effective_start || '').localeCompare(String(a.effective_start || '')); })[0]; }
  function best(rs) { return rs.slice().sort(function (a, b) { return ((b.price != null) - (a.price != null)) || String(b.effective_start || '').localeCompare(String(a.effective_start || '')); })[0]; }

  function fuelOf(acct) {
    var t = String(acct.type || acct.accountType || '').toLowerCase();
    return t === 'gas' ? 'gas' : (t === 'electric' ? 'electric' : null);
  }

  function match(acct) {
    var st = String(acct.state || '').toUpperCase(), fuel = fuelOf(acct);
    if (!fuel || DEREG_PTC.indexOf(st) === -1) return Promise.resolve(null);
    return loadState(st).then(function (rows) {
      if (!rows.length) return null;
      var u = pickUtility(acct, rows, fuel);
      if (!u) return { fuel: fuel, state: st, unmatched: true, options: utilityOptions(rows, fuel) };
      var c = pickClass(acct, u, fuel);
      if (!c) return null;
      return { fuel: fuel, state: st, utility: u.name, utilHow: u.how, row: c.row, classHow: c.how, size: c.size,
               classes: u.rows, options: utilityOptions(rows, fuel) };
    });
  }
  function utilityOptions(rows, fuel) {
    var seen = {};
    rows.forEach(function (r) { if (r.fuel === fuel && !/^all\s/i.test(r.utility_name)) seen[r.utility_name] = 1; });
    return Object.keys(seen).sort();
  }

  // ── value helpers ─────────────────────────────────────────────────────
  // Returns { v, unit, kind:'published'|'estimate'|'none', ... } in a
  // comparable unit (cents/kWh or $/therm).
  function ptcValue(row) {
    if (!row) return null;
    var pub = row.price != null;
    var v = pub ? Number(row.price) : (row.proxy_price != null ? Number(row.proxy_price) : null);
    var u = pub ? row.unit : row.proxy_unit;
    if (v == null || !u) return { kind: 'none', priceType: row.price_type };
    return { kind: pub ? 'published' : 'estimate', raw: v, rawUnit: u, v: toCompare(v, u), unit: u === 'cents_per_kwh' ? 'cents_per_kwh' : 'dollars_per_therm' };
  }
  function toCompare(v, u) { return u === 'cents_per_kwh' ? v : v * (TO_THERM[u] || NaN); }
  function contracted(acct) {
    var v = acct.supplyRate != null ? Number(acct.supplyRate) : (acct.rateCents != null ? Number(acct.rateCents) : null);
    var u = acct.supplyRateUnit || (acct.rateCents != null && acct.supplyRate == null ? 'cents_per_kwh' : null);
    if (v == null || !isFinite(v) || v <= 0 || !u) return null;
    return { raw: v, rawUnit: u, v: toCompare(v, u), unit: u === 'cents_per_kwh' ? 'cents_per_kwh' : 'dollars_per_therm' };
  }
  function fmt(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    if (unit === 'cents_per_kwh') return v.toFixed(2) + '¢/kWh';
    if (unit === 'dollars_per_therm') return '$' + v.toFixed(3) + '/therm';
    return v + ' ' + (UNIT_LABEL[unit] || unit || '');
  }
  function fmtDate(d) { return d ? String(d).slice(0, 10) : ''; }
  function money(n) { var a = Math.abs(Math.round(n)); return '$' + a.toLocaleString(); }

  // ── broker session (customer deep-link flow has none) ─────────────────
  // Client-facing views hide the section: the "View as: Client" preview
  // (?view=client) and the customer deep link (snapshot-loaded portfolio).
  function clientView() {
    try {
      if (new URLSearchParams(location.search).get('view') === 'client') return true;
      var cid = window._beaconClientId || new URLSearchParams(location.search).get('clientId');
      var meta = window._beaconData && window._beaconData.meta && cid ? window._beaconData.meta[cid] : null;
      return !!(meta && meta._viaSnapshot);
    } catch (e) { return false; }
  }
  // Editing needs a signed-in broker (accounts RLS). Viewing does not.
  var _session = null;
  function hasSession() {
    if (_session) return _session;
    var c = sb();
    _session = (c && c.auth && c.auth.getSession) ? c.auth.getSession().then(function (r) {
      return !!(r && r.data && r.data.session);
    }, function () { return false; }) : Promise.resolve(false);
    return _session;
  }
  var _canEdit = false;
  function isDbAccount(a) { return _canEdit && a && a.id && /^acct_/.test(String(a.id)); }

  // ── location page section ─────────────────────────────────────────────
  var _last = null;
  function msg(body, sub, subText, html) {
    if (sub) sub.textContent = subText;
    body.innerHTML = '<div class="loc-card"><div class="loc-card-sub">' + html + '</div></div>';
  }
  function renderLocation(accts, prime) {
    var hd = document.getElementById('loc-ptc-hd'), body = document.getElementById('loc-ptc-body'), sub = document.getElementById('loc-ptc-sub');
    if (!body) return;
    _last = { accts: accts, prime: prime };
    if (clientView()) { if (hd) hd.style.display = 'none'; body.innerHTML = ''; return; }
    if (hd) hd.style.display = '';
    var st = String((prime && prime.state) || '').toUpperCase();
    var meters = (accts || []).filter(function (a) { return fuelOf(a); });
    console.log('[ptc] render', st, meters.length, 'meters');
    if (!meters.length) { msg(body, sub, 'No meters', 'No electric or gas meter on file for this location.'); return; }
    if (DEREG_PTC.indexOf(st) === -1) {
      msg(body, sub, st ? st + ' \u00b7 no retail choice' : 'State unknown',
        (st ? esc(st) + ' has' : 'This location has') + ' no retail choice for commercial supply, so the utility has no price to compare. ' +
        'Beacon compares contracted rates in PA, OH, IL, MA, NY, NJ, MD, DC, DE, CT, RI, NH, ME, MI and TX.');
      return;
    }
    if (sub) sub.textContent = 'Loading\u2026';
    body.innerHTML = '';
    hasSession().then(function (ok) {
      _canEdit = ok;
      return Promise.all(meters.map(function (a) { return match(a).then(function (m) { return { a: a, m: m }; }); }));
    }).then(function (list) {
      var anyRows = list.some(function (x) { return x.m; });
      if (!anyRows) { msg(body, sub, 'Catalog unavailable', 'The price-to-compare catalog could not be read for ' + esc(st) + '. Reload the page; if it persists, the catalog read failed (see console).'); return; }
      paint(list, st, body, sub);
    }, function (e) { console.warn('[ptc] render failed', e); msg(body, sub, 'Error', 'Price to compare could not be loaded.'); });
  }

  function paint(list, st, body, sub) {
    var above = 0, below = 0, impact = 0, withRate = 0;
    var cards = list.map(function (x, i) {
      var a = x.a, m = x.m, fuel = fuelOf(a);
      var usage = Number(a.usage || a.annualUsage) || 0;
      var meterLbl = (fuel === 'gas' ? 'Gas' : 'Electric') + (a.account || a.accountNumber ? ' · ' + esc(a.account || a.accountNumber) : '');
      var util = esc(a.utility || 'Utility not on file');
      if (!m) return card(i, meterLbl, util, '<div class="loc-card-sub">No price to compare in the catalog for this meter.</div>', a, null);
      if (m.unmatched) {
        return card(i, meterLbl, util,
          '<div class="loc-card-sub">“' + util + '” isn’t ' + (fuel === 'gas' ? 'a gas' : 'an electric') +
          ' utility with retail choice in ' + esc(st) + ' in the catalog. Pick the utility to compare against.</div>', a, m);
      }
      var p = ptcValue(m.row), c = contracted(a), row = m.row;
      var badge = !p || p.kind === 'none' ? '<span class="loc-pill gray">' + (row.price_type === 'hourly_index' ? 'Hourly priced' : 'Not published') + '</span>'
        : p.kind === 'estimate' ? '<span class="loc-pill amber">Estimate</span>'
        : (row.status === 'current' ? '<span class="loc-pill green">Published</span>' : '<span class="loc-pill amber">Unconfirmed</span>');
      var ptcLine = (p && p.kind !== 'none')
        ? '<div style="font-size:20px;font-weight:700;color:#fff;margin:2px 0 4px">' + fmt(p.v, p.unit) + '</div>'
        : '<div style="font-size:13px;color:rgba(255,255,255,0.72);margin:4px 0">' +
            (row.price_type === 'hourly_index' ? 'Default service for this class is priced hourly from the wholesale market; there is no single price to compare.' : 'The utility does not publish a single price for this class.') + '</div>';
      var period = (p && p.kind === 'estimate')
        ? (row.proxy_period_start ? fmtDate(row.proxy_period_start) + (row.proxy_period_end ? ' to ' + fmtDate(row.proxy_period_end) : '') : '')
        : (row.effective_start ? fmtDate(row.effective_start) + (row.effective_end ? ' to ' + fmtDate(row.effective_end) : '') : '');
      var srcUrl = (p && p.kind === 'estimate') ? row.proxy_source_url : row.source_url;
      var basis = (p && p.kind === 'estimate')
        ? '<div class="loc-card-srcline" style="margin-top:6px;line-height:1.45">Estimate basis: ' + esc(trim(String(row.proxy_basis || '').replace(/^\s*((CORRECTED|ESTIMATE|DERIVED ESTIMATE|WEAK DERIVED ESTIMATE|LOW-CONFIDENCE ESTIMATE)[^.:]*[.:]\s*)+/i, ''), 260)) + '</div>' : '';
      var cls = '<div class="loc-card-srcline">' + esc(m.utility) + ' · ' + esc(row.service_class) +
        (m.classHow === 'size' && m.size ? ' · matched by size (' + m.size + ')' : m.classHow === 'override' ? ' · set by broker' : m.classHow === 'tariff' ? ' · matched on rate class' : '') +
        (period ? ' · ' + esc(period) : '') +
        (srcUrl ? ' · <a class="lk" href="' + esc(srcUrl) + '" target="_blank" rel="noopener">source</a>' : '') + '</div>';

      var cmp = '';
      if (c && p && p.kind !== 'none' && c.unit === p.unit && isFinite(c.v) && isFinite(p.v)) {
        withRate++;
        var d = c.v - p.v, pct = p.v ? Math.round(d / p.v * 100) : 0;
        var yr = usage ? (c.unit === 'cents_per_kwh' ? d / 100 * usage : d * usage) : null;
        if (d > 0) above++; else below++;
        if (yr != null) impact += yr;
        var color = d > 0 ? '#f59e0b' : '#22c55e';
        cmp = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);font-size:13px;color:rgba(255,255,255,0.78);line-height:1.5">' +
          'Contracted <strong style="color:#fff">' + fmt(c.v, c.unit) + '</strong> is ' +
          '<strong style="color:' + color + '">' + fmt(Math.abs(d), c.unit) + ' (' + Math.abs(pct) + '%) ' + (d > 0 ? 'above' : 'below') + '</strong> ' +
          (p.kind === 'estimate' ? 'the estimated' : 'the') + ' price to compare' +
          (yr != null ? ', about <strong style="color:' + color + '">' + money(yr) + '/yr</strong> ' + (d > 0 ? 'more' : 'less') + ' on ' + Math.round(usage).toLocaleString() + (c.unit === 'cents_per_kwh' ? ' kWh' : ' therms') : '') + '.' +
          (Math.abs(pct) >= 60 ? '<div class="loc-card-srcline" style="color:#f59e0b">A gap this large usually means a unit mix-up (¢ vs $, ccf vs therm). Check the contracted rate.</div>' : '') +
          (a.rateSource ? '<div class="loc-card-srcline">Rate from ' + esc(a.rateSource) + (a.rateEffective ? ', effective ' + esc(fmtDate(a.rateEffective)) : '') + '</div>' : '') +
          '</div>';
      } else if (c && p && p.kind !== 'none') {
        cmp = '<div class="loc-card-srcline" style="margin-top:8px">Contracted rate ' + fmt(c.raw, c.rawUnit) + ' is in a different unit and was not compared.</div>';
      } else if (!c) {
        cmp = '<div class="loc-card-srcline" style="margin-top:8px">No contracted rate on file for this meter.</div>';
      }
      return card(i, meterLbl, util, badge + ptcLine + cls + basis + cmp, a, m);
    });
    body.innerHTML = '<div class="loc-grid">' + cards.join('') + '</div>' +
      '<div class="loc-card-srcline" style="margin-top:10px;line-height:1.5">Price to compare is the utility’s default-service supply price for the class (generation, plus transmission where the state includes it). ' +
      'It excludes delivery charges, so compare it with the supply portion of the contract only. Estimates are labelled and are not the utility’s price. Catalog refreshed monthly.</div>';
    if (sub) {
      sub.textContent = withRate
        ? (above ? above + ' meter' + (above > 1 ? 's' : '') + ' above' : 'All meters at or below') + ' price to compare' +
          (impact ? ' · net ' + money(impact) + '/yr ' + (impact > 0 ? 'above' : 'below') : '')
        : 'No contracted rates on file';
    }
    bind(body, list);
  }
  function trim(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function card(i, meterLbl, util, inner, a, m) {
    var edit = isDbAccount(a)
      ? '<div style="margin-top:10px"><a href="#" class="lk" data-ptc-edit="' + i + '" style="color:#add540;font-size:11.5px;text-decoration:none">' +
          (contracted(a) ? 'Edit rate or class' : 'Add contracted rate') + ' →</a></div><div data-ptc-form="' + i + '"></div>'
      : '';
    return '<div class="loc-card">' +
      '<div class="loc-card-eye">' + meterLbl + '</div>' +
      '<div class="loc-card-title" style="margin-bottom:8px">' + util + '</div>' +
      inner + edit + '</div>';
  }

  // ── broker edit: rate, unit, effective date, utility/class override ───
  function bind(body, list) {
    Array.prototype.forEach.call(body.querySelectorAll('[data-ptc-edit]'), function (lnk) {
      lnk.addEventListener('click', function (ev) {
        ev.preventDefault();
        var i = Number(lnk.getAttribute('data-ptc-edit')), x = list[i];
        var holder = body.querySelector('[data-ptc-form="' + i + '"]');
        if (!holder) return;
        if (holder.innerHTML) { holder.innerHTML = ''; return; }
        holder.innerHTML = form(x.a, x.m);
        holder.querySelector('[data-ptc-save]').addEventListener('click', function () { save(x.a, holder); });
      });
    });
  }
  var INP = 'background:rgba(255,255,255,0.04);border:1px solid var(--b1);color:#fff;border-radius:6px;padding:6px 8px;font-size:12px;width:100%;box-sizing:border-box';
  function form(a, m) {
    var fuel = fuelOf(a);
    var units = fuel === 'gas' ? ['dollars_per_therm', 'dollars_per_ccf', 'dollars_per_mcf', 'dollars_per_dth'] : ['cents_per_kwh'];
    var curU = a.supplyRateUnit || units[0];
    var uSel = units.map(function (u) { return '<option value="' + u + '"' + (u === curU ? ' selected' : '') + '>' + UNIT_LABEL[u] + '</option>'; }).join('');
    var utilOpts = '<option value="">Auto-match</option>' + ((m && m.options) || []).map(function (n) {
      return '<option' + (a.ptcUtility === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
    var clsOpts = '<option value="">Auto-match by size</option>' + ((m && m.classes) || []).map(function (r) { return r.service_class; })
      .filter(function (v, k, arr) { return arr.indexOf(v) === k; })
      .map(function (n) { return '<option' + (a.ptcServiceClass === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
    function f(lbl, html) { return '<label style="display:block"><div class="loc-card-eye" style="margin:8px 0 4px">' + lbl + '</div>' + html + '</label>'; }
    return '<div style="margin-top:10px;padding:12px;border:1px solid var(--b1);border-radius:10px;background:rgba(255,255,255,0.02)">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">' +
        f('Contracted supply rate', '<input data-f="rate" type="number" step="0.0001" min="0" style="' + INP + '" value="' + (a.supplyRate != null ? esc(a.supplyRate) : (a.rateCents != null ? esc(a.rateCents) : '')) + '">') +
        f('Unit', '<select data-f="unit" style="' + INP + '">' + uSel + '</select>') +
        f('Rate effective', '<input data-f="eff" type="date" style="' + INP + '" value="' + esc(fmtDate(a.rateEffective)) + '">') +
        f('Utility rate class (optional)', '<input data-f="tariff" type="text" style="' + INP + '" value="' + esc(a.tariffCode || '') + '" placeholder="e.g. GS, SC-9, Rate 30">') +
        f('Compare against utility', '<select data-f="putil" style="' + INP + '">' + utilOpts + '</select>') +
        f('Compare against class', '<select data-f="pclass" style="' + INP + '">' + clsOpts + '</select>') +
      '</div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:12px">' +
        '<button type="button" data-ptc-save style="background:#add540;color:#0a0e1a;border:0;border-radius:6px;padding:7px 14px;font-weight:700;font-size:12px;cursor:pointer">Save</button>' +
        '<span data-ptc-msg class="loc-card-srcline"></span>' +
      '</div></div>';
  }
  function save(a, holder) {
    var g = function (k) { var el = holder.querySelector('[data-f="' + k + '"]'); return el ? String(el.value || '').trim() : ''; };
    var msg = holder.querySelector('[data-ptc-msg]');
    var rate = g('rate') === '' ? null : Number(g('rate')), unit = g('unit');
    if (rate != null && (!isFinite(rate) || rate <= 0 || rate >= 100)) { msg.textContent = 'Rate must be between 0 and 100.'; msg.style.color = '#ef4444'; return; }
    if (rate != null && unit === 'cents_per_kwh' && rate < 1) { msg.textContent = 'Electric rates are in cents per kWh (e.g. 8.9, not 0.089).'; msg.style.color = '#ef4444'; return; }
    var putil = g('putil') || null, pclass = g('pclass') || null;
    if (putil && putil !== (a.ptcUtility || null) && pclass) pclass = null;   // class list belongs to the old utility
    var patch = {
      supply_rate: rate, supply_rate_unit: rate == null ? null : unit, rate_effective: g('eff') || null,
      rate_source: rate == null ? null : 'broker', tariff_code: g('tariff') || null,
      ptc_utility: putil, ptc_service_class: pclass, rate_updated_at: new Date().toISOString()
    };
    var c = sb();
    if (!c) { msg.textContent = 'Not connected.'; return; }
    msg.textContent = 'Saving…'; msg.style.color = '';
    c.from('accounts').update(patch).eq('id', a.id).select('id').then(function (r) {
      if (r.error || !r.data || !r.data.length) {
        msg.textContent = 'Not saved: ' + ((r.error && r.error.message) || 'no permission to edit this account'); msg.style.color = '#ef4444'; return;
      }
      a.supplyRate = rate; a.supplyRateUnit = patch.supply_rate_unit; a.rateEffective = patch.rate_effective;
      a.rateSource = patch.rate_source; a.tariffCode = patch.tariff_code; a.ptcUtility = putil; a.ptcServiceClass = pclass;
      a.rateCents = (rate != null && unit === 'cents_per_kwh') ? rate : null;
      if (_last) renderLocation(_last.accts, _last.prime);
    }, function (e) { msg.textContent = 'Not saved: ' + (e && e.message); msg.style.color = '#ef4444'; });
  }

  // ── portfolio rollup (Intelligence tab, "Theme · Supply") ─────────────
  // Same matching and the same comparison as the location cards, summed over
  // every meter in the active client's portfolio. Dollars use each meter's
  // own annual usage. Estimates are counted but flagged; meters with no
  // contracted rate are counted as "rate missing", never priced.
  var _portSeq = 0;
  function activeAccounts() {
    var cid = window._beaconClientId || new URLSearchParams(location.search).get('clientId') || '';
    try { return { cid: cid, accts: (window.beaconGetAccounts ? window.beaconGetAccounts(cid) : []) || [] }; }
    catch (e) { return { cid: cid, accts: [] }; }
  }
  function compareOne(a, m) {
    var p = m && !m.unmatched ? ptcValue(m.row) : null, c = contracted(a);
    var usage = Number(a.usage || a.annualUsage) || 0;
    var r = { a: a, m: m, p: p, c: c, usage: usage, d: null, yr: null, pct: null };
    if (c && p && p.kind !== 'none' && c.unit === p.unit && isFinite(c.v) && isFinite(p.v)) {
      r.d = c.v - p.v; r.pct = p.v ? r.d / p.v * 100 : null;
      r.yr = usage ? (c.unit === 'cents_per_kwh' ? r.d / 100 * usage : r.d * usage) : null;
    }
    return r;
  }
  function locLink(a) {
    try { var id = (typeof window._locId === 'function') ? window._locId(a) : null; return id ? String(id) : null; } catch (e) { return null; }
  }
  function renderPortfolio() {
    var hd = document.getElementById('ptc-port-hd'), grid = document.getElementById('ptc-port-grid');
    if (!hd || !grid) return;
    if (clientView()) { hd.style.display = 'none'; grid.style.display = 'none'; return; }
    var seq = ++_portSeq;
    var ctx = activeAccounts();
    var meters = ctx.accts.filter(function (a) { return fuelOf(a) && DEREG_PTC.indexOf(String(a.state || '').toUpperCase()) !== -1; });
    var all = ctx.accts.filter(function (a) { return fuelOf(a); });
    hd.style.display = ''; grid.style.display = '';
    var A = document.getElementById('ptc-port-a'), B = document.getElementById('ptc-port-b');
    if (!meters.length) {
      A.innerHTML = tileA({ none: true, total: all.length });
      B.innerHTML = tileB([], 0);
      return;
    }
    A.innerHTML = tileA({ loading: true, scope: meters.length, total: all.length });
    Promise.all(meters.map(function (a) { return match(a).then(function (m) { return compareOne(a, m); }, function () { return compareOne(a, null); }); }))
      .then(function (rows) {
        if (seq !== _portSeq) return;               // a newer client render won
        var st = { scope: meters.length, total: all.length, rated: 0, above: 0, below: 0, upYr: 0, downYr: 0, est: 0, noPtc: 0, unmatched: 0, missing: 0 };
        rows.forEach(function (r) {
          if (r.m && r.m.unmatched) st.unmatched++;
          if (!r.p || r.p.kind === 'none') st.noPtc++;
          if (!r.c) st.missing++;
          if (r.d == null) return;
          st.rated++;
          if (r.p.kind === 'estimate') st.est++;
          if (r.d > 0) { st.above++; if (r.yr) st.upYr += r.yr; } else { st.below++; if (r.yr) st.downYr += -r.yr; }
        });
        A.innerHTML = tileA(st);
        var ranked = rows.filter(function (r) { return r.d != null && r.d > 0 && r.yr; }).sort(function (x, y) { return y.yr - x.yr; });
        B.innerHTML = tileB(ranked.slice(0, 6), ranked.length);
        Array.prototype.forEach.call(B.querySelectorAll('[data-loc]'), function (el) {
          el.addEventListener('click', function () { var id = el.getAttribute('data-loc'); if (id && window.showLocationView) window.showLocationView(id); });
        });
      });
  }
  function row(lbl, val, color) {
    return '<div class="bm-row"><span class="bm-row-lbl">' + lbl + '</span><span class="bm-row-val"' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</span></div>';
  }
  function tileA(st) {
    var head = '<div class="ic-lbl">⇄ Supply vs Price to Compare</div>';
    if (st.none) {
      return head + '<div class="ic-cols"><div class="ic-hero"><div class="bm-bignum" style="color:var(--mu)">—</div><div class="ic-unit">no meters in choice states</div></div>' +
        '<div class="ic-data"><div class="bm-rows">' + row('Meters in portfolio', st.total) + row('In retail-choice states', 0) + '</div></div></div>' +
        '<div class="bm-basis">Price to compare exists only where customers can choose a supplier (15 jurisdictions). Regulated meters have no default-service price to compare against.</div>';
    }
    if (st.loading) {
      return head + '<div class="ic-cols"><div class="ic-hero"><div class="bm-bignum" style="color:var(--mu)">…</div><div class="ic-unit">matching ' + st.scope + ' meters</div></div><div class="ic-data"></div></div>';
    }
    var hasRates = st.rated > 0;
    var big = hasRates ? money(st.upYr) : '—';
    var verdict = hasRates
      ? (st.above ? st.above + ' of ' + st.rated + ' priced meters above' : 'All ' + st.rated + ' priced meters at or below')
      : 'No contracted rates on file';
    var vColor = hasRates && st.above ? 'var(--amber)' : (hasRates ? '#22c55e' : 'var(--mu)');
    var vBg = hasRates && st.above ? 'rgba(245,158,11,0.15)' : (hasRates ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.05)');
    return head +
      '<div class="ic-cols"><div class="ic-hero">' +
        '<div class="bm-bignum" style="color:' + (hasRates && st.above ? 'var(--amber)' : 'var(--lime)') + '">' + big + '</div>' +
        '<div class="ic-unit">' + (hasRates ? 'per year above default service' : 'add contracted rates to compare') + '</div>' +
        '<div class="bm-verdict" style="background:' + vBg + ';color:' + vColor + ';border:1px solid ' + vColor + '">' + verdict + '</div>' +
      '</div><div class="ic-data"><div class="bm-rows">' +
        row('Meters in choice states', st.scope + (st.total > st.scope ? ' of ' + st.total : '')) +
        row('With contracted rate', st.rated + (st.missing ? ' · ' + st.missing + ' missing' : ''), st.missing ? 'var(--amber)' : null) +
        row('Above price to compare', hasRates ? st.above + ' · ' + money(st.upYr) + '/yr' : '—', st.above ? 'var(--amber)' : null) +
        row('Below price to compare', hasRates ? st.below + ' · ' + money(st.downYr) + '/yr' : '—', st.below ? '#22c55e' : null) +
        row('Net vs price to compare', hasRates ? (st.upYr - st.downYr >= 0 ? '+' : '−') + money(st.upYr - st.downYr) + '/yr' : '—') +
      '</div></div></div>' +
      '<div class="bm-basis">Supply only · contracted rate vs the utility’s default-service price for the meter’s class × annual usage' +
        (st.est ? ' · ' + st.est + ' estimated' : '') +
        (st.noPtc ? ' · ' + st.noPtc + ' hourly or unpublished' : '') +
        (st.unmatched ? ' · ' + st.unmatched + ' utility not matched' : '') +
        ' · refreshed monthly</div>';
  }
  function tileB(list, n) {
    var head = '<div class="ic-lbl">↑ Largest gaps above price to compare</div>';
    if (!list.length) {
      return head + '<div class="loc-card-sub" style="margin-top:6px">No meter with a contracted rate is above its price to compare. Meters without a rate on file are not counted; add rates through the upload template or on each location page.</div>';
    }
    var rows = list.map(function (r) {
      var a = r.a, id = locLink(a);
      return '<div class="bm-row"' + (id ? ' data-loc="' + esc(id) + '" style="cursor:pointer"' : '') + ' title="Open location">' +
        '<span class="bm-row-lbl" style="max-width:62%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          esc(a.address || 'Unnamed') + (a.city ? ', ' + esc(a.city) : '') + ' · ' + esc(a.utility || '') + (fuelOf(a) === 'gas' ? ' gas' : '') + '</span>' +
        '<span class="bm-row-val" style="color:var(--amber)">+' + fmt(r.d, r.c.unit) + ' · ' + money(r.yr) + '/yr</span></div>';
    }).join('');
    return head + '<div class="bm-rows" style="margin-top:6px">' + rows + '</div>' +
      '<div class="bm-basis">' + (n > list.length ? 'Top ' + list.length + ' of ' + n + ' meters above. ' : '') + 'Click a row to open the location and its price-to-compare cards.</div>';
  }

  window.BeaconPTC = { renderLocation: renderLocation, renderPortfolio: renderPortfolio, match: match, loadState: loadState, _pickUtility: pickUtility, _expand: expand };
})();
