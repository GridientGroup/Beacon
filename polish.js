/* ==========================================================================
 * polish.js — bundle 146: smoother scrolling + depth and fine detail.
 *
 * Purely visual. No numbers, layout or behaviour change.
 * UNDO: remove <script src="polish.js"></script> from index.html.
 *
 * Smoothness
 *   • Header bar: solid dark glass instead of a live 24px backdrop blur
 *     (the blur was recomputed on every scroll frame).
 *   • Ask Gridient mark: plays its intro glow once, then holds a static glow
 *     (the endless filter animation repainted it every frame).
 *   • Cards: hover animates only lift / shadow / border, never "all".
 *   • Tabular figures, so numbers don't change width as they load.
 * Depth
 *   • Layered soft shadows + a faint top highlight on every card.
 *   • A hair-thin line in the firm's colour across each card's top edge.
 *   • Clickable cards lift 2px on hover.
 *   • Hairline under the header, slim scrollbars, gentle row hovers.
 * Colours follow the firm brand through --acc-rgb (set from --lime below).
 * ========================================================================== */
(function () {
  'use strict';

  // ── the firm accent as r,g,b (brand.js sets --lime; default STS lime) ─────
  function rgbOf(hex) {
    var m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    var h = m[1]; if (h.length === 3) h = h.replace(/./g, '$&$&');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(',');
  }
  var lastAcc = '';
  function syncAccent() {
    var root = document.documentElement;
    var v = getComputedStyle(root).getPropertyValue('--lime').trim();
    if (v === lastAcc) return;
    lastAcc = v;
    var rgb = rgbOf(v) || '173,213,64';
    root.style.setProperty('--acc-rgb', rgb);
  }

  var FLAT = ['.icard', '.side-card', '.mi-panel', '.rebates-card', '.score-tile', '.mkpi', '.hr-card', '.po-prog-card',
    '.pl-stat', '.bps-hm-card', '.ei-rollup', '.bps-heatmap', '.rebates-stat', '.fp-contracts-stat', '.pl-dist', '.fp-geo',
    '.ur-table-wrap', '.bp-table-wrap', '.pl-table-wrap', '.pmap-iframe-card', '.fp-problem-row'];
  var GRAD = ['.fp-card', '.fp-outlook-card', '.eq-card', '.bp-stat', '.opp-hero', '.recm-tile-lg', '.sl-summary'];
  var LIFT = ['.scard', '.fp-card', '.po-prog-card', '.score-tile', '.eq-card', '.rebates-card', '.hr-card'];
  function sel(list, suffix) { return list.map(function (s) { return s + (suffix || ''); }).join(','); }

  var SHADOW = '0 1px 0 rgba(255,255,255,.045) inset, 0 0 0 1px rgba(0,0,0,.22), 0 2px 4px -1px rgba(0,0,0,.35), 0 14px 32px -14px rgba(0,0,0,.7)';
  var SHADOW_HI = '0 1px 0 rgba(255,255,255,.06) inset, 0 0 0 1px rgba(0,0,0,.22), 0 4px 10px -2px rgba(0,0,0,.4), 0 22px 44px -16px rgba(0,0,0,.75), 0 0 0 1px rgba(var(--acc-rgb),.10)';
  var HAIR = 'linear-gradient(90deg, rgba(var(--acc-rgb),0) 6%, rgba(var(--acc-rgb),.42) 50%, rgba(var(--acc-rgb),0) 94%)';
  var EASE = 'cubic-bezier(.2,.7,.2,1)';

  var css =
    // ── type & numbers ──
    'body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}' +
    '.bm-bignum,.ic-hero,.bm-row-val,.s-val,.kpi-v,.mkpi,.opp-hero-num,.fp-card,.trg-row,.t120-val,td{font-variant-numeric:tabular-nums}' +
    '::selection{background:rgba(var(--acc-rgb),.28);color:#fff}' +

    // ── header: solid glass, hairline beneath ──
    '.topbar{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:linear-gradient(180deg,rgba(9,15,29,.985),rgba(7,12,24,.975))!important;' +
      'box-shadow:0 10px 28px -18px rgba(0,0,0,.9);border-bottom-color:rgba(255,255,255,.05)!important}' +
    '.topbar::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;pointer-events:none;background:' + HAIR + ';opacity:.7}' +

    // ── Ask Gridient: intro once, then a still glow ──
    '#ag-pill .ag-gm{animation:ag-entrance-glow 7s cubic-bezier(.4,0,.2,1) 1 forwards!important}' +
    '#ag-pill .ag-gm .ag-flare{animation:ag-entrance-flare 7s cubic-bezier(.4,0,.2,1) 1 forwards!important}' +

    // ── cards: depth + hairline ──
    sel(FLAT) + '{box-shadow:' + SHADOW + ';background-image:' + HAIR + ';background-size:100% 1px;background-repeat:no-repeat;background-position:top center;' +
      'transition:border-color .22s ' + EASE + ',box-shadow .22s ' + EASE + ',transform .22s ' + EASE + '}' +
    sel(GRAD) + '{box-shadow:' + SHADOW + '}' +
    sel(FLAT, ':hover') + '{border-color:rgba(255,255,255,.11)}' +
    '.scard{transition:transform .22s ' + EASE + ',box-shadow .22s ' + EASE + ',border-color .22s ' + EASE + '!important}' +
    sel(LIFT, ':hover') + '{transform:translateY(-2px)}' +
    sel(LIFT.filter(function (s) { return s !== '.scard'; }), ':hover') + '{box-shadow:' + SHADOW_HI + '}' +
    '.sc-stats,.stat-b{box-shadow:0 1px 0 rgba(255,255,255,.03) inset}' +

    // ── section headings: a short accent tick on the eyebrow ──
    '.igrid-theme-eye,.sec-eye{letter-spacing:.16em}' +

    // ── rows & lists ──
    '.bm-row,.trg-row,.fp-problem-row,.loc-row,tr{transition:background-color .15s ease}' +
    '.bm-row:hover,.loc-row:hover,tbody tr:hover{background-color:rgba(255,255,255,.022)}' +
    '.bm-row[data-loc]:hover .bm-row-lbl{color:#fff}' +

    // ── buttons: crisp press ──
    '.vbtn,.am-btn,.prog-btn,.opp-cta,.bm-link{transition:transform .14s ' + EASE + ',box-shadow .2s ' + EASE + ',background-color .2s ' + EASE + ',border-color .2s ' + EASE + ',color .2s ' + EASE + '!important}' +
    '.am-btn:active,.prog-btn:active,.opp-cta:active,.vbtn:active{transform:translateY(1px) scale(.99)}' +
    '.vbtn.on{box-shadow:0 1px 0 rgba(255,255,255,.18) inset,0 6px 18px -6px rgba(var(--acc-rgb),.55)!important}' +


    // ── scrollbars ──
    'html{scrollbar-color:rgba(255,255,255,.16) transparent;scrollbar-width:thin}' +
    '::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-track{background:transparent}' +
    '::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:10px;border:3px solid transparent;background-clip:padding-box}' +
    '::-webkit-scrollbar-thumb:hover{background:rgba(var(--acc-rgb),.45);background-clip:padding-box;border:3px solid transparent}' +

    // ── focus ──
    'button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:1px solid rgba(var(--acc-rgb),.8);outline-offset:2px}' +

    // ── print / reduced motion: none of this ──
    '@media (prefers-reduced-motion:reduce){' + sel(LIFT, ':hover') + '{transform:none}}' +
    '@media print{' + sel(FLAT) + ',' + sel(GRAD) + '{box-shadow:none!important;background-image:none!important}.topbar::after{display:none}}';

  function mount() {
    if (document.getElementById('b146-polish')) return;
    syncAccent();
    var st = document.createElement('style');
    st.id = 'b146-polish';
    st.setAttribute('data-no-brand-swap', '');
    st.textContent = css;
    document.head.appendChild(st);
    // the topbar hairline needs a positioned parent (it's sticky, which counts)
    // brand.js re-sets --lime when a firm brand applies: follow it
    new MutationObserver(syncAccent).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
