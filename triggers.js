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
  // Class codes ("I" vs "II", "on" vs "off", "NEMA" vs "SEMA", "G1" vs "G2")
  // name different classes even when every other word matches: any short or
  // numbered word present in one name and not the other means no pair.
  function codeClash(A, B) {
    var k;
    for (k in A) if (!B[k] && (k.length <= 4 || /\d/.test(k))) return true;
    for (k in B) if (!A[k] && (k.length <= 4 || /\d/.test(k))) return true;
    return false;
  }
  function sim(a, b) {
    var A = words(a), B = words(b), inter = 0, uni = 0, k;
    if (codeClash(A, B)) return 0;
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
      // Utility-wide fallback only for monthly gas supply charges, which are
      // set for all sales classes at once (Peoples Gas). Electric classes are
      // priced separately, so an unrelated class must never pair (bundle 126:
      // Eversource G1 was being paired with G2/G3).
      if (s < 0.6) s = (r.effective_start && perStart[String(r.effective_start)] === 1 && anchor.fuel === 'gas' &&
        r.price_type === 'monthly_variable' && anchor.price_type === 'monthly_variable') ? 0.5 : 0;
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
          // An estimate and a published price are different kinds of number;
          // a "move" between them is not a move (bundle 126: BGE showed +64%).
          if (sub !== 'reset' && from && to && (from.kind === 'estimate' || to.kind === 'estimate')) return;
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
        try { ex = window.computeBpsExposure(meters, opts.btype || window._currentBtype || 'office'); } catch (e) { console.warn('[triggers] bps', e); }
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
  // ── bundle 145: the 120-day view, redesigned ─────────────────────────────
  // A swimlane track (contracts · default rates · BPS) across the window, then
  // the list grouped by month with each item's dollar figure on the right.
  function kindColor(e) {
    if (e.kind === 'contract') return e.days <= 30 ? '#ef4444' : '#F59E0B';
    if (e.kind === 'bps') return '#3B82F6';
    if (e.sub === 'reset') return '#94A3B8';
    return e.pct > 0 ? '#F59E0B' : '#22c55e';
  }
  function evValue(e, t0) {
    if (e.kind === 'contract') {
      if (e.roll != null) return { t: signedMoney(e.roll) + '/yr', n: Math.abs(e.roll), s: 'if it rolls to default' };
      if (e.spend) return { t: '~' + money(e.spend) + '/yr', n: e.spend, s: 'spend up for renewal' };
      return { t: e.days + 'd', n: 0, s: '' };
    }
    if (e.kind === 'rate') {
      if (e.sub === 'reset') return { t: 'Price TBA', n: 0, s: 'next default not published' };
      return { t: (e.yr != null ? signedMoney(e.yr) + '/yr' : (e.pct > 0 ? '+' : '') + e.pct.toFixed(1) + '%'), n: Math.abs(e.yr || 0), s: (e.pct > 0 ? '+' : '') + e.pct.toFixed(1) + '% default' };
    }
    return e.amount ? { t: money(e.amount) + (e.amountKind === 'max-fine' ? ' max' : '/yr'), n: e.amount, s: e.amountKind === 'max-fine' ? 'maximum fine' : 'est. penalty' } : { t: fmtDate(e.date, t0), n: 0, s: '' };
  }
  function css120() {
    if (document.getElementById('trg120-css')) return;
    var st = document.createElement('style'); st.id = 'trg120-css';
    st.textContent =
      '.t120-rbtn{background:linear-gradient(135deg,rgb(var(--acc-rgb,173,213,64)),rgba(var(--acc-rgb,173,213,64),.8));color:#06101F;border:0;border-radius:14px;padding:4px 14px;font-size:11px;font-weight:800;cursor:pointer;box-shadow:0 6px 16px -6px rgba(var(--acc-rgb,173,213,64),.8)}' +
      '.t120-track{position:relative;margin:14px 0 6px;padding:10px 14px 26px;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01));border:1px solid rgba(255,255,255,.06)}' +
      '.t120-lane{display:flex;align-items:center;height:30px}' +
      '.t120-lane+.t120-lane{border-top:1px dashed rgba(255,255,255,.06)}' +
      '.t120-ll{flex:0 0 108px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--mu,#8b98ad)}' +
      '.t120-lt{position:relative;flex:1;height:100%}' +
      '.t120-dot{position:absolute;top:50%;border-radius:50%;transform:translate(-50%,-50%);cursor:pointer;border:2px solid rgba(10,14,26,.9);transition:transform .15s,box-shadow .15s}' +
      '.t120-dot:hover{transform:translate(-50%,-50%) scale(1.35);z-index:3}' +
      '.t120-axis{position:absolute;left:122px;right:14px;bottom:6px;height:16px}' +
      '.t120-tick{position:absolute;bottom:0;font-size:9.5px;letter-spacing:.1em;color:var(--mu,#8b98ad);transform:translateX(-50%);white-space:nowrap}' +
      '.t120-grid{position:absolute;top:10px;bottom:22px;width:1px;background:rgba(255,255,255,.07)}' +
      '.t120-now{position:absolute;top:4px;bottom:20px;width:2px;border-radius:2px;background:var(--lime,#ADD540);box-shadow:0 0 10px var(--lime,#ADD540)}' +
      '.t120-now::after{content:"TODAY";position:absolute;top:-2px;left:6px;font-size:8.5px;letter-spacing:.14em;color:var(--lime,#ADD540)}' +
      '.t120-mo{display:flex;justify-content:space-between;align-items:baseline;margin:16px 0 4px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.08)}' +
      '.t120-mo b{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#fff}' +
      '.t120-mo span{font-size:11px;color:var(--mu,#8b98ad)}' +
      '.t120-row{display:grid;grid-template-columns:70px 118px minmax(0,1fr) auto;gap:4px 14px;align-items:start;margin-top:6px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-left:3px solid var(--k);transition:background .15s,transform .15s}' +
      '.t120-row:hover{background:rgba(255,255,255,.045)}' +
      '.t120-row.flash{box-shadow:0 0 0 1px var(--k),0 0 22px -4px var(--k)}' +
      '.t120-val{text-align:right;white-space:nowrap}.t120-val b{display:block;font-size:14px;color:var(--k)}.t120-val i{font-style:normal;font-size:10px;color:var(--mu,#8b98ad)}' +
      '@media (max-width:760px){.t120-row{grid-template-columns:62px minmax(0,1fr)}.t120-row>:nth-child(2){display:none}.t120-val{grid-column:2;text-align:left}.t120-ll{flex-basis:70px}.t120-axis{left:84px}}';
    document.head.appendChild(st);
  }
  function track(res, shown) {
    var t0 = res.asOf, W = WINDOW_DAYS;
    function pos(d) { return Math.max(0, Math.min(100, d / W * 100)); }
    var lanes = [['contract', 'Contracts'], ['rate', 'Default rates'], ['bps', 'BPS']].filter(function (l) { return shown.some(function (e) { return e.kind === l[0]; }); });
    var maxN = Math.max.apply(null, shown.map(function (e) { return evValue(e, t0).n; }).concat([1]));
    var html = '<div class="t120-track">';
    var ticks = '', grids = '';
    for (var i = 0; i < 6; i++) {
      var m = new Date(t0.getFullYear(), t0.getMonth() + i, 1), dd = daysBetween(t0, m);
      if (dd <= 0 || dd > W) continue;
      ticks += '<span class="t120-tick" style="left:' + pos(dd) + '%">' + m.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() + '</span>';
      grids += '<span class="t120-grid" style="left:calc(122px + (100% - 136px) * ' + (pos(dd) / 100) + ')"></span>';
    }
    html += grids + '<span class="t120-now" style="left:122px"></span>';
    lanes.forEach(function (l) {
      html += '<div class="t120-lane"><span class="t120-ll">' + l[1] + '</span><div class="t120-lt">';
      shown.forEach(function (e, idx) {
        if (e.kind !== l[0]) return;
        var v = evValue(e, t0), sz = 10 + Math.round(Math.sqrt(v.n / maxN) * 12), c = kindColor(e);
        var tip = fmtDate(e.date, t0) + ' · ' + (e.kind === 'contract' ? where(e.a) : e.title) + (v.n ? ' · ' + v.t : '');
        html += '<span class="t120-dot" data-t120="' + idx + '" title="' + esc(tip) + '" style="left:' + pos(Math.max(0, e.days)) + '%;width:' + sz + 'px;height:' + sz + 'px;background:' + c + ';box-shadow:0 0 12px -2px ' + c + '"></span>';
      });
      html += '</div></div>';
    });
    return html + '<div class="t120-axis">' + ticks + '</div></div>';
  }
  function listRow(ev, t0, idx) {
    var id = evLink(ev), c = kindColor(ev), v = evValue(ev, t0);
    var head = ev.kind === 'contract' ? esc(where(ev.a)) : ev.kind === 'bps' ? esc(ev.title) + ' · ' + esc(evWhere(ev)) : esc(ev.title);
    return '<div class="trg-row t120-row" data-kind="' + ev.kind + '" data-t120-row="' + idx + '"' + (id ? ' data-loc="' + esc(id) + '" title="Open location"' : '') +
      ' style="--k:' + c + (id ? ';cursor:pointer' : '') + '">' +
      '<div><div class="bm-row-val" style="font-size:14px">' + fmtDate(ev.date, t0).replace(/, \d{4}$/, '') + '</div>' +
        '<div class="bm-row-lbl" style="font-size:10px">' + whenTxt(ev, t0) + '</div></div>' +
      '<div style="padding-top:1px">' + pill(ev) + (ev.kind === 'contract' && ev.compound.length ? '<div style="margin-top:4px"><span class="loc-pill amber">+ Rate move</span></div>' : '') + '</div>' +
      '<div style="min-width:0"><div style="font-size:12.5px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + head + '</div>' +
        '<div class="loc-card-sub" style="font-size:11px;overflow-wrap:anywhere">' + detail(ev, t0) + '</div></div>' +
      '<div class="t120-val">' + (v.n ? '<b>' + v.t + '</b><i>' + esc(v.s) + '</i>' : '<i>' + esc(v.s) + '</i>') + '</div></div>';
  }
  function monthGroups(shown, t0) {
    var out = '', cur = null, buf = [], kinds = {};
    function flush() {
      if (!cur) return;
      var parts = [['contract', 'contract'], ['rate', 'default-rate move'], ['bps', 'BPS deadline']].filter(function (k) { return kinds[k[0]]; })
        .map(function (k) { return kinds[k[0]] + ' ' + k[1] + (kinds[k[0]] === 1 ? '' : 's'); });
      out += '<div class="t120-mo"><b>' + cur + '</b><span>' + parts.join(' · ') + '</span></div>' + buf.join('');
    }
    shown.forEach(function (e, idx) {
      var d = e.days < 0 ? t0 : e.date, k = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (k !== cur) { flush(); cur = k; buf = []; kinds = {}; }
      buf.push(listRow(e, t0, idx)); kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    });
    flush();
    return out;
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
    css120();
    // bundle 148: the card is the timeline; the full list lives in the Report window
    var body = shown.length ? track(res, shown)
      : '<div class="loc-card-sub" style="padding:10px 0">Nothing in this category in the next 120 days.</div>';
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<div class="ic-lbl" style="margin:0">☰ Timeline · ' + fmtDate(t0, t0) + ' to ' + fmtDate(res.end, t0) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + tabs +
          '<button type="button" data-trg-csv style="background:transparent;color:var(--mu);border:1px solid var(--b1);border-radius:14px;padding:3px 10px;font-size:10.5px;cursor:pointer">CSV ↓</button>' +
          '<button type="button" data-trg-report class="t120-rbtn">Report ↗</button></div>' +
      '</div><div style="margin-top:6px">' + body + '</div>' +
      '<div data-trga-digest style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06)"></div>' +
      '<div class="bm-basis">Default-rate moves cover the classes this client’s meters match, from the monthly price-to-compare refresh; “resets” means a fixed default price ends and the next one isn’t published yet. ' +
        'Contract rows show what each meter rolls onto if nothing is signed. BPS dates come from each ordinance’s published schedule. Brokers only.</div>';
  }

  // ── bundle 148: printable report (always light) ───────────────────────────
  function plainTxt(h) { return String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
  function report(res, focus) {
    var t0 = res.asOf, ev = res.events, s = res.stats || {};
    var br = (window.BeaconBrand && window.BeaconBrand.current && window.BeaconBrand.current()) || null;
    var firm = (br && (br.full || br.short)) || 'Sustainable Turnkey Solutions';
    var logo = br && br.logo ? br.logo : ((document.querySelector('.logo-img') || {}).src || '');
    var client = ((document.getElementById('d-name') || {}).textContent || '').trim() || 'Client';
    var acc = (getComputedStyle(document.documentElement).getPropertyValue('--lime') || '#4C6FFF').trim();
    var KC = { contract: '#B45309', rate: '#1D4ED8', bps: '#7C3AED' };
    function kindLbl(e) { return e.kind === 'contract' ? 'Contract' : e.kind === 'bps' ? 'BPS deadline' : (e.sub === 'reset' ? 'Default resets' : (e.pct > 0 ? 'Default ↑' : 'Default ↓')); }
    var rows = '', cur = null, idx = ev.indexOf(focus);
    ev.forEach(function (e, i) {
      var d = e.days < 0 ? t0 : e.date, k = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (k !== cur) { cur = k; rows += '<tr class="mo"><td colspan="5">' + esc(k) + '</td></tr>'; }
      var v = evValue(e, t0);
      var head = e.kind === 'contract' ? esc(where(e.a)) : e.kind === 'bps' ? esc(e.title) + ' · ' + esc(evWhere(e)) : esc(e.title);
      rows += '<tr id="ev' + i + '"' + (i === idx ? ' class="focus"' : '') + '><td class="dt"><b>' + fmtDate(e.date, t0) + '</b><span>' + whenTxt(e, t0) + '</span></td>' +
        '<td><span class="pill" style="color:' + KC[e.kind] + ';border-color:' + KC[e.kind] + '55;background:' + KC[e.kind] + '0f">' + kindLbl(e) + '</span></td>' +
        '<td><div class="hd">' + head + '</div><div class="dl">' + esc(plainTxt(detail(e, t0))) + '</div></td>' +
        '<td class="num">' + (v.n ? '<b>' + v.t + '</b><span>' + esc(v.s) + '</span>' : '<span>' + esc(v.s) + '</span>') + '</td></tr>';
    });
    var stat = function (n, l) { return '<div class="st"><b>' + n + '</b><span>' + l + '</span></div>'; };
    var html = '<!doctype html><html><head><meta charset="utf-8"><title>Next 120 days · ' + esc(client) + '</title><style>' +
      ':root{--a:' + acc + '}*{box-sizing:border-box}html,body{background:#fff;color:#0f172a;margin:0;font:13px/1.5 Inter,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '.bar{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:12px 28px;background:#f8fafc;border-bottom:1px solid #e2e8f0}.bar button{font:600 13px Inter,sans-serif;padding:8px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}.bar .pr{background:var(--a);border-color:var(--a);color:#fff}' +
      '.pg{max-width:1000px;margin:0 auto;padding:36px 40px 48px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid var(--a);padding-bottom:18px}' +
      '.top img{max-height:44px;max-width:200px}.eye{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:#64748b;font-weight:700}h1{font-size:28px;margin:4px 0 2px;letter-spacing:-.5px}.sub{color:#475569}' +
      '.sts{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:22px 0}.st{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#f8fafc}.st b{display:block;font-size:22px;letter-spacing:-.5px}.st span{font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}' +
      'table{width:100%;border-collapse:collapse}td{padding:10px 8px;border-bottom:1px solid #eef2f7;vertical-align:top}tr.mo td{padding:18px 0 6px;border-bottom:2px solid #0f172a;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:800}' +
      '.dt{width:92px}.dt b{display:block}.dt span,.num span{display:block;font-size:11px;color:#64748b}.hd{font-weight:600}.dl{font-size:12px;color:#475569}.num{text-align:right;white-space:nowrap;width:150px}.num b{font-size:14px}' +
      '.pill{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid;white-space:nowrap}tr.focus td{background:#fff7e6}' +
      '.basis{margin-top:22px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px}.ft{margin-top:10px;font-size:11px;color:#94a3b8}' +
      '@media print{.bar{display:none}.pg{padding:0}tr{page-break-inside:avoid}@page{margin:14mm}}</style></head><body>' +
      '<div class="bar"><button onclick="emailIt()">Email</button><button class="pr" onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>' +
      '<div class="pg"><div class="top"><div><div class="eye">Next 120 days · contracts, default rates, BPS</div><h1>' + esc(client) + '</h1>' +
        '<div class="sub">' + fmtDate(t0, t0) + ' to ' + fmtDate(res.end, t0) + ' · prepared by ' + esc(firm) + '</div></div>' + (logo ? '<img src="' + esc(logo) + '" alt="">' : '') + '</div>' +
      '<div class="sts">' + stat(ev.length, 'Timed events') + stat(s.contract || 0, 'Contracts expiring') + stat(s.rate || 0, 'Default-rate moves') + stat(s.bps || 0, 'BPS deadlines') + stat(s.expired || 0, 'Already expired') + '</div>' +
      (ev.length ? '<table>' + rows + '</table>' : '<p>No contract expirations, default-rate moves or BPS deadlines fall in this window.</p>') +
      '<div class="basis">Default-rate moves come from the monthly utility price-to-compare catalog for the classes this portfolio’s meters match; “resets” means a fixed default price ends and the next one isn’t published yet. ' +
        'Contract figures show what each meter pays on default service versus its contract if nothing is signed (estimated spend when no rate is on file). BPS dates and fines come from each ordinance’s published schedule. Estimates, not quotes.</div>' +
      '<div class="ft">Beacon · ' + esc(firm) + ' · generated ' + new Date().toLocaleString('en-US') + '</div></div>' +
      '<script>function emailIt(){var t=document.title,b=[...document.querySelectorAll("tr:not(.mo)")].slice(0,25).map(function(r){return r.innerText.replace(/\\s*\\n\\s*/g," · ")}).join("\\n");location.href="mailto:?subject="+encodeURIComponent(t)+"&body="+encodeURIComponent(t+"\\n\\n"+b+"\\n\\nSent from Beacon")}' +
      (idx >= 0 ? 'setTimeout(function(){var e=document.getElementById("ev' + idx + '");if(e)e.scrollIntoView({block:"center"})},200);' : '') + '<\/script></body></html>';
    var w = window.open('', '_blank', 'width=1100,height=900');
    if (!w) { alert('Allow pop-ups for Beacon to open the report.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
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
    var shownNow = res.events.filter(function (e) { return _filter === 'all' || e.kind === _filter; });
    Array.prototype.forEach.call(C.querySelectorAll('[data-t120]'), function (d) {
      d.addEventListener('click', function () { report(res, shownNow[+d.getAttribute('data-t120')]); });
    });
    var rb = C.querySelector('[data-trg-report]'); if (rb) rb.addEventListener('click', function () { report(res); });
    try { digestUi(C); } catch (e) {}
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

  // ── all clients (Admin tab, bundle 126) ────────────────────────────────
  // Every client the signed-in broker can see (RLS decides: reps see their
  // own customers, managers the whole org), run through the same build().
  var ACCT_COLS = 'id, customer_id, sqft, type, utility, account_number, annual_usage, expiration, property_type,' +
    ' supply_rate, supply_rate_unit, rate_effective, rate_source, tariff_code, ptc_utility, ptc_service_class,' +
    ' lifecycle_status, locations ( address, suite, city, state, zip )';
  function mapAcct(a) {
    var loc = a.locations || {}, t = String(a.type || '').trim().toLowerCase();
    var type = /^(electric|electricity|elec|e)$/.test(t) ? 'Electric' : /^(gas|natural gas|ng|g)$/.test(t) ? 'Gas' : (a.type || '');
    var addr = loc.address || ''; if (loc.suite) addr = addr ? addr + ', ' + loc.suite : loc.suite;
    var u = Number(a.annual_usage) || 0;
    return { id: a.id, clientId: a.customer_id, address: addr, city: loc.city || '', state: loc.state || '', zip: loc.zip || '',
      sqft: Number(a.sqft) || 0, type: type, accountType: type, utility: a.utility || '', account: a.account_number || '',
      usage: u, annualUsage: u, expiration: a.expiration || '', exp: a.expiration || '', property_type: a.property_type || null,
      supplyRate: a.supply_rate != null ? Number(a.supply_rate) : null, supplyRateUnit: a.supply_rate_unit || null,
      rateCents: (a.supply_rate != null && a.supply_rate_unit === 'cents_per_kwh') ? Number(a.supply_rate) : null,
      rateEffective: a.rate_effective || null, rateSource: a.rate_source || null, tariffCode: a.tariff_code || null,
      ptcUtility: a.ptc_utility || null, ptcServiceClass: a.ptc_service_class || null };
  }
  function loadAllClients() {
    var c = sb();
    if (!c) return Promise.reject(new Error('Not connected.'));
    return (c.auth ? c.auth.getSession() : Promise.resolve({ data: { session: true } })).then(function (s) {
      if (!(s && s.data && s.data.session)) throw new Error('sign in to see your clients');
      return Promise.all([
      c.from('customers').select('id, name, type, is_demo').order('name'),
      c.from('accounts').select(ACCT_COLS).eq('lifecycle_status', 'active')
    ]).then(function (r) {
      if (r[0].error) throw new Error(r[0].error.message);
      if (r[1].error) throw new Error(r[1].error.message);
      var by = {};
      (r[1].data || []).forEach(function (a) { (by[a.customer_id] = by[a.customer_id] || []).push(mapAcct(a)); });
      return (r[0].data || []).map(function (cu) { return { id: cu.id, name: cu.name, btype: cu.type || 'office', demo: cu.is_demo === true, accts: by[cu.id] || [] }; })
        .filter(function (cu) { return cu.accts.length; });
    });
    });
  }
  function buildAll(clients, opts) {
    var out = [], stats = { clients: clients.length, withEvents: 0 };
    // one client at a time keeps the catalog reads cached per state
    return clients.reduce(function (p, cu) {
      return p.then(function () {
        return build(cu.accts, Object.assign({ btype: cu.btype }, opts || {})).then(function (res) {
          if (res.events.length) stats.withEvents++;
          res.events.forEach(function (e) { e.client = cu.name; e.clientId = cu.id; out.push(e); });
        });
      });
    }, Promise.resolve()).then(function () {
      out.sort(function (x, y) { return x.date - y.date; });
      return { events: out, stats: stats, asOf: today(opts), end: addDays(today(opts), WINDOW_DAYS) };
    });
  }
  function plain(html) {
    return String(html).replace(/<div[^>]*>/g, ' · ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  function describe(ev, t0) {
    var kind = ev.kind === 'contract' ? 'Contract expires' : ev.kind === 'bps' ? 'BPS deadline' : (ev.sub === 'reset' ? 'Default rate resets' : (ev.pct > 0 ? 'Default rate up' : 'Default rate down'));
    return { date: iso(ev.date), when: fmtDate(ev.date, t0), days: ev.days, kind: kind, client: ev.client || '',
      where: ev.kind === 'contract' ? where(ev.a) : ev.kind === 'bps' ? ev.title + ' · ' + evWhere(ev) : ev.title,
      detail: plain(detail(ev, t0)).replace(/ · source$| · ordinance$/, ''), compound: !!(ev.compound && ev.compound.length) };
  }

  var _allRes = null, _allFilter = 'all';
  function paintAll(root, res) {
    var t0 = res.asOf, ev = res.events, list = root.querySelector('[data-trga-list]');
    var counts = { all: ev.length, contract: 0, rate: 0, bps: 0 };
    ev.forEach(function (e) { counts[e.kind]++; });
    var tabs = [['all', 'All'], ['contract', 'Contracts'], ['rate', 'Default rates'], ['bps', 'BPS']].map(function (t) {
      var on = _allFilter === t[0];
      return '<button type="button" data-trga-filter="' + t[0] + '" style="background:' + (on ? 'rgba(173,213,64,0.15)' : 'transparent') + ';color:' + (on ? 'var(--lime)' : 'var(--mu)') +
        ';border:1px solid ' + (on ? 'rgba(173,213,64,0.35)' : 'var(--b1)') + ';border-radius:14px;padding:3px 10px;font-size:10.5px;cursor:pointer">' + t[1] + ' · ' + counts[t[0]] + '</button>';
    }).join('');
    var shown = ev.filter(function (e) { return _allFilter === 'all' || e.kind === _allFilter; });
    list.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<div class="ic-lbl" style="margin:0">' + res.stats.withEvents + ' of ' + res.stats.clients + ' clients have something in the window · ' + fmtDate(t0, t0) + ' to ' + fmtDate(res.end, t0) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + tabs + '<button type="button" data-trga-csv style="background:transparent;color:var(--mu);border:1px solid var(--b1);border-radius:14px;padding:3px 10px;font-size:10.5px;cursor:pointer">CSV ↓</button></div></div>' +
      (shown.length ? shown.map(function (e) {
        return '<div style="display:flex;flex-wrap:wrap;gap:4px 12px;align-items:flex-start;padding:8px 0;border-top:1px solid rgba(255,255,255,0.05)">' +
          '<div style="flex:0 0 74px"><div class="bm-row-val" style="font-size:14px">' + fmtDate(e.date, t0) + '</div><div class="bm-row-lbl" style="font-size:10px">' + whenTxt(e, t0) + '</div></div>' +
          '<div style="flex:0 0 112px;padding-top:1px">' + pill(e) + (e.kind === 'contract' && e.compound.length ? '<div style="margin-top:4px"><span class="loc-pill amber">+ Rate move</span></div>' : '') + '</div>' +
          '<div style="flex:1 1 240px;min-width:0"><div style="font-size:12px;color:#fff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            '<a href="?clientId=' + encodeURIComponent(e.clientId) + '" class="lk" style="color:var(--lime);text-decoration:none" title="Open this client">' + esc(e.client) + '</a> · ' +
            esc(e.kind === 'contract' ? where(e.a) : e.kind === 'bps' ? e.title + ' · ' + evWhere(e) : e.title) + '</div>' +
          '<div class="loc-card-sub" style="font-size:11px;overflow-wrap:anywhere">' + detail(e, t0) + '</div></div></div>';
      }).join('') : '<div class="loc-card-sub" style="padding:10px 0">Nothing in this category in the next 120 days across your clients.</div>');
    Array.prototype.forEach.call(list.querySelectorAll('[data-trga-filter]'), function (b) {
      b.addEventListener('click', function () { _allFilter = b.getAttribute('data-trga-filter'); paintAll(root, res); });
    });
    list.querySelector('[data-trga-csv]').addEventListener('click', function () {
      var lines = [['Date', 'Days', 'Client', 'Type', 'Location / utility', 'Detail']];
      res.events.forEach(function (e) { var d = describe(e, t0); lines.push([d.date, d.days, d.client, d.kind, d.where, d.detail]); });
      var text = lines.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      a.download = 'beacon_triggers_all_clients_' + iso(t0) + '.csv'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  }

  // Weekly email: opt-in toggle, preview, last status.
  var FN = 'https://wnzpoacrdxrddwptpeiz.supabase.co/functions/v1/triggers-digest';
  function digestUi(root) {
    var c = sb(), box = root.querySelector('[data-trga-digest]');
    if (!c || !c.auth) return;
    c.auth.getSession().then(function (r) {
      var sess = r && r.data && r.data.session;
      if (!sess) { box.innerHTML = '<span class="loc-card-srcline">Sign in to turn on the weekly email.</span>'; return; }
      var uid = sess.user.id;
      Promise.all([
        c.from('trigger_digest_prefs').select('enabled').eq('user_id', uid).maybeSingle(),
        c.from('trigger_digests').select('week_of, event_count, send_status, sent_at, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(1)
      ]).then(function (q) {
        var on = !!(q[0].data && q[0].data.enabled), last = q[1].data && q[1].data[0];
        box.innerHTML = '<label style="display:inline-flex;gap:8px;align-items:center;cursor:pointer;font-size:12px;color:#fff">' +
            '<input type="checkbox" data-trga-optin' + (on ? ' checked' : '') + '> Email me this list every Monday morning</label>' +
          ' <button type="button" data-trga-preview style="margin-left:10px;background:transparent;color:var(--lime);border:1px solid rgba(173,213,64,0.35);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer">Preview this week’s email</button>' +
          '<div class="loc-card-srcline" data-trga-dmsg style="margin-top:6px">' + (last ? 'Last digest: week of ' + esc(last.week_of) + ' · ' + last.event_count + ' items · ' + esc(last.send_status || '') : 'Goes to the email you sign in with. Sent from the server, so it arrives even when Beacon is closed.') + '</div>';
        box.querySelector('[data-trga-optin]').addEventListener('change', function (ev) {
          var m = box.querySelector('[data-trga-dmsg]');
          c.from('trigger_digest_prefs').upsert({ user_id: uid, enabled: ev.target.checked, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).then(function (u) {
            m.textContent = u.error ? 'Not saved: ' + u.error.message : (ev.target.checked ? 'On. The first email goes out next Monday.' : 'Off.');
          });
        });
        box.querySelector('[data-trga-preview]').addEventListener('click', function () {
          var m = box.querySelector('[data-trga-dmsg]'), w = window.open('', '_blank');
          m.textContent = 'Building the preview…';
          fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sess.access_token }, body: JSON.stringify({ mode: 'preview' }) })
            .then(function (r) { return r.json(); }).then(function (j) {
              if (j.error) throw new Error(j.error);
              m.textContent = 'Preview: ' + j.event_count + ' items. ' + (j.send_status || '');
              if (w) { w.document.open(); w.document.write(j.html); w.document.close(); }
            }).catch(function (e) { m.textContent = 'Preview failed: ' + e.message; if (w) w.close(); });
        });
      });
    });
  }

  function mountAll() {
    var root = document.getElementById('trga-root');
    if (!root || root.getAttribute('data-mounted')) return;
    root.setAttribute('data-mounted', '1');
    root.innerHTML = '<div class="igrid-theme-hd" style="margin-top:0"><div class="igrid-theme-eye">Triggers · All clients · Brokers only</div>' +
        '<div class="igrid-theme-title">Next 120 days across every client</div>' +
        '<div class="igrid-theme-sub">contract expirations · default-rate moves · BPS deadlines, for every client you can see</div></div>' +
      '<div class="icard" style="min-width:0"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<button type="button" data-trga-load style="background:#add540;color:#0a0e1a;border:0;border-radius:6px;padding:7px 14px;font-weight:700;font-size:12px;cursor:pointer">Load all clients</button>' +
        '<span class="loc-card-srcline" data-trga-msg>Runs the same Triggers check as each client’s Intelligence tab.</span></div>' +
        '<div data-trga-digest style="margin-top:10px"></div><div data-trga-list style="margin-top:10px"></div></div>';
    var msg = root.querySelector('[data-trga-msg]');
    root.querySelector('[data-trga-load]').addEventListener('click', function () {
      msg.textContent = 'Loading clients…';
      loadAllClients().then(function (clients) {
        msg.textContent = 'Checking ' + clients.length + ' clients…';
        return buildAll(clients);
      }).then(function (res) { _allRes = res; msg.textContent = res.events.length + ' items across ' + res.stats.clients + ' clients.'; paintAll(root, res); },
        function (e) { msg.textContent = 'Could not load: ' + e.message; msg.style.color = '#ef4444'; });
    });
    digestUi(root);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll); else setTimeout(mountAll, 0);
  }

  window.BeaconTriggers = { render: render, build: build, buildAll: buildAll, mapAcct: mapAcct, describe: describe, mountAll: mountAll,
    _bpsDates: bpsDates, _classKey: classKey, _periods: periods, _sim: sim, last: function () { return _last; } };
})();
