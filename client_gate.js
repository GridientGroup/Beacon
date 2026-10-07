/* ============================================================================
 * client_gate.js — real clients always get the client view          bundle 134
 * ----------------------------------------------------------------------------
 * Until now only ?view=client switched Beacon into client view. A customer
 * opening their private link (no sign-in, portfolio served by the snapshot
 * function) or a signed-in user whose profile role is 'client' saw the broker
 * chrome: Admin tab, Trading Desk, Edit Client, the View-as toggle. The data
 * behind those was still protected by RLS, but the screens should not show.
 *
 * This adds body.client-view (the same switch ?view=client uses) for:
 *   • a portfolio loaded through the customer snapshot (no broker session)
 *   • a signed-in profile with role = 'client'
 * and removes the View-as toggle for them. Local testing (localhost / file)
 * is left alone so brokers can still preview both views.
 * ========================================================================== */
(function () {
  'use strict';
  function local() { var h = location.hostname; return location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || /\.local$/.test(h); }
  function sb() { return window._beaconSb || window.sb || null; }
  var done = false;
  function gate(why) {
    if (done) return; done = true;
    document.body.classList.add('client-view');
    document.querySelectorAll('.lp-toggle').forEach(function (t) { t.remove(); });
    try {
      var on = document.querySelector('.vbtn.on');
      if (on && on.offsetParent === null && typeof showView === 'function') showView('overview');
    } catch (e) {}
    console.log('[client-gate] client view:', why);
  }
  function viaSnapshot() {
    try {
      var cid = window._beaconClientId || new URLSearchParams(location.search).get('clientId');
      var m = window._beaconData && window._beaconData.meta && cid ? window._beaconData.meta[cid] : null;
      return !!(m && m._viaSnapshot);
    } catch (e) { return false; }
  }
  function loadedAsBroker() {
    try {
      var cid = window._beaconClientId || new URLSearchParams(location.search).get('clientId');
      var m = window._beaconData && window._beaconData.meta && cid ? window._beaconData.meta[cid] : null;
      return !!(m && m._supabase && !m._viaSnapshot);
    } catch (e) { return false; }
  }
  function boot() {
    if (local()) return;
    var tries = 0;
    (function poll() {
      if (done) return;
      if (viaSnapshot()) return gate('customer link');
      // bundle 142: a ?share= link starts in client view (index.html pre-paint);
      // lift it once the portfolio has loaded through a signed-in broker instead.
      if (document.body.classList.contains('cv-pre') && loadedAsBroker()) {
        document.body.classList.remove('client-view', 'cv-pre');
        console.log('[client-gate] broker session on a customer link: broker view');
      }
      var c = sb();
      if (c && c.auth && tries === 4) {
        c.auth.getSession().then(function (s) {
          var u = s && s.data && s.data.session && s.data.session.user; if (!u) return;
          c.from('profiles').select('role').eq('id', u.id).maybeSingle().then(function (p) {
            if (p && p.data && p.data.role === 'client') gate('client login');
          }, function () {});
        }, function () {});
      }
      // a later tick may lift the snapshot marker; keep the toggle out meanwhile
      if (tries++ < 120) setTimeout(poll, 250);
    })();
    // Also observe the View-as toggle so it never appears once gated.
    new MutationObserver(function () { if (done) document.querySelectorAll('.lp-toggle').forEach(function (t) { t.remove(); }); })
      .observe(document.body, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.BeaconClientGate = { _gate: gate, _viaSnapshot: viaSnapshot };
})();
