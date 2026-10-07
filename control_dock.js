/* ============================================================================
 * control_dock.js — one quiet place for every action               bundle 142
 * ----------------------------------------------------------------------------
 * The header's second row (Admin · Live · date · Switch Customer · + Add
 * Client · Edit Client · Generate Beacon Brief) and the floating "View as"
 * box are hidden. Their actions live as small icons:
 *   • in the Ask Gridient tray, on the context line under its title, next to
 *     the client's initials (hover = full name) and "Live · date";
 *   • beside the closed Ask Gridient button, on hover (mouse only).
 * Each icon simply clicks the original control, so every behaviour is
 * unchanged. Removing this file's <script> tag brings the old buttons back.
 * Real client links (client_gate.js) see Ask Gridient only.
 * ========================================================================== */
(function () {
  'use strict';
  var I = {
    brief: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    add: '<circle cx="10" cy="8" r="4"/><path d="M3 21c0-4 3-6 7-6 1.3 0 2.5.2 3.5.6M18 14v6M15 17h6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    admin: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    broker: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 13h18"/>',
    client: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>'
  };
  function svg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[k] + '</svg>'; }
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  var ACTIONS = [
    { k: 'brief', tip: 'Beacon Brief', target: '#gen-report-btn' },
    { k: 'swap', tip: 'Switch client', target: '#switch-customer-btn' },
    { k: 'add', tip: 'Add client', target: '#ac-hdr-btn' },
    { k: 'edit', tip: 'Edit client', target: '#edit-client-btn' },
    { k: 'admin', tip: 'Admin', target: '.nav-row-2 .vbtn-admin' }
  ];
  function closeTray() { var x = document.getElementById('ag-close'); var d = document.getElementById('ag-drawer'); if (x && d && d.classList.contains('ag-open')) x.click(); }
  function run(a) {
    var el = $(a.target);
    if (!el) return;
    closeTray();
    setTimeout(function () { el.click(); }, 60);
  }
  function viewIsClient() { try { return new URLSearchParams(location.search).get('view') === 'client'; } catch (e) { return false; } }
  function setView(role) {
    var b = $('.lp-toggle .lp-toggle-btn[data-r="' + role + '"]');
    if (b) b.click();
  }

  function css() {
    if (document.getElementById('cdock-css')) return;
    var st = document.createElement('style'); st.id = 'cdock-css';
    st.textContent =
      // retire the loud second row and the corner box (kept in the DOM: the icons click them)
      'body.cdock-on .nav-row-2{display:none!important}' +
      'body.cdock-on .lp-toggle{display:none!important}' +
      'body.cdock-on #ag-pill{bottom:18px}' +
      // with row 2 gone the tabs get the whole header; narrow screens scroll the tabs, never the page
      'html,body{overflow-x:clip}' +
      '@media (max-width:1100px){.nav-row-1{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.nav-row-1::-webkit-scrollbar{display:none}.nav-row-1 .vbtn{flex:0 0 auto;white-space:nowrap;padding:9px 14px}}' +
      '@media (max-width:700px){.topbar{flex-wrap:wrap!important;gap:10px!important}.nav-stack{flex:1 1 100%!important;width:100%;order:3}}' +
      // context line
      '#ag-drawer .ag-ctx.cdock-ctx{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px;padding-bottom:12px}' +
      '.cdock-who{display:flex;align-items:center;gap:10px;min-width:0;flex:1 1 auto}' +
      '.cdock-ini{position:relative;font:700 11.5px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.08em;color:var(--txt,#E8EEF5);border:1px solid rgba(255,255,255,.14);border-radius:7px;padding:7px 8px;cursor:default;white-space:nowrap}' +
      '.cdock-live{position:relative;display:flex;align-items:center;justify-content:center;width:18px;height:18px;cursor:default;font:500 10.5px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.07em;color:var(--txt-3,#5A6A85);white-space:nowrap;text-transform:uppercase}' +
      '.cdock-live i{width:6px;height:6px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px rgba(34,197,94,.8)}' +
      '.cdock-icons{display:flex;align-items:center;gap:8px;flex-shrink:0}' +
      '.cdock-ic{position:relative;width:38px;height:38px;border-radius:11px;display:inline-flex;align-items:center;justify-content:center;color:var(--txt-2,#9AA9C0);background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);cursor:pointer;padding:0;transition:color .15s,border-color .15s,background .15s}' +
      '.cdock-ic svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}' +
      '.cdock-ic:hover,.cdock-ic:focus-visible{color:var(--lime,#ADD540);border-color:rgba(var(--cdock-acc,173,213,64),.45);background:rgba(var(--cdock-acc,173,213,64),.08);outline:none}' +
      '.cdock-sep{width:1px;height:22px;background:rgba(255,255,255,.09);margin:0 2px}' +
      '.cdock-seg{display:inline-flex;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:3px;gap:2px}' +
      '.cdock-seg .cdock-ic{width:32px;height:30px;border:0;border-radius:8px;background:transparent}' +
      '.cdock-seg .cdock-ic.on{color:var(--lime,#ADD540);background:rgba(var(--cdock-acc,173,213,64),.16)}' +
      // tooltips: one quiet label, below in the tray, above beside the pill
      '[data-cdock-tip]::after{content:attr(data-cdock-tip);position:absolute;left:50%;top:calc(100% + 8px);transform:translate(-50%,-2px);background:var(--panel-hi,#141C33);border:1px solid rgba(255,255,255,.1);color:var(--txt,#E8EEF5);font:500 11.5px/1 Inter,system-ui,sans-serif;letter-spacing:0;text-transform:none;padding:7px 10px;border-radius:7px;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .12s,transform .12s;z-index:5}' +
      '[data-cdock-tip]:hover::after,[data-cdock-tip]:focus-visible::after{opacity:1;transform:translate(-50%,0)}' +
      '.cdock-ini[data-cdock-tip]::after,.cdock-live[data-cdock-tip]::after{left:0;transform:translate(0,-2px)}.cdock-ini[data-cdock-tip]:hover::after,.cdock-live[data-cdock-tip]:hover::after{transform:translate(0,0)}' +
      '.cdock-icons .cdock-ic:last-child[data-cdock-tip]::after,.cdock-seg .cdock-ic[data-cdock-tip]::after{left:auto;right:0;transform:translate(0,-2px)}' +
      '.cdock-icons .cdock-ic:last-child[data-cdock-tip]:hover::after,.cdock-seg .cdock-ic[data-cdock-tip]:hover::after{transform:translate(0,0)}' +
      // beside the closed pill
      '#cdock-mini{position:fixed;bottom:18px;z-index:898;display:flex;gap:4px;padding:4px;background:var(--bg-2,#0A1224);border:1px solid rgba(255,255,255,.09);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.45);opacity:0;transform:translateX(8px);pointer-events:none;transition:opacity .16s,transform .16s}' +
      '#cdock-mini.show{opacity:1;transform:translateX(0);pointer-events:auto}' +
      '#cdock-mini .cdock-ic{width:34px;height:34px;border:0;border-radius:8px;background:transparent}' +
      '#cdock-mini .cdock-ic svg{width:17px;height:17px}' +
      '#cdock-mini [data-cdock-tip]::after{top:auto;bottom:calc(100% + 8px);transform:translate(-50%,2px)}#cdock-mini [data-cdock-tip]:hover::after{transform:translate(-50%,0)}' +
      'body.cdock-tray-open #cdock-mini{display:none}' +
      // clients: actions gone, chat stays
      'body.client-view .cdock-icons .cdock-act,body.client-view #cdock-mini,body.client-view .cdock-sep{display:none!important}' +
      '@media (hover:none),(max-width:700px){#cdock-mini{display:none!important}}' +
      '@media (max-width:600px){.cdock-icons{gap:6px}.cdock-ic{width:34px;height:34px}}';
    document.head.appendChild(st);
  }
  function accRgb() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--lime').trim();
      var m = /^#([0-9a-f]{6})$/i.exec(v); if (!m) return;
      var n = parseInt(m[1], 16); document.documentElement.style.setProperty('--cdock-acc', ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255));
    } catch (e) {}
  }
  function initials(name) {
    var skip = /^(llc|inc|inc\.|co|co\.|corp|corp\.|the|of|and|&|ltd|lp|llp|group)$/i;
    var w = String(name || '').replace(/\(.*?\)/g, ' ').split(/[\s\-–·]+/).filter(function (x) { return x && !skip.test(x); });
    if (!w.length) return '';
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    return w.slice(0, 4).map(function (x) { return x.charAt(0); }).join('').toUpperCase();
  }
  function btn(a, cls) {
    return '<button type="button" class="cdock-ic ' + (cls || '') + '" data-cdock="' + a.k + '" data-cdock-tip="' + esc(a.tip) + '" aria-label="' + esc(a.tip) + '">' + svg(a.k) + '</button>';
  }
  function available(a) { var el = $(a.target); return !!el; }

  function paintCtx() {
    var ctx = $('#ag-drawer .ag-ctx'); if (!ctx) return;
    ctx.classList.add('cdock-ctx');
    var name = (($('#d-name') || {}).textContent || '').trim();
    var loc = (($('#d-loc') || {}).textContent || '').trim();
    var date = (($('#date-chip') || {}).textContent || '').trim();
    var ini = initials(name);
    var acts = ACTIONS.filter(available);
    var toggle = !!$('.lp-toggle');
    var isC = viewIsClient();
    var html =
      '<div class="cdock-who">' +
        (ini ? '<span class="cdock-ini" tabindex="0" data-cdock-tip="' + esc(name + (loc ? ' · ' + loc : '')) + '">' + esc(ini) + '</span>' : '') +
        '<span class="cdock-live" tabindex="0" data-cdock-tip="Live data' + (date ? ' · ' + esc(date) : '') + '"><i></i></span>' +
      '</div>' +
      '<div class="cdock-icons">' +
        acts.map(function (a) { return btn(a, 'cdock-act'); }).join('') +
        (toggle ? (acts.length ? '<span class="cdock-sep"></span>' : '') +
          '<span class="cdock-seg">' +
            btn({ k: 'broker', tip: 'View as broker' }, isC ? '' : 'on') +
            btn({ k: 'client', tip: 'View as client' }, isC ? 'on' : '') +
          '</span>' : '') +
      '</div>';
    if (ctx.getAttribute('data-cdock-sig') === html) return;
    ctx.setAttribute('data-cdock-sig', html);
    ctx.innerHTML = html;
    wire(ctx);
  }
  function wire(root) {
    root.querySelectorAll('[data-cdock]').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var k = b.getAttribute('data-cdock');
        if (k === 'broker' || k === 'client') return setView(k);
        var a = ACTIONS.filter(function (x) { return x.k === k; })[0];
        if (a) run(a);
      });
    });
  }

  // ── beside the closed pill ────────────────────────────────────────────
  var hideT = null;
  function mini() {
    var pill = document.getElementById('ag-pill'); if (!pill) return;
    var m = document.getElementById('cdock-mini');
    var acts = ACTIONS.filter(available);
    if (!m) {
      m = document.createElement('div'); m.id = 'cdock-mini'; m.className = 'broker-only'; m.setAttribute('role', 'toolbar'); m.setAttribute('aria-label', 'Quick actions');
      document.body.appendChild(m);
      var show = function () { if (document.body.classList.contains('client-view')) return; clearTimeout(hideT); place(); m.classList.add('show'); };
      var hide = function () { clearTimeout(hideT); hideT = setTimeout(function () { m.classList.remove('show'); }, 220); };
      pill.addEventListener('mouseenter', show); pill.addEventListener('mouseleave', hide);
      m.addEventListener('mouseenter', show); m.addEventListener('mouseleave', hide);
      pill.addEventListener('click', function () { m.classList.remove('show'); });
    }
    var html = acts.map(function (a) { return btn(a, 'cdock-act'); }).join('');
    if (m.getAttribute('data-sig') !== html) { m.setAttribute('data-sig', html); m.innerHTML = html; wire(m); }
  }
  function place() {
    var pill = document.getElementById('ag-pill'), m = document.getElementById('cdock-mini'); if (!pill || !m) return;
    var r = pill.getBoundingClientRect();
    m.style.right = (window.innerWidth - r.left + 8) + 'px';
    m.style.bottom = (window.innerHeight - r.bottom + (r.height - 42) / 2) + 'px';
  }

  var on = false;
  function tick() {
    if (!document.body) return;
    if (!on && document.getElementById('ag-drawer')) { on = true; css(); document.body.classList.add('cdock-on'); }
    if (!on) return;
    accRgb();
    try { var d = document.getElementById('ag-drawer'); document.body.classList.toggle('cdock-tray-open', !!(d && d.classList.contains('ag-open'))); } catch (e) {}
    paintCtx(); mini();
  }
  function boot() {
    tick();
    // controls are injected by other scripts after sign-in / client load; brand
    // colour can change after the firm loads — keep the dock in step, cheaply.
    var n = 0, iv = setInterval(function () { tick(); if (++n > 120) { clearInterval(iv); setInterval(tick, 3000); } }, 500);
    window.addEventListener('resize', place);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.BeaconDock = { refresh: tick };
})();
