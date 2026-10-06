/* ============================================================================
 * loadprofile.js — Interval data + capacity tags (bundle 130)
 * ----------------------------------------------------------------------------
 * Painted on the Intelligence tab under "Theme · Load". Brokers only.
 *
 *   1. INTERVAL UPLOAD. A utility's 15-minute / hourly usage export:
 *        - long CSV/XLSX: one row per interval (timestamp + value), or a date
 *          column + a time column;
 *        - wide CSV/XLSX: one row per day, 24/48/96 time columns;
 *        - Green Button XML (ESPI IntervalBlock / IntervalReading).
 *      Interval length is read from the timestamps (median spacing, snapped to
 *      5/15/30/60 min). Values are kWh per interval unless the file says kW;
 *      the broker can flip that in the review before saving.
 *   2. LOAD PROFILE per meter (server-side aggregate, interval_profile RPC):
 *      peak kW and when, average kW, load factor, base load (5th percentile
 *      kW), weekday/weekend 24-hour shape, monthly peaks.
 *   3. CAPACITY TAG. Broker enters the meter's capacity tag (PJM PLC / ICAP)
 *      and optionally its transmission tag (NSPL) from the bill or supplier.
 *      Beacon prices the capacity tag at the ISO's published auction price.
 *   4. DEMAND RESPONSE VALUE. Flexible kW = (tag, or measured peak if no tag)
 *      minus measured base load: what the site sheds if it drops to its
 *      always-on load during an event. × the same capacity price = gross
 *      annual capacity value, before the aggregator's share.
 *
 * CAPACITY PRICES (published auction results, see PRICES below for each
 * source). Markets without a single published capacity price (NYISO monthly
 * spot, ERCOT and CAISO with no capacity market, SPP) are shown as
 * "not priced" rather than guessed.
 *
 * Timestamps are stored as local wall-clock time (no zone shift), so hour-of-
 * day shapes read in the building's own time.
 *
 *   window.BeaconLoad.render()
 *   window.BeaconLoad.measured(accounts) -> {value, kw, n, ids, byIso}   (VPP tile)
 * ========================================================================== */
(function () {
  'use strict';

  var DAY = 86400000;
  var MAX_ROWS = 5000;  // per RPC call (server cap 6000)

  // ── Capacity prices ─────────────────────────────────────────────────────
  // $/kW-year. Delivery/planning years run June → May.
  var PRICES = {
    PJM: {
      '2026/27': { kwyr: 329.17 * 365 / 1000, label: '$329.17/MW-day', src: 'PJM 2026/2027 Base Residual Auction (July 2025), RTO-wide at the FERC-approved cap' },
      '2027/28': { kwyr: 333.44 * 365 / 1000, label: '$333.44/MW-day', src: 'PJM 2027/2028 Base Residual Auction (Dec 2025), RTO-wide at the cap' },
    },
    'ISO-NE': {
      '2026/27': { kwyr: 2.59 * 12, label: '$2.59/kW-month', src: 'ISO-NE Forward Capacity Auction 17 (2026/2027), all zones' },
      '2027/28': { kwyr: 3.58 * 12, label: '$3.58/kW-month', src: 'ISO-NE Forward Capacity Auction 18 (2027/2028), all zones' },
    },
    MISO: {
      '2026/27': {
        zones: {
          '1-7': { kwyr: 126.19 * 365 / 1000, label: '$126.19/MW-day annualized (Zones 1–7)' },
          '8': { kwyr: 116.06 * 365 / 1000, label: '$116.06/MW-day annualized (Zone 8)' },
          '9': { kwyr: 123.12 * 365 / 1000, label: '$123.12/MW-day annualized (Zone 9)' },
          '10': { kwyr: 116.06 * 365 / 1000, label: '$116.06/MW-day annualized (Zone 10)' },
        },
        src: 'MISO 2026/2027 Planning Resource Auction (April 2026), seasonal prices annualized',
      },
    },
  };
  var NOT_PRICED = {
    NYISO: 'NYISO capacity clears monthly by zone (no single annual price)',
    ERCOT: 'ERCOT has no capacity market',
    CAISO: 'CAISO capacity is bilateral (Resource Adequacy), no auction price',
    SPP: 'SPP has no capacity auction',
  };
  function deliveryYear(d) {
    d = d || new Date();
    var y = d.getFullYear(), start = d.getMonth() >= 5 ? y : y - 1;
    return start + '/' + String(start + 1).slice(2);
  }

  // ── Which ISO a meter is in: utility first (states split between ISOs) ──
  var UTIL_ISO = [
    [/comed|commonwealth edison|peco|ppl\b|met-?ed|penelec|penn power|west penn|duquesne|pse&g|pseg(?! long)|public service electric|jcp&l|jersey central|atlantic city electric|delmarva|pepco|potomac electric|bge|baltimore gas|dominion|appalachian power|aep|ohio power|ohio edison|cleveland electric|illuminating|toledo edison|duke energy ohio|duke energy kentucky|dayton power|dp&l|aes ohio|first ?energy|potomac edison|mon power|monongahela|allegheny|ugi|rockland electric|kentucky power|indiana michigan/i, 'PJM'],
    [/con ?ed|consolidated edison|nyseg|rg&e|rochester gas|central hudson|orange (and|&) rockland|o&r|niagara mohawk|national grid.*(ny|new york|upstate)|pseg long island|lipa/i, 'NYISO'],
    [/eversource|nstar|western mass|unitil|central maine|cmp\b|versant|green mountain power|united illuminating|national grid/i, 'ISO-NE'],
    [/ameren|entergy|cleco|xcel|northern states|alliant|interstate power|wisconsin power|we energies|wisconsin electric|wps|dte|consumers energy|mge|madison gas|otter tail|minnesota power|nipsco|northern indiana|vectren|centerpoint.*indiana|duke energy indiana|aes indiana|indianapolis power|mid-?american/i, 'MISO'],
    [/oncor|centerpoint(?!.*indiana)|aep texas|tnmp|texas-new mexico/i, 'ERCOT'],
    [/pg&e|pacific gas|southern california edison|sce\b|sdg&e|san diego gas/i, 'CAISO'],
  ];
  var STATE_ISO = { DE: 'PJM', DC: 'PJM', MD: 'PJM', NJ: 'PJM', OH: 'PJM', PA: 'PJM', VA: 'PJM', WV: 'PJM',
    NY: 'NYISO', CT: 'ISO-NE', MA: 'ISO-NE', ME: 'ISO-NE', NH: 'ISO-NE', RI: 'ISO-NE', VT: 'ISO-NE',
    MN: 'MISO', WI: 'MISO', IA: 'MISO', MI: 'MISO', IN: 'MISO', AR: 'MISO', LA: 'MISO', MS: 'MISO', ND: 'MISO',
    TX: 'ERCOT', CA: 'CAISO', KS: 'SPP', OK: 'SPP', NE: 'SPP' };
  var MISO_ZONE = { AR: '8', LA: '9', MS: '10', TX: '9' };
  function isoOf(a) {
    var u = String((a && (a.utility || '')) || '');
    for (var i = 0; i < UTIL_ISO.length; i++) if (UTIL_ISO[i][0].test(u)) return { iso: UTIL_ISO[i][1], via: 'utility' };
    var st = String((a && a.state) || '').toUpperCase();
    return STATE_ISO[st] ? { iso: STATE_ISO[st], via: 'state' } : { iso: null, via: null };
  }
  function priceFor(a, year) {
    var w = isoOf(a);
    if (!w.iso) return { iso: null, note: 'ISO unknown for this utility/state' };
    if (NOT_PRICED[w.iso]) return { iso: w.iso, note: NOT_PRICED[w.iso] };
    var tab = PRICES[w.iso], y = year && tab[year] ? year : deliveryYear();
    var p = tab[y] || tab[Object.keys(tab)[0]], yy = tab[y] ? y : Object.keys(tab)[0];
    if (p.zones) {
      var z = MISO_ZONE[String(a.state || '').toUpperCase()] || '1-7';
      return { iso: w.iso, year: yy, kwyr: p.zones[z].kwyr, label: p.zones[z].label, src: p.src, via: w.via };
    }
    return { iso: w.iso, year: yy, kwyr: p.kwyr, label: p.label, src: p.src, via: w.via };
  }

  // ── small helpers ───────────────────────────────────────────────────────
  function sb() { return window._beaconSb || window.sb || null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function n0(v) { return v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString(); }
  function n1(v) { return v == null || !isFinite(v) ? '—' : (Math.round(v * 10) / 10).toLocaleString(); }
  function money(v) { return v == null || !isFinite(v) ? '—' : '$' + Math.round(v).toLocaleString(); }
  function clientView() {
    var p = window.BeaconPTC;
    if (p && p._clientView) return p._clientView();
    try { return new URLSearchParams(location.search).get('view') === 'client'; } catch (e) { return false; }
  }
  function active() {
    var q = new URLSearchParams(location.search);
    var cid = q.get('clientId') || q.get('client') || window._beaconClientId || '';
    var accts = [];
    try { accts = (window.beaconGetAccounts ? window.beaconGetAccounts(cid) : []) || []; } catch (e) {}
    return { cid: cid, accts: accts };
  }
  function isElec(a) { return !/^gas/i.test(String((a && (a.type || a.accountType)) || '')); }
  function label(a) { var n = a.account || a.accountNumber || a.store_code || a.storeCode || ''; return (a.address || 'Unnamed') + (a.city ? ', ' + a.city : '') + (n ? ' · ' + n : ''); }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, ''); }
  function matchAcct(accts, id) {
    var k = norm(id); if (k.length < 4) return null;
    var hits = accts.filter(function (a) {
      return isElec(a) && [a.account, a.accountNumber, a.store_code, a.storeCode].map(norm).some(function (m) { return m.length >= 4 && (m === k || (k.length >= 6 && m.length >= 6 && (k.indexOf(m) >= 0 || m.indexOf(k) >= 0))); });
    });
    return hits.length === 1 ? hits[0] : null;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function stamp(y, mo, d, h, mi) { return y + '-' + pad(mo) + '-' + pad(d) + 'T' + pad(h) + ':' + pad(mi); }
  function tms(s) { return Date.parse(s + ':00Z'); }                // wall-clock string → ms (as UTC)
  function fromMs(t) { var d = new Date(t); return stamp(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()); }

  // "2026-07-06 14:15", "7/6/2026 2:15 PM", Excel serial, Date objects
  function parseDT(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : stamp(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes());
    if (typeof v === 'number' && v > 20000 && v < 80000) { var t = Math.round((v - 25569) * DAY / 60000) * 60000; return fromMs(t); }
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?\s*([AaPp][Mm])?/.exec(s))) return withAmPm(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), m[6]);
    if ((m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::\d{2})?)?\s*([AaPp][Mm])?/.exec(s))) {
      var y = +m[3]; if (y < 100) y += 2000;
      return withAmPm(y, +m[1], +m[2], +(m[4] || 0), +(m[5] || 0), m[6]);
    }
    return null;
  }
  function withAmPm(y, mo, d, h, mi, ap) {
    if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
    if (h === 24) { var t = tms(stamp(y, mo, d, 0, mi)) + DAY; return fromMs(t); }
    return stamp(y, mo, d, h, mi);
  }
  // A time-of-day cell or header: "14:15", "2:15 PM", "HE14", "14" → minutes after midnight (null if not a time)
  function parseTOD(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && v >= 0 && v < 1) return Math.round(v * 1440);
    if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
    var s = String(v).trim(), m;
    if ((m = /^(?:HE\s*)?(\d{1,2})$/i.exec(s))) { var h = +m[1]; return h <= 24 ? h * 60 : null; }
    if ((m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(s))) {
      var hh = +m[1], ap = m[3] && m[3].toLowerCase();
      if (ap === 'pm' && hh < 12) hh += 12; if (ap === 'am' && hh === 12) hh = 0;
      return hh * 60 + +m[2];
    }
    return null;
  }
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var n = parseFloat(String(v).replace(/[,\s]/g, ''));
    return isFinite(n) ? n : null;
  }
  function snap(min) { var opts = [5, 15, 30, 60]; return opts.reduce(function (b, o) { return Math.abs(o - min) < Math.abs(b - min) ? o : b; }, 60); }
  function inferSeconds(stamps) {
    var t = stamps.map(tms).sort(function (a, b) { return a - b; }), d = [];
    for (var i = 1; i < t.length && d.length < 2000; i++) if (t[i] > t[i - 1]) d.push((t[i] - t[i - 1]) / 60000);
    if (!d.length) return 3600;
    d.sort(function (a, b) { return a - b; });
    return snap(d[Math.floor(d.length / 2)]) * 60;
  }

  // ── parsers → { rows: [[stamp, value]], seconds, unit: 'kWh'|'kW', acct, note } ──
  function parseCsv(t) {
    var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }
  var H = {
    acct: /^(account|acct|accountnumber|accountno|acctno|meter|meternumber|meterno|meterid|esiid|pod|serviceid|premise|servicepoint|said|spid)$/,
    ts: /^(datetime|timestamp|intervalstart|intervalstarttime|starttime|start|startdatetime|readstart|intervaldatetime|datetimestart|intervalbeginning|begin|readdatetime|intervalend|intervalending|endtime|end|enddatetime|datetimeend)$/,
    date: /^(date|readdate|usagedate|day|intervaldate|servicedate|meterreaddate|readingdate)$/,
    time: /^(time|hour|interval|starttime|intervaltime|hourending|he|endtime|intervalending|timeofday)$/,
    val: /^(kwh|usage|consumption|value|quantity|qty|kw|demand|usagekwh|kwhusage|intervalusage|reading|amount|energy|delivered|kwhdelivered|import|netusage)$/,
    unit: /^(unit|units|uom|unitofmeasure)$/,
  };
  function key(h) { return String(h || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, ''); }
  function fromGrid(grid, fname) {
    // Find a header row in the first 20 lines.
    for (var hi = 0; hi < Math.min(grid.length, 20); hi++) {
      var hdr = grid[hi] || [], ks = hdr.map(key), m = {};
      Object.keys(H).forEach(function (f) { ks.forEach(function (k, i) { if (m[f] == null && H[f].test(k)) m[f] = i; }); });
      // Wide: a date column plus ≥ 24 time-of-day columns.
      var tcols = [];
      hdr.forEach(function (h, i) { if (i !== m.date && i !== m.acct) { var tod = parseTOD(h); if (tod != null) tcols.push({ i: i, tod: tod }); } });
      if (tcols.length >= 24 && (m.date != null || m.ts != null)) return wide(grid, hi, m, tcols, hdr, fname);
      if (m.val != null && (m.ts != null || m.date != null)) return long(grid, hi, m, hdr, fname);
    }
    throw new Error('no header row with a timestamp and a usage column, or a date plus 24+ time columns');
  }
  function unitFromHeader(h) { var k = String(h || '').toLowerCase(); return /\bkw\b(?!h)|kw\)|demand/.test(k) && !/kwh/.test(k) ? 'kW' : 'kWh'; }
  function long(grid, hi, m, hdr, fname) {
    var out = [], acct = '', unit = unitFromHeader(hdr[m.val]), ending = m.ts != null && /end/i.test(hdr[m.ts]);
    var timeEnding = m.time != null && /end|^he$/i.test(key(hdr[m.time]));
    grid.slice(hi + 1).forEach(function (r) {
      if (!r) return;
      var s = null;
      if (m.ts != null) s = parseDT(r[m.ts]);
      if (m.date != null && m.time != null) {
        var d = parseDT(r[m.date]), tod = parseTOD(r[m.time]);
        if (d && tod != null) s = fromMs(tms(d.slice(0, 10) + 'T00:00') + tod * 60000);
      } else if (!s && m.date != null) s = parseDT(r[m.date]);
      var v = num(r[m.val]);
      if (!s || v == null) return;
      if (m.unit != null && /^kw$/i.test(String(r[m.unit]).trim())) unit = 'kW';
      if (m.acct != null && !acct && r[m.acct]) acct = String(r[m.acct]).trim();
      out.push([s, v]);
    });
    var sec = inferSeconds(out.map(function (x) { return x[0]; }));
    if (ending || timeEnding) out.forEach(function (x) { x[0] = fromMs(tms(x[0]) - sec * 1000); });
    return { rows: out, seconds: sec, unit: unit, acct: acct, note: (ending || timeEnding) ? 'timestamps were interval-ending; shifted to interval start' : '' };
  }
  function wide(grid, hi, m, tcols, hdr, fname) {
    tcols.sort(function (a, b) { return a.i - b.i; });
    var n = tcols.length, sec = Math.round(86400 / n);
    sec = snap(sec / 60) * 60;
    // Labels that start at 0:00 are interval-start; labels starting at 0:15 / 1:00 / HE1 are interval-ending.
    var ending = tcols[0].tod > 0;
    var out = [], acct = '', unit = /kw\b(?!h)/i.test(hdr.join(' ')) && !/kwh/i.test(hdr.join(' ')) ? 'kW' : 'kWh';
    grid.slice(hi + 1).forEach(function (r) {
      if (!r) return;
      var d = parseDT(r[m.date != null ? m.date : m.ts]); if (!d) return;
      var base = tms(d.slice(0, 10) + 'T00:00');
      if (m.acct != null && !acct && r[m.acct]) acct = String(r[m.acct]).trim();
      tcols.forEach(function (c) {
        var v = num(r[c.i]); if (v == null) return;
        var start = base + (c.tod * 60000) - (ending ? sec * 1000 : 0);
        out.push([fromMs(start), v]);
      });
    });
    return { rows: out, seconds: sec, unit: unit, acct: acct, note: n + ' interval columns per day' + (ending ? ' (interval-ending labels)' : '') };
  }
  // Green Button (ESPI). Values are Wh × 10^powerOfTenMultiplier when uom = 72.
  function fromGreenButton(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var byLocal = function (el, name) { var r = []; var all = el.getElementsByTagName('*'); for (var i = 0; i < all.length; i++) if (all[i].localName === name) r.push(all[i]); return r; };
    var one = function (el, name) { var r = byLocal(el, name); return r.length ? r[0].textContent.trim() : null; };
    var uom = one(doc, 'uom'), pow = +(one(doc, 'powerOfTenMultiplier') || 0);
    var tz = +(one(doc, 'tzOffset') || 0), dst = +(one(doc, 'dstOffset') || 0);
    var reads = byLocal(doc, 'IntervalReading');
    if (!reads.length) throw new Error('no IntervalReading entries in this XML');
    var out = [], secs = [];
    reads.forEach(function (r) {
      var st = byLocal(r, 'start')[0], du = byLocal(r, 'duration')[0], v = byLocal(r, 'value')[0];
      if (!st || !v) return;
      var utc = +st.textContent * 1000, d = du ? +du.textContent : 3600;
      var local = utc + tz * 1000 + (dst && usDst(utc + tz * 1000) ? dst * 1000 : 0);
      var wh = +v.textContent * Math.pow(10, pow);
      out.push([fromMs(local), uom === '72' || uom == null ? wh / 1000 : wh]);
      secs.push(d);
    });
    secs.sort(function (a, b) { return a - b; });
    var sec = snap((secs[Math.floor(secs.length / 2)] || 3600) / 60) * 60;
    return { rows: out, seconds: sec, unit: 'kWh', acct: '', note: 'Green Button' + (uom && uom !== '72' ? ' (uom ' + uom + ', check units)' : ''), source: 'green_button' };
  }
  function usDst(t) {       // US rule: 2nd Sunday of March 2:00 → 1st Sunday of November 2:00 (local standard time)
    var d = new Date(t), y = d.getUTCFullYear();
    var nthSun = function (mo, nth) { var x = new Date(Date.UTC(y, mo, 1)); var add = (7 - x.getUTCDay()) % 7 + (nth - 1) * 7; return Date.UTC(y, mo, 1 + add, 2); };
    return t >= nthSun(2, 2) && t < nthSun(10, 1);
  }
  function readFile(file) {
    return new Promise(function (ok, bad) {
      var fr = new FileReader(), isXml = /\.xml$/i.test(file.name), isCsv = /\.(csv|txt)$/i.test(file.name);
      fr.onerror = function () { bad(new Error('could not read the file')); };
      fr.onload = function () {
        try {
          if (isXml) return ok(fromGreenButton(String(fr.result)));
          if (isCsv) return ok(fromGrid(parseCsv(String(fr.result)), file.name));
          if (!window.XLSX) throw new Error('spreadsheet reader not loaded');
          var wb = window.XLSX.read(fr.result, { type: 'array', cellDates: true });
          ok(fromGrid(window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }), file.name));
        } catch (e) { bad(e); }
      };
      if (isXml || isCsv) fr.readAsText(file); else fr.readAsArrayBuffer(file);
    });
  }
  // Clean: dedupe stamps (first wins; DST fall-back repeats), keep only aligned rows.
  function clean(p) {
    var seen = {}, rows = [];
    p.rows.forEach(function (x) {
      var t = tms(x[0]);
      if (!isFinite(t) || seen[x[0]] || ((t / 1000) % p.seconds) !== 0) return;
      seen[x[0]] = 1; rows.push(x);
    });
    rows.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    p.dropped = p.rows.length - rows.length; p.rows = rows;
    return p;
  }
  function summarize(p) {
    var k = p.unit === 'kW' ? p.seconds / 3600 : 1, peak = 0, at = '', tot = 0;
    p.rows.forEach(function (x) { var kwh = x[1] * k, kw = kwh * 3600 / p.seconds; tot += kwh; if (kw > peak) { peak = kw; at = x[0]; } });
    return { n: p.rows.length, first: p.rows.length ? p.rows[0][0] : '', last: p.rows.length ? p.rows[p.rows.length - 1][0] : '', kwh: tot, peak: peak, at: at,
      days: p.rows.length ? Math.round((tms(p.rows[p.rows.length - 1][0]) + p.seconds * 1000 - tms(p.rows[0][0])) / DAY) : 0 };
  }
  function template() {
    var csv = 'account_number,interval_start,kwh\n';
    for (var i = 0; i < 8; i++) csv += '1234567890,2026-07-06 ' + pad(Math.floor(i / 4)) + ':' + pad((i % 4) * 15) + ',' + (42.5 + i).toFixed(1) + '\n';
    var b = new Blob([csv], { type: 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'beacon_interval_template.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ── state ───────────────────────────────────────────────────────────────
  var _seq = 0, _state = { cid: null, profiles: null, msg: '' }, _pending = null, _sel = null, _sig = '', _repainting = false;
  function loadProfiles(cid) {
    var c = sb();
    if (!c || !c.auth) return Promise.reject(new Error('not connected'));
    return c.auth.getSession().then(function (s) {
      if (!(s && s.data && s.data.session)) { var e = new Error('sign in'); e.signin = true; throw e; }
      return c.rpc('interval_profile', { p_customer: cid });
    }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      var by = {}; (r.data || []).forEach(function (x) { by[x.account_id] = x; });
      return by;
    });
  }
  function publish(cid, by) {
    window.__loadProfiles = { client: cid, by_id: by };
    var sig = cid + '|' + Object.keys(by).map(function (k) { return k + ':' + by[k].n + ':' + by[k].capacity_tag_kw; }).join(',');
    if (sig !== _sig) {
      _sig = sig;
      if (typeof window.renderAll === 'function') { try { _repainting = true; window.renderAll(); } finally { _repainting = false; } }
    }
  }

  // ── math shared with the Grid Services tile ─────────────────────────────
  function evaluate(a, prof) {
    var pr = priceFor(a, prof && prof.capacity_tag_year), peak = prof && Number(prof.peak_kw), base = prof && Number(prof.base_kw);
    var tag = prof && prof.capacity_tag_kw != null ? Number(prof.capacity_tag_kw) : null;
    var basis = tag != null ? tag : (peak || null);
    var flex = basis != null && base != null && prof.n ? Math.max(0, basis - base) : null;
    return {
      price: pr, peak: peak || null, base: prof && prof.n ? base : null, tag: tag, trans: prof && prof.transmission_tag_kw != null ? Number(prof.transmission_tag_kw) : null,
      capCost: pr.kwyr && basis != null ? basis * pr.kwyr : null, capBasis: tag != null ? 'tag' : 'peak',
      flex: flex, drValue: pr.kwyr && flex != null ? flex * pr.kwyr : null,
      lf: prof && prof.n && peak ? Number(prof.avg_kw) / peak : null,
    };
  }
  function measured(accounts) {
    var lp = window.__loadProfiles; if (!lp || !lp.by_id) return null;
    var out = { value: 0, kw: 0, n: 0, ids: {}, byIso: {} };
    (accounts || []).forEach(function (a) {
      var p = lp.by_id[a.id]; if (!p || !p.n) return;
      var e = evaluate(a, p); if (e.drValue == null) return;
      out.value += e.drValue; out.kw += e.flex; out.n++; out.ids[a.id] = 1;
      out.byIso[e.price.iso] = (out.byIso[e.price.iso] || 0) + e.drValue;
    });
    return out.n ? out : null;
  }

  // ── paint ────────────────────────────────────────────────────────────────
  var BTN = 'background:#add540;color:#0a0e1a;border:0;border-radius:6px;padding:7px 14px;font-weight:700;font-size:12px;cursor:pointer';
  var BTN2 = 'background:transparent;color:var(--lime);border:1px solid rgba(173,213,64,0.35);border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer';
  var INP = 'background:#0a0e1a;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:4px;font-size:12px;padding:5px 7px';
  function row(l, v) { return '<div class="bm-row"><span class="bm-row-lbl">' + l + '</span><span class="bm-row-val">' + v + '</span></div>'; }
  function fmtAt(s) { if (!s) return '—'; var d = new Date(tms(String(s).replace(' ', 'T').slice(0, 16))); return isNaN(d) ? esc(s) : d.toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function shapeSvg(sh) {
    if (!sh || !sh.wd) return '';
    var all = (sh.wd || []).concat(sh.we || []).filter(function (v) { return v != null; });
    var mx = Math.max.apply(null, all.concat([1])), W = 520, Ht = 64;
    var line = function (arr, col, dash) {
      var pts = []; (arr || []).forEach(function (v, i) { if (v != null) pts.push((i * (W / 23)).toFixed(1) + ',' + (Ht - (v / mx) * (Ht - 6) - 2).toFixed(1)); });
      return pts.length ? '<polyline fill="none" stroke="' + col + '" stroke-width="2"' + (dash ? ' stroke-dasharray="4 3"' : '') + ' points="' + pts.join(' ') + '"/>' : '';
    };
    return '<svg viewBox="0 0 ' + W + ' ' + (Ht + 14) + '" style="width:100%;max-width:440px;height:auto;display:block;margin-top:8px" role="img" aria-label="Average kW by hour of day">' +
      '<line x1="0" y1="' + Ht + '" x2="' + W + '" y2="' + Ht + '" stroke="rgba(255,255,255,.15)"/>' +
      line(sh.wd, '#add540') + line(sh.we, 'rgba(255,255,255,.55)', true) +
      [0, 6, 12, 18, 23].map(function (h) { return '<text x="' + (h * W / 23).toFixed(0) + '" y="' + (Ht + 12) + '" fill="rgba(255,255,255,.45)" font-size="11" text-anchor="' + (h === 0 ? 'start' : h === 23 ? 'end' : 'middle') + '">' + (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? h + 'a' : (h - 12) + 'p') + '</text>'; }).join('') +
      '</svg><div class="loc-card-srcline" style="margin-top:2px"><span style="color:#add540">━</span> weekday · <span style="color:rgba(255,255,255,.6)">┅</span> weekend · average kW by hour</div>';
  }
  function meterPicker(list, sel, attr) {
    return '<select ' + attr + ' style="' + INP + ';max-width:100%">' + list.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(label(a)) + '</option>'; }).join('') + '</select>';
  }
  function tileA(ctx, by) {
    var withData = ctx.accts.filter(function (a) { return by[a.id] && by[a.id].n; });
    var head = '<div class="ic-lbl">📈 Load profile</div>';
    if (!withData.length) return head + '<div class="loc-card-sub" style="margin-top:6px">No interval data yet for this client. Upload a utility’s 15-minute or hourly export (CSV, Excel or Green Button XML) to see peak demand, load factor, base load and the daily load shape.</div>' + (_state.msg ? '<div class="loc-card-srcline" style="margin-top:6px">' + esc(_state.msg) + '</div>' : '');
    if (!_sel || !by[_sel] || !by[_sel].n) _sel = withData[0].id;
    var a = withData.filter(function (x) { return x.id === _sel; })[0], p = by[_sel], e = evaluate(a, p);
    return head + (withData.length > 1 ? '<div style="margin:4px 0 8px">' + meterPicker(withData, _sel, 'data-ld-sel') + '</div>' : '<div class="loc-card-srcline" style="margin:2px 0 6px">' + esc(label(a)) + '</div>') +
      '<div class="ic-cols"><div class="ic-hero"><div class="bm-bignum">' + n0(e.peak) + '<span style="font-size:16px;color:var(--mu)"> kW</span></div><div class="ic-unit">measured peak demand</div></div><div class="ic-data">' +
      row('Peak at', fmtAt(p.peak_at)) +
      row('Average load', n1(Number(p.avg_kw)) + ' kW') +
      row('Load factor', e.lf != null ? Math.round(e.lf * 100) + '%' : '—') +
      row('Base load', n1(e.base) + ' kW <span style="color:var(--mu)">· ' + (e.peak ? Math.round(e.base / e.peak * 100) : '—') + '% of peak</span>') +
      row('Data', n0(p.n) + ' × ' + (p.interval_seconds / 60) + '-min · ' + esc(String(p.first_ts).slice(0, 10)) + ' → ' + esc(String(p.last_ts).slice(0, 10))) +
      row('Energy in range', n0(Number(p.total_kwh)) + ' kWh') +
      '</div></div>' + shapeSvg(p.shape) +
      '<div class="loc-card-srcline" style="margin-top:6px">Base load = 5th-percentile demand (what runs nights and weekends). Load factor = average ÷ peak.</div>' +
      (_state.msg ? '<div class="loc-card-srcline" style="margin-top:4px">' + esc(_state.msg) + '</div>' : '');
  }
  function tileB(ctx, by) {
    var elec = ctx.accts.filter(isElec);
    var head = '<div class="ic-lbl">⚡ Capacity tag &amp; demand response</div>';
    if (!elec.length) return head + '<div class="loc-card-sub">No electric meters on this client.</div>';
    var sel = _sel && elec.some(function (a) { return a.id === _sel; }) ? _sel : elec[0].id;
    var a = elec.filter(function (x) { return x.id === sel; })[0], p = by[sel] || {}, e = evaluate(a, p);
    var pr = e.price;
    var priceLine = pr.kwyr ? esc(pr.iso) + ' ' + esc(pr.year) + ': ' + esc(pr.label) + ' = $' + pr.kwyr.toFixed(2) + '/kW-yr' : esc(pr.iso ? pr.iso + ' — ' : '') + esc(pr.note);
    var out = '';
    if (pr.kwyr) {
      out += row(e.capBasis === 'tag' ? 'Capacity cost (tag ' + n0(e.tag) + ' kW)' : 'Capacity cost (from peak, no tag)', money(e.capCost) + '/yr');
      if (e.flex != null) {
        out += row('Flexible kW', n0(e.flex) + ' kW <span style="color:var(--mu)">· ' + (e.capBasis === 'tag' ? 'tag' : 'peak') + ' − base load</span>');
        out += row('DR capacity value', '<b style="color:#add540">' + money(e.drValue) + '/yr</b>');
      } else out += row('DR capacity value', '<span style="color:var(--mu)">needs interval data</span>');
      if (e.tag != null) out += row('Tag 10% lower saves', money(e.tag * 0.1 * pr.kwyr) + '/yr');
    }
    var hero = pr.kwyr && e.drValue != null ? '<div class="bm-bignum" style="color:#add540">' + money(e.drValue) + '</div><div class="ic-unit">gross DR capacity value / yr</div>' +
        '<div class="bm-verdict" style="background:rgba(173,213,64,.12);color:#add540;border:1px solid rgba(173,213,64,.35)">Measured · ' + (e.capBasis === 'tag' ? 'tag + interval data' : 'interval data') + '</div>'
      : '<div class="bm-bignum" style="color:var(--mu)">—</div><div class="ic-unit">' + (pr.kwyr ? 'add interval data' : 'not priced') + '</div>';
    return head + (elec.length > 1 ? '<div style="margin:4px 0 8px">' + meterPicker(elec, sel, 'data-ld-sel2') + '</div>' : '') +
      '<div class="ic-cols"><div class="ic-hero">' + hero + '</div><div class="ic-data">' + out + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px">' +
        '<label style="font-size:11px;color:var(--mu)">Capacity tag kW <input data-ld-cap type="number" min="0" step="0.1" value="' + (e.tag != null ? e.tag : '') + '" style="' + INP + ';width:90px"></label>' +
        '<label style="font-size:11px;color:var(--mu)">Transmission tag kW <input data-ld-trn type="number" min="0" step="0.1" value="' + (e.trans != null ? e.trans : '') + '" style="' + INP + ';width:90px"></label>' +
        '<label style="font-size:11px;color:var(--mu)">Year <input data-ld-yr value="' + esc(p.capacity_tag_year || deliveryYear()) + '" style="' + INP + ';width:70px"></label>' +
        '<label style="font-size:11px;color:var(--mu)">From <input data-ld-src value="' + esc(p.tag_source || '') + '" placeholder="bill / supplier" style="' + INP + ';width:110px"></label>' +
        '<button type="button" data-ld-tagsave style="' + BTN2 + '">Save tags</button></div>' +
      '<div class="loc-card-srcline" data-ld-tagmsg style="margin-top:6px">' + priceLine + (pr.src ? ' · ' + esc(pr.src) : '') + (pr.via === 'state' ? ' · ISO from state' : '') +
        '. Capacity cost is before the utility’s scaling factors and supplier margin. DR value assumes the site can drop to its base load during events; aggregator shares vary.</div>';
  }
  function tileC(ctx) {
    var elec = ctx.accts.filter(isElec);
    var html = '<div class="ic-lbl">⬆ Add interval data</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">' +
        '<label style="' + BTN + '">Interval file<input type="file" data-ld-file accept=".csv,.txt,.xlsx,.xls,.xml" style="display:none"></label>' +
        '<button type="button" data-ld-tpl style="' + BTN2 + '">Template</button>' +
        '<span class="loc-card-srcline" data-ld-msg>15-minute or hourly export from the utility: CSV, Excel, or Green Button XML. One meter per file.</span></div>';
    if (_pending) {
      var s = summarize(_pending), opts = elec.map(function (a) { return '<option value="' + esc(a.id) + '"' + (a.id === _pending.account_id ? ' selected' : '') + '>' + esc(label(a)) + '</option>'; }).join('');
      html += '<div style="margin-top:10px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px">' +
        '<div class="ic-lbl">✔ Check before saving · ' + esc(_pending.fname) + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0">' +
          '<select data-ld-acct style="' + INP + ';max-width:320px"><option value="">— pick meter —</option>' + opts + '</select>' +
          '<label style="font-size:11px;color:#fff">Values are <select data-ld-unit style="' + INP + '"><option value="kWh"' + (_pending.unit === 'kWh' ? ' selected' : '') + '>kWh per interval</option><option value="kW"' + (_pending.unit === 'kW' ? ' selected' : '') + '>average kW</option></select></label>' +
          '<button type="button" data-ld-save style="' + BTN + '"' + (_pending.account_id && s.n ? '' : ' disabled') + '>Save ' + n0(s.n) + ' intervals</button>' +
          '<button type="button" data-ld-discard style="' + BTN2 + '">Discard</button></div>' +
        '<div class="bm-rows">' +
          row('Intervals', n0(s.n) + ' × ' + (_pending.seconds / 60) + ' min' + (_pending.dropped ? ' <span style="color:#f59e0b">· ' + _pending.dropped + ' skipped (duplicate or off-grid)</span>' : '')) +
          row('Range', esc(s.first.replace('T', ' ')) + ' → ' + esc(s.last.replace('T', ' ')) + ' (' + s.days + ' days)') +
          row('Energy', n0(s.kwh) + ' kWh') +
          row('Peak', n1(s.peak) + ' kW at ' + esc(s.at.replace('T', ' '))) +
          (_pending.acct ? row('File account', esc(_pending.acct)) : '') +
          (_pending.note ? row('Note', esc(_pending.note)) : '') +
        '</div><div class="loc-card-srcline" data-ld-smsg style="margin-top:6px">Times are kept in the building’s local clock time. Saving the same intervals again replaces them.</div></div>';
    }
    return html;
  }
  function bind(root, ctx) {
    var A = root.A, B = root.B, C = root.C;
    var sel = A.querySelector('[data-ld-sel]'); if (sel) sel.addEventListener('change', function () { _sel = sel.value; repaint(ctx); });
    var sel2 = B.querySelector('[data-ld-sel2]'); if (sel2) sel2.addEventListener('change', function () { _sel = sel2.value; repaint(ctx); });
    var ts = B.querySelector('[data-ld-tagsave]');
    if (ts) ts.addEventListener('click', function () {
      var acc = (B.querySelector('[data-ld-sel2]') || {}).value || (ctx.accts.filter(isElec)[0] || {}).id, m = B.querySelector('[data-ld-tagmsg]');
      var cap = num(B.querySelector('[data-ld-cap]').value), trn = num(B.querySelector('[data-ld-trn]').value);
      m.textContent = 'Saving…';
      sb().rpc('tag_save', { p_customer: ctx.cid, p_account: acc, p_capacity_kw: cap, p_year: B.querySelector('[data-ld-yr]').value.trim(), p_transmission_kw: trn, p_source: B.querySelector('[data-ld-src]').value.trim() })
        .then(function (r) { if (r.error) { m.textContent = 'Not saved: ' + r.error.message; m.style.color = '#ef4444'; return; } _sel = acc; _state.cid = null; _state.msg = 'Tags saved.'; render(); },
              function (e) { m.textContent = 'Not saved: ' + e.message; });
    });
    C.querySelector('[data-ld-tpl]').addEventListener('click', template);
    C.querySelector('[data-ld-file]').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0], m = C.querySelector('[data-ld-msg]'); ev.target.value = '';
      if (!f) return;
      m.textContent = 'Reading ' + f.name + '…'; m.style.color = '';
      readFile(f).then(function (p) {
        p = clean(p); p.fname = f.name; p.cid = ctx.cid;
        if (!p.rows.length) throw new Error('no usable intervals found');
        var hit = p.acct ? matchAcct(ctx.accts, p.acct) : null, elec = ctx.accts.filter(isElec);
        p.account_id = hit ? hit.id : (elec.length === 1 ? elec[0].id : '');
        _pending = p; repaint(ctx);
      }).catch(function (e) { m.textContent = f.name + ': ' + e.message; m.style.color = '#ef4444'; });
    });
    if (_pending) {
      C.querySelector('[data-ld-acct]').addEventListener('change', function (ev) { _pending.account_id = ev.target.value; repaint(ctx); });
      C.querySelector('[data-ld-unit]').addEventListener('change', function (ev) { _pending.unit = ev.target.value; repaint(ctx); });
      C.querySelector('[data-ld-discard]').addEventListener('click', function () { _pending = null; repaint(ctx); });
      C.querySelector('[data-ld-save]').addEventListener('click', function () { save(ctx, C); });
    }
  }
  function save(ctx, C) {
    var p = _pending, m = C.querySelector('[data-ld-smsg]'), btn = C.querySelector('[data-ld-save]'), c = sb();
    if (!p || !p.account_id || !c) return;
    btn.disabled = true;
    var k = p.unit === 'kW' ? p.seconds / 3600 : 1;
    var rows = p.rows.map(function (x) { return [x[0], Math.round(x[1] * k * 10000) / 10000]; });
    var chunks = []; for (var i = 0; i < rows.length; i += MAX_ROWS) chunks.push(rows.slice(i, i + MAX_ROWS));
    var done = 0;
    chunks.reduce(function (pr, ch) {
      return pr.then(function () {
        m.textContent = 'Saving ' + n0(done) + ' of ' + n0(rows.length) + '…';
        return c.rpc('interval_save', { p_customer: ctx.cid, p_account: p.account_id, p_seconds: p.seconds, p_rows: ch, p_source: p.source || 'csv_upload', p_doc: p.fname })
          .then(function (r) { if (r.error) throw new Error(r.error.message); done += ch.length; });
      });
    }, Promise.resolve()).then(function () {
      _sel = p.account_id; _pending = null; _state.cid = null; _state.msg = 'Saved ' + n0(done) + ' intervals.'; render();
    }, function (e) { m.textContent = 'Not saved' + (done ? ' (after ' + n0(done) + ' intervals)' : '') + ': ' + e.message; m.style.color = '#ef4444'; btn.disabled = false; });
  }
  function els() { return { A: document.getElementById('ld-a'), B: document.getElementById('ld-b'), C: document.getElementById('ld-c') }; }
  function repaint(ctx) {
    var r = els(), by = (_state.profiles && _state.cid === ctx.cid) ? _state.profiles : {};
    r.A.innerHTML = tileA(ctx, by); r.B.innerHTML = tileB(ctx, by); r.C.innerHTML = tileC(ctx);
    bind(r, ctx);
  }
  function render() {
    if (_repainting) return;
    var hd = document.getElementById('ld-hd'), grid = document.getElementById('ld-grid');
    if (!hd || !grid) return;
    if (clientView()) { hd.style.display = 'none'; grid.style.display = 'none'; return; }
    hd.style.display = ''; grid.style.display = '';
    var ctx = active();
    if (_state.cid === ctx.cid && _state.profiles) { repaint(ctx); return; }
    if (_state.cid !== ctx.cid) { _pending = _pending && _pending.cid === ctx.cid ? _pending : null; }
    if (window.__loadProfiles && window.__loadProfiles.client !== ctx.cid) window.__loadProfiles = undefined;
    var seq = ++_seq, r = els();
    r.A.innerHTML = '<div class="ic-lbl">📈 Load profile</div><div class="loc-card-sub">Checking…</div>';
    r.B.innerHTML = tileB(ctx, {}); r.C.innerHTML = tileC(ctx); bind(r, ctx);
    loadProfiles(ctx.cid).then(function (by) {
      if (seq !== _seq) return;
      _state = { cid: ctx.cid, profiles: by, msg: _state.msg };
      repaint(ctx); publish(ctx.cid, by);
    }).catch(function (e) {
      if (seq !== _seq) return;
      if (!e.signin) console.warn('[load] failed', e.message || e);
      r.A.innerHTML = '<div class="ic-lbl">📈 Load profile</div><div class="loc-card-sub">' + (e.signin ? 'Sign in to see and add this client’s interval data.' : 'Could not load interval data: ' + esc(e.message || e)) + '</div>';
    });
  }

  window.BeaconLoad = { render: render, measured: measured, evaluate: evaluate, priceFor: priceFor, isoOf: isoOf, deliveryYear: deliveryYear,
    _fromGrid: fromGrid, _parseCsv: parseCsv, _fromGreenButton: fromGreenButton, _clean: clean, _summarize: summarize, _parseDT: parseDT, PRICES: PRICES };
})();
