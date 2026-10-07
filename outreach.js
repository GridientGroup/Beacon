/* ==========================================================================
 * outreach.js — bundle 150: broker-side outreach.
 *
 * In BROKER view, the client-facing action buttons ("Request Audit", "Run an
 * RFP", "Schedule 15-min call", "Upload Bills", "Schedule Discovery Call" …)
 * become outreach to THAT client: each opens a drafted email built from the
 * client's own data — the finding, how many locations qualify, the estimated
 * $/yr (labelled as an estimate), the locations to start with, why it matters
 * and the firm's booking link. The broker edits it, then opens it in their mail
 * app or copies it. Broker-mode wording also speaks about the client
 * ("This client's EUI…") instead of to them ("Your EUI…").
 *
 * CLIENT view is untouched: same buttons, same wording, same actions.
 * UNDO: remove <script src="outreach.js"></script> from index.html.
 * ========================================================================== */
(function () {
  'use strict';

  function isClient() { return document.body.classList.contains('client-view'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function money(n) { n = Number(n) || 0; return n >= 1e6 ? '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : '$' + Math.round(n); }
  function cid() { try { return window._beaconClientId || new URLSearchParams(location.search).get('clientId') || ''; } catch (e) { return ''; } }
  function poss(n) { return /s$/i.test(n) ? n + '\u2019' : n + '\u2019s'; }
  function clientName() { return ((document.getElementById('d-name') || {}).textContent || '').trim() || 'your company'; }
  function firm() { var b = window.BeaconBrand && BeaconBrand.current && BeaconBrand.current(); return (b && (b.full || b.short)) || 'Sustainable Turnkey Solutions'; }
  function cal() { return (window.BeaconBrand && BeaconBrand.calendar && BeaconBrand.calendar()) || 'https://gridientsuite.com/schedule'; }

  // ── broker button labels (one per program) ─────────────────────────────
  var VERB = {
    procurement: 'Email client: RFP pitch', solar: 'Email client: solar offer', recovery: 'Email client: bill-audit info',
    dr: 'Email client: DR offer', rebates: 'Email client: rebate list', recs: 'Email client: REC options',
    bps: 'Email client: BPS briefing', esg: 'Email client: ESG overview', efficiency: 'Email client: audit info'
  };
  var ASK = {
    procurement: 'run a competitive supply RFP across licensed suppliers and compare every offer to what you pay today',
    solar: 'enrol your eligible sites in community solar for a bill credit, with nothing to install',
    recovery: 'run a forensic audit of your utility bills for overcharges and misclassified rates, paid only from what we recover',
    dr: 'enrol your eligible sites in demand response so you are paid for trimming load on a few peak days a year',
    rebates: 'file the utility and federal rebates available for your equipment upgrades',
    recs: 'source renewable energy credits to cover your electricity use for your sustainability reporting',
    bps: 'map your exposure under local building-performance laws and plan the path to compliance before fines apply',
    esg: 'build a carbon roadmap and the reporting your investors and lenders ask for',
    efficiency: 'scope an energy-efficiency audit of your highest-use buildings, with upgrades that can be paid from the savings'
  };

  // ── the data behind a draft ────────────────────────────────────────────
  function facts(pid) {
    var out = { name: pid, why: '', elig: 0, total: 0, val: 0, top: [] };
    try {
      var m = (window.OPP_META || (typeof OPP_META !== 'undefined' ? OPP_META : {}))[pid] || {};
      out.name = m.name || pid; out.why = m.why || '';
      var accts = (window.beaconGetAccounts && beaconGetAccounts(cid())) || [];
      var key = function (a) { return [a.address, a.city, a.state].join('|').toLowerCase(); };
      var all = {}; accts.forEach(function (a) { all[key(a)] = 1; }); out.total = Object.keys(all).length;
      var el = (window._oppEligibleLocations && _oppEligibleLocations(pid, accts)) || [];
      var seen = {}, locs = []; el.forEach(function (a) { var k = key(a); if (!seen[k]) { seen[k] = 1; locs.push(a); } });
      out.elig = locs.length;
      out.val = (typeof _oppEstimatedValue === 'function' ? _oppEstimatedValue(pid, el) : (window._oppEstimatedValue ? _oppEstimatedValue(pid, el) : 0)) || 0;
      var use = function (a) { return Number(a.usage != null ? a.usage : a.annualUsage) || 0; };
      out.top = locs.slice().sort(function (x, y) { return use(y) - use(x); }).slice(0, 3).map(function (a) { return (a.address || 'Location') + (a.city ? ', ' + a.city : '') + (a.state ? ' ' + a.state : ''); });
    } catch (e) {}
    return out;
  }

  function draft(kind, pid, finding) {
    var f = pid ? facts(pid) : null, who = clientName(), b = firm();
    var hi = 'Hi there,\n\n';
    var sign = '\n\nBest regards,\n' + b;
    if (kind === 'bills') {
      return { subject: who + ': 12 months of utility bills', body: hi +
        'To finish reviewing ' + poss(who) + ' energy portfolio we need the last 12 months of utility bills for each account (PDFs or the utility’s usage export both work).\n\n' +
        'With them we can confirm what you are actually paying per meter, flag billing errors, and firm up the savings estimates we have so far.\n\n' +
        'You can reply with the files, or send them over whenever is easiest.' + sign };
    }
    if (kind === 'quote') {
      return { subject: who + ': pricing review', body: hi +
        'We would like to put together a pricing review for ' + poss(who) + ' energy supply: what you pay today, what the market is offering, and the options for your next contract.\n\n' +
        'Could you share your current supplier contracts (or the most recent bill for each account) and any renewal dates you are tracking?' + sign };
    }
    if (kind === 'call' && !pid) {
      return { subject: who + ': a quick review call', body: hi +
        'We have been reviewing ' + poss(who) + ' energy portfolio and have a few findings worth 20 minutes of your time.\n\nYou can pick a time that suits you here: ' + cal() + sign };
    }
    var lines = [];
    if (finding) lines.push(finding + '\n');
    if (f.total) lines.push('• ' + f.elig + ' of your ' + f.total + ' locations qualify');
    if (f.val > 0) lines.push('• Estimated value: about ' + money(f.val) + ' a year (an estimate from your own usage and published rates; we confirm it before anything is signed)');
    if (f.top.length) lines.push('• Where we would start: ' + f.top.join('; '));
    var body = hi +
      'While reviewing ' + poss(who) + ' energy portfolio we found an opportunity in ' + f.name + '.\n\n' +
      (lines.length ? lines.join('\n') + '\n\n' : '') +
      (f.why ? f.why + '\n\n' : '') +
      'We can ' + (ASK[pid] || 'walk you through the details') + '. There is no commitment until you approve it.\n\n' +
      'Would 20 minutes this week work to go through it? You can pick a time here: ' + cal() + sign;
    return { subject: who + ': ' + f.name + ' — what we found', body: body };
  }

  // ── client contact (customers.primary_contact) ─────────────────────────
  var CONTACT = {};
  function contactFor(id) {
    if (CONTACT[id] !== undefined) return Promise.resolve(CONTACT[id]);
    var sb = window._beaconSb;
    if (!sb || !id) return Promise.resolve('');
    return sb.from('customers').select('primary_contact').eq('id', id).maybeSingle().then(function (r) {
      var v = (r && r.data && r.data.primary_contact) || '';
      var m = String(v).match(/[^\s<>,;]+@[^\s<>,;]+\.[a-z]{2,}/i);
      CONTACT[id] = m ? m[0] : ''; return CONTACT[id];
    }, function () { return ''; });
  }

  // ── composer (shares the Beacon pop-up shell) ──────────────────────────
  function compose(kind, pid, finding) {
    var bd = document.getElementById('bm-modal-backdrop'), body = document.getElementById('bm-modal-body');
    if (!bd || !body) return false;
    var d = draft(kind, pid, finding), f = pid ? facts(pid) : null;
    document.getElementById('bm-modal-eye').textContent = 'Client outreach';
    document.getElementById('bm-modal-title').textContent = 'Email ' + clientName() + (f ? ' about ' + f.name : kind === 'bills' ? ' for bills' : kind === 'quote' ? ' about pricing' : '');
    body.innerHTML = '<div class="pm or">' +
      (f ? '<div class="or-facts">' +
        '<div class="pm-chip pm-chip-elig"><i></i><b>' + f.elig + '</b><span>of ' + f.total + ' locations qualify</span></div>' +
        '<div class="pm-chip"><i style="background:rgb(var(--acc2-rgb))"></i><b>' + (f.val > 0 ? money(f.val) : '—') + '</b><span>est. per year</span></div>' +
        '</div>' : '') +
      '<label class="or-f"><span>To</span><input id="or-to" type="email" placeholder="client@company.com"></label>' +
      '<label class="or-f"><span>Subject</span><input id="or-sub" value="' + esc(d.subject) + '"></label>' +
      '<label class="or-f or-f-b"><span>Message</span><textarea id="or-body" rows="14">' + esc(d.body) + '</textarea></label>' +
      '<div class="pm-cta"><button class="pm-btn" id="or-send"><span>Open in email</span><span class="pm-btn-a">→</span></button>' +
      '<button class="or-ghost" id="or-copy">Copy text</button>' +
      (pid && typeof openProgram === 'function' ? '<button class="or-ghost" id="or-prog">Open the program page</button>' : '') +
      '<span class="pm-cta-n" id="or-msg">Edit anything before it goes. Figures are estimates from this client’s accounts.</span></div></div>';
    bd.classList.add('show'); document.body.style.overflow = 'hidden';
    contactFor(cid()).then(function (em) { var t = document.getElementById('or-to'); if (t && em && !t.value) t.value = em; });
    document.getElementById('or-send').onclick = function () {
      var to = document.getElementById('or-to').value.trim(), s = document.getElementById('or-sub').value, b = document.getElementById('or-body').value;
      location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(s) + '&body=' + encodeURIComponent(b);
    };
    document.getElementById('or-copy').onclick = function () {
      var t = 'Subject: ' + document.getElementById('or-sub').value + '\n\n' + document.getElementById('or-body').value, m = document.getElementById('or-msg');
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { m.textContent = 'Copied. Paste it into any email.'; }, function () {
        var ta = document.getElementById('or-body'); ta.select(); try { document.execCommand('copy'); m.textContent = 'Copied the message.'; } catch (e) { m.textContent = 'Select the text and copy it.'; }
      });
    };
    var pg = document.getElementById('or-prog'); if (pg) pg.onclick = function () { if (window.closeBmModal) closeBmModal(); if (window.showView) showView('services'); setTimeout(function () { openProgram(pid); }, 80); };
    return true;
  }
  window.BeaconOutreach = { compose: compose, draft: draft, facts: facts };

  // ── route the client-facing actions in broker view ─────────────────────
  function wrapFn(name, route) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig._b150) return !!(orig && orig._b150);
    var w = function () { if (!isClient()) { var a = arguments; if (route.apply(null, a) !== false) return; } return orig.apply(this, arguments); };
    w._b150 = true; window[name] = w;
    return true;
  }
  function hook() {
    var ok = true;
    ok = wrapFn('_oppRequestCall', function (pid) { return compose('pitch', pid); }) && ok;
    ok = wrapFn('_oppScheduleVideo', function (pid) { return compose('pitch', pid); }) && ok;
    ok = wrapFn('_amContact', function (kind) { return compose(kind === 'bills' ? 'bills' : kind === 'quote' ? 'quote' : 'call'); }) && ok;
    return ok;
  }

  // Recommended-path buttons (Intelligence) and program-page CTAs: capture the click first.
  document.addEventListener('click', function (e) {
    if (isClient() || !e.target || !e.target.closest) return;
    var bl = e.target.closest('.bm-link[data-pid]');
    if (bl && bl.classList.contains('show')) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      var t = bl.querySelector('.bm-link-text'), tn = t && t.firstChild, ct = tn ? (ORIG.get(tn) || tn.nodeValue) : '';
      compose('pitch', bl.getAttribute('data-pid'), (ct || '').trim());
      return;
    }
    var a = e.target.closest('.subpage a[href*="gridientsuite.com/schedule"], .subpage .spx-cta-btn');
    if (a) {
      var sp = a.closest('.subpage'), pid = sp && sp.getAttribute('data-pid');
      if (pid) { e.preventDefault(); e.stopPropagation(); compose('pitch', pid); }
    }
  }, true);

  // ── broker labels + wording ─────────────────────────────────────────────
  // Buttons and texts get data-aud-broker; index.html's audience painter swaps
  // them with the view (client wording is kept in data-aud-client).
  var SKIP = '#trga-root,#brand-root,#team-root,#firms-root,#sec-market,#sec-admin,#ag-drawer,#cdock-mini,.rep-row,#bm-modal-backdrop,script,style,textarea,input';
  var RULES = [
    [/\bAvailable Programs for Your Portfolio\b/g, 'Available Programs for This Client'],
    [/\bYour Portfolio\b/g, 'Client Portfolio'],
    [/\byour portfolio\b/g, 'the client’s portfolio'],
    [/\bYour EUI\b/g, 'This client’s EUI'],
    [/\bYour spend\b/g, 'This client’s spend'],
    [/\bYour ([A-Za-z][A-Za-z-]+) cap:/g, 'Client $1 cap:'],
    [/\byour actual\b/g, 'the client’s actual'],
    [/\bWhere your\b/g, 'Where the client’s'],
    [/\bin your states\b/g, 'in the client’s states'],
    [/^You have$/g, 'Client has'],
    [/\byour accounts\b/g, 'the client’s accounts'],
    [/\byour buildings\b/g, 'the client’s buildings']
  ];
  function relabel(root) {
    // action buttons (re-rendered often, so swap the text node and remember the original)
    document.querySelectorAll('.bm-link[data-pid] .bm-link-prog').forEach(function (p) {
      var pid = p.closest('.bm-link').getAttribute('data-pid'), v = VERB[pid], n = p.firstChild;
      if (!v || !n || n.nodeType !== 3 || n.nodeValue === v + ' →') return;
      ORIG.set(n, n.nodeValue); n.nodeValue = v + ' →';
    });
    document.querySelectorAll('.opp-card').forEach(function (c) {
      var pid = c.getAttribute('data-pid');
      var s = c.querySelector('.opp-cta-solid'); if (s && VERB[pid] && !s.hasAttribute('data-aud-broker')) s.setAttribute('data-aud-broker', VERB[pid] + ' →');
      var t = c.querySelector('.opp-cta-tint'); if (t && !t.hasAttribute('data-aud-broker')) t.setAttribute('data-aud-broker', 'Invite client to a call');
    });
    var AM = { call: 'Invite client to a call', quote: 'Send pricing note', bills: 'Ask client for bills' };
    document.querySelectorAll('#rep-actions .am-btn').forEach(function (b) {
      var k = (b.getAttribute('onclick') || '').match(/_amContact\('(\w+)'\)/); if (k && AM[k[1]] && !b.hasAttribute('data-aud-broker')) b.setAttribute('data-aud-broker', AM[k[1]]);
    });
    document.querySelectorAll('.subpage a[href*="gridientsuite.com/schedule"]').forEach(function (a) {
      if (!a.hasAttribute('data-aud-broker')) a.setAttribute('data-aud-broker', 'Send this program to the client →');
    });
    var lc = document.getElementById('opp-learn-call'); if (lc && !lc.hasAttribute('data-aud-broker')) lc.setAttribute('data-aud-broker', 'Email the client');
    // wording: text nodes in client-content areas
    var scope = document.body;
    var tw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null), n, hits = [];
    while ((n = tw.nextNode())) {
      var v = n.nodeValue; if (!v || !/[Yy]ou/.test(v)) continue;
      var p = n.parentElement; if (!p || p.closest(SKIP) || p.hasAttribute('data-aud-broker')) continue;
      var out = v; RULES.forEach(function (r) { out = out.replace(r[0], r[1]); });
      if (out !== v) hits.push([n, p, v, out]);
    }
    hits.forEach(function (h) { ORIG.set(h[0], h[2]); h[0].nodeValue = h[3]; });
  }
  var ORIG = new Map();
  function restore() { ORIG.forEach(function (v, n) { if (n.nodeValue !== v) n.nodeValue = v; }); ORIG.clear(); }

  var T = null;
  function soon() { if (T) return; T = setTimeout(function () { T = null; if (isClient()) restore(); else relabel(document); }, 120); }
  function boot() {
    var tries = 0; (function go() { if (!hook() && tries++ < 60) setTimeout(go, 250); })();
    soon();
    new MutationObserver(soon).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(soon).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    if (!document.getElementById('or-css')) {
      var st = document.createElement('style'); st.id = 'or-css';
      st.textContent =
        '.or-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}' +
        '.or-f{display:flex;flex-direction:column;gap:6px}.or-f span{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mu);font-weight:700}' +
        '.or-f input,.or-f textarea{width:100%;box-sizing:border-box;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#E8EEF7;font:13.5px/1.55 Inter,system-ui,sans-serif;padding:10px 12px;outline:none;transition:border-color .2s}' +
        '.or-f textarea{resize:vertical;min-height:240px}.or-f input:focus,.or-f textarea:focus{border-color:rgba(var(--acc-rgb),.6)}' +
        '.or-ghost{background:transparent;border:1px solid rgba(255,255,255,.14);color:#E8EEF7;border-radius:10px;padding:11px 16px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer}.or-ghost:hover{border-color:rgba(var(--acc-rgb),.55)}';
      document.head.appendChild(st);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
