/* ============================================================================
 * trading_desk.js — Markets → Trading Desk (broker only)            bundle 134
 * ----------------------------------------------------------------------------
 * Brought over from Conductor's Trading Desk, rebuilt on Beacon tiles and
 * pointed at the live feeds:
 *   • Signals — what moved (power vs 30-day, Henry Hub week-over-week, storage
 *     vs 5-year) and renewals sitting in the markets that moved.
 *   • Wholesale power — benchmark hub per ISO (PJM, NYISO, ISO-NE, MISO,
 *     ERCOT, CAISO): latest 5-min, 24h / 7d / 30d averages, 7-day sparkline;
 *     click a tile for the 30-day daily chart and every hub/zone.
 *   • Exposure — this client or your whole book, by ISO: MWh, wholesale
 *     energy cost at the 30-day average, what a $10/MWh move is worth, and
 *     renewals in the next 180 days. Book = accounts your login can see (RLS),
 *     so a rep sees their clients and a manager sees the firm.
 *   • Natural gas — Henry Hub spot and Lower-48 storage with regions.
 *   • EIA outlook — STEO edition date shown so a stale edition is obvious.
 * One RPC (market_desk) returns all market numbers; nothing is invented.
 * Tagged broker-only; the tab is hidden in client view and on client links.
 * ========================================================================== */
(function () {
  'use strict';
  function sb() { return window._beaconSb || window.sb || null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function num(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) ? null : n; }
  function usd(v, d) { v = num(v); return v == null ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(d == null ? 2 : d); }
  function money(v) { v = num(v); return v == null ? '—' : (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString(); }
  function n0(v) { v = num(v); return v == null ? '—' : Math.round(v).toLocaleString(); }
  function pct(a, b) { a = num(a); b = num(b); if (a == null || b == null || b === 0) return null; return (a - b) / Math.abs(b) * 100; }
  function pctTxt(p) { return p == null ? '—' : (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%'; }
  function pctCol(p, invert) { if (p == null) return 'var(--mu)'; var up = invert ? p < 0 : p > 0; return Math.abs(p) < 1 ? 'var(--mu)' : (up ? '#f59e0b' : '#22c55e'); }
  function when(t) { if (!t) return '—'; var d = new Date(t); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function day(t) { if (!t) return '—'; return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
  function row(l, v) { return '<div class="bm-row"><span class="bm-row-lbl">' + l + '</span><span class="bm-row-val">' + v + '</span></div>'; }
  function clientView() {
    try { if (document.body.classList.contains('client-view')) return true; } catch (e) {}
    try { return !!(window.BeaconPTC && window.BeaconPTC._clientView && window.BeaconPTC._clientView()); } catch (e) { return false; }
  }

  var ISO_NAME = { PJM: 'PJM Interconnection', NYISO: 'New York ISO', ISONE: 'ISO New England', MISO: 'Midcontinent ISO', ERCOT: 'ERCOT (Texas)', CAISO: 'California ISO' };
  var STATE = { d: null, book: null, bookErr: null, scope: 'client', open: null, loading: false, at: 0 };

  // ── tiny SVG charts ──────────────────────────────────────────────────────
  function spark(pts, w, h, color) {
    var v = (pts || []).map(function (p) { return num(p[1]); }).filter(function (x) { return x != null; });
    if (v.length < 2) return '<div style="height:' + h + 'px"></div>';
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), span = hi - lo || 1;
    var xy = v.map(function (x, i) { return (i / (v.length - 1) * w).toFixed(1) + ',' + (h - 2 - (x - lo) / span * (h - 4)).toFixed(1); }).join(' ');
    var zero = lo < 0 && hi > 0 ? '<line x1="0" x2="' + w + '" y1="' + (h - 2 - (0 - lo) / span * (h - 4)).toFixed(1) + '" y2="' + (h - 2 - (0 - lo) / span * (h - 4)).toFixed(1) + '" stroke="rgba(255,255,255,.18)" stroke-dasharray="2,2"/>' : '';
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block">' + zero +
      '<polyline points="' + xy + '" fill="none" stroke="' + (color || 'var(--lime)') + '" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>';
  }
  function bars(pts, h, avg) {
    var v = (pts || []).map(function (p) { return { t: p[0], v: num(p[1]) }; }).filter(function (x) { return x.v != null; });
    if (!v.length) return '';
    var hi = Math.max.apply(null, v.map(function (x) { return x.v; }).concat([1])), lo = Math.min.apply(null, v.map(function (x) { return x.v; }).concat([0]));
    var span = hi - lo || 1, W = 100 / v.length;
    var bz = h * hi / span;
    var out = v.map(function (x, i) {
      var y = x.v >= 0 ? bz - x.v / span * h : bz, hh = Math.abs(x.v) / span * h;
      return '<rect x="' + (i * W + W * 0.12).toFixed(2) + '" width="' + (W * 0.76).toFixed(2) + '" y="' + y.toFixed(1) + '" height="' + Math.max(hh, 0.5).toFixed(1) + '" fill="' + (x.v < 0 ? '#3B82F6' : 'var(--lime)') + '" opacity=".75"><title>' + day(x.t) + ': ' + usd(x.v) + '/MWh</title></rect>';
    }).join('');
    var ay = avg != null ? (bz - avg / span * h).toFixed(1) : null;
    return '<svg viewBox="0 0 100 ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block">' + out +
      (ay != null ? '<line x1="0" x2="100" y1="' + ay + '" y2="' + ay + '" stroke="#f59e0b" stroke-dasharray="1.5,1.5" stroke-width=".6" vector-effect="non-scaling-stroke"/>' : '') + '</svg>';
  }

  // ── book / client exposure ───────────────────────────────────────────────
  function isoKey(a) {
    var r = window.BeaconLoad && window.BeaconLoad.isoOf ? window.BeaconLoad.isoOf(a) : { iso: null };
    return r.iso === 'ISO-NE' ? 'ISONE' : r.iso;
  }
  function isElec(a) { return !/gas/i.test(String(a.type || a.accountType || '')); }
  function clientAccts() {
    var q = new URLSearchParams(location.search), cid = q.get('clientId') || q.get('client') || window._beaconClientId || '';
    var list = [];
    try { list = (window.beaconGetAccounts ? window.beaconGetAccounts(cid) : []) || []; } catch (e) {}
    return list.map(function (a) { return { utility: a.utility, state: a.state, kwh: num(a.annualUsage != null ? a.annualUsage : a.usage), exp: a.expiration || a.exp || '', type: a.type, cust: cid }; });
  }
  function loadBook() {
    var c = sb(); if (!c || !c.auth) return Promise.resolve(null);
    return c.auth.getSession().then(function (s) {
      if (!s || !s.data || !s.data.session) return null;
      var out = [], page = 0;
      function next() {
        return c.from('accounts').select('id, customer_id, type, utility, annual_usage, expiration, locations ( state )')
          .eq('lifecycle_status', 'active').order('id').range(page * 1000, page * 1000 + 999).then(function (r) {
            if (r.error) throw r.error;
            (r.data || []).forEach(function (a) { out.push({ utility: a.utility, state: a.locations && a.locations.state, kwh: num(a.annual_usage), exp: a.expiration || '', type: a.type, cust: a.customer_id }); });
            if ((r.data || []).length === 1000 && page < 20) { page++; return next(); }
            return out;
          });
      }
      return next();
    });
  }
  function exposure(accts, d) {
    var by = {}, now = Date.now(), h180 = now + 180 * 86400000, px = {};
    (d.iso || []).forEach(function (i) { px[i.iso] = i; });
    accts.filter(isElec).forEach(function (a) {
      var k = isoKey(a) || 'OTHER';
      var r = by[k] = by[k] || { iso: k, accts: 0, mwh: 0, noUse: 0, ren: 0, renMwh: 0, custs: {} };
      r.accts++; r.custs[a.cust] = 1;
      if (a.kwh) r.mwh += a.kwh / 1000; else r.noUse++;
      var t = a.exp ? Date.parse(a.exp) : NaN;
      if (isFinite(t) && t >= now - 86400000 && t <= h180) { r.ren++; r.renMwh += (a.kwh || 0) / 1000; }
    });
    var order = ['PJM', 'NYISO', 'ISONE', 'MISO', 'ERCOT', 'CAISO', 'SPP', 'OTHER'];
    return Object.keys(by).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }).map(function (k) {
      var r = by[k], p = px[k];
      r.clients = Object.keys(r.custs).length;
      r.p30 = p ? num(p.avg30) : null; r.p7 = p ? num(p.avg7) : null;
      r.cost = r.p30 != null ? r.mwh * r.p30 : null;
      r.per10 = p ? r.mwh * 10 : null;
      r.trend = p ? pct(p.avg7, p.avg30) : null;
      return r;
    });
  }

  // ── signals ──────────────────────────────────────────────────────────────
  function signals(d, ex) {
    var out = [];
    (d.iso || []).forEach(function (i) {
      var p = pct(i.avg24, i.avg30);
      if (p != null && Math.abs(p) >= 25 && num(i.avg30) > 5)
        out.push({ sev: p > 0 ? 'amber' : 'green', tag: i.label, txt: i.label + ' ' + i.bench_label + ' ' + (p > 0 ? 'running hot' : 'running soft') + ': last 24h averaged ' + usd(i.avg24) + '/MWh vs ' + usd(i.avg30) + ' over 30 days (' + pctTxt(p) + ').' });
    });
    var hh = d.henry_hub || {}, w = pct(hh.last, hh.wk);
    if (w != null && Math.abs(w) >= 5) out.push({ sev: w > 0 ? 'amber' : 'green', tag: 'Gas', txt: 'Henry Hub ' + (w > 0 ? 'up' : 'down') + ' ' + Math.abs(w).toFixed(1) + '% in about a week: ' + usd(hh.wk) + ' → ' + usd(hh.last) + '/MMBtu (' + day(hh.last_at) + ').' });
    var st = d.storage || {}, s5 = pct(st.last, st.avg5);
    if (s5 != null && Math.abs(s5) >= 5) out.push({ sev: s5 > 0 ? 'green' : 'amber', tag: 'Storage', txt: 'Gas storage ' + Math.abs(s5).toFixed(1) + '% ' + (s5 > 0 ? 'above' : 'below') + ' the 5-year average for this week (' + n0(st.last) + ' vs ' + n0(st.avg5) + ' Bcf). ' + (s5 > 0 ? 'A cushion tends to soften prices.' : 'A deficit tends to support prices.') });
    (ex || []).forEach(function (r) {
      if (r.ren && r.trend != null && Math.abs(r.trend) >= 10)
        out.push({ sev: r.trend > 0 ? 'amber' : 'green', tag: 'Renewals', txt: r.ren + ' account' + (r.ren === 1 ? '' : 's') + ' (' + n0(r.renMwh) + ' MWh/yr) renew' + (r.ren === 1 ? 's' : '') + ' within 180 days in ' + (ISO_NAME[r.iso] ? r.iso.replace('ISONE', 'ISO-NE') : r.iso) + ', where the 7-day average is ' + pctTxt(r.trend) + ' vs 30 days.' });
    });
    return out;
  }

  // ── render ───────────────────────────────────────────────────────────────
  function isoTile(i) {
    var p24 = pct(i.avg24, i.avg_prev24), p30 = pct(i.avg24, i.avg30);
    var stale = !i.last_at || Date.now() - Date.parse(i.last_at) > 90 * 60000;
    var open = STATE.open === i.iso;
    return '<div class="icard icard-clickable" data-iso="' + i.iso + '" style="cursor:pointer;min-width:0;' + (open ? 'border-color:var(--lime);' : '') + '">' +
      '<div class="ic-lbl">' + esc(i.label) + ' · ' + esc(i.bench_label) + (stale ? ' <span class="loc-pill gray">delayed</span>' : '') + '</div>' +
      '<div class="ic-cols"><div class="ic-hero"><div class="bm-bignum">' + usd(i.last) + '</div><div class="ic-unit">$/MWh · latest · ' + when(i.last_at) + '</div></div>' +
      '<div class="ic-data"><div class="bm-rows">' +
        row('24h avg', usd(i.avg24) + ' <span style="color:' + pctCol(p24) + ';font-size:10px">' + pctTxt(p24) + '</span>') +
        row('7-day avg', usd(i.avg7)) + row('30-day avg', usd(i.avg30)) +
        row('24h range', usd(i.min24, 0) + ' – ' + usd(i.max24, 0)) +
      '</div></div></div>' +
      '<div style="margin-top:8px">' + spark(i.hourly, 200, 34) + '</div>' +
      '<div class="loc-card-srcline">7 days, hourly · 24h vs 30-day <span style="color:' + pctCol(p30) + '">' + pctTxt(p30) + '</span></div></div>';
  }
  function isoDetail(i) {
    var hubs = (i.hubs || []).slice().sort(function (a, b) { return (num(b.avg24) || 0) - (num(a.avg24) || 0); });
    return '<div class="icard" style="min-width:0;margin-top:10px">' +
      '<div class="ic-lbl">' + esc(ISO_NAME[i.iso] || i.label) + ' · ' + esc(i.bench_label) + ' · daily average, last 30 days</div>' +
      bars(i.daily, 70, num(i.avg30)) +
      '<div class="loc-card-srcline">Bars = daily average of real-time 5-minute prices. Dashed line = 30-day average ' + usd(i.avg30) + ' · median ' + usd(i.median30) + ' · ' + n0(i.n30) + ' intervals.</div>' +
      '<div style="overflow-x:auto;margin-top:10px"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>' +
        ['Hub / zone', 'Latest', '24h avg', 'As of'].map(function (h, k) { return '<th style="text-align:' + (k ? 'right' : 'left') + ';padding:5px 8px;color:var(--mu);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid var(--b1)">' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + hubs.map(function (h) {
        return '<tr><td style="padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.05);color:#fff">' + esc(h.label) + (h.id === i.bench ? ' <span class="loc-pill blue">benchmark</span>' : '') + '</td>' +
          '<td style="padding:5px 8px;text-align:right;border-bottom:1px solid rgba(255,255,255,.05)">' + usd(h.last) + '</td>' +
          '<td style="padding:5px 8px;text-align:right;border-bottom:1px solid rgba(255,255,255,.05)">' + usd(h.avg24) + '</td>' +
          '<td style="padding:5px 8px;text-align:right;border-bottom:1px solid rgba(255,255,255,.05);color:var(--mu)">' + when(h.last_at) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function exposureCard(d) {
    var list = STATE.scope === 'book' ? STATE.book : clientAccts();
    var head = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><div class="ic-lbl" style="margin:0">Wholesale exposure by ISO</div><span style="flex:1"></span>' +
      ['client:This client', 'book:Your book'].map(function (x) { var p = x.split(':'); return '<button type="button" data-scope="' + p[0] + '" style="border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;' + (STATE.scope === p[0] ? 'background:var(--lime);color:#0a0e1a;border:0;font-weight:700' : 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.25)') + '">' + p[1] + '</button>'; }).join('') + '</div>';
    if (STATE.scope === 'book' && list == null) return '<div class="icard" style="min-width:0">' + head + '<div class="loc-card-sub">' + (STATE.bookErr ? 'Could not load your book: ' + esc(STATE.bookErr) : 'Sign in to see your whole book. This client is shown under “This client”.') + '</div></div>';
    var ex = exposure(list || [], d);
    if (!ex.length) return '<div class="icard" style="min-width:0">' + head + '<div class="loc-card-sub">No electric accounts ' + (STATE.scope === 'book' ? 'in your book' : 'for this client') + ' yet.</div></div>';
    var tot = ex.reduce(function (s, r) { return { mwh: s.mwh + r.mwh, cost: s.cost + (r.cost || 0), per10: s.per10 + (r.per10 || 0), ren: s.ren + r.ren, accts: s.accts + r.accts }; }, { mwh: 0, cost: 0, per10: 0, ren: 0, accts: 0 });
    var th = function (h, k) { return '<th style="text-align:' + (k ? 'right' : 'left') + ';padding:5px 8px;color:var(--mu);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid var(--b1);white-space:nowrap">' + h + '</th>'; };
    var td = function (v, k, extra) { return '<td style="padding:6px 8px;text-align:' + (k ? 'right' : 'left') + ';border-bottom:1px solid rgba(255,255,255,.05);white-space:nowrap;' + (extra || '') + '">' + v + '</td>'; };
    var body = ex.map(function (r) {
      var name = r.iso === 'OTHER' ? 'Unmapped' : r.iso === 'ISONE' ? 'ISO-NE' : r.iso;
      var tracked = r.p30 != null;
      return '<tr>' + td('<b style="color:#fff">' + name + '</b>' + (STATE.scope === 'book' ? '<div style="font-size:10px;color:var(--mu)">' + r.clients + ' client' + (r.clients === 1 ? '' : 's') + '</div>' : ''), 0) +
        td(n0(r.accts) + (r.noUse ? '<div style="font-size:10px;color:var(--mu)">' + r.noUse + ' no usage</div>' : ''), 1) + td(n0(r.mwh), 1) +
        td(tracked ? usd(r.p30) + ' <span style="font-size:10px;color:' + pctCol(r.trend) + '">' + pctTxt(r.trend) + '</span>' : '<span style="color:var(--mu)">' + (r.iso === 'SPP' ? 'not tracked yet' : r.iso === 'OTHER' ? 'utility/state not mapped' : 'not tracked') + '</span>', 1) +
        td(tracked ? money(r.cost) : '—', 1) + td(tracked ? money(r.per10) : '—', 1) +
        td(r.ren ? '<b style="color:#f59e0b">' + r.ren + '</b> <span style="font-size:10px;color:var(--mu)">' + n0(r.renMwh) + ' MWh</span>' : '<span style="color:var(--mu)">0</span>', 1) + '</tr>';
    }).join('');
    return '<div class="icard" style="min-width:0">' + head +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>' +
        th('ISO', 0) + th('Accounts', 1) + th('MWh / yr', 1) + th('30-day hub avg · 7d vs 30d', 1) + th('Wholesale energy / yr', 1) + th('Per $10/MWh move', 1) + th('Renewing ≤180 days', 1) +
      '</tr></thead><tbody>' + body + '</tbody><tfoot><tr>' + td('<b>Total</b>', 0) + td(n0(tot.accts), 1) + td(n0(tot.mwh), 1) + td('', 1) + td('<b>' + money(tot.cost) + '</b>', 1) + td('<b>' + money(tot.per10) + '</b>', 1) + td(tot.ren ? '<b style="color:#f59e0b">' + tot.ren + '</b>' : '0', 1) + '</tr></tfoot></table></div>' +
      '<div class="loc-card-srcline" style="margin-top:6px">Estimate: annual usage × the benchmark hub’s 30-day real-time average. Wholesale energy only, before capacity, transmission, losses and supplier margin, so it is not a contract price. ISO from the utility (or state when the utility isn’t recognised). Electric accounts only.</div></div>';
  }
  function gasCards(d) {
    var hh = d.henry_hub || {}, st = d.storage || {};
    var wk = pct(hh.last, hh.wk), mo = pct(hh.last, hh.mo), yr = pct(hh.last, hh.yr);
    var chg = num(st.last) != null && num(st.prev) != null ? num(st.last) - num(st.prev) : null;
    var regs = (st.regions || []).map(function (r) { var c = num(r.last) != null && num(r.prev) != null ? num(r.last) - num(r.prev) : null; return row(esc(r.label), n0(r.last) + ' <span style="font-size:10px;color:var(--mu)">' + (c == null ? '' : (c >= 0 ? '+' : '−') + Math.abs(c)) + '</span>'); }).join('');
    return '<div class="icard" style="min-width:0"><div class="ic-lbl">Henry Hub natural gas · spot</div>' +
        '<div class="ic-cols"><div class="ic-hero"><div class="bm-bignum">' + usd(hh.last) + '</div><div class="ic-unit">$/MMBtu · ' + day(hh.last_at) + '</div></div>' +
        '<div class="ic-data"><div class="bm-rows">' + row('vs ~1 week', '<span style="color:' + pctCol(wk) + '">' + pctTxt(wk) + '</span>') + row('vs ~1 month', '<span style="color:' + pctCol(mo) + '">' + pctTxt(mo) + '</span>') +
          row('vs ~1 year', yr == null ? '<span style="color:var(--mu)">history starts Apr 2026</span>' : '<span style="color:' + pctCol(yr) + '">' + pctTxt(yr) + '</span>') + '</div></div></div>' +
        '<div style="margin-top:8px">' + spark(hh.hist, 200, 34, '#22d3ee') + '</div><div class="loc-card-srcline">EIA daily spot (RNGWHHD), last 30 prints · EIA publishes with a lag of several business days</div></div>' +
      '<div class="icard" style="min-width:0"><div class="ic-lbl">U.S. Lower-48 gas storage · weekly</div>' +
        '<div class="ic-cols"><div class="ic-hero"><div class="bm-bignum">' + n0(st.last) + '<span style="font-size:16px;color:var(--mu)"> Bcf</span></div><div class="ic-unit">week ending ' + day(st.last_at) + '</div></div>' +
        '<div class="ic-data"><div class="bm-rows">' + row('Weekly change', chg == null ? '—' : (chg >= 0 ? '+' : '−') + Math.abs(chg) + ' Bcf') +
          row('vs year ago', '<span style="color:' + pctCol(pct(st.last, st.yr), true) + '">' + pctTxt(pct(st.last, st.yr)) + '</span>') +
          row('vs 5-yr avg', '<span style="color:' + pctCol(pct(st.last, st.avg5), true) + '">' + pctTxt(pct(st.last, st.avg5)) + '</span> <span style="font-size:10px;color:var(--mu)">' + n0(st.avg5) + '</span>') + regs + '</div></div></div>' +
        '<div style="margin-top:8px">' + spark(st.hist, 200, 34, '#22d3ee') + '</div><div class="loc-card-srcline">EIA Weekly Natural Gas Storage Report, 52 weeks · 5-yr average = same week in each of the prior 5 years, from the same EIA series</div></div>';
  }
  function steoCard(d) {
    var s = d.steo || {}, c = s['eia.steo.escmuus'] || {}, g = s['eia.steo.nghhuus'] || {};
    var now = new Date().toISOString().slice(0, 7);
    var fut = function (p) { return (p || []).filter(function (x) { return x.m >= now; }).slice(0, 12); };
    var cf = fut(c.pts), gf = fut(g.pts);
    var avg = function (a) { return a.length ? a.reduce(function (t, x) { return t + Number(x.v); }, 0) / a.length : null; };
    var fetched = c.fetched || g.fetched, ageDays = fetched ? Math.round((Date.now() - Date.parse(fetched)) / 86400000) : null;
    return '<div class="icard" style="min-width:0"><div class="ic-lbl">EIA Short-Term Energy Outlook · next 12 months' + (ageDays != null && ageDays > 40 ? ' <span class="loc-pill amber">edition ' + ageDays + ' days old</span>' : '') + '</div>' +
      '<div class="bm-rows">' +
        row('Commercial electricity (U.S. avg)', (avg(cf) == null ? '—' : avg(cf).toFixed(2) + '¢/kWh avg') + (cf.length ? ' <span style="font-size:10px;color:var(--mu)">' + Number(cf[0].v).toFixed(2) + ' → ' + Number(cf[cf.length - 1].v).toFixed(2) + '</span>' : '')) +
        row('Henry Hub forecast', (avg(gf) == null ? '—' : '$' + avg(gf).toFixed(2) + '/MMBtu avg') + (gf.length ? ' <span style="font-size:10px;color:var(--mu)">' + usd(gf[0].v) + ' → ' + usd(gf[gf.length - 1].v) + '</span>' : '')) +
      '</div><div class="loc-card-srcline">EIA STEO series ESCMUUS and NGHHUUS, as loaded ' + day(fetched) + '. EIA publishes a new edition monthly; Beacon shows the latest edition it has.</div></div>';
  }

  function css() {
    if (document.getElementById('desk-css')) return;
    var st = document.createElement('style'); st.id = 'desk-css';
    st.textContent = '.desk-iso-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}' +
      '@media (max-width:1100px){.desk-iso-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
      '@media (max-width:640px){.desk-iso-grid{grid-template-columns:1fr}}' +
      '#sec-market .desk-hd{margin-top:34px}';
    document.head.appendChild(st);
  }
  function deskHd(eye, title, sub) {
    return '<div class="igrid-theme-hd desk-hd"><div class="igrid-theme-eye">' + eye + '</div><div class="igrid-theme-title">' + title + '</div>' + (sub ? '<div class="igrid-theme-sub">' + sub + '</div>' : '') + '</div>';
  }
  function render() {
    var root = document.getElementById('desk-root'); if (!root) return;
    var gasRoot = document.getElementById('desk-root-gas'), steoRoot = document.getElementById('desk-root-steo');
    css();
    if (clientView()) { root.innerHTML = ''; if (gasRoot) gasRoot.innerHTML = ''; if (steoRoot) steoRoot.innerHTML = ''; return; }
    var d = STATE.d;
    if (!d) { root.innerHTML = '<div class="icard"><div class="loc-card-sub">' + (STATE.err ? 'Market data unavailable: ' + esc(STATE.err) : 'Loading the trading desk…') + '</div></div>'; return; }
    var cex = exposure(STATE.scope === 'book' && STATE.book ? STATE.book : clientAccts(), d);
    var sig = signals(d, cex);
    var open = (d.iso || []).filter(function (i) { return i.iso === STATE.open; })[0];
    root.innerHTML =
      '<div class="igrid-theme-hd" style="margin-top:0"><div class="igrid-theme-eye">Trading Desk · broker only</div>' +
        '<div class="igrid-theme-title">What the market is doing, and what it means for this book</div>' +
        '<div class="igrid-theme-sub">as of ' + when(d.asof) + ' · power every 5–15 min · gas daily/weekly from EIA · <a href="#" data-refresh style="color:var(--lime)">refresh</a></div></div>' +
      '<div class="icard" style="min-width:0;margin-bottom:13px"><div class="ic-lbl">Signals</div>' +
        (sig.length ? sig.map(function (s) { return '<div style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-top:1px solid rgba(255,255,255,.05);font-size:12px;line-height:1.45"><span class="loc-pill ' + s.sev + '" style="flex:none">' + esc(s.tag) + '</span><span>' + esc(s.txt) + '</span></div>'; }).join('')
          : '<div class="loc-card-sub">Nothing unusual: power within 25% of its 30-day average, Henry Hub within 5% of a week ago, storage within 5% of the 5-year average.</div>') +
        '<div class="loc-card-srcline" style="margin-top:4px">Market context for your conversations, not a price forecast. Amber = upward pressure, green = easing.</div></div>' +
      // bundle 145: grouped — the book first, then power, gas and the retail outlook,
      // each with its charts beside it (gas and outlook live in their own roots below).
      '<div>' + exposureCard(d) + '</div>' +
      deskHd('Power markets', 'Wholesale power by ISO', 'real-time hub prices · click an ISO for its 30-day chart and every hub and zone') +
      '<div class="desk-iso-grid">' + (d.iso || []).map(isoTile).join('') + '</div>' +
      (open ? isoDetail(open) : '') +
      (gasRoot ? '' : '<div class="igrid" style="margin-top:13px">' + gasCards(d) + '</div>') +
      (steoRoot ? '' : '<div style="margin-top:13px">' + steoCard(d) + '</div>');
    if (gasRoot) gasRoot.innerHTML = '<div class="igrid" style="margin-top:0">' + gasCards(d) + '</div>';
    if (steoRoot) steoRoot.innerHTML = steoCard(d);
    root.querySelectorAll('[data-iso]').forEach(function (el) { el.addEventListener('click', function () { var k = el.getAttribute('data-iso'); STATE.open = STATE.open === k ? null : k; render(); }); });
    root.querySelectorAll('[data-scope]').forEach(function (el) { el.addEventListener('click', function () { STATE.scope = el.getAttribute('data-scope'); render(); }); });
    var rf = root.querySelector('[data-refresh]'); if (rf) rf.addEventListener('click', function (e) { e.preventDefault(); load(true); });
  }

  function load(force) {
    if (clientView()) return Promise.resolve();
    if (STATE.loading || (!force && STATE.d && Date.now() - STATE.at < 120000)) { render(); return Promise.resolve(); }
    var c = sb(); if (!c || !c.rpc) { STATE.err = 'not connected'; render(); return Promise.resolve(); }
    STATE.loading = true; render();
    return Promise.all([
      c.rpc('market_desk').then(function (r) { if (r.error) throw r.error; return r.data; }),
      STATE.book && !force ? Promise.resolve(STATE.book) : loadBook().catch(function (e) { STATE.bookErr = e.message || String(e); return null; }),
    ]).then(function (res) {
      STATE.d = res[0]; STATE.book = res[1]; STATE.err = null; STATE.at = Date.now();
      if (STATE.book && STATE.book.length && !clientAccts().length) STATE.scope = 'book';
    }, function (e) { STATE.err = (e && e.message) || String(e); })
      .then(function () { STATE.loading = false; render(); });
  }

  // Refresh every 5 minutes while the tab is on screen.
  setInterval(function () { var s = document.getElementById('sec-market'); if (s && s.classList.contains('on') && !document.hidden) load(true); }, 300000);
  window.BeaconDesk = { load: load, render: render, _state: STATE, _exposure: exposure, _signals: signals };
})();
