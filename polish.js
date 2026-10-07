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
    var cs = getComputedStyle(root), v = cs.getPropertyValue('--lime').trim(), g = cs.getPropertyValue('--gold').trim();
    if (v + '|' + g === lastAcc) return;
    lastAcc = v + '|' + g;
    root.style.setProperty('--acc-rgb', rgbOf(v) || '173,213,64');
    root.style.setProperty('--acc2-rgb', rgbOf(g) || '255,185,0');   // bundle 147: second colour
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
    '@media (prefers-reduced-motion:reduce){.bm-modal-backdrop.show,.bm-modal-backdrop.show .bm-modal,.modal-bg.on,.modal-bg.on>.modal{animation:none}' + sel(LIFT, ':hover') + '{transform:none}}' +

    // ══ bundle 147: pop-up cards ══════════════════════════════════════════
    // Shell (every Beacon pop-up): rises in, lit from the top in the firm colour,
    // signature shape (one tighter corner), hairline crown, deep shadow.
    '@keyframes b147-fade{from{opacity:0}to{opacity:1}}' +
    '@keyframes b147-rise{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}' +
    '.bm-modal-backdrop.show{animation:b147-fade .2s ease-out;backdrop-filter:blur(3px)!important;-webkit-backdrop-filter:blur(3px)!important;background:radial-gradient(1200px 600px at 50% 30%,rgba(var(--acc-rgb),.07),rgba(4,7,16,.86) 60%)!important}' +
    '.bm-modal-backdrop.show .bm-modal{animation:b147-rise .32s cubic-bezier(.2,.8,.2,1)}' +
    '.bm-modal{position:relative;overflow:hidden;border-radius:20px 20px 20px 6px!important;border:1px solid rgba(255,255,255,.08)!important;' +
      'background:radial-gradient(900px 260px at 12% -10%,rgba(var(--acc-rgb),.16),transparent 60%),radial-gradient(600px 240px at 100% 0%,rgba(var(--acc2-rgb),.07),transparent 65%),linear-gradient(180deg,#101C33,#0B1426)!important;' +
      'box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 0 0 1px rgba(0,0,0,.35),0 30px 80px -20px rgba(0,0,0,.85),0 0 60px -20px rgba(var(--acc-rgb),.35)!important}' +
    '.bm-modal::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,rgba(var(--acc-rgb),0),rgba(var(--acc-rgb),.95) 30%,rgba(var(--acc2-rgb),.85) 70%,rgba(var(--acc2-rgb),0));pointer-events:none;z-index:2}' +
    '.bm-modal-hd{border-bottom:1px solid rgba(255,255,255,.06)!important;padding:22px 28px 18px!important;position:relative}' +
    '.bm-modal-eye{display:inline-flex;align-items:center;gap:8px;color:rgba(var(--acc-rgb),.95)!important;font-size:10.5px!important;letter-spacing:.22em!important}' +
    '.bm-modal-eye::before{content:"";width:6px;height:6px;border-radius:50%;background:rgb(var(--acc-rgb));box-shadow:0 0 0 3px rgba(var(--acc-rgb),.18),0 0 10px rgba(var(--acc-rgb),.8)}' +
    '.bm-modal-title{font-size:28px!important;letter-spacing:-.2px!important;line-height:1.05}' +
    '.bm-modal-close{border-radius:50%!important;background:rgba(255,255,255,.03)!important;border-color:rgba(255,255,255,.1)!important;transition:transform .2s,background-color .2s,border-color .2s!important}' +
    '.bm-modal-close:hover{transform:rotate(90deg);background:rgba(var(--acc-rgb),.12)!important;border-color:rgba(var(--acc-rgb),.5)!important}' +
    '.bm-modal-body{padding:24px 28px 28px!important}' +

    // The other pop-up family (.modal: Learn more, Edit client, …): same rise, crown and shadow
    '.modal-bg.on{animation:b147-fade .2s ease-out}.modal-bg.on>.modal{animation:b147-rise .32s cubic-bezier(.2,.8,.2,1)}' +
    '.modal-bg>.modal{position:relative;border-radius:20px 20px 20px 6px!important;box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 0 0 1px rgba(0,0,0,.35),0 30px 80px -20px rgba(0,0,0,.85),0 0 60px -20px rgba(var(--acc-rgb),.35)!important}' +
    '.modal-bg>.modal::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;border-radius:20px 20px 0 0;background:linear-gradient(90deg,rgba(var(--acc-rgb),0),rgba(var(--acc-rgb),.95) 30%,rgba(var(--acc2-rgb),.85) 70%,rgba(var(--acc2-rgb),0));pointer-events:none;z-index:2}' +

    // Program pop-up content
    '.pm{display:flex;flex-direction:column;gap:18px}' +
    '.pm-hero{display:grid;grid-template-columns:150px minmax(0,1fr);gap:22px;align-items:center}' +
    '.pm-ring{position:relative;width:150px;height:150px}' +
    '.pm-ring svg{width:100%;height:100%;transform:rotate(-90deg);filter:drop-shadow(0 0 14px rgba(var(--acc-rgb),.25))}' +
    '.pm-ring circle{fill:none;stroke-width:11;stroke-linecap:round}' +
    '.pm-ring-bg{stroke:rgba(255,255,255,.06)}.pm-ring-elig{stroke:rgb(var(--acc-rgb))}.pm-ring-enr{stroke:#22c55e}' +
    '.pm-ring-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}' +
    '.pm-ring-c b{font-size:30px;font-weight:800;color:#fff;letter-spacing:-.5px;font-variant-numeric:tabular-nums}' +
    '.pm-ring-c span{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--mu);max-width:90px;line-height:1.3;margin-top:2px}' +
    '.pm-where{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--mu);margin-bottom:10px}' +
    '.pm-pin{width:8px;height:8px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:rgb(var(--acc2-rgb));box-shadow:0 0 8px rgba(var(--acc2-rgb),.7)}' +
    '.pm-ticket{position:relative;padding:16px 20px 15px;border-radius:16px 16px 16px 4px;border:1px solid rgba(var(--acc2-rgb),.28);' +
      'background:linear-gradient(135deg,rgba(var(--acc2-rgb),.12),rgba(var(--acc2-rgb),.02) 60%),rgba(255,255,255,.015);box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 16px 36px -18px rgba(var(--acc2-rgb),.45)}' +
    '.pm-ticket-l{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(var(--acc2-rgb),.9);font-weight:700}' +
    '.pm-ticket-v{font-size:40px;font-weight:800;color:#fff;letter-spacing:-1px;line-height:1.05;margin-top:4px;font-variant-numeric:tabular-nums;text-shadow:0 0 24px rgba(var(--acc2-rgb),.35)}' +
    '.pm-ticket-v small{font-size:15px;font-weight:600;color:var(--mu);margin-left:4px;letter-spacing:0;text-shadow:none}' +
    '.pm-ticket-n{font-size:11px;color:var(--mu);margin-top:4px}' +
    '.pm-ticket-none{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.02);box-shadow:none}.pm-ticket-none .pm-ticket-l{color:var(--mu)}' +
    '.pm-chips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}' +
    '.pm-chip{display:flex;align-items:baseline;gap:8px;padding:11px 14px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);box-shadow:0 1px 0 rgba(255,255,255,.035) inset}' +
    '.pm-chip i{width:8px;height:8px;border-radius:2px;align-self:center;flex:none}' +
    '.pm-chip b{font-size:22px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums}.pm-chip span{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mu)}' +
    '.pm-chip-enr i{background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,.7)}.pm-chip-elig i{background:rgb(var(--acc-rgb));box-shadow:0 0 8px rgba(var(--acc-rgb),.7)}.pm-chip-na i{background:rgba(255,255,255,.22)}' +
    '.pm-bar{display:flex;height:6px;border-radius:6px;overflow:hidden;background:rgba(255,255,255,.05);margin-top:-6px}' +
    '.pm-bar span{display:block;height:100%}.pm-bar-enr{background:#22c55e}.pm-bar-elig{background:linear-gradient(90deg,rgba(var(--acc-rgb),.75),rgb(var(--acc-rgb)));box-shadow:0 0 12px rgba(var(--acc-rgb),.6)}.pm-bar-na{background:rgba(255,255,255,.08)}' +
    '.pm-lbl{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--mu);font-weight:700;margin-bottom:8px}' +
    '.pm-lbl-row{display:flex;align-items:center;gap:8px;margin-bottom:-8px}.pm-lbl-row em{font-style:normal;font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(var(--acc-rgb),.14);color:rgb(var(--acc-rgb));letter-spacing:.05em}' +
    '.pm-why{position:relative;padding:14px 18px 14px 20px;border-radius:12px;background:linear-gradient(90deg,rgba(var(--acc-rgb),.07),transparent 70%)}' +
    '.pm-why::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:2px;border-radius:2px;background:linear-gradient(180deg,rgb(var(--acc-rgb)),rgba(var(--acc2-rgb),.8))}' +
    '.pm-why p{margin:0;font-size:14.5px;line-height:1.55;color:#E8EEF7}' +
    '.pm-locs{display:flex;flex-direction:column;gap:6px}' +
    '.pm-loc{display:flex;align-items:center;gap:14px;padding:11px 14px;border-radius:11px;background:rgba(255,255,255,.022);border:1px solid rgba(255,255,255,.055);transition:transform .18s cubic-bezier(.2,.7,.2,1),border-color .18s,background-color .18s}' +
    '.pm-loc-go{cursor:pointer}.pm-loc-go:hover{transform:translateX(4px);border-color:rgba(var(--acc-rgb),.45);background:rgba(var(--acc-rgb),.06)}' +
    '.pm-loc-n{font:600 11px/1 "IBM Plex Mono",ui-monospace,monospace;color:rgba(var(--acc-rgb),.85);min-width:20px}' +
    '.pm-loc-a{flex:1;min-width:0;font-size:13.5px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.pm-loc-b{font-size:11px;color:var(--mu);padding:3px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.08);white-space:nowrap}' +
    '.pm-loc-x{color:rgba(var(--acc-rgb),.9);transition:transform .18s}.pm-loc-go:hover .pm-loc-x{transform:translateX(3px)}' +
    '.pm-more,.pm-empty{font-size:12.5px;color:var(--mu);padding:4px 2px}' +
    '.pm-cta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding-top:18px;border-top:1px solid rgba(255,255,255,.06)}' +
    '.pm-btn{display:inline-flex;align-items:center;gap:12px;border:0;cursor:pointer;padding:13px 16px 13px 20px;border-radius:12px 12px 12px 4px;font-size:14px;font-weight:700;color:#06101F;' +
      'background:linear-gradient(135deg,rgb(var(--acc-rgb)),rgba(var(--acc-rgb),.78));box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 12px 28px -10px rgba(var(--acc-rgb),.75);transition:transform .16s,box-shadow .2s}' +
    '.pm-btn:hover{transform:translateY(-1px);box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 16px 34px -10px rgba(var(--acc-rgb),.9)}' +
    '.pm-btn-a{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:rgba(6,16,31,.18);transition:transform .16s}.pm-btn:hover .pm-btn-a{transform:translateX(3px)}' +
    '.pm-cta-n{font-size:11.5px;color:var(--mu)}' +
    // Location pop-up content
    '.lp-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:12px;margin-top:-8px}' +
    '.lp-contract{padding:14px 18px;border-radius:16px 16px 16px 4px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.022);box-shadow:0 1px 0 rgba(255,255,255,.04) inset}' +
    '.lp-c-top{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '.lp-c-st{font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:2px 8px;border-radius:10px;background:rgba(34,197,94,.12);color:#4ade80}' +
    '.lp-c-main{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:8px}.lp-c-main b{font-size:17px;color:#fff;font-variant-numeric:tabular-nums}.lp-c-main span{font-size:12px;color:var(--mu)}' +
    '.lp-c-bar{height:5px;border-radius:5px;background:rgba(255,255,255,.06);margin-top:12px;overflow:hidden}.lp-c-bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,rgba(var(--acc-rgb),.5),rgb(var(--acc-rgb)))}' +
    '.lp-c-ax{display:flex;justify-content:space-between;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mu);margin-top:5px}' +
    '.lp-c-soon{border-color:rgba(245,158,11,.35);background:linear-gradient(135deg,rgba(245,158,11,.10),rgba(255,255,255,.015))}.lp-c-soon .lp-c-main span{color:#fbbf24;font-weight:700}.lp-c-soon .lp-c-bar i{background:linear-gradient(90deg,#f59e0b,#fbbf24)}' +
    '.lp-c-past{border-color:rgba(239,68,68,.35);background:linear-gradient(135deg,rgba(239,68,68,.10),rgba(255,255,255,.015))}.lp-c-past .lp-c-main span{color:#f87171;font-weight:700}.lp-c-past .lp-c-bar i{background:#ef4444}' +
    '.lp-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}' +
    '.lp-tile{position:relative;padding:13px 16px 12px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.06);box-shadow:0 1px 0 rgba(255,255,255,.035) inset;overflow:hidden}' +
    '.lp-tile::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:2px;border-radius:2px;background:rgba(var(--acc-rgb),.8)}' +
    '.lp-t-gas::before{background:#22d3ee}.lp-t-sq::before{background:rgba(255,255,255,.35)}' +
    '.lp-tile-l{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mu);font-weight:700}' +
    '.lp-tile-v{font-size:21px;font-weight:800;color:#fff;margin-top:4px;font-variant-numeric:tabular-nums}.lp-tile-v small{font-size:11.5px;color:var(--mu);font-weight:600;margin-left:4px}' +
    '.lp-tile-s{font-size:11px;color:var(--mu);margin-top:3px}' +
    '.lp-chips{display:flex;flex-wrap:wrap;gap:8px}.lp-chip{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:#E8EEF7;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}' +
    '.lp-chip em{font-style:normal;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--mu)}' +
    '.lp .pm-ticket-v{font-size:34px}' +
    '@media (max-width:640px){.lp-grid{grid-template-columns:1fr}}' +
    '@media (max-width:640px){.pm-hero{grid-template-columns:1fr;justify-items:center}.pm-hero-r{width:100%}.pm-chips{grid-template-columns:1fr}}' +

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
