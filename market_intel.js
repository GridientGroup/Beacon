// ═══════════════════════════════════════════════════════════════════════
// market_intel.js — Beacon Energy Market Update module
//
// Reads from commodity_snapshots (populated by Conductor's commodity-fetcher
// edge function every 15 minutes) and paints 4 market-intelligence panels:
//
//   1. Natural Gas Storage          — current week vs 5-year min/max band
//   2. Henry Hub Spot + Forward     — 30-day spot trend + 24-month forward curve
//   3. ISO Wholesale Snapshot       — 5 ISOs, current-month avg vs prior year
//   4. EIA STEO Forecast            — 18-month commercial electricity outlook
//
// The Market tab calls renderMarketIntel() on every open via showView(),
// so panels reflect the latest 15-minute fetcher cycle without page reload.
//
// Dependencies:
//   • window._beaconSb  — Supabase client exposed by index.html
//                          (rev35 patch adds `window._beaconSb = sb;` after
//                          the IIFE-scoped client is constructed)
//   • commodity_snapshots table — org-scoped to STS via RLS
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─── Series IDs in commodity_snapshots ──────────────────────────────
  const SERIES = {
    HENRY_HUB_SPOT:   'RNGWHHD',                       // bundle 134: live EIA series (old eia.henry_hub.daily_spot stopped 2026-06-01)
    US_STORAGE:       'NW2_EPG0_SWO_R48_BCF',          // bundle 134: live EIA series (old copy stopped 2026-05-29)
    // Forward curve series — v2 fetcher writes RNGC1 through RNGC24
    FWD_PREFIX:       'eia.henry_hub.fwd_m',          // + '01' through '24'
    // STEO series — v2 fetcher writes 2 headline series (slugified EIA codes)
    STEO_COMM_PRICE:  'eia.steo.escmuus',  // Commercial retail electricity price (¢/kWh)
    STEO_HH_FORECAST: 'eia.steo.nghhuus',  // Henry Hub spot forecast ($/MMBtu)
  };

  // ─── Theme tokens (must match beacon-index.html CSS variables) ──────
  const COLOR = {
    lime:   '#add540',
    amber:  '#f59e0b',
    cyan:   '#22d3ee',
    rose:   '#fb7185',
    green:  '#22c55e',
    grid:   'rgba(255,255,255,0.07)',
    axis:   'rgba(255,255,255,0.35)',
    text:   'rgba(255,255,255,0.85)',
    sub:    'rgba(255,255,255,0.55)',
    band:   'rgba(173,213,64,0.10)',
    bandEdge:'rgba(173,213,64,0.30)',
  };

  // ─────────────────────────────────────────────────────────────────────
  // Data layer — one helper per series; uses window._beaconSb
  // ─────────────────────────────────────────────────────────────────────

  async function fetchSeries(seriesId, opts) {
    opts = opts || {};
    const sb = window._beaconSb;
    if (!sb) throw new Error('Supabase client not exposed (window._beaconSb)');

    // ── ORDER + LIMIT, FIXED 2026-09-17 ────────────────────────────────────
    // This was `.order(ascending: true)` followed by `.limit(n)`. PostgREST
    // applies LIMIT after ORDER BY, so that is `ORDER BY observed_at ASC
    // LIMIT n` — the OLDEST n rows ever written, not the newest.
    //
    // Every consumer then takes the LAST element as "latest". So the summary
    // strip's "Henry Hub spot $X.XX" was the 5th-oldest daily price in the
    // table, with a real-looking date beside it, and it would stay frozen
    // there forever as the table grew. The storage panel, the 30-day delta,
    // and the printed Beacon Brief all inherited it. No error, no empty
    // state — correct while the table was small, then silently stuck.
    //
    // The author's own correct idiom is 13 lines below (ascending: false,
    // then limit), which is what makes this a slip rather than intent.
    //
    // Fix: take the NEWEST n descending, then reverse back to ascending so
    // every existing consumer that reads data[data.length-1] as "latest"
    // keeps working unchanged.
    const wantsNewest = !!opts.limit;
    let q = sb.from('commodity_snapshots')
      .select('observed_at,value,unit,iso,metadata,series_label')
      .eq('series_id', seriesId)
      .order('observed_at', { ascending: !wantsNewest });

    if (opts.since) q = q.gte('observed_at', opts.since);
    if (opts.limit) q = q.limit(opts.limit);

    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    return wantsNewest ? rows.slice().reverse() : rows;
  }

  async function fetchSeriesByPrefix(prefix) {
    const sb = window._beaconSb;
    if (!sb) throw new Error('Supabase client not exposed (window._beaconSb)');

    const { data, error } = await sb.from('commodity_snapshots')
      .select('series_id,observed_at,value,unit,metadata')
      .like('series_id', prefix + '%')
      .order('observed_at', { ascending: false })
      .limit(2000);
    if (error) throw error;
    return data || [];
  }

  async function fetchISOLatest(daysBack) {
    daysBack = daysBack || 365;
    const sb = window._beaconSb;
    if (!sb) throw new Error('Supabase client not exposed');
    const since = new Date(Date.now() - daysBack * 86400000).toISOString();

    const { data, error } = await sb.from('commodity_snapshots')
      .select('iso,observed_at,value')
      .eq('category', 'electric_lmp')
      .gte('observed_at', since)
      .order('observed_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  // ─────────────────────────────────────────────────────────────────────
  // Utility — number formatting, date helpers, SVG primitives
  // ─────────────────────────────────────────────────────────────────────

  function fmtMoney(n, decimals) {
    if (n == null || isNaN(n)) return '—';
    decimals = decimals == null ? 2 : decimals;
    return '$' + Number(n).toFixed(decimals);
  }
  function fmtBcf(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString() + ' Bcf';
  }
  function fmtPct(n, decimals) {
    if (n == null || isNaN(n)) return '—';
    decimals = decimals == null ? 1 : decimals;
    return (n >= 0 ? '+' : '') + Number(n).toFixed(decimals) + '%';
  }
  function asDate(iso) { return new Date(iso); }
  function dateStr(d) { return d.toLocaleDateString('en-US', { month:'short', day:'numeric' }); }
  function monthStr(d) { return d.toLocaleDateString('en-US', { month:'short', year:'2-digit' }); }
  function isoWeekOfYear(d) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  }

  // ─────────────────────────────────────────────────────────────────────
  // PANEL 1 — Natural Gas Storage (current week vs 5-year band)
  // ─────────────────────────────────────────────────────────────────────

  async function renderStoragePanel() {
    const headline = document.getElementById('mi-storage-headline');
    const chart    = document.getElementById('mi-storage-chart');
    const insight  = document.getElementById('mi-storage-insight');
    if (!chart) return;

    chart.innerHTML = '<div class="mi-loading">Loading storage data…</div>';

    let rows;
    try {
      rows = await fetchSeries(SERIES.US_STORAGE, { limit: 320 });
    } catch (e) {
      console.error('[market_intel] storage fetch failed:', e);
      chart.innerHTML = '<div class="mi-empty"><div class="mi-empty-icon">⚠</div><div class="mi-empty-msg">Storage data temporarily unavailable.<br><small>'+ String(e).slice(0,120) +'</small></div></div>';
      return;
    }

    if (!rows.length) {
      chart.innerHTML = '<div class="mi-empty"><div class="mi-empty-icon">📊</div><div class="mi-empty-msg">No storage data yet. The commodity fetcher began landing rows recently — data accumulates weekly.</div></div>';
      return;
    }

    // Group by ISO week-of-year across all available years
    const byWeek = {};       // week → [{year, value}]
    const byYear = {};       // year → [{date, value, week}]
    rows.forEach(r => {
      const d = new Date(r.observed_at);
      const wk = isoWeekOfYear(d);
      const yr = d.getUTCFullYear();
      (byWeek[wk] = byWeek[wk] || []).push({ year: yr, value: Number(r.value) });
      (byYear[yr] = byYear[yr] || []).push({ date: d, value: Number(r.value), week: wk });
    });

    // Build 52-week min/max/median band (excluding current year, so the
    // "now" line truly compares against history rather than itself)
    const currentYear = new Date().getUTCFullYear();
    const bandWeeks = [];
    for (let w = 1; w <= 52; w++) {
      const obs = (byWeek[w] || []).filter(o => o.year < currentYear);
      if (obs.length === 0) { bandWeeks.push(null); continue; }
      const vals = obs.map(o => o.value).sort((a,b)=>a-b);
      bandWeeks.push({
        week: w,
        min: vals[0],
        max: vals[vals.length-1],
        median: vals[Math.floor(vals.length/2)],
        n: vals.length,
      });
    }

    const currentYearObs = (byYear[currentYear] || []).sort((a,b)=>a.date-b.date);
    const latest = currentYearObs[currentYearObs.length - 1] || rows.map(r=>({date:new Date(r.observed_at), value:Number(r.value), week:isoWeekOfYear(new Date(r.observed_at))})).pop();

    // Versus 5-year average for the matching week
    const matchBand = bandWeeks[latest.week - 1];
    const vsAvg5y = matchBand ? ((latest.value - matchBand.median) / matchBand.median) * 100 : null;
    const vsMin   = matchBand ? latest.value - matchBand.min : null;
    const vsMax   = matchBand ? latest.value - matchBand.max : null;

    // ─ Headline ─
    if (headline) {
      headline.innerHTML =
        '<div class="mi-headline-num">'+ fmtBcf(latest.value) +'</div>' +
        '<div class="mi-headline-sub">Working gas in storage · week of '+ dateStr(latest.date) +'</div>' +
        (vsAvg5y != null
          ? '<div class="mi-headline-delta '+(vsAvg5y >= 0 ? 'pos':'neg')+'">'+ fmtPct(vsAvg5y) +' vs 5-year median</div>'
          : '');
    }

    // ─ SVG chart ─
    const W = 540, H = 220, P = { t: 16, r: 14, b: 28, l: 50 };
    const innerW = W - P.l - P.r, innerH = H - P.t - P.b;

    const allMaxes = bandWeeks.filter(b=>b).map(b=>b.max);
    const allMins  = bandWeeks.filter(b=>b).map(b=>b.min);
    const yMax = Math.max(...allMaxes, latest.value) * 1.06;
    const yMin = Math.min(...allMins, latest.value) * 0.92;
    const xOfWeek = w => P.l + ((w - 1) / 51) * innerW;
    const yOfVal  = v => P.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;

    // Band polygon: walk forward on max, back on min
    let bandPath = '';
    const havePoints = bandWeeks.map((b,i)=>({b,w:i+1})).filter(p=>p.b);
    if (havePoints.length > 1) {
      const tops = havePoints.map(p => xOfWeek(p.w) + ',' + yOfVal(p.b.max));
      const bots = havePoints.slice().reverse().map(p => xOfWeek(p.w) + ',' + yOfVal(p.b.min));
      bandPath = '<polygon points="' + tops.concat(bots).join(' ') + '" fill="'+COLOR.band+'" stroke="'+COLOR.bandEdge+'" stroke-width="1" />';
    }

    // Current-year line
    let nowLine = '';
    if (currentYearObs.length >= 2) {
      const pts = currentYearObs.map(o => xOfWeek(o.week) + ',' + yOfVal(o.value));
      nowLine = '<polyline points="'+ pts.join(' ') +'" fill="none" stroke="'+COLOR.lime+'" stroke-width="2.5" stroke-linejoin="round" />';
    }

    // Latest dot
    const latestX = xOfWeek(latest.week), latestY = yOfVal(latest.value);

    // Y axis labels (5 evenly spaced)
    let yLabels = '';
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (yMax - yMin) * (i / 4);
      const y = yOfVal(v);
      yLabels += '<line x1="'+P.l+'" y1="'+y+'" x2="'+(W-P.r)+'" y2="'+y+'" stroke="'+COLOR.grid+'" />';
      yLabels += '<text x="'+(P.l-6)+'" y="'+(y+3)+'" text-anchor="end" fill="'+COLOR.sub+'" font-size="10">'+Math.round(v/100)*100+'</text>';
    }

    // X axis labels (Jan, Apr, Jul, Oct)
    let xLabels = '';
    [{w:1,l:'Jan'},{w:14,l:'Apr'},{w:27,l:'Jul'},{w:40,l:'Oct'},{w:52,l:'Dec'}].forEach(t=>{
      xLabels += '<text x="'+xOfWeek(t.w)+'" y="'+(H-8)+'" text-anchor="middle" fill="'+COLOR.sub+'" font-size="10">'+t.l+'</text>';
    });

    chart.innerHTML =
      '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;max-height:240px">' +
        yLabels +
        bandPath +
        nowLine +
        '<circle cx="'+latestX+'" cy="'+latestY+'" r="4.5" fill="'+COLOR.lime+'" stroke="#0f1410" stroke-width="2" />' +
        xLabels +
      '</svg>' +
      '<div class="mi-legend">' +
        '<span><span class="mi-swatch" style="background:'+COLOR.band+';border-color:'+COLOR.bandEdge+'"></span>5-year min/max band</span>' +
        '<span><span class="mi-swatch line" style="background:'+COLOR.lime+'"></span>Current year</span>' +
      '</div>';

    if (insight) {
      let msg = '';
      if (vsAvg5y == null) {
        msg = 'Insufficient historical data for week-on-week comparison yet — band will fill in as the fetcher accumulates weekly readings.';
      } else if (vsAvg5y >= 5) {
        msg = '<strong>Storage is above the 5-year average</strong> for this week, which historically dampens forward gas prices. Procurement implication: forward contract pricing should reflect comfortable supply. Watch the next two storage reports for trend confirmation before committing to a longer-tenor lock.';
      } else if (vsAvg5y <= -5) {
        msg = '<strong>Storage is below the 5-year average</strong> for this week. Tight inventory historically supports higher forward gas prices, especially heading into the next withdrawal season. Procurement implication: lengthening contract tenor now hedges against further tightening.';
      } else {
        msg = '<strong>Storage is in line with the 5-year average</strong> for this week. No strong directional signal from inventory alone — let forward curve shape and weather outlook drive procurement timing.';
      }
      insight.innerHTML = '<span class="mi-insight-eye">💡 What it means</span> ' + msg;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PANEL 2 — Henry Hub Spot + 24-Month Forward Curve
  // ─────────────────────────────────────────────────────────────────────

  async function renderHenryHubPanel() {
    const headline = document.getElementById('mi-hh-headline');
    const chart    = document.getElementById('mi-hh-chart');
    const insight  = document.getElementById('mi-hh-insight');
    if (!chart) return;

    chart.innerHTML = '<div class="mi-loading">Loading Henry Hub spot &amp; STEO forecast…</div>';

    let spotRows, steoRows;
    try {
      // Spot: published with ~5 business day lag per EIA cadence (normal)
      spotRows = await fetchSeries(SERIES.HENRY_HUB_SPOT, { limit: 40 });
      // STEO Henry Hub forecast — monthly, ~18 months forward
      steoRows = await fetchSeries(SERIES.STEO_HH_FORECAST);
    } catch (e) {
      console.error('[market_intel] henry hub fetch failed:', e);
      chart.innerHTML = '<div class="mi-empty"><div class="mi-empty-icon">⚠</div><div class="mi-empty-msg">Henry Hub data temporarily unavailable.</div></div>';
      return;
    }

    if (!spotRows.length) {
      chart.innerHTML = '<div class="mi-empty"><div class="mi-empty-icon">📊</div><div class="mi-empty-msg">No Henry Hub data yet.</div></div>';
      return;
    }

    spotRows.sort((a,b)=> new Date(a.observed_at) - new Date(b.observed_at));
    const latestSpot = spotRows[spotRows.length - 1];
    const earlierSpot = spotRows[Math.max(0, spotRows.length - 22)]; // ~30 days back
    const spot30dChg = ((latestSpot.value - earlierSpot.value) / earlierSpot.value) * 100;

    // Split STEO into history (actual) vs forecast.
    // EIA STEO publishes both: history fills in alongside spot, forecast extends
    // 18 months ahead. The fetcher tags each row with metadata.is_forecast.
    steoRows.sort((a,b)=> new Date(a.observed_at) - new Date(b.observed_at));
    const steoHistory  = steoRows.filter(r => !(r.metadata && r.metadata.is_forecast));
    const steoForecast = steoRows.filter(r =>  (r.metadata && r.metadata.is_forecast));

    // STEO next-12-month average — the canonical procurement-budgeting number
    const next12 = steoForecast.slice(0, 12);
    const steo12mAvg = next12.length
      ? next12.reduce((s, r) => s + Number(r.value), 0) / next12.length
      : null;
    const lastForecast = steoForecast.length ? steoForecast[steoForecast.length - 1] : null;

    // ─ Headline ─
    if (headline) {
      headline.innerHTML =
        '<div class="mi-headline-num">'+ fmtMoney(latestSpot.value) +'</div>' +
        '<div class="mi-headline-sub">Henry Hub spot · '+ dateStr(asDate(latestSpot.observed_at)) +'</div>' +
        '<div class="mi-headline-delta '+(spot30dChg >= 0 ? 'pos' : 'neg')+'">'+ fmtPct(spot30dChg) +' over 30 days</div>' +
        (steo12mAvg != null
          ? '<div class="mi-headline-fwd">EIA STEO 12-mo forecast: <strong>'+ fmtMoney(steo12mAvg) +'</strong></div>'
          : '<div class="mi-headline-fwd" style="opacity:.5">Awaiting STEO forecast…</div>');
    }

    // ─ SVG chart: 30-day spot on left, STEO forecast on right ─
    const W = 540, H = 220, P = { t: 16, r: 14, b: 28, l: 44 };
    const innerW = W - P.l - P.r, innerH = H - P.t - P.b;

    // Combine values for shared Y axis
    const spotVals = spotRows.map(r => Number(r.value));
    const fcstVals = steoForecast.map(r => Number(r.value));
    const allVals  = spotVals.concat(fcstVals);
    const yMax = Math.max(...allVals) * 1.10;
    const yMin = Math.min(...allVals) * 0.90;

    // X axis: spot occupies first 40%, STEO forecast next 60%
    const spotWidth = innerW * 0.4, fcstWidth = innerW * 0.6;
    const xSpot = (i) => P.l + (i / Math.max(1, spotRows.length - 1)) * spotWidth;
    // STEO is monthly; map by months-from-now (1..18)
    const fcstCount = steoForecast.length || 1;
    const xFcst = (idx) => P.l + spotWidth + (idx / Math.max(1, fcstCount - 1)) * fcstWidth;
    const yOf   = (v) => P.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;

    // Y axis grid
    let yLabels = '';
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (yMax - yMin) * (i / 4);
      const y = yOf(v);
      yLabels += '<line x1="'+P.l+'" y1="'+y+'" x2="'+(W-P.r)+'" y2="'+y+'" stroke="'+COLOR.grid+'" />';
      yLabels += '<text x="'+(P.l-6)+'" y="'+(y+3)+'" text-anchor="end" fill="'+COLOR.sub+'" font-size="10">$'+v.toFixed(2)+'</text>';
    }

    // Separator line at the spot/forecast boundary
    const sepX = P.l + spotWidth;
    const sepLine = '<line x1="'+sepX+'" y1="'+P.t+'" x2="'+sepX+'" y2="'+(P.t+innerH)+'" stroke="'+COLOR.axis+'" stroke-dasharray="3,3" />';

    // Spot line (solid lime, left side)
    const spotPts = spotRows.map((r,i) => xSpot(i) + ',' + yOf(Number(r.value)));
    const spotLine = '<polyline points="'+ spotPts.join(' ') +'" fill="none" stroke="'+COLOR.lime+'" stroke-width="2.5" stroke-linejoin="round" />';
    const lastSpotX = xSpot(spotRows.length - 1);
    const lastSpotY = yOf(Number(latestSpot.value));

    // STEO forecast line (dashed cyan, right side)
    let fcstLine = '', fcstDots = '';
    if (steoForecast.length > 1) {
      const pts = steoForecast.map((r,i) => xFcst(i) + ',' + yOf(Number(r.value)));
      fcstLine = '<polyline points="'+ pts.join(' ') +'" fill="none" stroke="'+COLOR.cyan+'" stroke-width="2.5" stroke-dasharray="5,4" stroke-linejoin="round" />';
      fcstDots = steoForecast.map((r,i) => '<circle cx="'+xFcst(i)+'" cy="'+yOf(Number(r.value))+'" r="2.5" fill="'+COLOR.cyan+'" opacity="0.7" />').join('');
    } else if (steoForecast.length === 1) {
      fcstDots = '<circle cx="'+xFcst(0)+'" cy="'+yOf(Number(steoForecast[0].value))+'" r="3.5" fill="'+COLOR.cyan+'" />';
    }

    // X labels
    let xLabels = '';
    xLabels += '<text x="'+(P.l+spotWidth/2)+'" y="'+(H-8)+'" text-anchor="middle" fill="'+COLOR.sub+'" font-size="10">30-day spot</text>';
    if (steoForecast.length) {
      const midIdx = Math.floor(steoForecast.length / 2);
      xLabels += '<text x="'+xFcst(midIdx)+'" y="'+(H-8)+'" text-anchor="middle" fill="'+COLOR.sub+'" font-size="10">'+monthStr(new Date(steoForecast[midIdx].observed_at))+'</text>';
      xLabels += '<text x="'+xFcst(steoForecast.length-1)+'" y="'+(H-8)+'" text-anchor="end" fill="'+COLOR.sub+'" font-size="10">'+monthStr(new Date(steoForecast[steoForecast.length-1].observed_at))+'</text>';
    }

    chart.innerHTML =
      '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;max-height:240px">' +
        yLabels + sepLine + spotLine + fcstLine + fcstDots +
        '<circle cx="'+lastSpotX+'" cy="'+lastSpotY+'" r="4.5" fill="'+COLOR.lime+'" stroke="#0f1410" stroke-width="2" />' +
        xLabels +
      '</svg>' +
      '<div class="mi-legend">' +
        '<span><span class="mi-swatch line" style="background:'+COLOR.lime+'"></span>Daily spot</span>' +
        '<span><span class="mi-swatch line" style="background:'+COLOR.cyan+';opacity:.85"></span>EIA STEO forecast</span>' +
      '</div>';

    if (insight) {
      let msg = '';
      if (steo12mAvg == null) {
        msg = 'STEO forecast loading. Once available, this shows EIA\'s official 18-month Henry Hub price outlook — the canonical reference for gas procurement budgeting, published the second Tuesday of each month.';
      } else if (steo12mAvg > latestSpot.value * 1.05) {
        const premiumPct = ((steo12mAvg / latestSpot.value) - 1) * 100;
        msg = '<strong>EIA forecasts Henry Hub rising</strong> — STEO 12-month average ('+ fmtMoney(steo12mAvg) +') sits '+ premiumPct.toFixed(1) +'% above current spot ('+ fmtMoney(latestSpot.value) +'). EIA cites supply/demand drivers in the published outlook. Procurement implication: longer fixed-rate tenors hedge against the expected rise.';
      } else if (steo12mAvg < latestSpot.value * 0.95) {
        const discountPct = (1 - (steo12mAvg / latestSpot.value)) * 100;
        msg = '<strong>EIA forecasts Henry Hub easing</strong> — STEO 12-month average ('+ fmtMoney(steo12mAvg) +') sits '+ discountPct.toFixed(1) +'% below current spot ('+ fmtMoney(latestSpot.value) +'). Procurement implication: shorter tenors may capture the expected decline; lock long only for budget certainty.';
      } else {
        msg = '<strong>EIA forecasts a flat Henry Hub</strong> — STEO 12-month average ('+ fmtMoney(steo12mAvg) +') closely matches current spot ('+ fmtMoney(latestSpot.value) +'). No strong directional pressure expected from gas; tenor decisions can prioritize budget certainty over price hedging.';
      }
      insight.innerHTML = '<span class="mi-insight-eye">💡 What it means</span> ' + msg;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PANEL 3 — ISO Wholesale Snapshot
  // ─────────────────────────────────────────────────────────────────────

  async function renderISOPanel() {
    const tableMount = document.getElementById('mi-iso-table');
    const insight    = document.getElementById('mi-iso-insight');
    if (!tableMount) return;

    tableMount.innerHTML = '<div class="mi-loading">Loading ISO wholesale prices…</div>';

    let rows;
    try {
      rows = await fetchISOLatest(400);
    } catch (e) {
      console.error('[market_intel] ISO fetch failed:', e);
      tableMount.innerHTML = '<div class="mi-empty"><div class="mi-empty-icon">⚠</div><div class="mi-empty-msg">ISO data temporarily unavailable.</div></div>';
      return;
    }

    if (!rows.length) {
      tableMount.innerHTML = '<div class="mi-empty"><div class="mi-empty-icon">📊</div><div class="mi-empty-msg">No ISO data yet. The commodity fetcher pulls hub LMPs every 15 minutes.</div></div>';
      return;
    }

    // Compute current-month average vs prior year same month, per ISO
    const now = new Date();
    const currentMonthKey = now.getUTCFullYear() + '-' + (now.getUTCMonth()+1);
    const priorYearMonthKey = (now.getUTCFullYear()-1) + '-' + (now.getUTCMonth()+1);

    const groups = {};
    rows.forEach(r => {
      if (!r.iso || r.value == null) return;
      const d = new Date(r.observed_at);
      const key = d.getUTCFullYear() + '-' + (d.getUTCMonth()+1);
      const g = groups[r.iso] = groups[r.iso] || { current: [], prior: [], all: [] };
      g.all.push({ d, v: Number(r.value) });
      if (key === currentMonthKey) g.current.push(Number(r.value));
      else if (key === priorYearMonthKey) g.prior.push(Number(r.value));
    });

    const ISO_ORDER = ['PJM','NYISO','ISONE','CAISO','MISO','ERCOT'];
    const isoData = ISO_ORDER.map(iso => {
      const g = groups[iso];
      if (!g) return { iso, status: 'no-data' };
      const cur = g.current.length ? g.current.reduce((a,b)=>a+b,0) / g.current.length : null;
      const prior = g.prior.length ? g.prior.reduce((a,b)=>a+b,0) / g.prior.length : null;
      const chg = (cur != null && prior != null) ? ((cur - prior) / prior) * 100 : null;
      return { iso, current: cur, prior: prior, change: chg, currentN: g.current.length, priorN: g.prior.length };
    });

    // Build table
    let tbl = '<table class="mi-iso-tbl"><thead><tr>' +
      '<th>ISO</th>' +
      '<th class="num">Current month avg</th>' +
      '<th class="num">Prior year same mo.</th>' +
      '<th class="num">Δ YoY</th>' +
      '</tr></thead><tbody>';

    isoData.forEach(d => {
      if (d.status === 'no-data') {
        tbl += '<tr class="dim"><td>'+d.iso+'</td><td colspan="3" class="num" style="color:'+COLOR.sub+'">No data <small>(see Conductor handoff)</small></td></tr>';
        return;
      }
      const chgCls = d.change == null ? 'dim' : (d.change >= 0 ? 'pos' : 'neg');
      tbl += '<tr>' +
        '<td><strong>'+d.iso+'</strong></td>' +
        '<td class="num">'+ (d.current != null ? fmtMoney(d.current, 2) + '<small> /MWh</small>' : '—') + '</td>' +
        '<td class="num">'+ (d.prior   != null ? fmtMoney(d.prior, 2) + '<small> /MWh</small>'   : '<span style="color:'+COLOR.sub+'">building history</span>') + '</td>' +
        '<td class="num '+chgCls+'">'+ (d.change != null ? fmtPct(d.change, 1) : '—') + '</td>' +
      '</tr>';
    });

    tbl += '</tbody></table>';
    tableMount.innerHTML = tbl;

    if (insight) {
      const withData = isoData.filter(d => d.current != null);
      const sorted = withData.slice().sort((a,b) => (b.current||0) - (a.current||0));
      let msg = '';
      if (withData.length === 0) {
        msg = 'ISO data is still landing — check back after the next fetcher cycle.';
      } else {
        const highest = sorted[0], lowest = sorted[sorted.length - 1];
        msg = '<strong>'+highest.iso+'</strong> is the highest-priced ISO this month at '+ fmtMoney(highest.current) +'/MWh; <strong>'+lowest.iso+'</strong> is the lowest at '+ fmtMoney(lowest.current) +'/MWh. ' +
              'Year-over-year deltas reflect a mix of weather, fuel costs, and reserve margin. ' +
              'Use these as input to procurement timing and basis differentials, not as a complete picture — capacity, transmission, and ancillary services layer on top.';
      }
      insight.innerHTML = '<span class="mi-insight-eye">💡 What it means</span> ' + msg;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PANEL 4 — EIA STEO 18-Month Forecast
  // ─────────────────────────────────────────────────────────────────────

  async function renderSTEOPanel() {
    const chart   = document.getElementById('mi-steo-chart');
    const insight = document.getElementById('mi-steo-insight');
    if (!chart) return;

    chart.innerHTML = '<div class="mi-loading">Loading STEO forecast…</div>';

    let rows;
    try {
      rows = await fetchSeries(SERIES.STEO_COMM_PRICE);
    } catch (e) {
      console.error('[market_intel] STEO fetch failed:', e);
      chart.innerHTML = '<div class="mi-empty"><div class="mi-empty-icon">⚠</div><div class="mi-empty-msg">STEO data temporarily unavailable.</div></div>';
      return;
    }

    if (!rows.length) {
      chart.innerHTML = '<div class="mi-empty"><div class="mi-empty-icon">📅</div><div class="mi-empty-msg">STEO data not yet collected. The v2 fetcher pulls EIA STEO monthly (released the 2nd Tuesday).</div></div>';
      if (insight) {
        insight.innerHTML = '<span class="mi-insight-eye">💡 What it means</span> Once the v2 commodity fetcher deploys, this panel shows EIA\'s official 18-month commercial electricity price forecast — the canonical reference for procurement modeling.';
      }
      return;
    }

    // Sort by observation date, split into history (actual) vs forecast
    rows.sort((a,b) => new Date(a.observed_at) - new Date(b.observed_at));
    const history  = rows.filter(r => !r.metadata || r.metadata.is_forecast !== true);
    const forecast = rows.filter(r => r.metadata && r.metadata.is_forecast === true);

    if (history.length + forecast.length < 2) {
      chart.innerHTML = '<div class="mi-empty"><div class="mi-empty-icon">📅</div><div class="mi-empty-msg">Building STEO history — only '+rows.length+' point loaded so far.</div></div>';
      return;
    }

    const allPts = rows.map(r => ({ d: new Date(r.observed_at), v: Number(r.value), forecast: !!(r.metadata && r.metadata.is_forecast) }));
    const W = 540, H = 220, P = { t: 16, r: 14, b: 28, l: 44 };
    const innerW = W - P.l - P.r, innerH = H - P.t - P.b;

    const yMax = Math.max(...allPts.map(p => p.v)) * 1.10;
    const yMin = Math.min(...allPts.map(p => p.v)) * 0.90;
    const xOf = (i) => P.l + (i / Math.max(1, allPts.length - 1)) * innerW;
    const yOf = (v) => P.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;

    // History line (solid lime) and forecast line (dashed cyan), joined at the boundary
    const histIdx  = allPts.map((p,i)=>({p,i})).filter(x => !x.p.forecast);
    const fcstIdx  = allPts.map((p,i)=>({p,i})).filter(x => x.p.forecast);

    const histLine = histIdx.length > 1
      ? '<polyline points="'+ histIdx.map(x => xOf(x.i)+','+yOf(x.p.v)).join(' ') +'" fill="none" stroke="'+COLOR.lime+'" stroke-width="2.5" />'
      : '';
    const fcstLine = fcstIdx.length > 1
      ? '<polyline points="'+ fcstIdx.map(x => xOf(x.i)+','+yOf(x.p.v)).join(' ') +'" fill="none" stroke="'+COLOR.cyan+'" stroke-width="2.5" stroke-dasharray="5,4" />'
      : '';

    // Y axis
    let yLabels = '';
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (yMax - yMin) * (i / 4);
      const y = yOf(v);
      yLabels += '<line x1="'+P.l+'" y1="'+y+'" x2="'+(W-P.r)+'" y2="'+y+'" stroke="'+COLOR.grid+'" />';
      yLabels += '<text x="'+(P.l-6)+'" y="'+(y+3)+'" text-anchor="end" fill="'+COLOR.sub+'" font-size="10">'+v.toFixed(1)+'¢</text>';
    }

    // X labels — first, middle, last
    const xLabels =
      '<text x="'+xOf(0)+'" y="'+(H-8)+'" text-anchor="start" fill="'+COLOR.sub+'" font-size="10">'+monthStr(allPts[0].d)+'</text>' +
      '<text x="'+xOf(Math.floor(allPts.length/2))+'" y="'+(H-8)+'" text-anchor="middle" fill="'+COLOR.sub+'" font-size="10">'+monthStr(allPts[Math.floor(allPts.length/2)].d)+'</text>' +
      '<text x="'+xOf(allPts.length-1)+'" y="'+(H-8)+'" text-anchor="end" fill="'+COLOR.sub+'" font-size="10">'+monthStr(allPts[allPts.length-1].d)+'</text>';

    chart.innerHTML =
      '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;max-height:240px">' +
        yLabels + histLine + fcstLine + xLabels +
      '</svg>' +
      '<div class="mi-legend">' +
        '<span><span class="mi-swatch line" style="background:'+COLOR.lime+'"></span>Actual</span>' +
        '<span><span class="mi-swatch line" style="background:'+COLOR.cyan+';opacity:.85"></span>STEO forecast</span>' +
      '</div>';

    if (insight) {
      const lastActual = histIdx.length ? histIdx[histIdx.length-1].p : null;
      const lastForecast = fcstIdx.length ? fcstIdx[fcstIdx.length-1].p : null;
      let msg = 'EIA Short-Term Energy Outlook — the canonical 18-month commercial retail price forecast used across the industry for procurement planning.';
      if (lastActual && lastForecast) {
        const chg = ((lastForecast.v - lastActual.v) / lastActual.v) * 100;
        if (chg > 2) {
          msg = '<strong>EIA expects commercial electricity prices to rise '+chg.toFixed(1)+'%</strong> over the forecast horizon (latest actual '+lastActual.v.toFixed(1)+'¢/kWh → forecast '+lastForecast.v.toFixed(1)+'¢/kWh). Procurement implication: budget for upward pressure; longer fixed-rate tenors hedge the expected rise.';
        } else if (chg < -2) {
          msg = '<strong>EIA expects commercial electricity prices to fall '+Math.abs(chg).toFixed(1)+'%</strong> over the forecast horizon. Procurement implication: shorter tenors may capture the decline; lock long only for budget certainty rather than price hedging.';
        } else {
          msg = '<strong>EIA expects commercial electricity prices to stay roughly flat</strong> over the next 18 months. Procurement timing decisions can prioritize budget certainty over market timing.';
        }
      }
      insight.innerHTML = '<span class="mi-insight-eye">💡 What it means</span> ' + msg;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Top summary strip — 4 KPIs derived from the same data
  // ─────────────────────────────────────────────────────────────────────

  async function renderSummaryStrip() {
    const mount = document.getElementById('mi-summary');
    const asOf  = document.getElementById('mi-as-of');
    if (!mount) return;

    let spot, steoFcstAvg, storage, latestObservedAt, isoLatest;
    try {
      const [spotRows, steoRows, storageRows, isoRows] = await Promise.all([
        fetchSeries(SERIES.HENRY_HUB_SPOT, { limit: 5 }),
        fetchSeries(SERIES.STEO_HH_FORECAST),
        fetchSeries(SERIES.US_STORAGE, { limit: 5 }),
        fetchISOLatest(2),  // last 2 days — for the "data as of" timestamp
      ]);
      spotRows.sort((a,b)=> new Date(a.observed_at) - new Date(b.observed_at));
      storageRows.sort((a,b)=> new Date(a.observed_at) - new Date(b.observed_at));
      steoRows.sort((a,b)=> new Date(a.observed_at) - new Date(b.observed_at));
      spot = spotRows[spotRows.length - 1];
      storage = storageRows[storageRows.length - 1];

      // STEO Henry Hub next-12-month forecast average
      const steoForecast = steoRows.filter(r => r.metadata && r.metadata.is_forecast);
      const next12 = steoForecast.slice(0, 12);
      steoFcstAvg = next12.length ? next12.reduce((a,r)=>a+Number(r.value),0)/next12.length : null;

      // Most recent LIVE observation (excludes STEO forecast rows whose
      // observed_at points at future months, not the publish date).
      // We use the freshest ISO LMP timestamp as the canonical "live" signal
      // since ISO data flows every 15 minutes from the fetcher.
      isoRows.sort((a,b)=> new Date(a.observed_at) - new Date(b.observed_at));
      isoLatest = isoRows.length ? isoRows[isoRows.length - 1].observed_at : null;
      const candidates = [
        spot?.observed_at,
        storage?.observed_at,
        isoLatest,
      ].filter(Boolean);
      latestObservedAt = candidates.length ? candidates.sort().pop() : null;
    } catch (e) {
      console.error('[market_intel] summary fetch failed:', e);
      mount.innerHTML = '<div class="mi-summary-error">Market data temporarily unavailable</div>';
      return;
    }

    const fmtStat = (label, value, sub) =>
      '<div class="mi-stat">' +
        '<div class="mi-stat-lbl">'+label+'</div>' +
        '<div class="mi-stat-val">'+value+'</div>' +
        '<div class="mi-stat-sub">'+(sub || '')+'</div>' +
      '</div>';

    // ISO median (across whatever ISOs returned data) — uses a 30-day window
    // separate from the 2-day window above (which is just for the timestamp).
    let isoMedianLabel = '—', isoMedianSub = '';
    try {
      const isoRows = await fetchISOLatest(35);
      const byIso = {};
      isoRows.forEach(r => { if (r.iso && r.value!=null) (byIso[r.iso]=byIso[r.iso]||[]).push(Number(r.value)); });
      const avgs = Object.keys(byIso).map(iso => ({ iso, avg: byIso[iso].reduce((a,b)=>a+b,0)/byIso[iso].length }));
      if (avgs.length) {
        const sortedAvgs = avgs.slice().sort((a,b)=>a.avg-b.avg);
        const median = sortedAvgs[Math.floor(sortedAvgs.length/2)];
        isoMedianLabel = fmtMoney(median.avg, 2) + '<small>/MWh</small>';
        isoMedianSub = 'Median ISO ('+ avgs.length +' hubs, ~30d)';
      }
    } catch (e) { /* non-fatal */ }

    mount.innerHTML =
      fmtStat('Henry Hub spot',  spot ? fmtMoney(spot.value) : '—', spot ? dateStr(asDate(spot.observed_at)) : '') +
      fmtStat('EIA 12mo forecast', steoFcstAvg != null ? fmtMoney(steoFcstAvg) : '—', steoFcstAvg != null ? 'STEO Henry Hub avg' : 'Awaiting STEO') +
      fmtStat('US storage',      storage ? fmtBcf(storage.value) : '—', storage ? 'Week of '+dateStr(asDate(storage.observed_at)) : '') +
      fmtStat('Wholesale electric', isoMedianLabel, isoMedianSub);

    if (asOf && latestObservedAt) {
      asOf.textContent = 'Data as of ' + new Date(latestObservedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      });
    } else if (asOf) {
      asOf.textContent = 'Awaiting first data cycle…';
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Report data API — consumed by the Beacon Brief report (openReport()).
  // Returns a single object with everything the report's market pages
  // need. All values pre-computed so the report builder stays synchronous
  // once this resolves. Safe to call before the Market tab is opened.
  // ─────────────────────────────────────────────────────────────────────

  window.beaconMarketData = async function () {
    // Wait briefly for the Supabase client to be exposed (same pattern as
    // renderMarketIntel). If it never appears, return null and let the
    // report omit the market section gracefully.
    if (!window._beaconSb) {
      for (let i = 0; i < 20 && !window._beaconSb; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    if (!window._beaconSb) return null;

    try {
      const [spotRows, steoHHRows, storageRows, steoCommRows, isoRows] =
        await Promise.all([
          fetchSeries(SERIES.HENRY_HUB_SPOT, { limit: 40 }),
          fetchSeries(SERIES.STEO_HH_FORECAST),
          fetchSeries(SERIES.US_STORAGE, { limit: 320 }),
          fetchSeries(SERIES.STEO_COMM_PRICE),
          // bundle 134: one server-side summary (benchmark hub per ISO, 30 days).
          // The old query read the OLDEST 1000 rows of the window, not the month.
          window._beaconSb.rpc('market_desk').then(r => (r && r.data && r.data.iso) || [], () => []),
        ]);

      // ── Henry Hub spot ──
      spotRows.sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
      const latestSpot = spotRows.length ? spotRows[spotRows.length - 1] : null;
      const earlierSpot = spotRows.length
        ? spotRows[Math.max(0, spotRows.length - 22)] : null;
      const spot30dChg = (latestSpot && earlierSpot && earlierSpot.value)
        ? ((latestSpot.value - earlierSpot.value) / earlierSpot.value) * 100
        : null;

      // ── STEO Henry Hub forecast ──
      steoHHRows.sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
      const steoForecast = steoHHRows.filter(r => r.metadata && r.metadata.is_forecast);
      const next12 = steoForecast.slice(0, 12);
      const steo12mAvg = next12.length
        ? next12.reduce((s, r) => s + Number(r.value), 0) / next12.length
        : null;
      const lastForecast = steoForecast.length
        ? steoForecast[steoForecast.length - 1] : null;

      // ── US working gas storage + 5-year band position ──
      storageRows.sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
      const latestStorage = storageRows.length
        ? storageRows[storageRows.length - 1] : null;
      // 5-year band: same calendar week across the prior 5 years
      let storageVs5yr = null;
      if (latestStorage) {
        const latestDate = new Date(latestStorage.observed_at);
        const latestWeek = _weekOfYear(latestDate);
        const sameWeek = storageRows.filter(r => {
          const d = new Date(r.observed_at);
          return _weekOfYear(d) === latestWeek &&
                 d.getFullYear() < latestDate.getFullYear() &&
                 d.getFullYear() >= latestDate.getFullYear() - 5;
        });
        if (sameWeek.length) {
          const avg = sameWeek.reduce((s, r) => s + Number(r.value), 0) / sameWeek.length;
          storageVs5yr = avg ? ((latestStorage.value - avg) / avg) * 100 : null;
        }
      }

      // ── ISO LMP medians (per ISO, ~30-day) ──
      const isoTable = isoRows.filter(r => r.avg30 != null).map(r => ({
        iso: r.iso, hub: r.bench_label, avg: Number(r.avg30), median: r.median30 != null ? Number(r.median30) : null, n: Number(r.n30) || 0,
      })).sort((a, b) => a.avg - b.avg);

      // ── STEO commercial electricity forecast ──
      steoCommRows.sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
      const commActual = steoCommRows.filter(r => !(r.metadata && r.metadata.is_forecast));
      const commForecast = steoCommRows.filter(r => r.metadata && r.metadata.is_forecast);
      const commLastActual = commActual.length ? commActual[commActual.length - 1] : null;
      const commLastForecast = commForecast.length
        ? commForecast[commForecast.length - 1] : null;
      const commChgPct = (commLastActual && commLastForecast && commLastActual.value)
        ? ((commLastForecast.value - commLastActual.value) / commLastActual.value) * 100
        : null;

      // "Data as of" — newest live (non-forecast) observation
      const liveStamps = [
        latestSpot && latestSpot.observed_at,
        latestStorage && latestStorage.observed_at,
        isoRows.map(r => r.last_at).filter(Boolean).sort().pop() || null,
      ].filter(Boolean);
      const asOf = liveStamps.length ? liveStamps.sort().pop() : null;

      return {
        ok: true,
        asOf: asOf,
        henryHub: {
          spot: latestSpot ? Number(latestSpot.value) : null,
          spotDate: latestSpot ? latestSpot.observed_at : null,
          spot30dChg: spot30dChg,
          steo12mAvg: steo12mAvg,
          steoLast: lastForecast ? Number(lastForecast.value) : null,
          steoLastDate: lastForecast ? lastForecast.observed_at : null,
          steoForecast: steoForecast.map(r => ({
            date: r.observed_at, value: Number(r.value) })),
        },
        storage: {
          level: latestStorage ? Number(latestStorage.value) : null,
          date: latestStorage ? latestStorage.observed_at : null,
          vs5yrPct: storageVs5yr,
        },
        iso: isoTable,
        commElectric: {
          lastActual: commLastActual ? Number(commLastActual.value) : null,
          lastActualDate: commLastActual ? commLastActual.observed_at : null,
          lastForecast: commLastForecast ? Number(commLastForecast.value) : null,
          lastForecastDate: commLastForecast ? commLastForecast.observed_at : null,
          chgPct: commChgPct,
        },
      };
    } catch (e) {
      console.error('[market_intel] beaconMarketData failed:', e);
      return null;
    }
  };

  // ISO-week helper for the storage 5-year band comparison.
  function _weekOfYear(d) {
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.floor(((d - start) / 86400000 + start.getDay() + 1) / 7);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Public entry point — called by showView('market')
  // ─────────────────────────────────────────────────────────────────────

  let inFlight = false;
  window.renderMarketIntel = async function () {
    if (inFlight) return;
    inFlight = true;
    try {
      // Wait briefly for the IIFE-scoped sb to be exposed on window
      if (!window._beaconSb) {
        for (let i = 0; i < 20 && !window._beaconSb; i++) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
      if (!window._beaconSb) {
        const mount = document.getElementById('sec-market');
        if (mount) {
          mount.querySelectorAll('.mi-loading,.mi-empty').forEach(n => n.remove());
          const banner = document.createElement('div');
          banner.className = 'mi-empty';
          banner.innerHTML = '<div class="mi-empty-icon">🔒</div><div class="mi-empty-msg">Sign in to view market intelligence. The market data tab requires an authenticated Suite session.</div>';
          mount.appendChild(banner);
        }
        return;
      }
      // Fire panels in parallel; each handles its own loading / error state
      await Promise.all([
        // bundle 134: summary strip hidden (the Trading Desk shows these numbers)
        renderStoragePanel(),
        renderHenryHubPanel(),
        // bundle 134: ISO panel replaced by the Trading Desk tiles (trading_desk.js)
        renderSTEOPanel(),
      ]);
    } finally {
      inFlight = false;
    }
  };

})();
