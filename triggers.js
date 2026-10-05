/* ============================================================================
 * triggers.js — Triggers: "Next 120 days" (bundle 122)
 * ----------------------------------------------------------------------------
 * One per-client list of TIMED sales events, painted on the Intelligence tab
 * under "Theme · Triggers". Three sources, nothing invented:
 *
 *   1. CONTRACT EXPIRATIONS  accounts.expiration / exp, 0–120 days out.
 *      For meters in choice states the row also says what the meter rolls
 *      onto if nothing is signed: the utility's price to compare (same
 *      matching as ptc.js) vs the contracted rate, × annual usage.
 *   2. DEFAULT-RATE MOVES    the monthly price_to_compare catalog, including
 *      superseded periods, for the classes this client's meters match:
 *        announced  a new period starting within 120 days (old → new)
 *        changed    the period in effect started in the last 45 days and an
 *                   earlier period is on file (old → new)
 *        reset      a FIXED period ends within 120 days and the next price
 *                   is not published yet
 *   3. BPS DEADLINES          bps_jurisdictions.js, only jurisdictions where
 *      this client has buildings in scope (computeBpsExposure). Dates come
 *      from the catalogue's own fields: the annual filing date in
 *      `deadline`, `nextDeadline`, and a full date in `currentPhaseLabel`.
 *      Text with no date ("Annual") produces no event.
 *
 * Broker-only: hidden in "View as: Client" and the customer deep link, the
 * same rule ptc.js uses. Read-only; writes nothing. Email alerts come later.
 *
 *   window.BeaconTriggers.render()            paint the tiles for the active client
 *   window.BeaconTriggers.build(accts, opts)  -> Promise<{events, stats}>
 * ========================================================================== */
(function () {
  'use strict';

  var WINDOW_DAYS = 120;     // look-ahead
  var RECENT_DAYS = 45;      // "just changed" look-back for default rates
  var MIN_MOVE_PCT = 0.5;    // ignore rounding-size moves
  var DAY = 86400000;
  var MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

  function P() { return window.BeaconPTC || null; }
  function sb() { return window._beaconSb || window.sb || null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n) { var a = Math.abs(Math.round(n)); return '$' + a.toLocaleString(); }
  function signedMoney(n) { return (n >= 0 ? '+' : '−') + money(n); }

  // ── dates (local midnight; ISO strings are read as local dates, not UTC) ──
  function today(opts) {
    var d = opts && opts.asOf ? parseDate(opts.asOf) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function parseDate(raw) {
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / DAY); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function fmtDate(d, t0) {
    if (!d) return '';
    var s = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return (!t0 || d.getFullYear() !== t0.getFullYear()) ? s + ', ' + d.getFullYear() : s;
  }
  function iso(d) {
    return d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : '';
  }

  // ── client view (broker-only rule shared with ptc.js) ───────────────────
  function clientView() {
    var p = P();
    if (p && p._clientView) return p._clientView();
    try { return new URLSearchParams(location.search).get('view') === 'client'; } catch (e) { return false; }
  }
  function activeAccounts() {
    var cid = window._beaconClientId || new URLSearchParams(location.search).get('clientId') || '';
    try { return { cid: cid, accts: (window.beaconGetAccounts ? window.beaconGetAccounts(cid) : []) || [] }; }
    catch (e) { return { cid: cid, accts: [] }; }
  }
  function locKey(a) {
    return [a.address, a.city, a.state].map(function (s) { return String(s || '').toLowerCase().trim(); }).join('|');
  }
  function locLink(a) {
    try { var id = (typeof window._locId === 'function') ? window._locId(a) : null; return id ? String(id) : null; } catch (e) { return null; }
  }
  function where(a) { return (a.address || 'Unnamed location') + (a.city ? ', ' + a.city : '') + (a.state ? ' ' + a.state : ''); }
  function usageOf(a) { return Number(a.usage != null ? a.usage : a.annualUsage) || 0; }
  function spendOf(a) {
    try {
      if (typeof window.computeContractCalendar === 'function') {
        var c = window.computeContractCalendar([Object.assign({}, a, { expiration: '2099-01-01' })]);
        var it = c.beyond[0] || c.withinYear[0] || c.soon[0] || c.critical[0];
        if (it) return it.annualSpend || 0;
      }
    } catch (e) {}
    return 0;
  }

  // ── catalog history: every period for a state, superseded included ─────
  var HIST = {};
  function loadHistory(st) {
    st = String(st || '').toUpperCase();
    if (HIST[st]) return HIST[st];
    var c = sb(), p = P();
    if (!c || !p) return Promise.resolve([]);
    HIST[st] = c.from('price_to_compare').select(p.COLS).eq('state', st)
      .then(function (r) {
        if (r.error) { console.warn('[triggers] history read failed', st, r.error.message); delete HIST[st]; return []; }
        return r.data || [];
      }, function (e) { console.warn('[triggers] history read threw', e); delete HIST[st]; return []; });
    return HIST[st];
  }
  // Monthly last-resort rows carry the month in the class name ("GST/LPT
  // Last Resort Service (December on-peak)"); strip it so consecutive months
  // pair up as one class.
  function classKey(name) {
    return String(name || '').toLowerCase()
      .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b\s*/g, '')
      .replace(/\(\s*/g, '(').replace(/\s+/g, ' ').trim();
  }
  function rowVal(r) { var v = P()._ptcValue(r); return v && v.kind !== 'none' && isFinite(v.v) ? v : null; }

  // Class names drift between periods in the catalog ("Low Load Factor group
  // (Small C&I…)" becomes "Low Load Factor group: Small C&I… (and Residential
  // Heating)"; Peoples Gas' September "Gas Supply Charge" becomes October's
  // "Rate 2 General Service"). Periods pair by name similarity (≥ 0.6 on
  // words, months ignored), or when a row is the utility's ONLY priced row
  // for its period (a utility-wide figure). Per period, the closest name wins
  // so on-peak never pairs with off-peak.
  var STOP = { and: 1, the: 1, of: 1, for: 1 };
  function words(name) {
    var w = {};
    classKey(name).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).forEach(function (t) { if (t && !STOP[t]) w[t] = 1; });
    return w;
  }
  function sim(a, b) {
    var A = words(a), B = words(b), inter = 0, uni = 0, k;
    for (k in A) { uni++; if (B[k]) inter++; }
    for (k in B) if (!A[k]) uni++;
    return uni ? inter / uni : 0;
  }
  function periods(hist, anchor, t0, end) {
    var av = rowVal(anchor);
    var same = hist.filter(function (r) {
      var v = r.utility_name === anchor.utility_name && r.fuel === anchor.fuel && rowVal(r);
      return v && (!av || v.unit === av.unit);
    });
    var perStart = {};
    same.forEach(function (r) { var k = String(r.effective_start || ''); perStart[k] = (perStart[k] || 0) + 1; });
    var cands = same.map(function (r) {
      var s = r === anchor ? 1.01 : sim(anchor.service_class, r.service_class);
      if (s < 0.6) s = (r.effective_start && perStart[String(r.effective_start)] === 1) ? 0.5 : 0;
      return { r: r, s: s };
    }).filter(function (c) { return c.s > 0; });
    function st(r) { return parseDate(r.effective_start); }
    function en(r) { return parseDate(r.effective_end); }
    function pick(list, order) {
      return list.sort(function (a, b) { return order(a.r, b.r) || (b.s - a.s) || ((a.r.status === 'superseded') - (b.r.status === 'superseded')); })[0];
    }
    var live = cands.filter(function (c) { return c.r.status !== 'superseded'; });
    var cur = pick(live.filter(function (c) { var s = st(c.r), e = en(c.r); return (!s || s <= t0) && (!e || e >= t0); }),
      function (a, b) { return 0; });
    // among in-effect rows the closest name wins; a tie goes to the latest start
    if (cur) {
      var ties = live.filter(function (c) { var s = st(c.r), e = en(c.r); return c.s === cur.s && (!s || s <= t0) && (!e || e >= t0); });
      cur = pick(ties, function (a, b) { return (st(b) || 0) - (st(a) || 0); });
    }
    var inEffect = cur ? cur.r : null;
    var nx = pick(live.filter(function (c) { var s = st(c.r); return s && s > t0 && s <= end; }),
      function (a, b) { return st(a) - st(b); });
    var next = nx ? nx.r : null;
    var prev = null;
    if (inEffect && st(inEffect)) {
      var s0 = st(inEffect);
      var pv = pick(cands.filter(function (c) {
        var s = st(c.r), e = en(c.r);
        return c.r !== inEffect && s && s < s0 && (!e || e <= s0);
      }), function (a, b) { return st(b) - st(a); });
      prev = pv ? pv.r : null;
    }
    return { inEffect: inEffect, next: next, prev: prev };
  }

  // ── build ────────────────────────────────────────────────────────────────
  function build(accts, opts) {
    opts = opts || {};
    var t0 = today(opts), end = addDays(t0, WINDOW_DAYS), recent = addDays(t0, -RECENT_DAYS);
    var p = P();
    var events = [];
    var stats = { meters: 0, withExp: 0, expired: 0, expiredSpend: 0, choiceMeters: 0, bpsSites: 0,
                  contract: 0, contractSpend: 0, rate: 0, rateUp: 0, rateDown: 0, rateReset: 0, bps: 0, compound: 0 };
    var meters = (accts || []).filter(function (a) { return a && (p ? p._fuelOf(a) : a.type); });
    stats.meters = meters.length;

    // PTC match per meter (choice states only), then history per state.
    var choice = p ? meters.filter(function (a) { return p.DEREG.indexOf(String(a.state || '').toUpperCase()) !== -1; }) : [];
    stats.choiceMeters = choice.length;
    var matchP = Promise.all(choice.map(function (a) {
      return p.match(a).then(function (m) { return { a: a, m: m }; }, function () { return { a: a, m: null }; });
    }));
    return matchP.then(function (ms) {
      var states = {};
      ms.forEach(function (x) { if (x.m && !x.m.unmatched && x.m.row) states[x.m.state] = 1; });
      return Promise.all(Object.keys(states).map(function (s) { return loadHistory(s).then(function (h) { return [s, h]; }); }))
        .then(function (pairs) { var H = {}; pairs.forEach(function (q) { H[q[0]] = q[1]; }); return { ms: ms, H: H }; });
    }).then(function (ctx) {
      var byAcct = new Map();
      ctx.ms.forEach(function (x) { byAcct.set(x.a, x); });

      // ── 2. default-rate moves, one event per utility+class ──
      var groups = {};
      ctx.ms.forEach(function (x) {
        if (!x.m || x.m.unmatched || !x.m.row) return;
        var r = x.m.row, k = x.m.state + '|' + r.utility_name + '|' + r.fuel + '|' + classKey(r.service_class);
        (groups[k] = groups[k] || { state: x.m.state, row: r, list: [] }).list.push(x);
      });
      var rateLocs = {};   // locKey -> [event] (for compound flags)
      Object.keys(groups).forEach(function (k) {
        var g = groups[k], per = periods(ctx.H[g.state] || [], g.row, t0, end);
        var cur = per.inEffect;
        if (!cur) return;
        var cv = rowVal(cur);
        function impact(newV) {
          var yr = 0, n = 0, above = 0;
          g.list.forEach(function (x) {
            var u = usageOf(x.a);
            if (u) { yr += (cv.unit === 'cents_per_kwh' ? (newV - cv.v) / 100 : (newV - cv.v)) * u; n++; }
            var c = p._contracted(x.a);
            if (c && c.unit === cv.unit && isFinite(c.v) && c.v > newV) above++;
          });
          return { yr: n ? yr : null, above: above };
        }
        function push(sub, date, fromRow, toRow) {
          var from = fromRow ? rowVal(fromRow) : null, to = toRow ? rowVal(toRow) : null;
          var pct = (from && to && from.v) ? (to.v - from.v) / from.v * 100 : null;
          if (pct != null && Math.abs(pct) < MIN_MOVE_PCT) return;
          var imp = to ? impact(to.v) : { yr: null, above: 0 };
          if (sub === 'changed' && from) {   // impact of the move itself, from the old price
            var yr = 0, n = 0;
            g.list.forEach(function (x) { var u = usageOf(x.a); if (u) { yr += (cv.unit === 'cents_per_kwh' ? (to.v - from.v) / 100 : (to.v - from.v)) * u; n++; } });
            imp.yr = n ? yr : null;
          }
          var est = (from && from.kind === 'estimate') || (to && to.kind === 'estimate');
          var ev = {
            kind: 'rate', sub: sub, date: date, days: daysBetween(t0, date),
            title: g.row.utility_name.replace(/\s*\(.*?\)\s*/g, ' ').trim() + ' · ' + (g.row.fuel === 'gas' ? 'gas ' : '') + 'default service',
            klass: String(toRow ? toRow.service_class : fromRow.service_class),
            from: from, to: to, pct: pct, yr: imp.yr, aboveAfter: imp.above, estimate: est,
            meters: g.list.length, accts: g.list.map(function (x) { return x.a; }),
            src: (toRow && (toRow.source_url || toRow.proxy_source_url)) || (fromRow && (fromRow.source_url || fromRow.proxy_source_url)) || '',
            unconfirmed: (toRow && toRow.status === 'needs_review') || (fromRow && fromRow.status === 'needs_review')
          };
          events.push(ev);
          g.list.forEach(function (x) { var lk = locKey(x.a); (rateLocs[lk] = rateLocs[lk] || []).push(ev); });
        }
        if (per.next) push('announced', parseDate(per.next.effective_start), cur, per.next);
        else {
          var s = parseDate(cur.effective_start);
          if (s && s >= recent && s <= t0 && per.prev) push('changed', s, per.prev, cur);
          var e = parseDate(cur.effective_end);
          if (cur.price_type === 'fixed' && e && e >= t0 && e < end) push('reset', addDays(e, 1), cur, null);
        }
      });

      // ── 1. contract expirations, grouped by location + date ──
      var cgroups = {};
      meters.forEach(function (a) {
        var raw = (a.expiration != null && a.expiration !== '') ? a.expiration : a.exp;
        if (raw == null || raw === '' || String(raw).toLowerCase() === 'nan') return;
        stats.withExp++;
        var d = parseDate(raw);
        if (!d) return;
        var days = daysBetween(t0, d);
        if (days < 0) { stats.expired++; stats.expiredSpend += spendOf(a); return; }
        if (days > WINDOW_DAYS) return;
        var k = locKey(a) + '|' + iso(d);
        (cgroups[k] = cgroups[k] || { date: d, days: days, list: [] }).list.push(a);
      });
      Object.keys(cgroups).forEach(function (k) {
        var g = cgroups[k], a0 = g.list[0];
        var spend = 0, roll = 0, rollN = 0, rollEst = false, rollParts = [];
        g.list.forEach(function (a) {
          spend += spendOf(a);
          var x = byAcct.get(a);
          if (!x || !x.m || x.m.unmatched || !x.m.row) return;
          var pv = p._ptcValue(x.m.row), c = p._contracted(a), u = usageOf(a);
          if (!pv || pv.kind === 'none') { rollParts.push({ a: a, hourly: x.m.row.price_type === 'hourly_index', util: x.m.utility }); return; }
          var part = { a: a, p: pv, c: c, util: x.m.utility };
          if (c && c.unit === pv.unit && isFinite(c.v) && u) {
            var d = pv.v - c.v;
            part.yr = (pv.unit === 'cents_per_kwh' ? d / 100 : d) * u; roll += part.yr; rollN++;
            if (pv.kind === 'estimate') rollEst = true;
          }
          rollParts.push(part);
        });
        var compound = (rateLocs[locKey(a0)] || []).filter(function (ev) { return ev.date <= addDays(g.date, 31); });
        var ev = {
          kind: 'contract', date: g.date, days: g.days, title: 'Contract expires', a: a0, accts: g.list,
          meters: g.list.length, spend: spend, roll: rollN ? roll : null, rollEst: rollEst, rollParts: rollParts,
          compound: compound
        };
        if (compound.length) stats.compound++;
        events.push(ev);
        stats.contract++; stats.contractSpend += spend;
      });

      // ── 3. BPS deadlines ──
      if (typeof window.computeBpsExposure === 'function') {
        var ex = null;
        try { ex = window.computeBpsExposure(meters, window._currentBtype || 'office'); } catch (e) { console.warn('[triggers] bps', e); }
        stats.bpsSites = ex ? ex.totalSitesInScope : 0;
        ((ex && ex.byJurisdiction) || []).forEach(function (bj) {
          var j = bj.jurisdiction;
          bpsDates(j, t0).forEach(function (dd) {
            if (dd.date < t0 || dd.date > end) return;
            var amt = bj.dueNow ? bj.currentExposure : bj.futureExposure;
            events.push({
              kind: 'bps', sub: dd.sub, date: dd.date, days: daysBetween(t0, dd.date),
              title: (j.city && j.city.charAt(0) !== '_' ? j.city + ' ' : (j.state + ' ')) + j.ordinance,
              what: dd.label, sites: bj.sites, sqft: bj.sqft, locations: bj.locations || [],
              amount: amt || 0, amountKind: bj.amountKind, severity: j.severity, url: j.url
            });
          });
        });
      }

      events.forEach(function (ev) {
        if (ev.kind === 'rate') {
          stats.rate++;
          if (ev.sub === 'reset') stats.rateReset++;
          else if (ev.pct > 0) stats.rateUp++; else if (ev.pct < 0) stats.rateDown++;
        } else if (ev.kind === 'bps') stats.bps++;
      });
      events.sort(function (x, y) { return x.date - y.date || (y.kind === 'contract') - (x.kind === 'contract'); });
      return { events: events, stats: stats, asOf: t0, end: end };
    });
  }

  // Dated BPS milestones from the catalogue's own fields.
  function bpsDates(j, t0) {
    var out = [];
    var m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(String(j.deadline || ''));
    if (m) {
      var mo = MONTHS.indexOf(m[1].toLowerCase()), dy = +m[2];
      var d = new Date(t0.getFullYear(), mo, dy);
      if (d < t0) d = new Date(t0.getFullYear() + 1, mo, dy);
      out.push({ sub: 'filing', date: d, label: 'Annual filing due (' + j.deadline + ')' });
    }
    var nd = parseDate(j.nextDeadline);
    if (nd) out.push({ sub: 'phase', date: nd, label: 'Next phase begins: ' + (j.nextPhaseLabel || '') });
    var c = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})\b/i.exec(String(j.currentPhaseLabel || ''));
    if (c) out.push({ sub: 'phase-end', date: new Date(+c[3], MONTHS.indexOf(c[1].toLowerCase()), +c[2]), label: j.currentPhaseLabel });
    return out;
  }

  // ── paint ────────────────────────────────────────────────────────────────
  var _seq = 0, _last = null, _filter = 'all';
  function row(lbl, val, color) {
    return '<div class="bm-row"><span class="bm-row-lbl">' + lbl + '</span><span class="bm-row-val"' + (color ? ' style="color:' + color + '"' : '') + '>' + val + '</span></div>';
  }
  function fmtV(v) { return v ? P()._fmt(v.v, v.unit) : '—'; }
  function pill(ev) {
    if (ev.kind === 'contract') return ev.days <= 30 ? '<span class="loc-pill red">Contract</span>' : '<span class="loc-pill amber">Contract</span>';
    if (ev.kind === 'bps') return '<span class="loc-pill ' + (ev.severity === 'high' ? 'red' : 'blue') + '">BPS</span>';
    if (ev.sub === 'reset') return '<span class="loc-pill gray">Default resets</span>';
    return ev.pct > 0 ? '<span class="loc-pill amber">Default ↑</span>' : '<span class="loc-pill green">Default ↓</span>';
  }
  function whenTxt(ev, t0) {
    if (ev.days === 0) return 'today';
    if (ev.days < 0) return Math.abs(ev.days) + 'd ago';
    return 'in ' + ev.days + 'd';
  }
  function detail(ev, t0) {
    if (ev.kind === 'contract') {
      var s = ev.meters + ' meter' + (ev.meters > 1 ? 's' : '') + (ev.spend ? ' · ~' + money(ev.spend) + '/yr spend (est.)' : '');
      var parts = ev.rollParts.filter(function (x) { return x.p; });
      if (parts.length) {
        var x = parts[0];
        s += ' · if not renewed, rolls to ' + esc(shortUtil(x.util)) + ' default ' + fmtV(x.p) + (x.p.kind === 'estimate' ? ' (estimate)' : '') +
          (x.c ? ' vs contract ' + P()._fmt(x.c.v, x.c.unit) : ' · no contracted rate on file');
        if (parts.length > 1) s += ' (+' + (parts.length - 1) + ' more meter' + (parts.length > 2 ? 's' : '') + ')';
        if (ev.roll != null) s += ' · <strong style="color:' + (ev.roll > 0 ? '#f59e0b' : '#22c55e') + '">' + signedMoney(ev.roll) + '/yr on default</strong>';
      } else if (ev.rollParts.some(function (x) { return x.hourly; })) {
        s += ' · rolls to hourly-priced default service';
      }
      if (ev.compound.length) {
        var c = ev.compound[0];
        s += '<div class="loc-card-srcline" style="color:#f59e0b">Same location: ' + esc(shortUtil(c.title)) + ' ' +
          (c.sub === 'reset' ? 'resets ' + fmtDate(c.date, t0) : (c.pct > 0 ? 'up ' : 'down ') + Math.abs(c.pct).toFixed(1) + '% ' + (c.sub === 'announced' ? 'from ' : 'since ') + fmtDate(c.date, t0)) + '</div>';
      }
      return s;
    }
    if (ev.kind === 'rate') {
      var t = esc(trim(ev.klass, 60)) + ' · ';
      if (ev.sub === 'reset') t += 'current price ' + fmtV(ev.from) + ' ends ' + fmtDate(addDays(ev.date, -1), t0) + '; the next price is not published yet';
      else t += fmtV(ev.from) + ' → <strong style="color:#fff">' + fmtV(ev.to) + '</strong> (' + (ev.pct > 0 ? '+' : '') + ev.pct.toFixed(1) + '%)' +
        (ev.sub === 'announced' ? ' from ' + fmtDate(ev.date, t0) : ' since ' + fmtDate(ev.date, t0));
      t += ' · ' + ev.meters + ' meter' + (ev.meters > 1 ? 's' : '');
      if (ev.yr != null && ev.sub !== 'reset') t += ' · ' + signedMoney(ev.yr) + '/yr on default';
      if (ev.sub !== 'reset' && ev.aboveAfter) t += ' · contract above new default on ' + ev.aboveAfter;
      if (ev.estimate) t += ' · estimate';
      if (ev.unconfirmed) t += ' · unconfirmed';
      if (ev.src) t += ' · <a class="lk" href="' + esc(ev.src) + '" target="_blank" rel="noopener">source</a>';
      return t;
    }
    var b = esc(ev.what) + ' · ' + ev.sites + ' building' + (ev.sites > 1 ? 's' : '') + (ev.sqft ? ' · ' + Math.round(ev.sqft).toLocaleString() + ' sq ft' : '');
    if (ev.amount) b += ' · ' + money(ev.amount) + (ev.amountKind === 'max-fine' ? ' max fine' : '/yr est. penalty');
    if (ev.url) b += ' · <a class="lk" href="' + esc(ev.url) + '" target="_blank" rel="noopener">ordinance</a>';
    return b;
  }
  function shortUtil(n) { return String(n || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*·.*$/, '').trim(); }
  function trim(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function evWhere(ev) {
    if (ev.kind === 'contract') return where(ev.a);
    if (ev.kind === 'bps') {
      var l = ev.locations || [];
      return l.length ? where(l[0]) + (l.length > 1 ? ' +' + (l.length - 1) + ' more' : '') : '';
    }
    return ev.title;
  }
  function evLink(ev) {
    if (ev.kind === 'contract') return locLink(ev.a);
    if (ev.kind === 'bps' && ev.locations && ev.locations.length === 1) return locLink(ev.locations[0]);
    if (ev.kind === 'rate' && ev.accts && ev.accts.length) {
      var ids = ev.accts.map(locLink).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
      return ids.length === 1 ? ids[0] : null;
    }
    return null;
  }
  function listRow(ev, t0) {
    var id = evLink(ev);
    var head = ev.kind === 'contract' ? esc(where(ev.a)) : ev.kind === 'bps' ? esc(ev.title) + ' · ' + esc(evWhere(ev)) : esc(ev.title);
    return '<div class="trg-row" data-kind="' + ev.kind + '"' + (id ? ' data-loc="' + esc(id) + '" title="Open location"' : '') +
      ' style="display:flex;flex-wrap:wrap;gap:4px 12px;align-items:flex-start;padding:8px 0;border-top:1px solid rgba(255,255,255,0.05)' + (id ? ';cursor:pointer' : '') + '">' +
      '<div style="flex:0 0 74px"><div class="bm-row-val" style="font-size:14px">' + fmtDate(ev.date, t0) + '</div>' +
        '<div class="bm-row-lbl" style="font-size:10px">' + whenTxt(ev, t0) + '</div></div>' +
      '<div style="flex:0 0 112px;padding-top:1px">' + pill(ev) + (ev.kind === 'contract' && ev.compound.length ? '<div style="margin-top:4px"><span class="loc-pill amber">+ Rate move</span></div>' : '') + '</div>' +
      '<div style="flex:1 1 240px;min-width:0"><div style="font-size:12px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + head + '</div>' +
        '<div class="loc-card-sub" style="font-size:11px;overflow-wrap:anywhere">' + detail(ev, t0) + '</div></div></div>';
  }

  function tileA(res) {
    var s = res.stats, ev = res.events, t0 = res.asOf;
    var head = '<div class="ic-lbl">⏱ Next 120 days</div>';
    var next = ev.filter(function (e) { return e.days >= 0; })[0];
    var verdict = next ? 'Next: ' + fmtDate(next.date, t0) + ' · ' + (next.kind === 'contract' ? 'contract' : next.kind === 'bps' ? 'BPS' : 'default rate') : 'Nothing timed in the window';
    var vColor = ev.length ? 'var(--amber)' : 'var(--mu)', vBg = ev.length ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)';
    var rateTxt = s.rate ? s.rate + (s.rateUp || s.rateDown ? ' · ' + s.rateUp + '↑ ' + s.rateDown + '↓' : '') + (s.rateReset ? ' · ' + s.rateReset + ' reset' : '') : '0';
    return head +
      '<div class="ic-cols" style="flex-wrap:wrap;row-gap:10px"><div class="ic-hero" style="flex:1 1 140px">' +
        '<div class="bm-bignum" style="color:' + (ev.length ? 'var(--amber)' : 'var(--lime)') + '">' + ev.length + '</div>' +
        '<div class="ic-unit">timed event' + (ev.length === 1 ? '' : 's') + ' through ' + fmtDate(res.end, t0) + '</div>' +
        '<div class="bm-verdict" style="background:' + vBg + ';color:' + vColor + ';border:1px solid ' + vColor + '">' + esc(verdict) + '</div>' +
      '</div><div class="ic-data" style="flex:1 1 190px"><div class="bm-rows">' +
        row('Contracts expiring', s.contract + (s.contractSpend ? ' · ~' + money(s.contractSpend) : ''), s.contract ? 'var(--amber)' : null) +
        row('Default-rate moves', rateTxt, s.rateUp ? 'var(--amber)' : null) +
        row('BPS deadlines', s.bps, s.bps ? '#3B82F6' : null) +
        row('Expiring + rate move', s.compound, s.compound ? 'var(--amber)' : null) +
        row('Already expired', s.expired + (s.expiredSpend ? ' · ~' + money(s.expiredSpend) : ''), s.expired ? '#ef4444' : null) +
      '</div></div></div>' +
      '<div class="bm-basis">Checked ' + s.withExp + ' contract date' + (s.withExp === 1 ? '' : 's') + ' · ' + s.choiceMeters + ' meter' + (s.choiceMeters === 1 ? '' : 's') +
        ' in choice states against the monthly price-to-compare catalog · ' + s.bpsSites + ' building' + (s.bpsSites === 1 ? '' : 's') + ' in BPS scope. Spend (~$/yr) is estimated at state average rates.</div>';
  }
  function tileB(res) {
    var t0 = res.asOf;
    var head = '<div class="ic-lbl">⚑ Act first</div>';
    // Compound first, then contracts by $ at stake, then everything else by date.
    var pool = res.events.filter(function (e) { return e.days >= 0; });
    function weight(e) {
      if (e.kind === 'contract') return (e.compound.length ? 2e9 : 1e9) + (e.roll != null ? Math.abs(e.roll) : 0) + (e.spend || 0) / 10;
      if (e.kind === 'rate') return (e.yr != null ? Math.abs(e.yr) : 0) + (e.sub === 'reset' ? 0 : 1000);
      return e.amount || 0;
    }
    var top = pool.slice().sort(function (a, b) { return weight(b) - weight(a) || a.date - b.date; }).slice(0, 5);
    if (!top.length) {
      return head + '<div class="loc-card-sub" style="margin-top:6px">No contract expirations, default-rate moves or BPS deadlines fall in the next 120 days for this portfolio. ' +
        'Contracts without an expiration date on file are not counted.</div>';
    }
    var rows = top.map(function (e) {
      var id = evLink(e);
      var val = e.kind === 'contract' ? (e.roll != null ? signedMoney(e.roll) + '/yr' : (e.spend ? '~' + money(e.spend) + '/yr' : e.days + 'd'))
        : e.kind === 'rate' ? (e.sub === 'reset' ? fmtDate(e.date, t0) : (e.pct > 0 ? '+' : '') + e.pct.toFixed(1) + '%')
        : (e.amount ? money(e.amount) + (e.amountKind === 'max-fine' ? ' max' : '/yr') : fmtDate(e.date, t0));
      var lbl = (e.kind === 'contract' ? (e.compound.length ? '⚑ ' : '') + where(e.a) + ' · expires ' + fmtDate(e.date, t0)
        : e.kind === 'rate' ? shortUtil(e.title) + (e.sub === 'reset' ? ' resets' : e.sub === 'announced' ? ' from ' + fmtDate(e.date, t0) : ' since ' + fmtDate(e.date, t0))
        : e.title + ' · ' + fmtDate(e.date, t0));
      var color = e.kind === 'bps' ? '#3B82F6' : (e.kind === 'rate' && e.pct < 0) || (e.kind === 'contract' && e.roll != null && e.roll < 0) ? '#22c55e' : 'var(--amber)';
      return '<div class="bm-row"' + (id ? ' data-loc="' + esc(id) + '" style="cursor:pointer" title="Open location"' : '') + '>' +
        '<span class="bm-row-lbl" style="max-width:66%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(lbl) + '</span>' +
        '<span class="bm-row-val" style="color:' + color + '">' + val + '</span></div>';
    }).join('');
    return head + '<div class="bm-rows" style="margin-top:6px">' + rows + '</div>' +
      '<div class="bm-basis">⚑ = contract expiring where the default rate is also moving. $ on contracts is what the meter pays on default service vs its contract if nothing is signed (estimated spend when no rate is on file).</div>';
  }
  function listCard(res) {
    var t0 = res.asOf, ev = res.events;
    var counts = { all: ev.length, contract: 0, rate: 0, bps: 0 };
    ev.forEach(function (e) { counts[e.kind]++; });
    var tabs = [['all', 'All'], ['contract', 'Contracts'], ['rate', 'Default rates'], ['bps', 'BPS']].map(function (t) {
      var on = _filter === t[0];
      return '<button type="button" data-trg-filter="' + t[0] + '" style="background:' + (on ? 'rgba(173,213,64,0.15)' : 'transparent') + ';color:' + (on ? 'var(--lime)' : 'var(--mu)') +
        ';border:1px solid ' + (on ? 'rgba(173,213,64,0.35)' : 'var(--b1)') + ';border-radius:14px;padding:3px 10px;font-size:10.5px;cursor:pointer">' + t[1] + ' · ' + counts[t[0]] + '</button>';
    }).join('');
    var shown = ev.filter(function (e) { return _filter === 'all' || e.kind === _filter; });
    var body = shown.length ? shown.map(function (e) { return listRow(e, t0); }).join('')
      : '<div class="loc-card-sub" style="padding:10px 0">Nothing in this category in the next 120 days.</div>';
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<div class="ic-lbl" style="margin:0">☰ Timeline · ' + fmtDate(t0, t0) + ' to ' + fmtDate(res.end, t0) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + tabs +
          '<button type="button" data-trg-csv style="background:transparent;color:var(--mu);border:1px solid var(--b1);border-radius:14px;padding:3px 10px;font-size:10.5px;cursor:pointer">CSV ↓</button></div>' +
      '</div><div style="margin-top:6px">' + body + '</div>' +
      '<div class="bm-basis">Default-rate moves cover the classes this client’s meters match, from the monthly price-to-compare refresh; “resets” means a fixed default price ends and the next one isn’t published yet. ' +
        'Contract rows show what each meter rolls onto if nothing is signed. BPS dates come from each ordinance’s published schedule. Brokers only.</div>';
  }

  function csv(res) {
    var t0 = res.asOf;
    var lines = [['Date', 'Days', 'Type', 'Location / utility', 'Detail', '$/yr', 'Basis']];
    res.events.forEach(function (e) {
      var d = String(detail(e, t0)).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      var amt = e.kind === 'contract' ? (e.roll != null ? Math.round(e.roll) : '') : e.kind === 'rate' ? (e.yr != null && e.sub !== 'reset' ? Math.round(e.yr) : '') : (e.amount || '');
      var basis = e.kind === 'contract' ? (e.roll != null ? 'default vs contract' : '') : e.kind === 'rate' ? (e.sub === 'reset' ? '' : 'default move × usage') : (e.amount ? (e.amountKind === 'max-fine' ? 'max fine' : 'est. penalty') : '');
      var type = e.kind === 'contract' ? 'Contract expiration' : e.kind === 'bps' ? 'BPS deadline' : (e.sub === 'reset' ? 'Default rate reset' : 'Default rate move');
      lines.push([iso(e.date), e.days, type, e.kind === 'contract' ? where(e.a) : e.kind === 'bps' ? e.title + ' · ' + evWhere(e) : e.title, d, amt, basis]);
    });
    var text = lines.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = 'beacon_next_120_days_' + (activeAccounts().cid || 'portfolio') + '_' + iso(t0) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function bindLinks(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-loc]'), function (el) {
      el.addEventListener('click', function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest('a')) return;   // source links open normally
        var id = el.getAttribute('data-loc'); if (id && window.showLocationView) window.showLocationView(id);
      });
    });
  }
  function paintList(res) {
    var C = document.getElementById('trg-list');
    if (!C) return;
    C.innerHTML = listCard(res);
    bindLinks(C);
    Array.prototype.forEach.call(C.querySelectorAll('[data-trg-filter]'), function (b) {
      b.addEventListener('click', function () { _filter = b.getAttribute('data-trg-filter'); paintList(res); });
    });
    var x = C.querySelector('[data-trg-csv]');
    if (x) x.addEventListener('click', function () { csv(res); });
  }

  function render() {
    var hd = document.getElementById('trg-hd'), grid = document.getElementById('trg-grid');
    if (!hd || !grid) return;
    if (clientView()) { hd.style.display = 'none'; grid.style.display = 'none'; return; }
    hd.style.display = ''; grid.style.display = '';
    var A = document.getElementById('trg-a'), B = document.getElementById('trg-b'), C = document.getElementById('trg-list');
    var seq = ++_seq, ctx = activeAccounts();
    if (!P()) { A.innerHTML = '<div class="ic-lbl">⏱ Next 120 days</div><div class="loc-card-sub">Price-to-compare module not loaded.</div>'; return; }
    A.innerHTML = '<div class="ic-lbl">⏱ Next 120 days</div><div class="ic-cols"><div class="ic-hero"><div class="bm-bignum" style="color:var(--mu)">…</div><div class="ic-unit">checking ' + ctx.accts.length + ' meters</div></div><div class="ic-data"></div></div>';
    B.innerHTML = '<div class="ic-lbl">⚑ Act first</div>';
    C.innerHTML = '';
    build(ctx.accts).then(function (res) {
      if (seq !== _seq) return;
      _last = res;
      console.log('[triggers] ' + res.events.length + ' events', res.stats);
      A.innerHTML = tileA(res);
      B.innerHTML = tileB(res);
      bindLinks(B);
      paintList(res);
    }, function (e) {
      console.warn('[triggers] build failed', e);
      if (seq === _seq) A.innerHTML = '<div class="ic-lbl">⏱ Next 120 days</div><div class="loc-card-sub">Triggers could not be computed (see console).</div>';
    });
  }

  window.BeaconTriggers = { render: render, build: build, _bpsDates: bpsDates, _classKey: classKey, _periods: periods, _sim: sim, last: function () { return _last; } };
})();
