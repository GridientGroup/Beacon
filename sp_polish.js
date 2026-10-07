/* ==========================================================================
 * sp_polish.js — bundle 148: program pages ("See methodology" / workspace).
 *
 * The program pages are static HTML with inline styles. This tags their
 * sections with classes when a page opens, and the stylesheet below restyles
 * them: KPI band that floats over the hero, a numbered step timeline, stat
 * columns with source tags, a "ticket" estimate card, and a full-bleed call
 * to action. Words and numbers are untouched.
 * UNDO: remove <script src="sp_polish.js"></script> from index.html.
 * ========================================================================== */
(function () {
  'use strict';
  function txt(e) { return (e && e.textContent || '').trim(); }
  function st(e) { return (e && e.getAttribute && e.getAttribute('style')) || ''; }
  function add(e, c) { if (e && e.classList) e.classList.add(c); }

  function tag(sp) {
    if (!sp || sp.id === 'sp-sources-page') return;
    var kids = [].slice.call(sp.children);
    // KPI strip: a band whose child is a 4-column grid, no headings
    kids.forEach(function (c) {
      var g = c.querySelector(':scope > div');
      if (g && /repeat\(4/.test(st(g)) && !c.querySelector('h1,h2') && !c.classList.contains('pi-top-row')) {
        add(c, 'spx-kband'); add(g, 'spx-kgrid');
        [].forEach.call(g.children, function (k, i) { add(k, 'spx-kpi'); k.style.setProperty('--i', i); });
      }
    });
    var main = kids.filter(function (c) { return c.querySelector(':scope > h2'); })[0];
    if (!main) return;
    add(main, 'spx-main');
    [].forEach.call(main.children, function (c) {
      var s = st(c), t = txt(c);
      if (c.tagName === 'H2') { add(c, 'spx-h2'); return; }
      if (!c.children.length && /text-transform:uppercase/.test(s)) { add(c, 'spx-eye'); return; }
      if (/repeat\(4/.test(s) || /repeat\(3/.test(s)) {
        add(c, 'spx-steps');
        [].forEach.call(c.children, function (k, i) {
          add(k, 'spx-step'); k.setAttribute('data-n', String(i + 1).padStart(2, '0'));
          var ico = k.firstElementChild; if (ico && txt(ico).length <= 3) add(ico, 'spx-step-ico');
        });
        return;
      }
      if (/By the Numbers/i.test(t) && c.querySelector('div')) {
        add(c, 'spx-numwrap');
        var card = c.querySelector(':scope > div'); add(card, 'spx-num');
        var list = card && [].slice.call(card.querySelectorAll(':scope > div')).filter(function (d) { return /flex-direction:column/.test(st(d)); })[0];
        if (list) { add(list, 'spx-numlist'); [].forEach.call(list.children, function (n) { add(n, 'spx-stat'); var p = n.children; add(p[0], 'spx-stat-v'); add(p[1], 'spx-stat-l'); add(p[2], 'spx-stat-s'); }); }
        [].forEach.call(card.children, function (d) { if (/By the Numbers/i.test(txt(d)) && !d.children.length) add(d, 'spx-eye'); });
        // a second card in the same grid (when a program has one)
        [].slice.call(c.children, 1).forEach(function (o) { add(o, 'spx-num'); });
        return;
      }
      if (/grid-template-columns:\s*1fr 1fr/.test(s)) {
        add(c, 'spx-why');
        var L = c.children[0], R = c.children[1];
        add(L, 'spx-why-l'); add(R, 'spx-est');
        if (L) {
          [].forEach.call(L.children, function (d) { if (!d.children.length && /uppercase/.test(st(d))) add(d, 'spx-eye'); if (d.tagName === 'H2') add(d, 'spx-h2'); });
          var lst = [].slice.call(L.querySelectorAll(':scope > div')).filter(function (d) { return /flex-direction:column/.test(st(d)); })[0];
          if (lst) { add(lst, 'spx-checks'); [].forEach.call(lst.children, function (r) { add(r, 'spx-check'); add(r.firstElementChild, 'spx-check-ico'); }); }
        }
        if (R) {
          [].forEach.call(R.querySelectorAll('div'), function (d) {
            var ds = st(d);
            if (/justify-content:space-between/.test(ds) && d.children.length === 2) {
              add(d, 'spx-est-row');
              if (/border:1px solid/.test(ds) || /rgba\(173,213,64,\.1\)|var\(--lime\)/.test(ds + d.innerHTML)) add(d, 'spx-est-hi');
            }
          });
        }
        return;
      }
      if (/Ready to get started|get started\?|Talk to|Next step/i.test(t) && c.querySelector('a,button')) { add(c, 'spx-cta'); var a = c.querySelector('a,button'); add(a, 'spx-cta-btn'); return; }
    });
    // any remaining "Schedule Discovery Call" anchors in the page get the button look
    [].forEach.call(sp.querySelectorAll('a[href*="gridientsuite.com/schedule"]'), function (a) { add(a, 'spx-btn'); });
  }

  function tagVisible() {
    document.querySelectorAll('.subpage.sp-panel').forEach(function (p) { if (p.style.display !== 'none') tag(p); });
  }
  function wrap() {
    if (typeof window.openProgram !== 'function') return false;
    if (window.openProgram._b148) return true;
    var orig = window.openProgram;
    var w = function () { var r = orig.apply(this, arguments); setTimeout(tagVisible, 30); setTimeout(tagVisible, 700); return r; };
    w._b148 = true; if (orig._b138) w._b138 = true; window.openProgram = w;
    return true;
  }

  var A = 'rgb(var(--acc-rgb,173,213,64))', Aa = function (a) { return 'rgba(var(--acc-rgb,173,213,64),' + a + ')'; };
  var B = 'rgb(var(--acc2-rgb,255,185,0))', Ba = function (a) { return 'rgba(var(--acc2-rgb,255,185,0),' + a + ')'; };
  var EASE = 'cubic-bezier(.2,.7,.2,1)';
  var css =
    // KPI band: four floating tiles over the hero edge
    '.spx-kband{background:transparent!important;border:0!important;position:relative;z-index:2;margin:-26px auto 0!important;max-width:1180px;padding:0 32px}' +
    '.subpage .pi-top-row{padding-bottom:30px}' +
    '.spx-kgrid{gap:14px!important;max-width:none!important}' +
    '.spx-kpi{border:1px solid rgba(255,255,255,.08)!important;border-radius:16px 16px 16px 4px;padding:22px 22px 20px!important;position:relative;overflow:hidden;' +
      'background:linear-gradient(180deg,rgba(17,27,48,.96),rgba(11,19,36,.96))!important;box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 18px 40px -18px rgba(0,0,0,.9),0 0 0 1px rgba(0,0,0,.3);' +
      'animation:spx-up .5s ' + EASE + ' both;animation-delay:calc(var(--i,0) * 70ms)}' +
    '.spx-kpi::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,' + Aa(0) + ',' + A + ' 40%,' + Ba(.9) + ' 80%,' + Ba(0) + ')}' +
    '.spx-kpi>div:first-child{color:#fff!important;font-family:"Inter",system-ui,sans-serif!important;font-size:34px!important;letter-spacing:-1px!important;text-shadow:0 0 28px ' + Aa(.35) + ';font-variant-numeric:tabular-nums}' +
    '.spx-kpi>div:last-child{text-transform:uppercase;letter-spacing:.14em!important;font-size:10px!important;font-weight:700!important;margin-top:6px}' +
    '@keyframes spx-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +

    // section heads
    '.spx-main{max-width:1180px!important;padding:64px 32px 72px!important}' +
    '.spx-eye{display:inline-flex!important;align-items:center;gap:10px;color:' + A + '!important;font-family:"IBM Plex Mono",ui-monospace,monospace!important;font-size:10.5px!important;letter-spacing:.22em!important}' +
    '.spx-eye::before{content:"";width:22px;height:1px;background:linear-gradient(90deg,' + A + ',' + Ba(.8) + ')}' +
    '.spx-h2{font-size:40px!important;letter-spacing:-1.2px!important;line-height:1.08!important;max-width:760px}' +

    // steps: numbered timeline
    '.spx-steps{position:relative;gap:16px!important;padding-top:34px;margin-bottom:72px!important}' +
    '.spx-steps::before{content:"";position:absolute;left:24px;right:24px;top:13px;height:2px;border-radius:2px;background:linear-gradient(90deg,' + A + ',' + Ba(.85) + ');opacity:.55}' +
    '.spx-step{position:relative;border-radius:16px 16px 16px 4px!important;padding:24px 22px 22px!important;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.015))!important;border:1px solid rgba(255,255,255,.07)!important;' +
      'box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 16px 34px -20px rgba(0,0,0,.85);transition:transform .22s ' + EASE + ',border-color .22s,box-shadow .22s}' +
    '.spx-step::before{content:attr(data-n);position:absolute;top:-34px;left:14px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
      'font:700 10.5px/1 "IBM Plex Mono",ui-monospace,monospace;color:#06101F;background:' + A + ';box-shadow:0 0 0 4px #070D1A,0 0 18px ' + Aa(.6) + '}' +
    '.spx-step:hover{transform:translateY(-3px);border-color:' + Aa(.35) + '!important;box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 22px 44px -18px rgba(0,0,0,.9),0 0 0 1px ' + Aa(.12) + '}' +
    '.spx-step-ico{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px!important;margin-bottom:14px!important;background:' + Aa(.12) + ';border:1px solid ' + Aa(.3) + '}' +
    '.spx-step>div:nth-child(2){font-size:14.5px!important;margin-bottom:8px!important}' +
    '.spx-step>div:nth-child(3){font-size:12.5px!important;line-height:1.65!important}' +

    // by the numbers: stat columns
    '.spx-numwrap{margin-bottom:72px!important}' +
    '.spx-num{border-radius:20px 20px 20px 6px!important;padding:30px 32px!important;border:1px solid rgba(255,255,255,.08)!important;' +
      'background:radial-gradient(700px 200px at 0% 0%,' + Ba(.09) + ',transparent 60%),linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.012))!important;box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 20px 44px -22px rgba(0,0,0,.85)}' +
    '.spx-num>div:first-child{background:linear-gradient(90deg,' + Ba(.9) + ',' + A + ' 60%,transparent)!important}' +
    '.spx-num .spx-eye{color:' + B + '!important}.spx-num .spx-eye::before{background:' + B + '}' +
    '.spx-numlist{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0!important}' +
    '.spx-stat{padding:6px 26px 4px 0;margin-right:26px;border-right:1px solid rgba(255,255,255,.07)}.spx-stat:last-child{border-right:0;margin-right:0}' +
    '.spx-stat-v{font-size:44px!important;letter-spacing:-1.5px!important;color:#fff!important;text-shadow:0 0 30px ' + Ba(.3) + ';font-variant-numeric:tabular-nums;margin-bottom:10px!important}' +
    '.spx-stat-l{font-size:13px!important;color:#C9D3E3!important;margin-bottom:12px!important;max-width:280px}' +
    '.spx-stat-s{display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.1);color:var(--mu)!important;background:rgba(255,255,255,.02)}' +

    // why it works + estimate ticket
    '.spx-why{gap:40px!important;margin-bottom:72px!important;align-items:center!important}' +
    '.spx-checks{gap:10px!important}' +
    '.spx-check{padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);font-size:13.5px!important;transition:border-color .2s,background-color .2s}' +
    '.spx-check:hover{border-color:' + Aa(.3) + ';background:' + Aa(.05) + '}' +
    '.spx-check-ico{background:' + Aa(.15) + '!important;color:' + A + '!important;border:1px solid ' + Aa(.45) + ';box-shadow:0 0 12px ' + Aa(.35) + '}' +
    '.spx-est{position:relative;overflow:hidden;border-radius:22px 22px 22px 6px!important;padding:34px!important;border:1px solid ' + Ba(.3) + '!important;' +
      'background:radial-gradient(500px 220px at 100% 0%,' + Ba(.14) + ',transparent 60%),radial-gradient(400px 240px at 0% 100%,' + Aa(.10) + ',transparent 60%),linear-gradient(180deg,#111C33,#0B1426)!important;' +
      'box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 30px 70px -28px rgba(0,0,0,.95),0 0 50px -24px ' + Ba(.5) + '}' +
    '.spx-est::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,' + Aa(0) + ',' + A + ' 30%,' + B + ' 70%,' + Ba(0) + ')}' +
    '.spx-est-row{background:rgba(255,255,255,.03)!important;border:1px solid rgba(255,255,255,.05);border-radius:11px!important}' +
    '.spx-est-row>span:last-child{font-family:"Inter",system-ui,sans-serif!important;font-variant-numeric:tabular-nums}' +
    '.spx-est-hi{background:linear-gradient(135deg,' + Ba(.16) + ',' + Ba(.04) + ')!important;border:1px solid ' + Ba(.45) + '!important;padding:16px 16px!important}' +
    '.spx-est-hi>span:last-child{font-size:28px!important;color:#fff!important;text-shadow:0 0 22px ' + Ba(.45) + '}' +

    // call to action
    '.spx-cta{border-radius:24px 24px 24px 6px!important;border:1px solid ' + Aa(.3) + '!important;padding:60px 64px!important;' +
      'background:radial-gradient(800px 300px at 100% 0%,' + Aa(.22) + ',transparent 60%),radial-gradient(600px 300px at 0% 100%,' + Ba(.14) + ',transparent 60%),linear-gradient(135deg,#10203D,#0A1426)!important;' +
      'box-shadow:0 1px 0 rgba(255,255,255,.08) inset,0 40px 90px -36px rgba(0,0,0,.95),0 0 80px -30px ' + Aa(.55) + '}' +
    '.spx-cta h2{font-size:42px!important}' +
    '.spx-btn,.spx-cta-btn{display:inline-flex!important;align-items:center;gap:10px;border-radius:12px 12px 12px 4px!important;padding:15px 26px!important;font-size:14px!important;' +
      'background:linear-gradient(135deg,' + A + ',' + Aa(.78) + ')!important;color:#06101F!important;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 14px 30px -10px ' + Aa(.8) + ';transition:transform .16s,box-shadow .2s!important}' +
    '.spx-btn:hover,.spx-cta-btn:hover{transform:translateY(-2px);box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 18px 38px -10px ' + Aa(.95) + '}' +

    // fonts: these pages asked for Fraunces / IBM Plex Sans, which Beacon never
    // loads, so they fell back to Times-style serif. Use Beacon's Inter instead.
    '.subpage [style*="Fraunces"],.subpage [style*="IBM Plex Sans"],.subpage h1,.subpage h2,.subpage .pi-headline,.subpage .pi-gauge-headline,.subpage .sp-hero-v2-headline,.subpage .pi-tile-num,.subpage .pi-row-name{font-family:Inter,-apple-system,"Segoe UI",system-ui,sans-serif!important}' +
    '.subpage h1,.subpage .sp-hero-v2-headline{font-weight:800!important;letter-spacing:-.035em!important;line-height:1.06!important}' +
    '.subpage h2,.subpage .spx-h2{font-weight:800!important;letter-spacing:-.03em!important}' +
    '.subpage .pi-headline{font-weight:700!important;letter-spacing:-.02em!important;line-height:1.22!important}' +
    '.subpage h1 em,.subpage h2 em{font-style:normal!important;background:linear-gradient(90deg,' + A + ',' + B + ');-webkit-background-clip:text;background-clip:text;color:transparent!important}' +
    '#bm-modal-body [style*="Fraunces"],#bm-modal-body [style*="IBM Plex Sans"]{font-family:Inter,-apple-system,system-ui,sans-serif!important}' +

    // hero (program_intel two-column top row)
    '.subpage .sp-hero-v2-headline{letter-spacing:-1.2px}' +
    '.subpage .pi-top-row{position:relative}' +
    '.subpage .pi-top-row::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,' + Aa(0) + ',' + Aa(.6) + ' 30%,' + Ba(.6) + ' 70%,' + Ba(0) + ');pointer-events:none}' +
    '.subpage .pi-tiles .pi-tile:nth-child(4):last-child{grid-column:1/-1}' +
    '.subpage .pi-tile{border-radius:14px 14px 14px 4px!important;box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 12px 26px -16px rgba(0,0,0,.8)}' +
    '.subpage .sp-back{border-radius:12px!important;transition:border-color .2s,background-color .2s}.subpage .sp-back:hover{border-color:' + Aa(.45) + '!important;background:' + Aa(.06) + '!important}' +

    '@media (max-width:900px){.spx-steps{grid-template-columns:1fr 1fr!important}.spx-steps::before{display:none}.spx-why{grid-template-columns:1fr!important}.spx-stat{border-right:0;margin-right:0;padding-right:0;margin-bottom:18px}.spx-cta{flex-direction:column;align-items:flex-start!important;padding:40px 28px!important}.spx-kband{margin-top:16px!important}}' +
    '@media (max-width:560px){.spx-steps,.spx-kgrid{grid-template-columns:1fr!important}}' +
    '@media (prefers-reduced-motion:reduce){.spx-kpi{animation:none}}';

  function boot() {
    if (!document.getElementById('spx-css')) {
      var s = document.createElement('style'); s.id = 'spx-css'; s.setAttribute('data-no-brand-swap', ''); s.textContent = css; document.head.appendChild(s);
    }
    var t = 0; (function go() { if (!wrap() && t++ < 60) setTimeout(go, 250); })();
    // program_pages.js wraps openProgram too; re-check ours sits on top after it loads
    setTimeout(wrap, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.BeaconSpPolish = { tag: tag, tagVisible: tagVisible };
})();
