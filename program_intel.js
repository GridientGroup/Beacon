// STS Portal Build: 2026-05-04T17:34:03Z-v100000
// STS Portal · Program Intelligence Renderer
// Builds rich data cards inline beneath each program subpage's hero.
// Components: marquee ticker · comparison bars · sparkline · YoY bar chart
//             · LL97 compliance gauge · DSIRE rebate matrix · markets list
//             · sources strip
//
// Usage: window.populateProgramIntel(pid, state, portfolioCtx)
//   pid: 'procurement' | 'dr' | 'bps' | ...
//   state: 'eligible' | 'enrolled' | 'active' | 'results' | 'new'
//   portfolioCtx: { state:'PA', btype:'healthcare', sites:288, spend:2400000 }

(function(){
  'use strict';

  // ------------------------------------------------------------------
  // CSS — injected once on first call
  // ------------------------------------------------------------------
  function injectCSS(){
    if (document.getElementById('program-intel-css')) return;
    const css = `
.pi-wrap{padding:0 52px 12px;max-width:1060px;margin:0 auto}
.pi-card{background:rgba(255,255,255,.025);border:1px solid var(--b1,rgba(255,255,255,.08));border-radius:14px;padding:24px 26px;margin:0 0 18px;position:relative;overflow:hidden}
.pi-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#add540 0%,#06b6d4 50%,transparent 100%);box-shadow:0 0 14px rgba(173,213,64,.45)}
.pi-eyebrow{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.18em;color:#add540;text-transform:uppercase;display:flex;align-items:center;gap:10px;margin-bottom:12px}
.pi-eyebrow .pi-dot{display:inline-block;width:6px;height:6px;background:#add540;border-radius:50%;box-shadow:0 0 8px rgba(173,213,64,.7);animation:pi-pulse 1.8s ease-in-out infinite}
@keyframes pi-pulse{0%,100%{opacity:.5}50%{opacity:1}}
.pi-eyebrow .pi-stamp{margin-left:auto;color:rgba(255,255,255,.4);letter-spacing:.12em;font-size:9px;font-weight:600}
.pi-headline{font-family:Fraunces,Georgia,serif;font-size:26px;font-weight:700;line-height:1.18;letter-spacing:-.4px;color:#fff;margin-bottom:10px}
.pi-summary{font-size:13.5px;color:rgba(255,255,255,.65);line-height:1.6;margin-bottom:0}

/* TICKER */
.pi-ticker{background:linear-gradient(90deg,rgba(20,35,76,.6),rgba(28,49,102,.45));border:1px solid rgba(173,213,64,.18);border-radius:10px;padding:0;margin:14px 0 0;overflow:hidden;position:relative;height:40px}
.pi-ticker::before,.pi-ticker::after{content:'';position:absolute;top:0;bottom:0;width:60px;z-index:2;pointer-events:none}
.pi-ticker::before{left:0;background:linear-gradient(90deg,rgba(11,21,46,.95),transparent)}
.pi-ticker::after{right:0;background:linear-gradient(-90deg,rgba(11,21,46,.95),transparent)}
.pi-ticker-track{display:flex;gap:0;align-items:center;height:100%;animation:pi-scroll 48s linear infinite;will-change:transform}
.pi-ticker:hover .pi-ticker-track{animation-play-state:paused}
@keyframes pi-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.pi-tk-item{display:inline-flex;align-items:center;gap:8px;padding:0 28px;border-right:1px solid rgba(255,255,255,.07);height:24px;flex-shrink:0;font-family:'IBM Plex Mono',monospace;white-space:nowrap}
.pi-tk-label{color:rgba(255,255,255,.55);font-size:10.5px;font-weight:600;letter-spacing:.1em}
.pi-tk-value{color:#fff;font-size:13px;font-weight:700;letter-spacing:-.2px}
.pi-tk-delta{display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:4px;font-size:9.5px;font-weight:700;letter-spacing:.05em}
.pi-tk-delta.up{background:rgba(34,197,94,.18);color:#22c55e}
.pi-tk-delta.dn{background:rgba(239,68,68,.18);color:#ef4444}
.pi-tk-delta.flat{background:rgba(255,255,255,.06);color:rgba(255,255,255,.55)}

/* METRIC TILES */
.pi-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:18px}
.pi-tile{background:rgba(255,255,255,.04);border:1px solid var(--b1,rgba(255,255,255,.08));border-radius:11px;padding:14px 16px;position:relative;overflow:hidden}
.pi-tile-stripe{position:absolute;top:0;left:0;right:0;height:2px}
.pi-tile-lbl{font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.16em;color:rgba(255,255,255,.5);text-transform:uppercase;margin-bottom:5px}
.pi-tile-num{font-family:'IBM Plex Sans',sans-serif;font-weight:800;font-size:32px;line-height:1;letter-spacing:-.8px;color:#fff;display:flex;align-items:baseline;gap:5px}
.pi-tile-num .pi-suffix{font-size:14px;font-weight:600;color:rgba(255,255,255,.55);letter-spacing:0}
.pi-tile-sub{font-size:10.5px;color:rgba(255,255,255,.5);margin-top:6px;font-family:'IBM Plex Mono',monospace;letter-spacing:.04em;line-height:1.4}

/* COMPARISON BARS */
.pi-bars{margin-top:16px;display:flex;flex-direction:column;gap:10px}
.pi-bar-row{display:grid;grid-template-columns:140px 1fr 90px;gap:14px;align-items:center}
.pi-bar-label{font-size:11px;color:rgba(255,255,255,.7);font-weight:600;letter-spacing:.04em;font-family:'IBM Plex Mono',monospace;text-transform:uppercase}
.pi-bar-track{height:24px;background:rgba(255,255,255,.04);border-radius:5px;overflow:hidden;position:relative}
.pi-bar-fill{height:100%;border-radius:5px;display:flex;align-items:center;padding:0 10px;color:#fff;font-size:11.5px;font-weight:700;font-family:'IBM Plex Mono',monospace;letter-spacing:-.2px;transition:width 1s cubic-bezier(.2,.8,.2,1)}
.pi-bar-val{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:700;color:#fff;text-align:right}

/* SPARKLINE */
.pi-spark{display:flex;align-items:center;gap:12px}
.pi-spark svg{flex-shrink:0}
.pi-spark-cap{font-size:11px;color:rgba(255,255,255,.55);font-family:'IBM Plex Mono',monospace;letter-spacing:.04em}

/* YOY BARS (vertical) */
.pi-yoy{display:flex;align-items:flex-end;gap:8px;height:140px;padding:0 0 24px;position:relative;margin-top:20px}
.pi-yoy-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;position:relative}
.pi-yoy-bar{width:100%;background:linear-gradient(180deg,rgba(173,213,64,.85) 0%,rgba(173,213,64,.4) 100%);border-radius:5px 5px 0 0;position:relative;transition:height 1.2s cubic-bezier(.2,.8,.2,1);min-height:8px}
.pi-yoy-bar.cap{background:linear-gradient(180deg,rgba(245,158,11,.85) 0%,rgba(245,158,11,.4) 100%)}
.pi-yoy-bar.current{background:linear-gradient(180deg,rgba(6,182,212,.95) 0%,rgba(6,182,212,.4) 100%)}
.pi-yoy-num{position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;color:#fff;white-space:nowrap}
.pi-yoy-lbl{position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:600;color:rgba(255,255,255,.55);letter-spacing:.05em;white-space:nowrap}

/* LL97 GAUGE */
.pi-gauge{display:flex;align-items:center;justify-content:space-around;gap:24px;margin-top:14px;flex-wrap:wrap}
.pi-gauge-svg{flex-shrink:0}
.pi-gauge-info{flex:1;min-width:200px}
.pi-gauge-headline{font-family:Fraunces,serif;font-size:22px;font-weight:700;color:#fff;letter-spacing:-.3px;margin-bottom:8px}
.pi-gauge-detail{font-size:12.5px;color:rgba(255,255,255,.62);line-height:1.55}

/* TIMELINE */
.pi-timeline{display:flex;align-items:center;gap:0;margin-top:14px;padding:14px 4px;background:rgba(255,255,255,.025);border-radius:10px;border:1px solid var(--b1,rgba(255,255,255,.06))}
.pi-tl-step{flex:1;text-align:center;position:relative;padding:6px 4px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:rgba(255,255,255,.5);font-weight:600;letter-spacing:.05em}
.pi-tl-step.active{color:#add540}
.pi-tl-step.active::before{content:'';position:absolute;top:0;left:25%;right:25%;height:2px;background:#add540;box-shadow:0 0 8px rgba(173,213,64,.7)}
.pi-tl-step.future{color:rgba(255,255,255,.35)}
.pi-tl-step + .pi-tl-step::after{content:'';position:absolute;left:-2px;top:50%;width:4px;height:1px;background:rgba(255,255,255,.15)}

/* MARKETS / FRAMEWORKS LIST */
.pi-list{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.pi-row{display:grid;grid-template-columns:1.4fr 80px 1fr;gap:14px;align-items:center;padding:11px 14px;background:rgba(255,255,255,.025);border:1px solid var(--b1,rgba(255,255,255,.06));border-radius:9px}
.pi-row-name{font-size:13px;color:#fff;font-weight:600;font-family:'IBM Plex Sans',sans-serif}
.pi-row-val{font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:800;color:#06b6d4;letter-spacing:-.3px;text-align:right}
.pi-row-note{font-size:11px;color:rgba(255,255,255,.55);line-height:1.45}

/* PIE / SHARE BARS for Recovery */
.pi-share{display:flex;flex-direction:column;gap:7px;margin-top:14px}
.pi-share-row{display:grid;grid-template-columns:1fr 60px;gap:10px;align-items:center}
.pi-share-track{height:18px;background:rgba(255,255,255,.04);border-radius:4px;overflow:hidden;position:relative}
.pi-share-fill{height:100%;background:linear-gradient(90deg,#06b6d4,#add540);border-radius:4px;display:flex;align-items:center;padding:0 8px;color:rgba(0,0,0,.8);font-size:10.5px;font-weight:700;font-family:'IBM Plex Mono',monospace;transition:width 1s ease}
.pi-share-pct{font-family:'IBM Plex Mono',monospace;font-size:11px;color:rgba(255,255,255,.65);text-align:right;font-weight:600}

/* SOURCES STRIP */
.pi-sources{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:18px;padding-top:14px;border-top:1px dashed rgba(255,255,255,.1)}
.pi-sources-lbl{font-family:'IBM Plex Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.18em;color:rgba(255,255,255,.4);text-transform:uppercase;margin-right:4px}
.pi-source{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:rgba(255,255,255,.04);border:1px solid var(--b1,rgba(255,255,255,.08));border-radius:5px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:600;color:rgba(255,255,255,.7);letter-spacing:.02em;text-decoration:none;transition:all .15s}
.pi-source:hover{border-color:rgba(173,213,64,.4);color:#add540;background:rgba(173,213,64,.06)}
.pi-source-date{color:rgba(255,255,255,.4);font-size:9.5px}

/* TOP ROW — hero (left) + intel (right) side-by-side */
.pi-top-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;align-items:stretch;background:rgba(11,21,46,.5);border-bottom:1px solid var(--b1,rgba(255,255,255,.08))}
.pi-top-row > .pi-hero-col{padding:38px 36px 30px !important;display:flex !important;flex-direction:column;justify-content:center;position:relative;overflow:hidden;border-right:1px solid rgba(255,255,255,.06)}
.pi-top-row > .pi-hero-col h1{font-size:38px !important;line-height:1.08 !important;letter-spacing:-1px !important;margin-bottom:14px !important}
.pi-top-row > .pi-hero-col p{font-size:14px !important;line-height:1.6 !important;margin-bottom:22px !important;max-width:100% !important}
.pi-top-row > .pi-hero-col > div:last-child{margin-bottom:0 !important}
.pi-top-row > .pi-hero-col [style*="font-size:56"]{font-size:38px !important}
.pi-top-row > .pi-wrap{padding:0 !important;margin:0 !important;max-width:none !important}
.pi-top-row > .pi-wrap > .pi-card{border-radius:0 !important;border-top:none !important;border-right:none !important;border-bottom:none !important;border-left:none !important;margin:0 !important;height:100%;background:rgba(255,255,255,.02)}
.pi-top-row > .pi-wrap > .pi-card::before{display:none}
.pi-top-row > .pi-wrap > .pi-card .pi-eyebrow{padding-top:6px}
@media (max-width:980px){
  .pi-top-row{grid-template-columns:1fr}
  .pi-top-row > .pi-hero-col{border-right:none;border-bottom:1px solid rgba(255,255,255,.08);padding:28px 24px !important}
  .pi-top-row > .pi-hero-col h1{font-size:30px !important}
}

/* RESPONSIVE */
@media (max-width:780px){
  .pi-wrap{padding:0 24px 12px}
  .pi-card{padding:18px 18px}
  .pi-headline{font-size:21px}
  .pi-bar-row{grid-template-columns:90px 1fr 70px}
}
`;
    const tag = document.createElement('style');
    tag.id = 'program-intel-css';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  const fmt = (n, d) => Number(n).toLocaleString(undefined, {maximumFractionDigits: d||0, minimumFractionDigits: d||0});
  const esc = (s) => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const pct = (a, b) => b ? (((a-b)/b)*100) : 0;
  const arrow = (delta) => delta > 0.5 ? 'up' : delta < -0.5 ? 'dn' : 'flat';

  // Sparkline SVG
  function sparkline(data, w, h, color){
    if (!data || data.length < 2) return '';
    w = w || 100; h = h || 28; color = color || '#add540';
    const min = Math.min(...data), max = Math.max(...data);
    const span = max - min || 1;
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => `${(i*step).toFixed(1)},${(h - ((v-min)/span)*(h-4) - 2).toFixed(1)}`).join(' ');
    const lastX = ((data.length-1)*step).toFixed(1);
    const lastY = (h - ((data[data.length-1]-min)/span)*(h-4) - 2).toFixed(1);
    return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lastX}" cy="${lastY}" r="2.5" fill="${color}"/></svg>`;
  }

  // Sources strip
  function sourcesHTML(sources){
    if (!sources || !sources.length) return '';
    const items = sources.map(s => `<a class="pi-source" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}<span class="pi-source-date">${esc(s.date||'')}</span></a>`).join('');
    return `<div class="pi-sources"><span class="pi-sources-lbl">Sources</span>${items}</div>`;
  }

  // ------------------------------------------------------------------
  // PROGRAM RENDERERS
  // ------------------------------------------------------------------

  function renderProcurement(d, ctx){
    const st = (ctx.state || 'PA').toUpperCase();
    const s = d.byState[st] || d.byState._DEFAULT;
    const spend = ctx.spend || 0;

    let body = '';
    if (s.deregulated) {
      const savingsLow = s.savingsLow, savingsHigh = s.savingsHigh;
      const dollarLow = spend ? Math.round(spend * savingsLow / 100) : null;
      const dollarHigh = spend ? Math.round(spend * savingsHigh / 100) : null;
      const spreadCents = (s.defaultRate - s.competitiveRate).toFixed(2);
      const tickerItems = [
        {label:`${st} DEFAULT`, value:`${s.defaultRate}¢/kWh`, delta:pct(s.defaultRate, s.trend[0])},
        {label:`${st} COMPETITIVE`, value:`${s.competitiveRate}¢/kWh`, delta:0, flat:true},
        {label:'SPREAD', value:`${spreadCents}¢/kWh`, delta:0, flat:true},
        {label:`SUPPLIERS IN ${st}`, value:`${s.suppliers}`, delta:0, flat:true},
      ];
      body = `
        ${ticker(tickerItems)}
        <div class="pi-tiles">
          <div class="pi-tile"><div class="pi-tile-stripe" style="background:#ef4444;box-shadow:0 0 10px #ef4444"></div>
            <div class="pi-tile-lbl">Utility Default</div>
            <div class="pi-tile-num">${s.defaultRate}<span class="pi-suffix">¢/kWh</span></div>
            <div class="pi-tile-sub">${esc(s.utility)}</div></div>
          <div class="pi-tile"><div class="pi-tile-stripe" style="background:#22c55e;box-shadow:0 0 10px #22c55e"></div>
            <div class="pi-tile-lbl">Recent Competitive</div>
            <div class="pi-tile-num">${s.competitiveRate}<span class="pi-suffix">¢/kWh</span></div>
            <div class="pi-tile-sub">via STS-style RFP</div></div>
          <div class="pi-tile"><div class="pi-tile-stripe" style="background:#add540;box-shadow:0 0 10px #add540"></div>
            <div class="pi-tile-lbl">Implied Savings</div>
            <div class="pi-tile-num">${savingsLow}-${savingsHigh}<span class="pi-suffix">%</span></div>
            <div class="pi-tile-sub">vs default supply rate</div></div>
          ${dollarLow ? `<div class="pi-tile"><div class="pi-tile-stripe" style="background:#06b6d4;box-shadow:0 0 10px #06b6d4"></div>
            <div class="pi-tile-lbl">Annualized $</div>
            <div class="pi-tile-num">$${fmt(Math.round(dollarLow/1000))}K<span class="pi-suffix">– $${fmt(Math.round(dollarHigh/1000))}K</span></div>
            <div class="pi-tile-sub">on $${fmt(Math.round(spend/1000))}K annual spend</div></div>` : ''}
        </div>
        <div class="pi-bars">
          <div class="pi-bar-row"><div class="pi-bar-label">Default</div>
            <div class="pi-bar-track"><div class="pi-bar-fill" style="width:0;background:linear-gradient(90deg,#ef4444,#dc2626)" data-pct="100">${s.defaultRate}¢</div></div>
            <div class="pi-bar-val">${s.defaultRate}¢/kWh</div></div>
          <div class="pi-bar-row"><div class="pi-bar-label">Competitive</div>
            <div class="pi-bar-track"><div class="pi-bar-fill" style="width:0;background:linear-gradient(90deg,#22c55e,#16a34a)" data-pct="${(s.competitiveRate/s.defaultRate*100).toFixed(1)}">${s.competitiveRate}¢</div></div>
            <div class="pi-bar-val">${s.competitiveRate}¢/kWh</div></div>
        </div>
        ${s.trend ? `<div style="margin-top:18px;display:flex;align-items:center;gap:14px;padding:10px 14px;background:rgba(255,255,255,.025);border-radius:8px;border:1px solid var(--b1,rgba(255,255,255,.06))">
          <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.55);font-weight:700">5-YR DEFAULT TRAJECTORY</span>
          ${sparkline(s.trend, 220, 32, '#ef4444')}
          <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:rgba(255,255,255,.7);margin-left:auto"><span style="color:#22c55e">${s.trend[0]}¢</span> → <span style="color:#ef4444">${s.trend[s.trend.length-1]}¢</span> · <span style="color:#ef4444;font-weight:700">+${pct(s.trend[s.trend.length-1], s.trend[0]).toFixed(0)}%</span></span>
        </div>` : ''}
        <div style="margin-top:14px;font-size:13px;color:rgba(255,255,255,.7);line-height:1.65;font-style:italic">${esc(s.note)}</div>
      `;
    } else {
      body = `<div class="pi-tiles">
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#64748b"></div>
          <div class="pi-tile-lbl">Market Type</div>
          <div class="pi-tile-num" style="font-size:24px">Regulated</div>
          <div class="pi-tile-sub">No retail competition for commercial</div></div>
        ${s.defaultRate ? `<div class="pi-tile"><div class="pi-tile-stripe" style="background:#ef4444"></div>
          <div class="pi-tile-lbl">Avg Commercial Rate</div>
          <div class="pi-tile-num">${s.defaultRate}<span class="pi-suffix">¢/kWh</span></div>
          <div class="pi-tile-sub">EIA Form 861 commercial avg</div></div>` : ''}
      </div>
      <div style="margin-top:14px;font-size:13px;color:rgba(255,255,255,.7);line-height:1.65;font-style:italic">${esc(s.note)}</div>`;
    }
    return wrap('procurement', d, body);
  }

  function renderDR(d, ctx){
    const st = (ctx.state || 'PA').toUpperCase();
    const iso = window.STATE_TO_ISO[st] || 'SE';
    const r = d.byISO[iso] || d.byISO.SE;
    // ── PEAK LOAD: INVERTED LOAD FACTOR + HARDCODED RATE (fixed 2026-09-17) ─
    // This line was:
    //     Math.round((ctx.spend / 0.11) / 8760 * 0.4)
    // Two independent errors, compounding:
    //
    // 1. THE LOAD FACTOR WAS MULTIPLIED, NOT DIVIDED. The identity is stated
    //    in this codebase's own comment (vpp_opportunities.js:128):
    //        peak_kw x 8760 x load_factor = annual_kwh
    //    so peak = annual / (8760 x lf). Multiplying by 0.4 instead of
    //    dividing understates peak by 1/0.4^2 = 6.25x. It was also
    //    physically impossible as labelled: annual/8760 is AVERAGE kW, and
    //    peak can never be below average, yet the tile reads "est. peak load".
    //
    // 2. THE RATE WAS HARDCODED AT 11c. Beacon loads real per-state EIA
    //    commercial rates, spanning 8.66c to 26.78c. This is the same bug
    //    fixed across eight sites in rev49; this was a ninth consumer.
    //
    // Both are fixed by deferring to the single implementations that already
    // exist: window.beaconRateFor for the rate, BeaconVPP.estimatePeakKW for
    // the peak. One formula, one place — the point of rev49.
    //
    // CAVEAT, STATED BECAUSE IT CANNOT BE FIXED HERE: ctx.spend is a
    // MIXED electric + gas dollar total, and this converts all of it at an
    // electric rate, so gas dollars become phantom kWh. The context this
    // function receives ({state, btype, city, sqft, spend}) carries no fuel
    // split. The tile is directional, and it is now directionally right
    // rather than 6x wrong, but it will read high for a gas-heavy portfolio.
    // The real fix is to pass electric kWh in ctx.
    let peakKW = 0;
    if (ctx.spend) {
      const $perKwh = (typeof window.beaconRateFor === 'function')
        ? window.beaconRateFor({ type: 'electric', state: st })
        : 0.1275;
      const annualKwh = ctx.spend / $perKwh;
      peakKW = (window.BeaconVPP && typeof window.BeaconVPP.estimatePeakKW === 'function')
        ? Math.round(window.BeaconVPP.estimatePeakKW(annualKwh, ctx.btype))
        : Math.round(annualKwh / (8760 * 0.40));
    }
    const peakMW = peakKW / 1000;
    const annualRev = peakMW * (r.annualRevPerMW || 0);

    const tickerItems = [];
    if (r.rates) {
      for (const rt of r.rates) {
        let prev = null;
        for (const rt0 of r.rates) { if (rt0 === rt) break; prev = rt0; }
        const delta = prev ? pct(rt.value, prev.value) : 0;
        tickerItems.push({label:`${iso} ${rt.label}`, value:`$${rt.value < 100 ? rt.value.toFixed(2) : fmt(rt.value)}`, delta, flat: !prev});
      }
    } else {
      tickerItems.push({label:`${iso} ZONE`, value:r.zone, delta:0, flat:true});
    }

    let yoyHTML = '';
    if (r.rates && r.rates.length >= 2) {
      const max = Math.max(...r.rates.map(x => x.value));
      yoyHTML = `<div class="pi-yoy">
        ${r.rates.map((rt, i) => {
          const h = (rt.value / max) * 100;
          const cls = rt.cap ? 'cap' : (rt.status === 'current' ? 'current' : '');
          const unit = rt.unit ? '' : '/MW-d';
          return `<div class="pi-yoy-col">
            <div class="pi-yoy-num">$${rt.value < 100 ? rt.value.toFixed(2) : fmt(rt.value)}${rt.cap ? ' <span style="color:#f59e0b">★</span>' : ''}</div>
            <div class="pi-yoy-bar ${cls}" data-h="${h.toFixed(1)}"></div>
            <div class="pi-yoy-lbl">${rt.label}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:36px;font-size:10px;font-family:'IBM Plex Mono',monospace;color:rgba(255,255,255,.45);letter-spacing:.05em;text-align:center">
        ${r.rates[0].unit ? r.rates[0].unit : '$/MW-day · cleared capacity'} · <span style="color:#f59e0b">★</span> = cleared at FERC cap
      </div>`;
    }

    const body = `
      ${ticker(tickerItems)}
      <div class="pi-tiles">
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#06b6d4;box-shadow:0 0 10px #06b6d4"></div>
          <div class="pi-tile-lbl">Your ISO/RTO</div>
          <div class="pi-tile-num" style="font-size:26px">${iso}</div>
          <div class="pi-tile-sub">${esc(r.zone || 'Zone varies')}</div></div>
        ${r.rates ? `<div class="pi-tile"><div class="pi-tile-stripe" style="background:#add540;box-shadow:0 0 10px #add540"></div>
          <div class="pi-tile-lbl">Latest Cleared</div>
          <div class="pi-tile-num">$${r.rates[r.rates.length-1].value < 100 ? r.rates[r.rates.length-1].value.toFixed(2) : fmt(r.rates[r.rates.length-1].value)}</div>
          <div class="pi-tile-sub">${esc(r.rates[r.rates.length-1].unit || '$/MW-day')} · ${esc(r.rates[r.rates.length-1].label)}</div></div>` : ''}
        ${r.annualRevPerMW ? `<div class="pi-tile"><div class="pi-tile-stripe" style="background:#22c55e;box-shadow:0 0 10px #22c55e"></div>
          <div class="pi-tile-lbl">Annual $/MW</div>
          <div class="pi-tile-num">$${fmt(Math.round(r.annualRevPerMW/1000))}K</div>
          <div class="pi-tile-sub">per MW of committed reduction</div></div>` : ''}
        ${peakMW > 0 && annualRev > 0 ? `<div class="pi-tile"><div class="pi-tile-stripe" style="background:#f59e0b;box-shadow:0 0 10px #f59e0b"></div>
          <div class="pi-tile-lbl">Est. Portfolio Revenue</div>
          <div class="pi-tile-num">$${fmt(Math.round(annualRev/1000))}<span class="pi-suffix">K/yr</span></div>
          <div class="pi-tile-sub">at ~${peakMW.toFixed(1)} MW est. peak load</div></div>` : ''}
      </div>
      ${yoyHTML}
      <div style="margin-top:14px;font-size:13px;color:rgba(255,255,255,.7);line-height:1.65;font-style:italic">${esc(r.note)}</div>
    `;
    return wrap('dr', d, body);
  }

  function renderBPS(d, ctx){
    const st = (ctx.state || 'PA').toUpperCase();
    const city = (ctx.city || '').trim();
    const key = `${st}:${city}`;
    let j = d.byJurisdiction[key];
    if (!j) {
      const stateKey = Object.keys(d.byJurisdiction).find(k => k.startsWith(st + ':'));
      j = stateKey ? d.byJurisdiction[stateKey] : d.byJurisdiction._DEFAULT;
    }

    let body = '';
    if (j && j.ordinance) {
      const btype = (ctx.btype || 'office').toLowerCase().replace(/[^a-z]/g,'_');
      const cap1 = j.caps && j.caps[btype] ? j.caps[btype].p1 : (j.caps && j.caps.office ? j.caps.office.p1 : null);
      const cap2 = j.caps && j.caps[btype] ? j.caps[btype].p2 : (j.caps && j.caps.office ? j.caps.office.p2 : null);
      const tickerItems = [
        {label:'ORDINANCE', value:j.ordinance, delta:0, flat:true},
        {label:'PHASE', value:j.phases[j.currentPhase] || 'Phase 1', delta:0, flat:true},
        cap1 != null ? {label:`P1 CAP (${btype.toUpperCase()})`, value:`${cap1} kg/sqft`, delta:0, flat:true} : null,
        cap2 != null ? {label:`P2 CAP (2030)`, value:`${cap2} kg/sqft`, delta:cap1 ? pct(cap2,cap1) : 0} : null,
        j.penalty != null ? {label:'PENALTY', value:typeof j.penalty === 'number' ? `$${j.penalty}/ton` : j.penalty, delta:0, flat:true} : null,
      ].filter(Boolean);

      const gaugeSVG = renderGauge(57, 100);

      body = `
        ${ticker(tickerItems)}
        <div class="pi-tiles">
          <div class="pi-tile"><div class="pi-tile-stripe" style="background:#06b6d4"></div>
            <div class="pi-tile-lbl">Active Ordinance</div>
            <div class="pi-tile-num" style="font-size:22px">${esc(j.ordinance)}</div>
            <div class="pi-tile-sub">Effective ${esc(j.effective)}</div></div>
          ${cap1 != null ? `<div class="pi-tile"><div class="pi-tile-stripe" style="background:#add540"></div>
            <div class="pi-tile-lbl">2024-2029 Cap (${esc(btype)})</div>
            <div class="pi-tile-num">${cap1}<span class="pi-suffix">kgCO₂e/sqft</span></div>
            <div class="pi-tile-sub">Period 1 limit</div></div>` : ''}
          ${cap2 != null ? `<div class="pi-tile"><div class="pi-tile-stripe" style="background:#f59e0b"></div>
            <div class="pi-tile-lbl">2030+ Cap (Period 2)</div>
            <div class="pi-tile-num">${cap2}<span class="pi-suffix">kgCO₂e/sqft</span></div>
            <div class="pi-tile-sub">${cap1 ? `${Math.abs(pct(cap2,cap1)).toFixed(0)}% stricter than P1` : 'Stricter than P1'}</div></div>` : ''}
          ${j.penalty && typeof j.penalty === 'number' ? `<div class="pi-tile"><div class="pi-tile-stripe" style="background:#ef4444"></div>
            <div class="pi-tile-lbl">Penalty</div>
            <div class="pi-tile-num">$${j.penalty}<span class="pi-suffix">/ton CO₂e</span></div>
            <div class="pi-tile-sub">Per year over the limit</div></div>` : ''}
        </div>
        <div class="pi-gauge">
          ${gaugeSVG}
          <div class="pi-gauge-info">
            <div class="pi-gauge-headline">~57% of covered buildings are over 2030 caps today</div>
            <div class="pi-gauge-detail">Period 1 (2024-29) was tuned to catch the worst 9-11% of emitters. Period 2 (2030-34) tightens by ~40-45% across building types — most buildings compliant today will need real efficiency or electrification work to hit the 2030 line.</div>
          </div>
        </div>
        ${j.phases ? `<div class="pi-timeline">
          ${j.phases.map((p, i) => `<div class="pi-tl-step ${i === j.currentPhase ? 'active' : i < j.currentPhase ? '' : 'future'}">${esc(p)}</div>`).join('')}
        </div>` : ''}
        <div style="margin-top:14px;font-size:12.5px;color:rgba(255,255,255,.6);line-height:1.55;font-family:'IBM Plex Mono',monospace;letter-spacing:.02em">
          📅 Annual filing: <strong style="color:#fff">${esc(j.deadline||'TBD')}</strong> · Coverage: <strong style="color:#fff">${esc(j.coverage)}</strong>
        </div>
      `;
    } else {
      body = `<div class="pi-tiles">
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#64748b"></div>
          <div class="pi-tile-lbl">Status in ${esc(st)}</div>
          <div class="pi-tile-num" style="font-size:22px">No active BPS</div>
          <div class="pi-tile-sub">Track new ordinances; many proposals pending</div></div>
      </div>
      <div style="margin-top:14px;font-size:13px;color:rgba(255,255,255,.7);line-height:1.65">
        Building Performance Standards are accelerating across major cities. NYC, Boston, DC, Denver, Boulder, and Seattle all have active or imminent ordinances. ${esc(st)} portfolios with locations in those jurisdictions face fines for non-compliance.
      </div>`;
    }
    return wrap('bps', d, body);
  }

  function renderRebates(d, ctx){
    const st = (ctx.state || 'PA').toUpperCase();
    const r = d.byState[st] || d.byState._DEFAULT;
    const tickerItems = [
      {label:`${st} ACTIVE PROGRAMS`, value:`${r.programs}`, delta:0, flat:true},
      {label:'FEDERAL (IRA)', value:`${r.federal}`, delta:0, flat:true},
      {label:'HVAC', value:r.hvac.split('-')[0].replace('$','$') + '+/unit', delta:0, flat:true},
      {label:'LED', value:r.led.split('-')[0].replace('$','$') + '+/sqft', delta:0, flat:true},
    ];
    const body = `
      ${ticker(tickerItems)}
      <div class="pi-tiles">
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#06b6d4"></div>
          <div class="pi-tile-lbl">Active Programs (${esc(st)})</div>
          <div class="pi-tile-num">${r.programs}</div>
          <div class="pi-tile-sub">commercial-eligible · DSIRE</div></div>
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#add540"></div>
          <div class="pi-tile-lbl">Federal Programs</div>
          <div class="pi-tile-num">${r.federal}</div>
          <div class="pi-tile-sub">IRA + DOE + Treasury</div></div>
      </div>
      <div class="pi-list">
        <div class="pi-row">
          <div class="pi-row-name">🌡️ HVAC equipment</div>
          <div class="pi-row-val">${esc(r.hvac.split('-')[0])}+</div>
          <div class="pi-row-note">${esc(r.hvac)}</div>
        </div>
        <div class="pi-row">
          <div class="pi-row-name">💡 LED &amp; lighting controls</div>
          <div class="pi-row-val">${esc(r.led.split('-')[0])}+</div>
          <div class="pi-row-note">${esc(r.led)}</div>
        </div>
        <div class="pi-row">
          <div class="pi-row-name">⚡ Variable Frequency Drives</div>
          <div class="pi-row-val">${esc(r.vfd.split('-')[0])}+</div>
          <div class="pi-row-note">${esc(r.vfd)}</div>
        </div>
        <div class="pi-row">
          <div class="pi-row-name">🔧 Commissioning / RCx</div>
          <div class="pi-row-val">${esc(r.cx.split('-')[0])}+</div>
          <div class="pi-row-note">${esc(r.cx)}</div>
        </div>
      </div>
      ${r.note ? `<div style="margin-top:14px;font-size:13px;color:rgba(255,255,255,.7);line-height:1.65;font-style:italic">${esc(r.note)}</div>` : ''}
    `;
    return wrap('rebates', d, body);
  }

  function renderRECs(d, ctx){
    const tickerItems = d.markets.slice(0, 5).map(m => ({
      label: m.name.toUpperCase(),
      value: '$' + m.price + (m.price < 10 ? '0' : '') + '/MWh',
      delta: m.trend ? pct(m.trend[m.trend.length-1], m.trend[0]) : 0,
    }));
    const body = `
      ${ticker(tickerItems)}
      <div class="pi-list" style="margin-top:18px">
        ${d.markets.map(m => `<div class="pi-row" style="grid-template-columns:1.4fr 100px 80px 1fr">
          <div class="pi-row-name">${esc(m.name)}</div>
          <div class="pi-row-val">$${m.price.toFixed(2)}<span style="font-size:10px;color:rgba(255,255,255,.4);margin-left:4px;font-weight:500">${esc(m.unit)}</span></div>
          ${m.trend ? `<div>${sparkline(m.trend, 70, 22, m.trend[m.trend.length-1] > m.trend[0] ? '#22c55e' : '#ef4444')}</div>` : '<div></div>'}
          <div class="pi-row-note">${esc(m.note || '')}</div>
        </div>`).join('')}
      </div>
    `;
    return wrap('recs', d, body);
  }

  function renderSolar(d, ctx){
    const st = (ctx.state || 'PA').toUpperCase();
    const s = d.byState[st] || d.byState._DEFAULT;
    const irradianceCategory = s.irradiance >= 1500 ? 'Excellent' : s.irradiance >= 1300 ? 'Strong' : s.irradiance >= 1150 ? 'Moderate' : 'Modest';
    const tickerItems = [
      {label:`${st} COMM. SOLAR`, value: s.open ? 'OPEN' : 'NOT YET', delta:0, flat:true},
      {label:'NREL IRRADIANCE', value:`${fmt(s.irradiance)} kWh/kW-yr`, delta:0, flat:true},
      s.savings ? {label:'TYPICAL SAVINGS', value:s.savings, delta:0, flat:true} : null,
    ].filter(Boolean);
    const body = `
      ${ticker(tickerItems)}
      <div class="pi-tiles">
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:${s.open ? '#22c55e' : '#64748b'};box-shadow:0 0 10px ${s.open ? '#22c55e' : 'transparent'}"></div>
          <div class="pi-tile-lbl">Community Solar (${esc(st)})</div>
          <div class="pi-tile-num" style="font-size:22px">${s.open ? '✓ Open' : '— Pending'}</div>
          <div class="pi-tile-sub">${esc(s.status)}</div></div>
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#f59e0b"></div>
          <div class="pi-tile-lbl">Solar Resource (NREL)</div>
          <div class="pi-tile-num">${fmt(s.irradiance)}<span class="pi-suffix">kWh/kW-yr</span></div>
          <div class="pi-tile-sub">${esc(irradianceCategory)} for the region</div></div>
        ${s.savings ? `<div class="pi-tile"><div class="pi-tile-stripe" style="background:#06b6d4"></div>
          <div class="pi-tile-lbl">Subscriber Savings</div>
          <div class="pi-tile-num" style="font-size:24px">${esc(s.savings)}</div>
          <div class="pi-tile-sub">via VNM (Virtual Net Metering)</div></div>` : ''}
      </div>
      <div style="margin-top:14px;font-size:13px;color:rgba(255,255,255,.7);line-height:1.65"><strong style="color:#add540">Programs:</strong> ${esc(s.programs)}</div>
    `;
    return wrap('solar', d, body);
  }

  function renderEfficiency(d, ctx){
    const st = (ctx.state || 'PA').toUpperCase();
    const band = d.bands.find(b => b.states.indexOf(st) >= 0) || d.bands[2];
    const tickerItems = [
      {label:`${st} CODE BAND`, value:band.label, delta:0, flat:true},
      {label:'BASELINE', value:band.code.split('/')[0].trim(), delta:0, flat:true},
      {label:'ACHIEVABLE', value:band.savings, delta:0, flat:true},
    ];
    const body = `
      ${ticker(tickerItems)}
      <div class="pi-tiles">
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:${band.key === 'older' ? '#ef4444' : band.key === 'leading' ? '#22c55e' : '#f59e0b'}"></div>
          <div class="pi-tile-lbl">Code Band</div>
          <div class="pi-tile-num" style="font-size:22px">${esc(band.label)}</div>
          <div class="pi-tile-sub">${esc(band.code)}</div></div>
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#add540"></div>
          <div class="pi-tile-lbl">Achievable Savings</div>
          <div class="pi-tile-num">${esc(band.savings)}</div>
          <div class="pi-tile-sub">vs current code baseline</div></div>
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#06b6d4"></div>
          <div class="pi-tile-lbl">Code Update Cycle</div>
          <div class="pi-tile-num" style="font-size:22px">${esc(band.cycle)}</div>
          <div class="pi-tile-sub">${st} adoption pace</div></div>
      </div>
      <div class="pi-list" style="margin-top:14px">
        ${d.bands.map(b => `<div class="pi-row" style="grid-template-columns:1fr 1.2fr 90px 80px;background:${b.key === band.key ? 'rgba(173,213,64,.06)' : 'rgba(255,255,255,.025)'};border-color:${b.key === band.key ? 'rgba(173,213,64,.3)' : 'var(--b1,rgba(255,255,255,.06))'}">
          <div class="pi-row-name">${b.key === band.key ? '▸ ' : '  '}${esc(b.label)}</div>
          <div class="pi-row-note">${esc(b.code)}</div>
          <div class="pi-row-val" style="font-size:12px">${esc(b.savings)}</div>
          <div class="pi-row-note" style="text-align:right">${esc(b.cycle)}</div>
        </div>`).join('')}
      </div>
    `;
    return wrap('efficiency', d, body);
  }

  function renderESG(d, ctx){
    const tickerItems = d.frameworks.slice(0,4).map(f => ({label:f.name, value:f.adopters.split(' ')[0]+'+', delta:0, flat:true}));
    const body = `
      ${ticker(tickerItems)}
      <div class="pi-list" style="margin-top:18px">
        ${d.frameworks.map(f => `<div class="pi-row" style="grid-template-columns:1fr 1.4fr 1fr 1.2fr">
          <div class="pi-row-name">${esc(f.name)}</div>
          <div class="pi-row-note"><strong style="color:#fff">${esc(f.adopters)}</strong> · ${esc(f.timeline)}</div>
          <div class="pi-row-note">${esc(f.scope)}</div>
          <div class="pi-row-note" style="color:rgba(173,213,64,.85)">${esc(f.use)}</div>
        </div>`).join('')}
      </div>
    `;
    return wrap('esg', d, body);
  }

  function renderRecovery(d, ctx){
    const tickerItems = [
      {label:'INDUSTRY MEDIAN', value:'1.2% of spend', delta:0, flat:true},
      {label:'LOOKBACK', value:'2-4 years', delta:0, flat:true},
      {label:'STS FEE', value:'Contingency only', delta:0, flat:true},
    ];
    const body = `
      ${ticker(tickerItems)}
      <div class="pi-tiles">
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#add540"></div>
          <div class="pi-tile-lbl">Avg Recovery</div>
          <div class="pi-tile-num">1.2<span class="pi-suffix">% of annual spend</span></div>
          <div class="pi-tile-sub">industry median</div></div>
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#06b6d4"></div>
          <div class="pi-tile-lbl">PUC Lookback</div>
          <div class="pi-tile-num" style="font-size:22px">2-4 yrs</div>
          <div class="pi-tile-sub">retroactive refunds allowed</div></div>
        <div class="pi-tile"><div class="pi-tile-stripe" style="background:#22c55e"></div>
          <div class="pi-tile-lbl">STS Fee Structure</div>
          <div class="pi-tile-num" style="font-size:18px">Contingency only</div>
          <div class="pi-tile-sub">no recovery, no charge</div></div>
      </div>
      <div style="margin-top:18px"><div style="font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.16em;color:rgba(255,255,255,.5);text-transform:uppercase;margin-bottom:10px">Most Common Error Categories</div>
      <div class="pi-share">
        ${d.stats.categories.map(c => `<div class="pi-share-row">
          <div><div style="font-size:12.5px;color:#fff;margin-bottom:3px">${esc(c.name)}</div>
          <div class="pi-share-track"><div class="pi-share-fill" style="width:0" data-pct="${c.share}">${c.share}%</div></div></div>
          <div class="pi-share-pct">${c.share}%</div>
        </div>`).join('')}
      </div></div>
    `;
    return wrap('recovery', d, body);
  }

  // ------------------------------------------------------------------
  // Shared components
  // ------------------------------------------------------------------
  function ticker(items){
    if (!items || !items.length) return '';
    const renderItem = (item) => {
      const cls = item.flat ? 'flat' : (item.delta > 0 ? 'up' : item.delta < 0 ? 'dn' : 'flat');
      const arrow = item.flat ? '' : (item.delta > 0 ? '↑' : item.delta < 0 ? '↓' : '·');
      const deltaText = item.flat ? '' : `<span class="pi-tk-delta ${cls}">${arrow} ${Math.abs(item.delta).toFixed(0)}%</span>`;
      return `<div class="pi-tk-item"><span class="pi-tk-label">${esc(item.label)}</span><span class="pi-tk-value">${esc(item.value)}</span>${deltaText}</div>`;
    };
    const html = items.map(renderItem).join('') + items.map(renderItem).join('');
    return `<div class="pi-ticker"><div class="pi-ticker-track">${html}</div></div>`;
  }

  function renderGauge(value, max){
    max = max || 100;
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    const angle = (pct / 100) * 180;
    const r = 60, cx = 80, cy = 80;
    const startX = cx - r, startY = cy;
    const endX = cx + r * Math.cos(Math.PI - angle * Math.PI / 180);
    const endY = cy - r * Math.sin(Math.PI - angle * Math.PI / 180);
    const largeArc = angle > 180 ? 1 : 0;
    const color = pct < 30 ? '#22c55e' : pct < 60 ? '#f59e0b' : '#ef4444';
    return `<svg class="pi-gauge-svg" width="170" height="100" viewBox="0 0 170 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M ${startX} ${startY} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="14" stroke-linecap="round"/>
      <path d="M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" style="filter:drop-shadow(0 0 8px ${color}66)"/>
      <text x="${cx}" y="${cy+2}" text-anchor="middle" font-family="'IBM Plex Sans',sans-serif" font-size="32" font-weight="800" fill="#fff" letter-spacing="-1">${value}<tspan font-size="16" fill="rgba(255,255,255,.5)">%</tspan></text>
      <text x="${cx}" y="${cy+22}" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="9" font-weight="700" letter-spacing=".15em" fill="rgba(255,255,255,.5)">OVER 2030 CAP</text>
    </svg>`;
  }

  function wrap(pid, d, body){
    return `<div class="pi-wrap"><div class="pi-card" data-pid="${pid}">
      <div class="pi-eyebrow"><span class="pi-dot"></span>Live Market Intelligence · ${esc(d.label)}<span class="pi-stamp">REFRESHED ${esc(d.refreshed)}</span></div>
      <div class="pi-headline">${esc(d.headline)}</div>
      <div class="pi-summary">${esc(d.summary)}</div>
      ${body}
      ${sourcesHTML(d.sources)}
    </div></div>`;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  const RENDERERS = {
    procurement: renderProcurement,
    dr: renderDR,
    bps: renderBPS,
    rebates: renderRebates,
    recs: renderRECs,
    solar: renderSolar,
    efficiency: renderEfficiency,
    esg: renderESG,
    recovery: renderRecovery,
  };

  window.populateProgramIntel = function(pid, state, ctx){
    injectCSS();
    if (!window.PROGRAM_DATA || !window.PROGRAM_DATA[pid]) return;
    const renderer = RENDERERS[pid];
    if (!renderer) return;
    const d = window.PROGRAM_DATA[pid];
    const html = renderer(d, ctx || {});

    const subpages = document.querySelectorAll(`.subpage[data-pid="${pid}"]`);
    subpages.forEach(sp => {
      const oldRow = sp.querySelector(':scope > .pi-top-row');
      if (oldRow) {
        const oldHero = oldRow.querySelector(':scope > .pi-hero-col');
        if (oldHero) {
          oldHero.classList.remove('pi-hero-col');
          sp.insertBefore(oldHero, oldRow);
        }
        oldRow.remove();
      }
      const oldStandalone = sp.querySelector(':scope > .pi-wrap');
      if (oldStandalone) oldStandalone.remove();

      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const intelCard = tmp.firstElementChild;

      const back = sp.querySelector(':scope > .sp-back');
      if (!back) {
        sp.insertBefore(intelCard, sp.firstChild);
        return;
      }

      const candidate = back.nextElementSibling;
      const cstyle = candidate ? (candidate.getAttribute('style') || '') : '';
      const looksLikeHero = candidate && candidate.tagName === 'DIV' && (
        cstyle.indexOf('linear-gradient') >= 0 &&
        (cstyle.indexOf('navy') >= 0 || cstyle.indexOf('14234C') >= 0 || cstyle.indexOf('1c3166') >= 0)
      );

      if (looksLikeHero) {
        const topRow = document.createElement('div');
        topRow.className = 'pi-top-row';
        sp.insertBefore(topRow, candidate);
        candidate.classList.add('pi-hero-col');
        topRow.appendChild(candidate);
        topRow.appendChild(intelCard);
      } else {
        if (back.nextSibling) sp.insertBefore(intelCard, back.nextSibling);
        else sp.appendChild(intelCard);
      }
    });

    requestAnimationFrame(() => {
      document.querySelectorAll('.pi-bar-fill[data-pct]').forEach(el => {
        el.style.width = el.getAttribute('data-pct') + '%';
      });
      document.querySelectorAll('.pi-yoy-bar[data-h]').forEach(el => {
        el.style.height = el.getAttribute('data-h') + '%';
      });
      document.querySelectorAll('.pi-share-fill[data-pct]').forEach(el => {
        el.style.width = el.getAttribute('data-pct') + '%';
      });
    });
  };

  window.populateAllProgramIntel = function(ctx){
    if (!window.PROGRAM_DATA) return;
    Object.keys(window.PROGRAM_DATA).forEach(pid => {
      try { window.populateProgramIntel(pid, null, ctx); }
      catch(e){ console.warn('[program_intel] render failed for ' + pid, e); }
    });
  };

  console.log('[program_intel] loaded · 9 renderers ready');
})();
