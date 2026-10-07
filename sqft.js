/* ============================================================================
 * sqft.js — square footage for sites that have none on file       bundle 140
 * ----------------------------------------------------------------------------
 * Order of trust, per site (one building = one location):
 *   1. Reported   — square footage on the client's upload (accounts.sqft).
 *   2. Disclosure — the building's own floor area as reported to a city
 *                   benchmarking program (NYC LL84, Chicago, Seattle, DC,
 *                   Philadelphia). Looked up by the sqft-lookup function.
 *   3. Footprint  — FEMA / ORNL "USA Structures" building footprint × floors
 *                   from measured height. Used ONLY when the height is known;
 *                   a footprint with no height is shown, never used as area.
 *   4. Usage      — back-calculated from the site's kWh + therms ÷ the typical
 *                   EUI for its building type. Fills gaps for size-based
 *                   figures, but can't say whether a building is efficient
 *                   (by construction it lands on the median), so it is never
 *                   used for the EUI-gap savings estimate.
 * Every estimate carries its label to the screen. Lookups (2, 3) are cached
 * in public.site_sqft; this file reads them, applies them to the in-memory
 * accounts (a.sqft + a.sqftSource + a.sqftLabel), and draws the Admin →
 * "Square footage" card where a broker runs the lookup.
 *
 *   BeaconSqft.apply(cid, accounts, rows)  ·  BeaconSqft.summary(cid)
 *   window.resolveSqft(client, accounts, btype)  → portfolio sqft + source
 *   window.beaconClientProfile()  → the loaded client's real state, city,
 *        spend, sites, sqft (used by the Brief and the Services scorecard,
 *        which used to fall back to a demo portfolio: PA, 1,250,000 sq ft,
 *        $2.4M)
 * ========================================================================== */
(function () {
  'use strict';
  var ROWS = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function sb() { return window._beaconSb || window.sb || null; }
  function cidNow() { try { return window._beaconClientId || new URLSearchParams(location.search).get('clientId') || ''; } catch (e) { return ''; } }
  function siteKey(a) {
    if (a.location_id) return 'L:' + a.location_id;
    return 'A:' + [a.address, a.city, a.state].map(function (s) { return String(s || '').trim().toLowerCase(); }).join('|');
  }
  function bySite(accounts) {
    var m = {};
    (accounts || []).forEach(function (a) { if (!a) return; var k = siteKey(a); (m[k] = m[k] || []).push(a); });
    return m;
  }
  var EST = { disclosure: 1, footprint: 1 };

  // ── apply looked-up rows onto the in-memory accounts ──────────────────
  function apply(cid, accounts, rows) {
    if (!cid || !Array.isArray(accounts)) return;
    if (rows) ROWS[cid] = rows;
    var map = {};
    (ROWS[cid] || []).forEach(function (r) { if (r && r.location_id && r.status === 'found') map[r.location_id] = r; });
    var sites = bySite(accounts);
    Object.keys(sites).forEach(function (k) {
      var list = sites[k];
      // undo an earlier application so re-applying is idempotent
      list.forEach(function (a) { if (EST[a.sqftSource]) { a.sqft = 0; } delete a.sqftFootprint; if (a.sqftSource !== 'reported') { delete a.sqftSource; delete a.sqftLabel; delete a.sqftConfidence; } });
      var reported = list.some(function (a) { return Number(a.sqft) > 0; });
      if (reported) { list.forEach(function (a) { if (Number(a.sqft) > 0) a.sqftSource = 'reported'; }); return; }
      var r = list[0] && list[0].location_id ? map[list[0].location_id] : null;
      if (!r || !(Number(r.sqft) > 0)) return;
      list.forEach(function (a) {
        a.sqftLabel = r.label || '';
        a.sqftConfidence = (r.detail && r.detail.confidence) || (r.method === 'disclosure' ? 'high' : 'medium');
        // a tower estimate (base footprint × many floors) is shown but not used as area
        if (r.floors_known && a.sqftConfidence !== 'low') { a.sqft = Math.round(Number(r.sqft)); a.sqftSource = r.method; }
        else { a.sqftFootprint = Math.round(Number(r.sqft)); }
      });
    });
    try { if (document.getElementById('sqft-root') && cid === cidNow()) render(); } catch (e) { /* card not mounted yet */ }
  }

  function medianEUI(btype, state) {
    var bt = (window.beaconNormalizeBtype && window.beaconNormalizeBtype(btype)) || btype || 'office';
    var m = (window.CBECS_MEDIANS && window.CBECS_MEDIANS[bt]) || 0;
    var adj = (window.REGION_ADJ_BY_STATE && window.REGION_ADJ_BY_STATE[String(state || '').toUpperCase()]) || 1;
    return m * adj;
  }
  function usageOf(a) { var u = Number(a.usage != null ? a.usage : a.annualUsage) || 0; return /^gas$/i.test(a.type || '') ? { kwh: 0, th: u } : { kwh: u, th: 0 }; }

  // ── portfolio square footage, site by site ────────────────────────────
  window.resolveSqft = function (client, accounts, btype) {
    accounts = Array.isArray(accounts) ? accounts : [];
    var sites = bySite(accounts), keys = Object.keys(sites);
    var c = { reported: 0, disclosure: 0, footprint: 0, usage: 0, none: 0, footprintOnly: 0 };
    var total = 0, measured = 0, usageSqft = 0;
    keys.forEach(function (k) {
      var list = sites[k], best = null;
      list.forEach(function (a) { if (Number(a.sqft) > 0 && (!best || Number(a.sqft) > Number(best.sqft))) best = a; });
      if (best) {
        var src = EST[best.sqftSource] ? best.sqftSource : 'reported';
        c[src]++; total += Number(best.sqft); measured += Number(best.sqft);
        return;
      }
      if (list.some(function (a) { return a.sqftFootprint > 0; })) c.footprintOnly++;
      var kwh = 0, th = 0, st = '';
      list.forEach(function (a) { var u = usageOf(a); kwh += u.kwh; th += u.th; st = st || a.state; });
      var bt = (list[0] && list[0].property_type) || btype;
      var eui = medianEUI(bt, st);
      var kbtu = kwh * 3.412 + th * 100;
      if (kbtu > 0 && eui > 0) { var sf = Math.round(kbtu / eui); c.usage++; total += sf; usageSqft += sf; }
      else c.none++;
    });
    var n = keys.length;
    var source = !n ? 'none'
      : c.reported === n ? 'reported'
      : (c.usage && !c.reported && !c.disclosure && !c.footprint) ? 'usage'
      : (c.reported + c.disclosure + c.footprint + c.usage) ? 'estimated' : 'none';
    window._beaconSqftCounts = c;
    return {
      sqft: total, source: source, sites: n, counts: c,
      // floor area that can be trusted for EUI comparisons: every site has a
      // reported, disclosed or measured-footprint figure (no usage back-calc)
      measuredSqft: measured, measuredComplete: n > 0 && (c.reported + c.disclosure + c.footprint) === n,
      usageSqft: usageSqft
    };
  };

  // ── the loaded client's real profile (no demo fallbacks) ──────────────
  window.beaconClientProfile = function () {
    var q = new URLSearchParams(location.search), cid = cidNow();
    var meta = (window.beaconGetMeta && window.beaconGetMeta(cid)) || {};
    var accts = (window.beaconGetAccounts && window.beaconGetAccounts(cid)) || [];
    var btype = (window._beaconBtype && window._beaconBtype()) || q.get('btype') || 'office';
    var mode = function (key) { var t = {}; accts.forEach(function (a) { var v = a[key]; if (v) t[v] = (t[v] || 0) + 1; }); var k = Object.keys(t).sort(function (x, y) { return t[y] - t[x]; }); return k[0] || ''; };
    var r = window.resolveSqft(meta, accts, btype);
    var kwh = 0, th = 0; accts.forEach(function (a) { var u = usageOf(a); kwh += u.kwh; th += u.th; });
    var spend = accts.length && window.beaconSpend ? window.beaconSpend(accts) : 0;
    return {
      cid: cid, hasAccounts: accts.length > 0, accounts: accts,
      state: String(meta.state || mode('state') || q.get('state') || '').toUpperCase(),
      city: meta.city || mode('city') || q.get('city') || '',
      utility: meta.utility || mode('utility') || q.get('utility') || '',
      btype: btype, spend: Math.round(spend || Number(q.get('spend')) || 0),
      sites: r.sites || parseInt(q.get('sites'), 10) || 0,
      sqft: r.sqft || Number(q.get('sqft')) || 0, sqftSource: r.source, sqftCounts: r.counts,
      // only a fully measured portfolio feeds the EUI-gap efficiency estimate
      sqftForEfficiency: r.measuredComplete ? r.measuredSqft : 0,
      usage: { electricKwh: kwh, gasTherms: th }
    };
  };

  function summary(cid) {
    var accts = (window.beaconGetAccounts && window.beaconGetAccounts(cid)) || [];
    var r = window.resolveSqft({}, accts, (window._beaconBtype && window._beaconBtype()) || 'office');
    return r;
  }

  // ── Admin → This client → Square footage ──────────────────────────────
  var BTN = 'background:var(--lime,#add540);color:#0a0e1a;border:0;border-radius:6px;padding:7px 14px;font-weight:700;font-size:12px;cursor:pointer';
  var GHOST = 'background:transparent;color:var(--mu);border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer';
  function fmt(n) { return Math.round(Number(n) || 0).toLocaleString(); }
  function card() {
    var el = document.getElementById('sqft-root');
    if (!el) {
      var host = document.getElementById('adm-client-card') || document.getElementById('adm-upload');
      if (!host) return null;
      el = document.createElement('div'); el.id = 'sqft-root'; el.className = 'broker-only';
      el.style.cssText = 'margin-top:22px;border-top:1px solid rgba(255,255,255,.08);padding-top:18px';
      host.appendChild(el);
    }
    return el;
  }
  function render(msg) {
    var el = card(); if (!el) return;
    var cid = cidNow(), r = summary(cid), c = r.counts || {};
    var rows = (ROWS[cid] || []).slice().sort(function (a, b) { return (b.sqft || 0) - (a.sqft || 0); });
    var accNow = (window.beaconGetAccounts && window.beaconGetAccounts(cid)) || [];
    var checked = {}; (ROWS[cid] || []).forEach(function (x) { checked[x.location_id] = 1; });
    var sitesNow = bySite(accNow), missing = 0;
    Object.keys(sitesNow).forEach(function (k) { var l = sitesNow[k]; if (!l.some(function (a) { return Number(a.sqft) > 0 && !EST[a.sqftSource]; }) && !(l[0].location_id && checked[l[0].location_id])) missing++; });
    var line = function (n, t) { return n ? '<span style="margin-right:14px"><b style="color:#fff">' + fmt(n) + '</b> ' + t + '</span>' : ''; };
    el.innerHTML =
      '<div class="admin-title" style="margin-top:0">Square footage</div>' +
      '<div class="loc-card-srcline" style="margin:4px 0 10px">' +
        (r.sites ? line(c.reported, 'reported') + line(c.disclosure, 'from city disclosure') + line(c.footprint, 'from building footprints') + line(c.usage, 'estimated from usage') + line(c.none, 'unknown') + (c.footprintOnly ? line(c.footprintOnly, 'footprint only, floors unknown') : '') : 'No sites yet.') +
      '</div>' +
      (missing > 0 ? '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" data-sq-run style="' + BTN + '">Look up missing square footage</button>' +
        '<span class="loc-card-srcline" data-sq-msg>' + esc(msg || (missing.toLocaleString() + ' site' + (missing === 1 ? '' : 's') + ' without reported square footage not checked yet. Free public data: city benchmarking disclosures, then FEMA building footprints.')) + '</span></div>'
        : '<div class="loc-card-srcline" data-sq-msg>' + esc(msg || (c.reported === r.sites ? 'Every site has reported square footage.' : 'Every site without reported square footage has been checked.')) + '</div>') +
      (rows.length ? '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:var(--mu)">Looked-up sites (' + rows.length + ')</summary>' +
        '<div style="max-height:260px;overflow:auto;margin-top:8px;font-size:12px">' + rows.slice(0, 300).map(function (x) {
          var a = (window.beaconGetAccounts ? window.beaconGetAccounts(cid) : []).filter(function (y) { return y.location_id === x.location_id; })[0] || {};
          return '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)"><span style="color:#fff">' + esc(a.address || x.location_id) + (a.city ? ', ' + esc(a.city) : '') + '</span>' +
            '<span style="text-align:right;color:var(--mu)">' + (x.floors_known ? '<b style="color:#fff">' + fmt(x.sqft) + ' sq ft</b> · ' : '') + esc(x.label || '') + '</span></div>';
        }).join('') + '</div><div class="loc-card-srcline" style="margin-top:6px">Estimates are labelled wherever they appear. A square footage on the client\'s upload always replaces them.</div></details>' : '') +
      (rows.length ? '<button type="button" data-sq-redo style="' + GHOST + ';margin-top:10px">Look up again</button>' : '');
    var run = el.querySelector('[data-sq-run]'), redo = el.querySelector('[data-sq-redo]');
    if (run) run.addEventListener('click', function () { lookup(false); });
    if (redo) redo.addEventListener('click', function () { lookup(true); });
  }
  var BUSY = false;
  function say(t, bad) { var m = document.querySelector('#sqft-root [data-sq-msg]'); if (m) { m.textContent = t; m.style.color = bad ? '#ef4444' : ''; } }
  function lookup(force) {
    var c = sb(), cid = cidNow();
    if (BUSY || !c || !c.functions || !cid) return;
    BUSY = true;
    var found = 0, done = 0, first = true;
    var btn = document.querySelector('#sqft-root [data-sq-run], #sqft-root [data-sq-redo]'); if (btn) btn.disabled = true;
    (function step() {
      say('Looking up… ' + done + ' sites checked' + (found ? ', ' + found + ' found' : ''));
      c.functions.invoke('sqft-lookup', { body: { customer_id: cid, limit: 15, force: force && first } }).then(function (r) {
        first = false;
        var d = r && r.data;
        if (r.error || !d || d.error) { BUSY = false; say('Lookup stopped: ' + ((d && d.error) || (r.error && r.error.message) || 'no answer'), true); return reload(cid, false); }
        var fd = d.found || {}; done += (d.processed || 0); found += (fd.disclosure || 0) + (fd.footprint || 0) + (fd.footprint_no_floors || 0);  // bundle 142: tolerate a reply missing 'found'
        if ((d.remaining || 0) > 0 && (d.processed || 0) > 0) { if (done % 45 === 0) reload(cid, false); return step(); }
        BUSY = false; reload(cid, true, 'Done: ' + done + ' sites checked, ' + found + ' with public square footage.');
      }, function (e) { BUSY = false; say('Lookup stopped: ' + (e && e.message), true); });
      if (force) force = false;
    })();
  }
  function reload(cid, rerender, msg) {
    var c = sb(); if (!c || !c.from) return;
    return c.from('site_sqft').select('location_id, status, method, sqft, floors_known, label, detail').eq('customer_id', cid).then(function (r) {
      if (r.error) return;
      var accts = window.beaconGetAccounts ? window.beaconGetAccounts(cid) : [];
      apply(cid, accts, r.data || []);
      render(msg);
      if (rerender) {
        var m = document.querySelector('#sqft-root [data-sq-msg]') || document.querySelector('#sqft-root .loc-card-srcline');
        var el = document.getElementById('sqft-root');
        if (el && !el.querySelector('[data-sq-reload]')) {
          var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-sq-reload', '1'); b.textContent = 'Reload to use the new figures';
          b.style.cssText = BTN + ';margin-top:10px'; b.addEventListener('click', function () { location.reload(); });
          var redoBtn = el.querySelector('[data-sq-redo]'); if (redoBtn) redoBtn.insertAdjacentElement('afterend', b); else el.appendChild(b);
        }
        if (msg && m) m.textContent = msg;
      }
    });
  }
  function boot() {
    var tries = 0;
    (function go() {
      var cid = cidNow(), accts = window.beaconGetAccounts ? window.beaconGetAccounts(cid) : [];
      if (!card() || !accts.length) { if (tries++ < 60) setTimeout(go, 500); return; }
      if (!ROWS[cid]) ROWS[cid] = [];
      // the lookups were applied when the client loaded (hydrate / snapshot)
      render();
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.BeaconSqft = { apply: apply, summary: summary, render: render, lookup: lookup, _rows: ROWS };
})();
