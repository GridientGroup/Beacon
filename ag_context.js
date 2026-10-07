/* ==========================================================================
 * ag_context.js — bundle 153: what Ask Gridient knows about the page.
 *
 * Builds a compact, plain-text briefing from what Beacon already computed for
 * the open client — portfolio size, spend, program opportunities, the next 120
 * days, contracts, the open location, and live market prices — and sends it
 * with each question so answers use this client's real numbers.
 * Nothing new is estimated here: every figure comes from Beacon's own engines,
 * and estimates are labelled as estimates.
 * ========================================================================== */
(function () {
  'use strict';
  function cid() { try { return window._beaconClientId || new URLSearchParams(location.search).get('clientId') || ''; } catch (e) { return ''; } }
  function money(n) { n = Number(n) || 0; var a = Math.abs(n); var s = a >= 1e6 ? '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M' : a >= 1e3 ? '$' + Math.round(a / 1e3) + 'K' : '$' + Math.round(a); return n < 0 ? '-' + s : s; }
  function num(n) { return (Number(n) || 0).toLocaleString('en-US'); }
  function txt(id) { var e = document.getElementById(id); return e ? e.textContent.trim().replace(/\s+/g, ' ') : ''; }
  function timeout(p, ms) { return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(null); }, ms); })]); }
  function key(a) { return [a.address, a.city, a.state].join('|').toLowerCase(); }

  function portfolio(accts) {
    var locs = {}, states = {}, elec = 0, gas = 0, withExp = 0, expired = 0, soon = 0, year = 0, sup = {}, util = {};
    var t0 = new Date(); t0.setHours(0, 0, 0, 0);
    accts.forEach(function (a) {
      locs[key(a)] = 1; if (a.state) states[a.state] = (states[a.state] || 0) + 1;
      var t = String(a.type || a.accountType || '').toLowerCase(), u = Number(a.usage != null ? a.usage : a.annualUsage) || 0;
      if (t === 'electric') elec += u; else if (t === 'gas') gas += u;
      if (a.supplier) sup[a.supplier] = (sup[a.supplier] || 0) + 1;
      if (a.utility) util[a.utility] = (util[a.utility] || 0) + 1;
      var e = a.exp || a.expiration; if (e) { var d = new Date(String(e).slice(0, 10) + 'T00:00:00'); if (!isNaN(d)) { withExp++; var days = (d - t0) / 864e5; if (days < 0) expired++; else if (days <= 120) soon++; else if (days <= 365) year++; } }
    });
    var top = function (o, n) { return Object.keys(o).sort(function (x, y) { return o[y] - o[x]; }).slice(0, n).map(function (k) { return k + ' (' + o[k] + ')'; }).join(', '); };
    var spend = 0; try { spend = window.beaconSpend ? window.beaconSpend(accts) : 0; } catch (e) {}
    return [
      'Accounts (meters): ' + accts.length + ' · Locations: ' + Object.keys(locs).length + ' · States: ' + Object.keys(states).length + ' (most: ' + top(states, 5) + ')',
      'Annual usage: ' + num(Math.round(elec)) + ' kWh electric · ' + num(Math.round(gas)) + ' therms gas' + (spend ? ' · Estimated annual energy spend: ' + money(spend) + ' (estimate at state average rates)' : ''),
      'Supply contracts: ' + withExp + ' meters have an end date on file · ' + expired + ' already expired (likely on utility default service) · ' + soon + ' end within 120 days · ' + year + ' more end within a year',
      'Main suppliers: ' + (top(sup, 5) || 'none on file') + ' · Main utilities: ' + top(util, 5)
    ].join('\n');
  }

  function programs(accts) {
    var M = window.OPP_META || (typeof OPP_META !== 'undefined' ? OPP_META : null); if (!M || !window._oppEligibleLocations) return '';
    var rows = Object.keys(M).map(function (pid) {
      try {
        var el = _oppEligibleLocations(pid, accts) || [], seen = {}; el.forEach(function (a) { seen[key(a)] = 1; });
        var v = (typeof _oppEstimatedValue === 'function' ? _oppEstimatedValue(pid, el) : 0) || 0;
        return { name: M[pid].name || pid, n: Object.keys(seen).length, v: v, one: !!M[pid].oneTime };
      } catch (e) { return null; }
    }).filter(Boolean).sort(function (a, b) { return b.v - a.v; });
    return rows.map(function (r) { return '- ' + r.name + ': ' + r.n + ' qualifying locations' + (r.v ? ', estimated ' + money(r.v) + (r.one ? ' one-time' : '/yr') : ''); }).join('\n') +
      '\n(Program estimates overlap; do not add them together.)';
  }

  function next120(res) {
    if (!res || !res.events) return '';
    var s = res.stats || {}, D = window.BeaconTriggers && BeaconTriggers.describe;
    var head = res.events.length + ' timed events from today to ' + (res.end ? res.end.toISOString().slice(0, 10) : '') + ': ' + (s.contract || 0) + ' contract expirations, ' + (s.rate || 0) + ' utility default-rate changes, ' + (s.bps || 0) + ' building-performance (BPS) deadlines; ' + (s.expired || 0) + ' contracts already expired.';
    var list = res.events.slice(0, 12).map(function (e) {
      var d = D ? D(e, res.asOf) : { when: e.date, kind: e.kind, where: e.title, detail: '' };
      var fuel = '';
      if (e.kind === 'contract') { var dt = String(d.detail || ''); fuel = /kWh/.test(dt) ? 'Electric ' : /therm/.test(dt) ? 'Gas ' : ''; }
      return '- ' + d.when + ' · ' + fuel + d.kind + ' · ' + d.where + (d.detail ? ' · ' + d.detail.slice(0, 180) : '');
    }).join('\n');
    var cs = res.events.filter(function (e) { return e.kind === 'contract'; }).map(function (e) { var d = D ? D(e, res.asOf) : { where: e.title, detail: '' }; var m = String(d.detail || '').match(/~\$([\d,]+)\/yr/); return { where: d.where, when: d.when, v: m ? +m[1].replace(/,/g, '') : 0 }; });
    var pr = cs.length > 1 ? '\nContract expirations in this window, largest estimated spend first: ' + cs.slice().sort(function (a, b) { return b.v - a.v; }).map(function (c) { return c.where + ' (' + c.when + ')'; }).join('; ') + '. The soonest is ' + cs[0].where + ' (' + cs[0].when + ').' : '';
    return head + '\n' + list + pr;
  }

  function market(d) {
    if (!d) return '';
    var out = [];
    (d.iso || []).forEach(function (i) { if (i.last != null) out.push(i.iso + ' ' + (i.bench_label || 'hub') + ': $' + Number(i.last).toFixed(2) + '/MWh now, 30-day avg $' + Number(i.avg30 || 0).toFixed(2)); });
    if ((d.iso || []).length) out.push('(Power figures are wholesale spot prices, not retail fixed-contract quotes; a low spot price is a supportive sign for pricing renewals, not a quote.)');
    var h = d.henry_hub || {}; if (h.last != null) out.push('Henry Hub gas: $' + Number(h.last).toFixed(2) + '/MMBtu (' + String(h.last_at || '').slice(0, 10) + ')' + (h.wk ? ', a week earlier $' + Number(h.wk).toFixed(2) : ''));
    var st = d.storage || {}; if (st.last != null) out.push('US gas storage: ' + num(st.last) + ' Bcf (week ending ' + String(st.last_at || '').slice(0, 10) + ')' + (st.avg5 ? ' vs 5-year average ' + num(st.avg5) + ' Bcf, ' + (function (p) { return Math.abs(p).toFixed(1) + '% ' + (p >= 0 ? 'ABOVE the 5-year average (more gas than normal: bearish, downward pressure on prices)' : 'BELOW the 5-year average (less gas than normal: bullish, upward pressure on prices)'); })((st.last / st.avg5 - 1) * 100) : ''));
    if (h.last != null && h.wk) { var hp = (h.last / h.wk - 1) * 100; out.push('Henry Hub week-over-week: ' + (hp >= 0 ? 'up ' : 'down ') + Math.abs(hp).toFixed(1) + '%'); }
    return out.join('\n');
  }

  function location() {
    var sec = document.getElementById('sec-location'); if (!sec || !sec.classList.contains('on')) return '';
    var sc = window._locProgScope; if (!sc || !sc.accts) return '';
    var a = sc.accts, lines = ['Open location: ' + sc.label + ' · ' + a.length + ' meter(s)'];
    a.slice(0, 4).forEach(function (m) { lines.push('- ' + (m.type || '') + ' ' + (m.account || '') + ' · utility ' + (m.utility || '?') + ' · supplier ' + (m.supplier || 'none') + ' · contract ends ' + (m.exp || m.expiration || 'not on file') + ' · ' + num(m.usage || m.annualUsage) + (String(m.type).toLowerCase() === 'gas' ? ' therms' : ' kWh') + '/yr'); });
    return lines.join('\n');
  }

  // warm the 120-day list in the background so the first question is quick
  var _pre = null;
  function warm() {
    var id = cid(), accts = (id && window.beaconGetAccounts && beaconGetAccounts(id)) || [];
    if (!accts.length || !window.BeaconTriggers || (_pre && _pre.n === accts.length)) return;
    BeaconTriggers.build(accts).then(function (res) { _pre = { n: accts.length, res: res }; }, function () {});
  }
  setTimeout(warm, 6000); setTimeout(warm, 20000);
  var _cache = null;
  window.BeaconAskContext = function () {
    var sig = [cid(), document.body.classList.contains('client-view'), (document.querySelector('.vbtn.on') || {}).textContent, (document.getElementById('sec-location') || {}).className, window._locProgScope && window._locProgScope.label].join('|');
    if (_cache && _cache.sig === sig && Date.now() - _cache.t < 60000) return _cache.p;
    var p = build();
    _cache = { sig: sig, t: Date.now(), p: p };
    p.then(function (v) { if (!v && _cache && _cache.p === p) _cache = null; });
    return p;
  };
  function build() {
    var id = cid(), accts = (id && window.beaconGetAccounts && beaconGetAccounts(id)) || [];
    var broker = !document.body.classList.contains('client-view');
    var b = window.BeaconBrand && BeaconBrand.current && BeaconBrand.current();
    var firm = (b && (b.full || b.short)) || 'Sustainable Turnkey Solutions';
    var view = document.querySelector('.vbtn.on'); view = view ? view.textContent.trim() : '';
    var trg = window.BeaconTriggers && BeaconTriggers.last && BeaconTriggers.last();
    if (!(trg && trg.stats && trg.stats.meters === accts.length)) trg = (_pre && _pre.n === accts.length) ? _pre.res : null;
    var trgP = trg ? Promise.resolve(trg) : (accts.length && window.BeaconTriggers ? timeout(BeaconTriggers.build(accts), 6000) : Promise.resolve(null));
    var desk = window.BeaconDesk && BeaconDesk._state;
    var mkP = desk && desk.d ? Promise.resolve(desk.d) : (broker && window.BeaconDesk ? timeout(BeaconDesk.load().then(function () { return BeaconDesk._state.d; }), 2500) : Promise.resolve(null));
    return Promise.all([trgP, mkP]).then(function (r) {
      var parts = [
        'AUDIENCE: ' + (broker ? 'a broker at ' + firm + ' (the energy advisor) looking at their client' : 'the client themselves, a customer of ' + firm),
        'TODAY: ' + new Date().toISOString().slice(0, 10) + ' · SCREEN: ' + view,
        accts.length ? 'CLIENT: ' + (txt('d-name') || id) + '\n' + portfolio(accts) : 'CLIENT: none open',
        accts.length ? 'PROGRAM OPPORTUNITIES (Beacon estimates from this client’s accounts):\n' + programs(accts) : '',
        r[0] ? 'NEXT 120 DAYS:\n' + next120(r[0]) : '',
        location(),
        r[1] ? 'LIVE MARKET:\n' + market(r[1]) : ''
      ].filter(Boolean).join('\n\n');
      return parts.slice(0, 7000);
    }, function () { return ''; });
  }
})();

/* --------------------------------------------------------------------------
 * Ask Gridient window — bundle 153 polish.
 *   • Suggested questions (chips) that fit who is looking and what is open.
 *   • A live-data badge naming the client the answers come from.
 *   • Answer styling: figures in the firm colour, cleaner lists.
 *   • A small "answered in 3.4s" stamp under each answer.
 * UNDO: delete this block (the context builder above keeps working).
 * -------------------------------------------------------------------------- */
(function () {
  'use strict';
  function isBroker() { return !document.body.classList.contains('client-view'); }
  function clientName() { var e = document.getElementById('d-name'); return e ? e.textContent.trim() : ''; }
  function meters() { try { var id = window._beaconClientId || new URLSearchParams(location.search).get('clientId'); var a = id && window.beaconGetAccounts ? beaconGetAccounts(id) : []; return (a || []).length; } catch (e) { return 0; } }
  function locOpen() { var s = document.getElementById('sec-location'); return !!(s && s.classList.contains('on') && window._locProgScope); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function questions() {
    var b = isBroker(), q = [];
    if (locOpen()) q.push(b ? 'When does this location’s contract end, and what happens then?' : 'When does this location’s contract end, and what happens then?');
    if (b) q.push('Which of this client’s contracts should I call about first, and why?', 'What changes for this client in the next 120 days?', 'What is the gas market telling us this week?', 'Which program should I bring to this client first?');
    else q.push('Which of my contracts need attention first?', 'What changes for us in the next 120 days?', 'What happens if one of our contracts is not renewed in time?', 'Which program is the best fit for us?');
    return q.slice(0, 4);
  }

  // render model text as safe, styled HTML (accepts HTML or light markdown)
  window.BeaconAskRender = function (t) {
    t = String(t || '');
    if (!/<(p|ul|li|strong)\b/i.test(t)) {
      var out = [], list = [];
      var flush = function () { if (list.length) { out.push('<ul>' + list.join('') + '</ul>'); list = []; } };
      t.split(/\n/).forEach(function (ln) {
        var l = ln.trim();
        if (!l) { flush(); return; }
        var m = l.match(/^[-*•]\s+(.*)$/);
        if (m) list.push('<li>' + esc(m[1]) + '</li>'); else { flush(); out.push('<p>' + esc(l) + '</p>'); }
      });
      flush();
      t = out.join('').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*\*/g, '');
    }
    // keep only the tags the assistant is allowed to use
    t = t.replace(/<(?!\/?(p|ul|ol|li|strong|b|em|br)\b)[^>]*>/gi, '').replace(/<(\w+)\s[^>]*>/g, '<$1>');
    // figures in the firm colour
    return t.replace(/(^|[^\w#&;])(~?\$[\d,.]+[KkMB]?(?:\/yr| one-time)?|\d[\d,.]*¢\/kWh|\$[\d.]+\/(?:MMBtu|therm|MWh)|[+−-]?\d+(?:\.\d+)?%)(?![^<]*>)/g, '$1<span class="ag-fig">$2</span>');
  };

  window.BeaconAskStamp = function (node, ms, live, first) {
    if (!node) return;
    var body = node.querySelector('.ag-msg-body'); if (!body) return;
    var d = document.createElement('div'); d.className = 'ag-stamp';
    d.innerHTML = '<span class="ag-stamp-bolt"></span>Answered in ' + (ms / 1000).toFixed(1) + 's' + (first ? ' · first words in ' + (first / 1000).toFixed(1) + 's' : '') + (live ? ' · from ' + (clientName() ? esc(/s$/i.test(clientName()) ? clientName() + '’' : clientName() + '’s') : 'this client’s') + ' live data' : '');
    body.appendChild(d);
  };

  function paint() {
    var empty = document.getElementById('ag-empty'), msgsEl = document.getElementById('ag-msgs');
    var name = clientName(), n = meters();
    var live = document.getElementById('ag-live');
    if (!live && msgsEl && msgsEl.parentNode) { live = document.createElement('div'); live.id = 'ag-live'; msgsEl.parentNode.insertBefore(live, msgsEl); }
    if (live) { live.style.display = name ? '' : 'none'; live.innerHTML = '<span class="ag-live-dot"></span><span class="ag-live-k">Live data</span><b>' + esc(name) + '</b>' + (n ? '<span class="ag-live-n">' + n.toLocaleString('en-US') + ' meters</span>' : '') + '<span class="ag-live-a">' + (isBroker() ? 'Broker view' : 'Client view') + '</span>'; }
    if (empty && empty.style.display !== 'none') {
      var hed = empty.querySelector('.ag-empty-hed'), tx = empty.querySelector('.ag-empty-txt');
      if (hed) hed.textContent = isBroker() ? 'Ask about this client' : 'Ask about your portfolio';
      if (tx) tx.textContent = isBroker() ? 'Answers use this client’s contracts, programs and today’s market. Try one:' : 'Answers use your accounts, contracts and today’s market. Try one:';
      var box = empty.querySelector('.ag-chips');
      if (!box) { box = document.createElement('div'); box.className = 'ag-chips'; empty.appendChild(box); }
      box.innerHTML = questions().map(function (q) { return '<button type="button" class="ag-chip">' + esc(q) + '</button>'; }).join('');
    }
  }

  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('.ag-chip'); if (!c) return;
    var ta = document.getElementById('ag-textarea'), send = document.getElementById('ag-send');
    if (!ta || !send) return;
    ta.value = c.textContent; ta.dispatchEvent(new Event('input')); send.click();
  });

  var A = 'var(--lime,#ADD540)';
  var css =
    '#ag-drawer{width:480px;background:linear-gradient(180deg,rgba(var(--acc-rgb,173,213,64),.05),transparent 180px),var(--bg-2,#0A1224);border-left:1px solid rgba(var(--acc-rgb,173,213,64),.18);box-shadow:-24px 0 60px -10px rgba(0,0,0,.6)}' +
    '#ag-drawer::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,' + A + ',var(--gold,' + A + '));opacity:.9}' +
    '.ag-hd-sub{font-family:Inter,system-ui,sans-serif!important;letter-spacing:.12em}' +
    '.ag-ctx{background:rgba(var(--acc-rgb,173,213,64),.06)!important}' +
    '#ag-live{display:flex;align-items:center;gap:9px;padding:9px 22px;border-bottom:1px solid rgba(255,255,255,.06);background:linear-gradient(90deg,rgba(var(--acc-rgb,173,213,64),.10),rgba(var(--acc-rgb,173,213,64),0) 70%);font:500 11.5px Inter,system-ui,sans-serif;color:var(--txt-2,#9AA9C0);flex-shrink:0;white-space:nowrap;overflow:hidden}' +
    '#ag-live b{color:var(--txt,#E8EEF5);font-weight:600;overflow:hidden;text-overflow:ellipsis}' +
    '.ag-live-dot{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399;flex-shrink:0;animation:ag-live 2.4s ease-in-out infinite}' +
    '.ag-live-k{text-transform:uppercase;letter-spacing:.12em;font-size:9.5px;font-weight:700;color:#34d399}' +
    '.ag-live-n{color:var(--txt-3,#5A6A85)}' +
    '.ag-live-a{margin-left:auto;font-size:10px;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:999px;border:1px solid rgba(var(--acc-rgb,173,213,64),.35);color:' + A + '}' +
    '@keyframes ag-live{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.ag-empty{justify-content:flex-start!important;padding-top:28px!important}' +
    '.ag-empty-mark{opacity:.5!important;width:40px!important;height:40px!important;filter:drop-shadow(0 0 10px rgba(var(--acc-rgb,173,213,64),.45))}' +
    '.ag-empty-hed{font-size:17px!important;color:var(--txt,#E8EEF5)!important;letter-spacing:-.01em}' +
    '.ag-empty-txt{max-width:340px!important;font-size:13px!important;color:var(--txt-2,#9AA9C0)!important}' +
    '.ag-chips{display:flex;flex-direction:column;gap:8px;width:100%;margin-top:6px}' +
    '.ag-chip{text-align:left;font:500 13px/1.4 Inter,system-ui,sans-serif;color:var(--txt,#E8EEF5);background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);border-left:2px solid ' + A + ';border-radius:12px 12px 12px 4px;padding:11px 14px;cursor:pointer;transition:background .18s,border-color .18s,transform .14s}' +
    '.ag-chip:hover{background:rgba(var(--acc-rgb,173,213,64),.08);border-color:rgba(var(--acc-rgb,173,213,64),.35);transform:translateX(2px)}' +
    '.ag-who{font-family:Inter,system-ui,sans-serif!important;letter-spacing:.08em;font-size:10.5px!important}' +
    '.ag-msg.user .ag-text{background:rgba(var(--acc-rgb,173,213,64),.09);border:1px solid rgba(var(--acc-rgb,173,213,64),.2);border-radius:14px 14px 4px 14px;padding:9px 13px;display:inline-block}' +
    '.ag-msg.ai .ag-text{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07);border-radius:4px 14px 14px 14px;padding:12px 15px;box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 10px 24px -14px rgba(0,0,0,.7)}' +
    '.ag-text{font-family:Inter,system-ui,sans-serif;font-size:13.5px}' +
    '.ag-text strong,.ag-text b{color:#fff;font-weight:650}' +
    '.ag-text p:first-child strong:first-child{color:#fff}' +
    '.ag-text ul{list-style:none;margin:8px 0!important;padding:0!important}' +
    '.ag-text li{position:relative;padding-left:16px;margin-bottom:7px!important}' +
    '.ag-text li::before{content:"";position:absolute;left:2px;top:.62em;width:6px;height:6px;border-radius:2px;background:' + A + ';opacity:.85}' +
    '.ag-fig{color:' + A + ';font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.ag-streaming .ag-text::after{content:"";display:inline-block;width:7px;height:14px;margin-left:2px;vertical-align:-2px;background:' + A + ';animation:ag-caret 1s steps(2) infinite}' +
    '@keyframes ag-caret{50%{opacity:0}}' +
    '.ag-stamp{margin-top:7px;font:500 10.5px Inter,system-ui,sans-serif;color:var(--txt-3,#5A6A85);display:flex;align-items:center;gap:6px}' +
    '.ag-stamp-bolt{width:6px;height:6px;border-radius:50%;background:' + A + ';box-shadow:0 0 6px ' + A + '}' +
    '.ag-input-wrap{border-radius:14px!important}' +
    '.ag-input-wrap textarea{font-family:Inter,system-ui,sans-serif!important}' +
    '.ag-disclaimer{font-family:Inter,system-ui,sans-serif!important}' +
    '@media (max-width:600px){#ag-drawer{width:100vw}}';

  function sprite() {
    if (document.getElementById('gd-mark')) return;
    var R = [[6,6,1],[21,6,.88],[36,6,.68],[51,6,.42],[6,21,.88],[21,21,.7],[36,21,.5],[51,21,.26],[6,36,.68],[21,36,.5],[36,36,.3],[51,36,.12],[6,51,.42],[21,51,.26],[36,51,.12],[51,51,.04]];
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    svg.innerHTML = '<symbol id="gd-mark" viewBox="0 0 64 64">' + R.map(function (r) { return '<rect x="' + r[0] + '" y="' + r[1] + '" width="11" height="11" rx="2" style="fill:var(--lime,#ADD540)" opacity="' + Math.max(r[2], .12) + '"/>'; }).join('') + '</symbol>';
    document.body.insertBefore(svg, document.body.firstChild);
  }
  function mount() {
    sprite();
    if (!document.getElementById('b153-ag')) { var st = document.createElement('style'); st.id = 'b153-ag'; st.setAttribute('data-no-brand-swap', ''); st.textContent = css; document.head.appendChild(st); }
    var pill = document.getElementById('ag-pill'); if (pill) pill.addEventListener('click', function () { setTimeout(paint, 0); try { if (window.BeaconAskContext) window.BeaconAskContext(); } catch (e) {} });
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
