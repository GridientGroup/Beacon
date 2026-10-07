/* ============================================================================
 * brand.js — White-label per firm (bundle 131)
 * ----------------------------------------------------------------------------
 * Each firm (public.organizations) can set: short name, full name, logo,
 * accent colour, support email, phone, website. Beacon applies them:
 *   • broker side — after sign-in, from the signed-in user's own firm row;
 *   • customer link — from the `brand` block the snapshot function returns.
 * A firm that hasn't set anything (STS today) sees no change at all.
 *
 * What changes for a branded firm:
 *   • BROKERAGE_CONFIG identity/contact fields → applyBrandConfig() re-run
 *     (title, wordmark, contact links, footer);
 *   • the topbar logo (or the firm's name in its place when no logo);
 *   • the accent colour (--lime / --lime-dim);
 *   • on-page copy: "Sustainable Turnkey Solutions" / "STS" / stsusgroup
 *     addresses are rewritten to the firm's own, live (MutationObserver),
 *     and inside report windows Beacon opens (window.open + document.write).
 *   • STS's own track record is NOT transferred: the case-study drawers
 *     (Hilton, Foot Locker, …) and the "STS has secured millions…" claim are
 *     hidden for any other firm. A partner's page never claims STS results.
 *
 * Admin → "Brand" panel: managers edit their firm's brand and can require
 * private link codes on customer links (org_brand_save RPC).
 *
 *   window.BeaconBrand.apply(brand) · .current() · .loadForSession() · .swap(str)
 * ========================================================================== */
(function () {
  'use strict';

  var DEF = null, CUR = null, observer = null, busy = false;
  // bundle 139: the firm's booking link for every "Schedule a call" button. Kept apart
  // from the brand keys so a firm can set only a calendar and keep the default look.
  var CAL = null, GRIDIENT_CAL = 'https://cal.com/gridientgroup';
  var KEYS = ['short', 'full', 'logo', 'accent', 'accent2', 'email', 'phone', 'website'];
  function cfg() { try { return (typeof BROKERAGE_CONFIG !== 'undefined') ? BROKERAGE_CONFIG : null; } catch (e) { return null; } }
  function sb() { return window._beaconSb || window.sb || null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function snapshotDefaults() {
    var c = cfg(); if (!c || DEF) return;
    DEF = { brandShort: c.brandShort, brandFull: c.brandFull, pageTitle: c.pageTitle, contactEmail: c.contactEmail, contactPhone: c.contactPhone,
      contactWebsite: c.contactWebsite, footerCopy: c.footerCopy, rep: JSON.parse(JSON.stringify(c.rep || {})), logo: (document.querySelector('.logo-img') || {}).src,
      caseKeys: JSON.parse(JSON.stringify(c.caseStudies || {})) };
  }
  function lighter(hex, f) {
    var n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v + (255 - v) * f).toString(16).padStart(2, '0'); });
    return '#' + c.join('');
  }
  function has(b) { return !!(b && KEYS.some(function (k) { return b[k]; })); }
  function darker(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var h = function (v) { return Math.round(v * f).toString(16).padStart(2, '0'); };
    return '#' + h(r) + h(g) + h(b);
  }

  // ── accent colour: Beacon's lime is also hard-coded in CSS and inline styles
  var ACC = null;  // { hex, rgb: 'r,g,b', dim }
  var LIGHT = ['#c4f048', '#c4eb55', '#b0d840', '#d8ff5e', '#b8e045'], DARK = ['#7a9a2a', '#92b82d', '#9bc432', '#9dc535', '#8fb82d', '#a4cc36'];
  var LIME_RE = /#add540|#7a9a2a|#c4f048|#c4eb55|#b0d840|#d8ff5e|#b8e045|#a4cc36|#92b82d|#9bc432|#9dc535|#8fb82d|173,\s*213,\s*64/gi;
  // Green→amber→red risk scales keep their meaning: never recolour inside them.
  var SCALE_RE = /linear-gradient\([^;{}]*?#ef4444[^;{}]*?\)/gi;
  // ── second accent (bundle 141): Beacon's gold highlight colour, per firm ──
  // A LIGHT second colour (e.g. Pilot's yellow) replaces the gold used for
  // highlights and callouts. A DARK one (e.g. Power Kiosk's navy) can't be read
  // as text on a dark screen, so it becomes the firm's BASE: Beacon's navy
  // backgrounds take its hue, and highlights use a lifted shade of it.
  // Amber/red/green status colours are never touched.
  var BRIEF_RE = /#7da512|125,\s*165,\s*18/gi;
  function printShade(hex) { var c = rgbOf(hex), f = 1; while (relLum(c.map(function (v) { return v * f; })) > 0.2 && f > 0.3) f -= 0.05; return c.map(function (v) { return Math.round(v * f); }); }
  var ACC2 = null;   // { hex, rgb, tint: { h, s } | null }
  var GOLD_RE = /#ffb900|255,\s*185,\s*0|255,\s*160,\s*0|255,\s*200,\s*40/gi;
  function rgbOf(hex) { var n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function relLum(rgb) { var a = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  function toHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, rgb;
    rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return rgb.map(function (v) { return Math.round((v + m) * 255); });
  }
  function hexOf(rgb) { return '#' + rgb.map(function (v) { return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'); }).join(''); }
  function makeAcc2(hex) {
    var rgb = rgbOf(hex), hsl = toHsl(rgb[0], rgb[1], rgb[2]), out = { input: hex, tint: null };
    if (relLum(rgb) < 0.18) {
      out.tint = { h: hsl[0], s: Math.min(0.75, Math.max(0.25, hsl[1])) };
      rgb = fromHsl(hsl[0], Math.min(0.8, Math.max(0.45, hsl[1])), 0.70);
    }
    out.hex = hexOf(rgb); out.rgb = rgb.join(',');
    return out;
  }
  // Beacon's navy backgrounds (dark, blue-dominant) take the base hue; lightness kept.
  function tintRgb(r, g, b) {
    if (!ACC2 || !ACC2.tint) return null;
    var hsl = toHsl(r, g, b);
    if (hsl[2] > 0.26 || b < g || b <= r + 3 || hsl[1] < 0.12) return null;
    return fromHsl(ACC2.tint.h, Math.min(0.7, hsl[1] * 0.55 + ACC2.tint.s * 0.45), hsl[2]);
  }
  function tintText(t) {
    if (!ACC2 || !ACC2.tint) return t;
    t = t.replace(/#([0-9a-fA-F]{6})\b/g, function (m, h) { var c = rgbOf('#' + h), x = tintRgb(c[0], c[1], c[2]); return x ? hexOf(x) : m; });
    return t.replace(/rgb(a?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g, function (m, a, r, g, b) { var x = tintRgb(+r, +g, +b); return x ? 'rgb' + a + '(' + x.join(',') : m; });
  }
  function recolor(str) {
    if ((!ACC && !ACC2) || !str) return str;
    var keep = [];
    var t = String(str).replace(SCALE_RE, function (m) { keep.push(m); return '\u0000' + (keep.length - 1) + '\u0000'; });
    // bundle 142: the light Beacon Brief uses a darker 'print' green; give it the firm's accent, darkened until it reads on white
    if (ACC && ACC.print) t = t.replace(BRIEF_RE, function (m) { return m.charAt(0) === '#' ? ACC.print : ACC.printRgb; });
    if (ACC) t = t.replace(LIME_RE, function (m) { var k = m.toLowerCase(); return k === '#add540' ? ACC.hex : LIGHT.indexOf(k) >= 0 ? ACC.light : DARK.indexOf(k) >= 0 ? ACC.dim : ACC.rgb; });
    if (ACC2) { t = t.replace(GOLD_RE, function (m) { return m.charAt(0) === '#' ? ACC2.hex : ACC2.rgb; }); t = tintText(t); }
    return t.replace(/\u0000(\d+)\u0000/g, function (_, i) { return keep[+i]; });
  }
  function recolorStyles() {
    document.querySelectorAll('style').forEach(function (st) { if (st.id === 'brand-hide-css') return; var t = st.textContent, u = recolor(t); if (u !== t) st.textContent = u; });
  }
  function recolorAttrs(root) {
    if ((!ACC && !ACC2) || !root || !root.querySelectorAll) return;
    var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll('[style]')));
    els.forEach(function (el) { var v = el.getAttribute && el.getAttribute('style'); if (v) { var u = recolor(v); if (u !== v) el.setAttribute('style', u); } });
    root.querySelectorAll('svg [stroke],svg [fill]').forEach(function (el) { ['stroke', 'fill'].forEach(function (a) { var v = el.getAttribute(a); if (v) { var u = recolor(v); if (u !== v) el.setAttribute(a, u); } }); });
  }
  // ── logo on a dark screen: a logo with its own white box, or dark ink on a
  // transparent background, sits on a rounded light plate so it reads as designed.
  function plateLogo(img) {
    var setPlate = function (on) {
      img.style.background = on ? '#fff' : ''; img.style.borderRadius = on ? '8px' : '';
      img.style.padding = on ? '4px 10px' : ''; img.style.boxSizing = on ? 'border-box' : '';
      img.setAttribute('data-plate', on ? '1' : '0');
    };
    var test = function () {
      try {
        var w = Math.min(img.naturalWidth, 240), h = Math.max(1, Math.round(img.naturalHeight * w / Math.max(1, img.naturalWidth)));
        if (!w || !h) return;
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
        var d = cx.getImageData(0, 0, w, h).data, px = function (x, y) { var i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
        var corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
        var boxed = corners.every(function (c) { return c[3] > 200 && relLum(c) > 0.75; });
        var ink = 0, dark = 0;
        for (var i = 0; i < d.length; i += 16) { if (d[i + 3] > 128) { ink++; if (relLum([d[i], d[i + 1], d[i + 2]]) < 0.06) dark++; } }
        setPlate(boxed || (ink > 0 && dark / ink > 0.25));
      } catch (e) { /* cross-origin logo: leave as is */ }
    };
    // wait for THIS src to decode (a just-swapped data URL can report the old image as complete)
    if (img.decode) img.decode().then(test, function () { img.addEventListener('load', test, { once: true }); });
    else img.addEventListener('load', test, { once: true });
  }

  // ── text rewrite ─────────────────────────────────────────────────────────
  var RULES = [];
  function buildRules(b) {
    var short = b.short || b.full, full = b.full || b.short, email = b.email, site = b.website;
    RULES = [
      [/\bSTS has secured millions in mid-stream rebates across retail, hospitality, and commercial portfolios\.?/g, ''],
      [/\bSustainable Turnkey Solutions\b/g, full],
      [/\bsolutions@stsusgroup\.com\b/g, email || ''],
      [/\b[a-z.]+@stsusgroup\.com\b/g, email || ''],
      [/\b(?:www\.)?stsusgroup\.com\b/g, site || ''],
      [/\bSTS\b/g, short],
    ];
  }
  function swap(s) {
    if (!CUR || !RULES.length || s == null) return s;
    var out = String(s);
    RULES.forEach(function (r) { out = out.replace(r[0], r[1]); });
    return out;
  }
  function fixCal(root) {
    if (!root || !root.querySelectorAll || (!CAL && !CUR)) return;
    root.querySelectorAll('a[href*="cal.com/gridientgroup"]').forEach(function (a) {
      var to = CAL || (CUR && CUR.email ? 'mailto:' + CUR.email + '?subject=' + encodeURIComponent('Schedule a call') : '');
      if (to) { a.setAttribute('href', to); if (/^mailto:/.test(to)) a.removeAttribute('target'); }
      else a.style.display = 'none';
    });
  }
  // Open the firm's calendar; a branded firm without one gets an email to its support
  // address; STS's own Beacon keeps the Gridient booking page.
  function schedule(subject) {
    if (CAL) { window.open(CAL, '_blank', 'noopener'); return true; }
    if (CUR && (CUR.short || CUR.full)) {
      if (CUR.email) window.location.href = 'mailto:' + encodeURIComponent(CUR.email) + '?subject=' + encodeURIComponent(subject || 'Schedule a call');
      return true;
    }
    return false;
  }
  function setCal(v) {
    var u = String(v || '').trim(); CAL = /^https:\/\/[^\s<>"]+$/.test(u) ? u : null;
    if (CAL || CUR) { busy = true; try { fixCal(document.body); } finally { busy = false; } watch(); }
  }
  function rewrite(root) {
    fixCal(root);
    if (!CUR || !root) return;
    recolorAttrs(root);
    if (!RULES.length) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode; if (!p) return NodeFilter.FILTER_REJECT;
        var t = p.nodeName; if (t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA') return NodeFilter.FILTER_REJECT;
        // bundle 142: the firm-admin panels show real firm names and 'replaces STS' labels — leave them as written
        if (p.closest && p.closest('#firms-root, #brand-root, #team-root, [data-no-brand-swap]')) return NodeFilter.FILTER_REJECT;
        return /STS|Sustainable Turnkey|stsusgroup/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(function (n) { var v = swap(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; });
    if (root.querySelectorAll) root.querySelectorAll('a[href*="stsusgroup"]').forEach(function (a) {
      var h = a.getAttribute('href');
      a.setAttribute('href', /^mailto:/i.test(h) ? (CUR.email ? 'mailto:' + CUR.email : '#') : (CUR.website ? 'https://' + CUR.website.replace(/^https?:\/\//, '') : '#'));
    });
  }
  function hideStsTrackRecord() {
    var st = document.getElementById('brand-hide-css');
    if (!st) { st = document.createElement('style'); st.id = 'brand-hide-css'; document.head.appendChild(st); }
    // Case-study drawers carry STS's own named results; never show them under another firm's name.
    var keys = Object.keys((DEF && DEF.caseKeys) || {});
    // bundle 138: also any toggle titled "Case Study …" (e.g. the efficiency
    // Signia by Hilton drawer), found by its text since it isn't in caseStudies.
    document.querySelectorAll('.cs-toggle').forEach(function (t) { var k = t.getAttribute('data-pid'); if (k && /case study/i.test(t.textContent || '') && keys.indexOf(k) < 0) keys.push(k); });
    st.textContent = keys.map(function (k) { return '.cs-toggle[data-pid="' + k + '"],#cs-' + k; }).join(',') + '{display:none!important}';
    if (!hideStsTrackRecord._again) { hideStsTrackRecord._again = true; setTimeout(function () { if (CUR && (CUR.short || CUR.full)) hideStsTrackRecord(); }, 2500); }
  }
  function watch() {
    if (observer) return;
    // bundle 139: queue mutations instead of dropping the ones that arrive while a
    // rewrite is pending (the Beacon Brief's final page landed inside that window
    // and kept "STS" for partner firms).
    var pending = false, queue = [];
    observer = new MutationObserver(function (muts) {
      if (busy) return;
      Array.prototype.push.apply(queue, muts);
      if (pending) return; pending = true;
      setTimeout(function () {
        var muts = queue; queue = [];
        pending = false; busy = true;
        try { muts.forEach(function (m) { m.addedNodes && m.addedNodes.forEach(function (n) { if (n.nodeType === 1) rewrite(n); else if (n.nodeType === 3 && n.parentNode) rewrite(n.parentNode); }); if (m.type === 'characterData' && m.target.parentNode) rewrite(m.target.parentNode); }); }
        finally { busy = false; }
      }, 30);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  // Reports Beacon opens in a new window via document.write
  (function wrapOpen() {
    var _open = window.open;
    window.open = function () {
      var w = _open.apply(window, arguments);
      try {
        if (w && w.document && CUR) {
          var d = w.document, ow = d.write.bind(d);
          d.write = function () { return ow.apply(null, Array.prototype.map.call(arguments, swap)); };
        }
      } catch (e) { /* cross-origin window, leave it */ }
      return w;
    };
  })();

  // ── apply ────────────────────────────────────────────────────────────────
  function apply(b) {
    snapshotDefaults();
    if (b && b.calendar !== undefined) setCal(b.calendar);
    if (!has(b)) return false;
    var c = cfg(); if (!c) return false;
    CUR = {}; KEYS.forEach(function (k) { CUR[k] = b[k] || null; });
    var short = CUR.short || CUR.full, full = CUR.full || CUR.short;
    if (short) {
      c.brandShort = short; c.brandFull = full;
      c.pageTitle = short + ' Client Portal · Beacon';
      c.footerCopy = '© ' + new Date().getFullYear() + ' ' + full;
      c.rep = { name: full, initials: short.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(), role: 'Your energy advisor', email: CUR.email || '', subject: short + ' Portal Inquiry' };
      if (c.caseStudies) Object.keys(c.caseStudies).forEach(function (k) { c.caseStudies[k] = { headline: '', body: '', result: '' }; });
    }
    c.contactEmail = CUR.email || ''; c.contactPhone = CUR.phone || ''; c.contactWebsite = CUR.website || '';
    try { if (typeof applyBrandConfig === 'function') applyBrandConfig(); } catch (e) { console.warn('[brand] applyBrandConfig failed', e); }
    var img = document.querySelector('.logo-img');
    if (img) {
      var tag = document.getElementById('brand-name-tag');
      if (CUR.logo) { img.src = CUR.logo; img.alt = full || ''; img.style.display = ''; if (tag) tag.remove(); plateLogo(img); }
      else if (short) {
        img.style.display = 'none';
        if (!tag) { tag = document.createElement('div'); tag.id = 'brand-name-tag'; tag.style.cssText = 'font-weight:800;font-size:18px;letter-spacing:.5px;color:#fff;white-space:nowrap;margin-right:10px'; img.parentNode.insertBefore(tag, img.nextSibling); }
        tag.textContent = short;
      }
    }
    if (CUR.accent) {
      var n = parseInt(CUR.accent.slice(1), 16);
      ACC = { hex: CUR.accent, dim: darker(CUR.accent, 0.7), light: lighter(CUR.accent, 0.25), rgb: ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) };
      var _ps = printShade(CUR.accent); ACC.print = hexOf(_ps); ACC.printRgb = _ps.join(',');
      document.documentElement.style.setProperty('--lime', ACC.hex);
      document.documentElement.style.setProperty('--lime-dim', ACC.dim);
    }
    if (CUR.accent2 && /^#[0-9a-fA-F]{6}$/.test(CUR.accent2)) {
      ACC2 = makeAcc2(CUR.accent2);
      document.documentElement.style.setProperty('--gold', ACC2.hex);
      document.documentElement.setAttribute('data-brand-base', ACC2.tint ? 'tinted' : 'default');
    }
    if (ACC || ACC2) recolorStyles();
    if (short) { buildRules(CUR); hideStsTrackRecord(); }
    busy = true; try { rewrite(document.body); } finally { busy = false; }
    watch();
    document.documentElement.setAttribute('data-brand', short || 'custom');
    return true;
  }

  // ── broker session: brand of the signed-in user's own firm ──────────────
  var COLS = 'id, name, brand_short, brand_full, brand_logo, brand_accent, brand_accent2, brand_email, brand_phone, brand_website, brand_calendar, require_share_token';
  var _org = null;
  function loadForSession() {
    var c = sb(); if (!c || !c.auth) return Promise.resolve(null);
    return c.auth.getSession().then(function (s) {
      var sess = s && s.data && s.data.session; if (!sess) return null;
      return c.from('profiles').select('org_id, role').eq('id', sess.user.id).maybeSingle().then(function (p) {
        if (!p.data || !p.data.org_id) return null;
        return c.from('organizations').select(COLS).eq('id', p.data.org_id).maybeSingle().then(function (o) {
          if (o.error || !o.data) return null;
          _org = o.data; _org._role = p.data.role;
          // A client link (?share=) shows the CLIENT'S firm brand, even to a signed-in
          // broker from another firm; the session brand only applies otherwise.
          if (!LINK_BRAND) apply(fromRow(o.data));
          mountAdmin();
          return o.data;
        });
      });
    }).catch(function (e) { console.warn('[brand] load failed', e); return null; });
  }
  function fromRow(r) { return { short: r.brand_short, full: r.brand_full, logo: r.brand_logo, accent: r.brand_accent, accent2: r.brand_accent2, email: r.brand_email, phone: r.brand_phone, website: r.brand_website, calendar: r.brand_calendar || '' }; }

  // ── private link for the current client (Copy Customer URL) ─────────────
  function shareUrl(clientId) {
    var base = new URL(location.href); base.searchParams.delete('broker'); base.searchParams.delete('share');
    var c = sb();
    if (!c || !clientId) return Promise.resolve(base.toString());
    return c.from('customers').select('share_token').eq('id', clientId).maybeSingle().then(function (r) {
      if (r.data && r.data.share_token) base.searchParams.set('share', r.data.share_token);
      return base.toString();
    }, function () { return base.toString(); });
  }

  // ── Admin → Brand panel ─────────────────────────────────────────────────
  var INP = 'background:#0a0e1a;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:4px;font-size:12px;padding:6px 8px;width:100%;box-sizing:border-box';
  var BTN = 'background:#add540;color:#0a0e1a;border:0;border-radius:6px;padding:7px 14px;font-weight:700;font-size:12px;cursor:pointer';
  function accNote(a1, a2) {
    var out = [];
    if (a1 && /^#[0-9a-f]{6}$/i.test(a1) && relLum(rgbOf(a1)) < 0.12) out.push('Your accent is very dark for a dark screen: buttons and links will be hard to read. A lighter shade of it works better.');
    if (a2 && /^#[0-9a-f]{6}$/i.test(a2) && a2.toUpperCase() !== '#FFB900') {
      var x = makeAcc2(a2);
      out.push(x.tint ? 'Dark second colour: Beacon\u2019s backgrounds take its hue, and highlights use a lighter shade <span style="display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:-1px;background:' + x.hex + '"></span>.'
        : 'Second colour is used for highlights and callouts.');
    } else out.push('Second colour: highlights and callouts (Beacon gold by default). A dark one tints the backgrounds instead.');
    return out.join(' ');
  }
  function mountAdmin() {
    var root = document.getElementById('brand-root'); if (!root || !_org) return;
    var mgr = _org._role === 'manager' || _org._role === 'superadmin', b = fromRow(_org);
    var f = function (lbl, key, ph, type) { return '<label style="display:block;font-size:11px;color:var(--mu);margin-bottom:8px">' + lbl + '<input data-br="' + key + '" type="' + (type || 'text') + '" value="' + esc(b[key] || '') + '" placeholder="' + esc(ph || '') + '" style="' + INP + '"' + (mgr ? '' : ' disabled') + '></label>'; };
    root.innerHTML = '<div class="igrid-theme-hd" style="margin-top:0"><div class="igrid-theme-eye">Brand · ' + esc(_org.name || 'Your firm') + '</div>' +
      '<div class="igrid-theme-title">How Beacon looks to your reps and clients</div>' +
      '<div class="igrid-theme-sub">logo · name · accent colour · contact details · private client links</div></div>' +
      '<div class="icard" style="min-width:0"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">' +
        '<div>' + f('Short name (replaces “STS” in copy)', 'short', 'e.g. Cardinal') + f('Full name', 'full', 'e.g. Cardinal Energy Advisors') +
          f('Support email', 'email', 'help@yourfirm.com', 'email') + f('Phone', 'phone', '800.555.0100') + f('Website', 'website', 'yourfirm.com') +
          f('“Schedule a call” link (Calendly, Cal.com, HubSpot, Outlook bookings…)', 'calendar', 'https://calendly.com/yourfirm/15min', 'url') + '</div>' +
        '<div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label style="display:block;font-size:11px;color:var(--mu);margin-bottom:8px">Accent colour<input data-br="accent" type="color" value="' + esc(b.accent || '#ADD540') + '" style="' + INP + ';height:34px;padding:2px"' + (mgr ? '' : ' disabled') + '></label>' +
          '<label style="display:block;font-size:11px;color:var(--mu);margin-bottom:8px">Second colour (highlights)<input data-br="accent2" type="color" value="' + esc(b.accent2 || '#FFB900') + '" style="' + INP + ';height:34px;padding:2px"' + (mgr ? '' : ' disabled') + '></label></div>' +
          '<div class="loc-card-srcline" data-br-acc-note style="margin:-2px 0 10px">' + accNote(b.accent, b.accent2) + '</div>' +
          '<div style="font-size:11px;color:var(--mu);margin-bottom:4px">Logo (PNG, JPG, SVG or WebP, under 300 KB)</div>' +
          '<div data-br-logo-prev style="background:#0a0e1a;border:1px dashed rgba(255,255,255,.2);border-radius:6px;min-height:54px;display:flex;align-items:center;justify-content:center;padding:6px;margin-bottom:6px">' + (b.logo ? '<img src="' + esc(b.logo) + '" style="max-height:44px;max-width:100%">' : '<span style="font-size:11px;color:var(--mu)">no logo — your short name shows instead</span>') + '</div>' +
          (mgr ? '<input data-br-logo type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="font-size:11px;color:#fff"> <button type="button" data-br-logo-clear style="background:transparent;color:var(--mu);border:0;font-size:11px;cursor:pointer;text-decoration:underline">remove logo</button>' : '') +
          '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#fff;margin-top:12px;cursor:pointer"><input data-br="require" type="checkbox"' + (_org.require_share_token ? ' checked' : '') + (mgr ? '' : ' disabled') + '> <span>Require private link codes on client links. Old links without a code stop working; use “Copy Customer URL” to get each client’s private link.</span></label></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px">' + (mgr ? '<button type="button" data-br-save style="' + BTN + '">Save brand</button>' : '') +
        '<span class="loc-card-srcline" data-br-msg>' + (mgr ? 'Leave everything blank to use the default Beacon look. Changes show for your reps and clients on their next page load.' : 'Only a manager in your firm can change the brand.') + '</span></div>' +
      '<div class="loc-card-srcline" style="margin-top:8px">Another firm’s results and case studies are never shown under your name: Beacon hides the built-in case studies once a brand is set.</div></div>';
    if (!mgr) return;
    var logo = b.logo || '', msg = root.querySelector('[data-br-msg]');
    ['accent', 'accent2'].forEach(function (k) { var el = root.querySelector('[data-br="' + k + '"]'); if (el) el.addEventListener('input', function () { var n = root.querySelector('[data-br-acc-note]'); if (n) n.innerHTML = accNote(root.querySelector('[data-br="accent"]').value, root.querySelector('[data-br="accent2"]').value); }); });
    root.querySelector('[data-br-logo]').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0]; if (!file) return;
      if (file.size > 300 * 1024) { msg.textContent = 'That logo is ' + Math.round(file.size / 1024) + ' KB; keep it under 300 KB.'; msg.style.color = '#ef4444'; return; }
      var fr = new FileReader();
      fr.onload = function () { logo = String(fr.result); root.querySelector('[data-br-logo-prev]').innerHTML = '<img src="' + logo + '" style="max-height:44px;max-width:100%">'; msg.textContent = 'Logo ready. Click Save brand.'; msg.style.color = ''; };
      fr.readAsDataURL(file);
    });
    root.querySelector('[data-br-logo-clear]').addEventListener('click', function () { logo = ''; root.querySelector('[data-br-logo-prev]').innerHTML = '<span style="font-size:11px;color:var(--mu)">no logo — your short name shows instead</span>'; });
    root.querySelector('[data-br-save]').addEventListener('click', function () {
      var v = function (k) { var el = root.querySelector('[data-br="' + k + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
      var accent = v('accent'); if (accent && accent.toUpperCase() === '#ADD540' && !b.accent) accent = '';
      var accent2 = v('accent2'); if (accent2 && accent2.toUpperCase() === '#FFB900' && !b.accent2) accent2 = '';
      msg.textContent = 'Saving…'; msg.style.color = '';
      sb().rpc('org_brand_save', { p_short: v('short'), p_full: v('full'), p_logo: logo, p_accent: accent, p_email: v('email'), p_phone: v('phone'), p_website: v('website'), p_require_token: v('require') })
        .then(function (r) {
          if (r.error) return r;
          // bundle 139: the booking link is saved by its own RPC
          return sb().rpc('org_calendar_save', { p_calendar: v('calendar') });
        })
        .then(function (r) {
          if (r.error) return r;
          // bundle 141: second accent, its own RPC
          return sb().rpc('org_accent2_save', { p_accent2: accent2 });
        })
        .then(function (r) {
          if (r.error) { msg.textContent = 'Not saved: ' + r.error.message; msg.style.color = '#ef4444'; return; }
          msg.textContent = 'Saved. Reload the page to see the full effect everywhere.'; msg.style.color = 'var(--lime)';
          loadForSession();
        }, function (e) { msg.textContent = 'Not saved: ' + e.message; msg.style.color = '#ef4444'; });
    });
  }

  var LINK_BRAND = false;
  function loadForLink() {
    var q = new URLSearchParams(location.search), share = q.get('share'), cid = q.get('clientId');
    if (!share) return;
    LINK_BRAND = true;
    var tries = 0;
    (function go() {
      var c = sb();
      if (!c || !c.functions) { if (tries++ < 40) setTimeout(go, 250); return; }
      c.functions.invoke('beacon-customer-snapshot', { body: { clientId: cid || '', share: share } }).then(function (r) {
        var b = r && r.data && r.data.brand;
        if (b) apply(b);
      }, function (e) { console.warn('[brand] link brand failed', e); });
    })();
  }
  function boot() {
    snapshotDefaults();
    loadForLink();
    var tries = 0;
    (function wait() {
      var c = sb();
      if (c && c.auth) {
        loadForSession();
        try { c.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED') loadForSession(); }); } catch (e) {}
      } else if (tries++ < 40) setTimeout(wait, 500);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);

  window.BeaconBrand = { apply: apply, swap: swap, loadForSession: loadForSession, shareUrl: shareUrl, current: function () { return CUR; }, _acc2: function () { return ACC2; }, calendar: function () { return CAL; }, schedule: schedule, _defaults: function () { return DEF; } };
})();
