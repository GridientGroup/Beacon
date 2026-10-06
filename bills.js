/* ============================================================================
 * bills.js — Monthly bill reader (bundle 127)
 * ----------------------------------------------------------------------------
 * Gets real MONTHLY bills into Beacon so the Bill Anomaly and Weather-
 * Normalized M&V tiles run on this client's own numbers instead of an
 * "awaiting data" shell. Painted on the Intelligence tab under
 * "Theme · Bills". Brokers only (hidden in "View as: Client").
 *
 * Two ways in, one review step, nothing saved until the broker clicks Save:
 *   1. Usage history file (CSV / XLSX): one row per meter per billing period.
 *      Header names are matched loosely (account, start, end, usage, unit,
 *      kW, cost). Units are converted: MWh→kWh ×1000; ccf→therms ×1.037,
 *      mcf ×10.37, dth ×10.
 *   2. Bill PDF: read by the bill-extract edge function (Claude, figures
 *      copied as printed — never estimated). The current period plus any
 *      printed history table come back as rows.
 * Rows with only a month (no read dates) are shown but not saved: a period
 * needs real start and end dates for degree days to mean anything.
 *
 * Storage: beacon.meter_readings via SECURITY DEFINER RPCs
 *   bill_readings_save(p_customer, p_rows)  bill_history(p_customer)
 * which check that the signed-in broker can reach the client.
 *
 * Weather: weather-dd edge function — NOAA NCEI GHCN-Daily TMAX/TMIN for the
 * nearest station, degree days base 65°F. A bill's HDD/CDD is the sum over
 * its days [start, end). A period with under 90% of days reported gets no
 * HDD/CDD (left out of the regression rather than guessed); 90–99% is scaled
 * to the full period and counted.
 *
 * Output: window.__billHistory = { by_account: { '<store_code>'|'id:<id>': [bill] } }
 * which beacon_pro_renderer.js already reads, then renderAll() repaints.
 *
 *   window.BeaconBills.render()   paint for the active client
 * ========================================================================== */
(function () {
  'use strict';

  var FN = 'https://wnzpoacrdxrddwptpeiz.supabase.co/functions/v1/';
  var DAY = 86400000;
  var MAX_DAYS = 62;
  var UNIT = { kwh: ['kWh', 1], mwh: ['kWh', 1000], wh: ['kWh', 0.001],
    therm: ['therms', 1], therms: ['therms', 1], thm: ['therms', 1], ccf: ['therms', 1.037], hcf: ['therms', 1.037],
    mcf: ['therms', 10.37], dth: ['therms', 10], dekatherm: ['therms', 10], dekatherms: ['therms', 10], mmbtu: ['therms', 10] };

  function sb() { return window._beaconSb || window.sb || null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function fmtN(n) { return n == null ? '—' : Math.round(n).toLocaleString(); }
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
  function isGas(a) { return /^gas/i.test(String((a && (a.type || a.accountType)) || '')); }
  function unitFor(a) { return isGas(a) ? 'therms' : 'kWh'; }
  function where(a) { return (a.address || 'Unnamed') + (a.city ? ', ' + a.city : ''); }
  function label(a) {
    var n = a.account || a.accountNumber || a.store_code || a.storeCode || '';
    return (isGas(a) ? 'Gas' : 'Electric') + ' · ' + where(a) + (n ? ' · ' + n : '');
  }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^0+/, ''); }

  // ── dates ────────────────────────────────────────────────────────────────
  function isoOf(d) { return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function toIso(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : isoOf(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())));
    if (typeof v === 'number' && v > 20000 && v < 80000) return isoOf(new Date(Date.UTC(1899, 11, 30) + v * DAY)); // Excel serial
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    if ((m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s))) {
      var y = +m[3]; if (y < 100) y += 2000;
      return y + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
    }
    return null;
  }
  function ms(iso) { return Date.parse(iso + 'T00:00:00Z'); }
  function days(a, b) { return Math.round((ms(b) - ms(a)) / DAY); }
  function monthOf(v) {
    if (v == null || v === '') return null;
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})$/.exec(s))) return m[1] + '-' + m[2].padStart(2, '0');
    var d = new Date(s + (/\d{4}$/.test(s) ? ' 1' : ''));
    return isNaN(d) ? null : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  // ── matching a file's account / meter to one of this client's meters ─────
  function matchAcct(accts, ids, commodity) {
    var keys = (ids || []).map(norm).filter(function (k) { return k.length >= 4; });
    if (!keys.length) return null;
    var hits = accts.filter(function (a) {
      var mine = [a.account, a.accountNumber, a.store_code, a.storeCode].map(norm).filter(function (k) { return k.length >= 4; });
      return mine.some(function (m) { return keys.some(function (k) { return k === m || (k.length >= 6 && m.length >= 6 && (k.indexOf(m) >= 0 || m.indexOf(k) >= 0)); }); });
    });
    if (hits.length > 1 && commodity) {
      var g = /gas/i.test(commodity);
      var f = hits.filter(function (a) { return isGas(a) === g; });
      if (f.length) hits = f;
    }
    return hits.length === 1 ? hits[0] : null;
  }

  // One review row. Every check that decides "can this be saved" lives here.
  // Month-only rows (a bill's usage-history table prints a month, not read
  // dates). Off by default; when the broker turns it on, each such row gets
  // the calendar month as its period and is labelled approximate everywhere.
  var _calMonths = false;
  function nextMonth(m) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1; if (mo > 12) { mo = 1; y++; } return y + '-' + String(mo).padStart(2, '0'); }
  function check(r, byId) {
    var a = byId[r.account_id];
    r.problem = '';
    if (r.month && /^\d{4}-\d{2}$/.test(r.month) && (!r.start || !r.end || r.approx)) {
      if (_calMonths) { r.start = r.month + '-01'; r.end = nextMonth(r.month) + '-01'; r.approx = true; }
      else if (r.approx) { r.start = null; r.end = null; r.approx = false; }
    }
    if (!a) r.problem = 'pick the meter';
    else if (!r.start || !r.end) r.problem = r.month ? 'month only — needs read dates' : 'no dates';
    else if (days(r.start, r.end) < 1 || days(r.start, r.end) > MAX_DAYS) r.problem = 'period ' + days(r.start, r.end) + ' days';
    else if (r.usage == null || r.usage < 0) r.problem = 'no usage';
    else if (!r.unit) r.problem = 'unknown unit';
    else if (r.unit !== unitFor(a)) r.problem = r.unit + ' on a ' + (isGas(a) ? 'gas' : 'electric') + ' meter';
    if (r.problem) r.ok = false;
    return r;
  }
  function convert(usage, rawUnit, fallback) {
    var k = String(rawUnit || '').toLowerCase().replace(/[^a-z]/g, '');
    var u = UNIT[k] || (k ? null : (fallback ? [fallback, 1] : null));
    if (!u || usage == null) return { usage: usage, unit: u ? u[0] : null, raw: rawUnit || '' };
    return { usage: Math.round(usage * u[1] * 1000) / 1000, unit: u[0], raw: rawUnit || fallback };
  }

  // ── 1. CSV / XLSX usage history ──────────────────────────────────────────
  var ALIAS = {
    acct: /^(account|acct|accountnumber|accountno|acctno|acctnumber|utilityaccount|meter|meternumber|meterno|meterid|storecode|store|esiid|pod|serviceid|accountid)$/,
    start: /^(start|startdate|periodstart|from|fromdate|servicefrom|readstart|beginning|begindate|billstart|servicestart|prevreaddate|previousreaddate)$/,
    end: /^(end|enddate|periodend|to|todate|servicethrough|servicethru|serviceto|readend|readdate|billend|serviceend|currentreaddate|thru|through)$/,
    month: /^(month|billmonth|billingmonth|period|billperiod|billdate|statementdate)$/,
    usage: /^(usage|consumption|quantity|qty|kwh|kwhs|therms|therm|ccf|mcf|dth|mwh|totalkwh|totaltherms|totalusage|billedusage|use|energy)$/,
    unit: /^(unit|units|uom|usageunit|unitofmeasure)$/,
    demand: /^(kw|demand|demandkw|peakkw|billedkw|billeddemand|maxkw|peakdemand)$/,
    cost: /^(cost|amount|total|totalcost|charges|totalcharges|billamount|amountdue|currentcharges|dollars)$/,
  };
  function headerMap(hdr) {
    var m = {};
    hdr.forEach(function (h, i) {
      var k = String(h || '').toLowerCase().replace(/[^a-z]/g, '');
      Object.keys(ALIAS).forEach(function (f) { if (m[f] == null && ALIAS[f].test(k)) m[f] = i; });
    });
    if (m.usage != null && m.unit == null) {
      var uk = String(hdr[m.usage] || '').toLowerCase().replace(/[^a-z]/g, '').replace(/^total/, '');
      if (UNIT[uk]) m.usageUnit = uk;
    }
    return m;
  }
  // RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes.
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
  function readSheet(file) {
    return new Promise(function (ok, bad) {
      var fr = new FileReader();
      fr.onerror = function () { bad(new Error('could not read the file')); };
      fr.onload = function () {
        try {
          if (/\.csv$|\.txt$/i.test(file.name) && !window.XLSX) {
            ok(parseCsv(String(fr.result)));
            return;
          }
          if (!window.XLSX) throw new Error('spreadsheet reader not loaded');
          var wb = window.XLSX.read(fr.result, { type: 'array', cellDates: true });
          var ws = wb.Sheets[wb.SheetNames[0]];
          ok(window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }));
        } catch (e) { bad(e); }
      };
      if (/\.csv$|\.txt$/i.test(file.name) && !window.XLSX) fr.readAsText(file); else fr.readAsArrayBuffer(file);
    });
  }
  function rowsFromSheet(grid, accts, fname) {
    var hi = -1, m = null;
    for (var i = 0; i < Math.min(grid.length, 15); i++) {
      var t = headerMap(grid[i] || []);
      if (t.usage != null && (t.start != null || t.end != null || t.month != null)) { hi = i; m = t; break; }
    }
    if (hi < 0) throw new Error('no header row with a usage column and a date column');
    var out = [], single = accts.length === 1 ? accts[0] : null;
    grid.slice(hi + 1).forEach(function (row) {
      if (!row || !row.some(function (c) { return c !== '' && c != null; })) return;
      var id = m.acct != null ? row[m.acct] : '';
      var a = id !== '' ? matchAcct(accts, [id]) : single;
      var raw = num(row[m.usage]);
      var cv = convert(raw, m.unit != null ? row[m.unit] : m.usageUnit, a ? unitFor(a) : null);
      out.push({
        account_id: a ? a.id : '', file_acct: String(id || ''),
        start: m.start != null ? toIso(row[m.start]) : null,
        end: m.end != null ? toIso(row[m.end]) : null,
        month: m.month != null ? monthOf(row[m.month]) : null,
        usage: cv.usage, unit: cv.unit, raw_unit: cv.raw,
        demand_kw: m.demand != null ? num(row[m.demand]) : null,
        cost: m.cost != null ? num(row[m.cost]) : null,
        source: 'upload', doc: fname, from: 'file', ok: true,
      });
    });
    return out;
  }
  function template() {
    var csv = 'account_number,period_start,period_end,usage,unit,demand_kw,cost\n' +
      '1234567890,2025-09-03,2025-10-02,48210,kWh,162,6120.55\n' +
      '9876543210,2025-09-05,2025-10-04,812,therms,,940.10\n';
    var b = new Blob([csv], { type: 'text/csv' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'beacon_monthly_bills_template.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ── 2. bill PDF ───────────────────────────────────────────────────────────
  function b64(file) {
    return new Promise(function (ok, bad) {
      var fr = new FileReader();
      fr.onerror = function () { bad(new Error('could not read the PDF')); };
      fr.onload = function () { ok(String(fr.result).replace(/^data:[^,]*,/, '')); };
      fr.readAsDataURL(file);
    });
  }
  function callFn(name, body) {
    var c = sb();
    if (!c || !c.auth) return Promise.reject(new Error('not connected'));
    return c.auth.getSession().then(function (s) {
      var sess = s && s.data && s.data.session;
      if (!sess) throw new Error('sign in first');
      return fetch(FN + name, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sess.access_token }, body: JSON.stringify(body) });
    }).then(function (r) {
      return r.json().catch(function () { return { error: 'HTTP ' + r.status }; }).then(function (j) {
        if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  function rowsFromPdf(j, accts, fname) {
    var d = j.data || {}, out = [];
    (d.meters || []).forEach(function (mt) {
      var a = matchAcct(accts, [mt.account_number, mt.meter_number, d.account_number], mt.commodity);
      if (!a && accts.length === 1) a = accts[0];
      (mt.periods || []).forEach(function (p) {
        var cv = convert(num(p.usage), mt.unit, null);
        out.push({
          account_id: a ? a.id : '', file_acct: mt.account_number || mt.meter_number || d.account_number || '',
          start: toIso(p.start), end: toIso(p.end), month: p.month || null,
          usage: cv.usage, unit: cv.unit, raw_unit: cv.raw,
          demand_kw: num(p.demand_kw), cost: num(p.cost),
          source: 'pdf', doc: fname, from: p.from === 'history' ? 'bill history' : 'bill', ok: true,
        });
      });
    });
    return { rows: out, utility: d.utility, addr: d.service_address, notes: d.notes };
  }

  // ── history load + degree days ───────────────────────────────────────────
  var _seq = 0, _state = { cid: null, hist: null, msg: '' }, _review = [], _sig = '';
  function loadHistory(cid) {
    var c = sb();
    if (!c || !c.rpc) return Promise.resolve([]);
    return c.rpc('bill_history', { p_customer: cid }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return r.data || [];
    });
  }
  function coordsFor(a) {
    if (typeof window.geocodeCityState !== 'function') return null;
    var g = window.geocodeCityState(a.city, a.state);
    return g && isFinite(g.lat) && isFinite(g.lng) ? g : null;
  }
  function addDegreeDays(rows, accts) {
    var byId = {}; accts.forEach(function (a) { byId[a.id] = a; });
    var pts = {}, keyOf = {}, noCity = {};
    rows.forEach(function (r) {
      var a = byId[r.account_id]; if (!a) return;
      var g = coordsFor(a);
      // A state-center fallback can sit hundreds of km from the building (WA's
      // lands on Stampede Pass), so when the city isn't on Beacon's own map the
      // server places the meter from its ZIP code instead.
      var k, pt;
      if (g && !g.approximate) { k = g.lat.toFixed(2) + ',' + g.lng.toFixed(2); pt = { key: k, lat: g.lat, lon: g.lng }; }
      else if (/^\d{5}/.test(String(a.zip || ''))) { k = 'zip:' + String(a.zip).slice(0, 5); pt = { key: k, zip: String(a.zip).slice(0, 5), city: a.city, state: a.state }; }
      else { noCity[a.id] = 1; return; }
      keyOf[r.account_id] = k;
      pts[k] = pt;
    });
    var keys = Object.keys(pts);
    if (!rows.length || !keys.length) return Promise.resolve({ stations: {}, noCity: Object.keys(noCity).length });
    var start = rows.reduce(function (m, r) { return r.period_start < m ? r.period_start : m; }, '9999');
    var end = rows.reduce(function (m, r) { return r.period_end > m ? r.period_end : m; }, '0000');
    var floor = isoOf(new Date(ms(end) - 1095 * DAY));
    if (start < floor) start = floor;
    var batches = [];
    for (var i = 0; i < keys.length; i += 25) batches.push(keys.slice(i, i + 25).map(function (k) { return pts[k]; }));
    return Promise.all(batches.map(function (b) {
      return callFn('weather-dd', { points: b, start: start, end: end }).then(function (j) { return j.results || {}; }, function (e) { console.warn('[bills] weather failed', e.message); return {}; });
    })).then(function (parts) {
      var res = Object.assign.apply(null, [{}].concat(parts));
      rows.forEach(function (r) {
        var w = res[keyOf[r.account_id]];
        r.hdd = null; r.cdd = null;
        if (!w || !w.days) return;
        var n = days(r.period_start, r.period_end), got = 0, h = 0, c = 0;
        for (var t = ms(r.period_start); t < ms(r.period_end); t += DAY) {
          var d = w.days[isoOf(new Date(t))];
          if (d) { got++; h += d[0]; c += d[1]; }
        }
        if (!n || got / n < 0.9) return;
        r.hdd = Math.round(h * n / got * 10) / 10;
        r.cdd = Math.round(c * n / got * 10) / 10;
        r.station = w.name || w.station;
      });
      var st = {};
      keys.forEach(function (k) { if (res[k] && res[k].station) st[k] = { name: res[k].name, id: res[k].station, km: res[k].km }; });
      return { stations: st, noCity: Object.keys(noCity).length };
    });
  }
  function publish(cid, accts, rows) {
    var by = {}, byId = {};
    accts.forEach(function (a) { byId[a.id] = a; });
    rows.forEach(function (r) {
      var a = byId[r.account_id]; if (!a) return;
      var b = { period_start: r.period_start, period_end: r.period_end, consumption: Number(r.consumption),
        consumption_unit: r.consumption_unit, demand_kw: r.demand_kw == null ? null : Number(r.demand_kw),
        cost: r.cost == null ? null : Number(r.cost), hdd: r.hdd, cdd: r.cdd, bill_source: r.bill_source || 'upload' };
      var sc = a.store_code || a.storeCode;
      [sc, 'id:' + a.id].forEach(function (k) { if (k) (by[k] = by[k] || []).push(b); });
    });
    Object.keys(by).forEach(function (k) { by[k].sort(function (x, y) { return x.period_start < y.period_start ? -1 : 1; }); });
    window.__billHistory = Object.keys(by).length ? { by_account: by, client: cid } : undefined;
    var sig = cid + '|' + rows.length + '|' + rows.filter(function (r) { return r.hdd != null; }).length;
    if (sig !== _sig) {
      _sig = sig;
      if (typeof window.renderAll === 'function') { try { _repainting = true; window.renderAll(); } finally { _repainting = false; } }
    }
  }
  var _repainting = false;

  // ── paint ────────────────────────────────────────────────────────────────
  var BTN = 'background:#add540;color:#0a0e1a;border:0;border-radius:6px;padding:7px 14px;font-weight:700;font-size:12px;cursor:pointer';
  var BTN2 = 'background:transparent;color:var(--lime);border:1px solid rgba(173,213,64,0.35);border-radius:6px;padding:6px 12px;font-size:11px;cursor:pointer';
  function tileA(accts, rows, wx) {
    var per = {};
    rows.forEach(function (r) { per[r.account_id] = per[r.account_id] || { n: 0, last: '', dd: 0 }; var p = per[r.account_id]; p.n++; if (r.period_end > p.last) p.last = r.period_end; if (r.hdd != null) p.dd++; });
    var ids = Object.keys(per), with12 = ids.filter(function (k) { return per[k].n >= 12; }).length;
    var with24 = ids.filter(function (k) { return per[k].n >= 24; }).length;
    var last = ids.reduce(function (m, k) { return per[k].last > m ? per[k].last : m; }, '');
    var dd = rows.filter(function (r) { return r.hdd != null; }).length;
    var st = Object.keys((wx && wx.stations) || {}).map(function (k) { var s = wx.stations[k]; return esc(s.name) + ' (' + s.km + ' km)'; });
    var row = function (l, v) { return '<div class="bm-row"><span class="bm-row-lbl">' + l + '</span><span class="bm-row-val">' + v + '</span></div>'; };
    return '<div class="ic-lbl">🧾 Monthly bills on file</div><div class="ic-cols"><div class="ic-hero"><div class="bm-bignum">' + ids.length + '<span style="font-size:16px;color:var(--mu)"> / ' + accts.length + '</span></div>' +
      '<div class="ic-unit">meters with monthly bills</div></div><div class="ic-data">' +
      row('Bills held', rows.length.toLocaleString()) +
      row('Meters with 12+ months', with12 + ' <span style="color:var(--mu)">· anomaly check needs 6</span>') +
      row('Meters with 24+ months', with24 + ' <span style="color:var(--mu)">· M&amp;V needs 24</span>') +
      row('Latest period ends', last || '—') +
      row('Weather matched', rows.length ? dd + ' of ' + rows.length + ' bills' : '—') +
      '</div></div>' +
      (st.length ? '<div class="loc-card-srcline" style="margin-top:6px">Degree days: NOAA NCEI daily (base 65°F) · ' + st.slice(0, 3).join(' · ') + (st.length > 3 ? ' · +' + (st.length - 3) + ' more' : '') + '</div>' : '') +
      (wx && wx.noCity ? '<div class="loc-card-srcline" style="margin-top:4px;color:#f59e0b">' + wx.noCity + ' meter' + (wx.noCity === 1 ? '' : 's') + ': no weather match (city not on Beacon\u2019s map and no ZIP on the location).</div>' : '') +
            (_state.msg ? '<div class="loc-card-srcline" style="margin-top:4px">' + esc(_state.msg) + '</div>' : '');
  }
  function tileB() {
    return '<div class="ic-lbl">⬆ Add bills</div>' +
      '<div class="loc-card-sub" style="margin:4px 0 10px">Usage history file (CSV or Excel: one row per meter per billing period) or bill PDFs. Nothing is saved until you check the rows and click Save.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<label style="' + BTN + '">Usage file<input type="file" data-bil-sheet accept=".csv,.xlsx,.xls,.txt" style="display:none"></label>' +
        '<label style="' + BTN + '">Bill PDFs<input type="file" data-bil-pdf accept="application/pdf,.pdf" multiple style="display:none"></label>' +
        '<button type="button" data-bil-tpl style="' + BTN2 + '">Template</button>' +
      '</div><div class="loc-card-srcline" data-bil-msg style="margin-top:8px">PDFs are read by AI and every figure is shown for checking. Month-only history rows need read dates before they can be saved.</div>';
  }
  function paintReview(C, accts) {
    if (!_review.length) { C.style.display = 'none'; C.innerHTML = ''; return; }
    C.style.display = '';
    var byId = {}; accts.forEach(function (a) { byId[a.id] = a; });
    _review.forEach(function (r) { var was = r.ok; check(r, byId); if (!r.problem && was !== false) r.ok = true; });
    var good = _review.filter(function (r) { return r.ok && !r.problem; }).length;
    var opts = '<option value="">— pick meter —</option>' + accts.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(label(a)) + '</option>'; }).join('');
    var th = 'style="text-align:left;padding:5px 6px;color:var(--mu);font-weight:600;font-size:10px;letter-spacing:.4px;text-transform:uppercase;white-space:nowrap"';
    var td = 'style="padding:5px 6px;border-top:1px solid rgba(255,255,255,.06);white-space:nowrap"';
    var body = _review.map(function (r, i) {
      var sel = opts.replace('value="' + esc(r.account_id) + '"', 'value="' + esc(r.account_id) + '" selected');
      return '<tr' + (r.problem ? ' style="opacity:.75"' : '') + '><td ' + td + '><input type="checkbox" data-bil-ok="' + i + '"' + (r.ok && !r.problem ? ' checked' : '') + (r.problem ? ' disabled' : '') + '></td>' +
        '<td ' + td + '><select data-bil-acct="' + i + '" style="max-width:260px;background:#0a0e1a;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:4px;font-size:11px">' + sel + '</select>' + (r.file_acct ? '<div style="color:var(--mu);font-size:10px">file: ' + esc(r.file_acct) + '</div>' : '') + '</td>' +
        '<td ' + td + '>' + (r.approx ? esc(r.month) + ' <span style="color:#f59e0b;font-size:10px">calendar month · approx</span>' : esc(r.start || (r.month ? r.month : '—')) + (r.end ? ' → ' + esc(r.end) : '')) + '</td>' +
        '<td ' + td + ' style="text-align:right">' + fmtN(r.usage) + ' ' + esc(r.unit || r.raw_unit || '') + (r.raw_unit && r.unit && String(r.raw_unit).toLowerCase() !== r.unit.toLowerCase() ? '<div style="color:var(--mu);font-size:10px">from ' + esc(r.raw_unit) + '</div>' : '') + '</td>' +
        '<td ' + td + '>' + (r.demand_kw != null ? fmtN(r.demand_kw) + ' kW' : '') + '</td>' +
        '<td ' + td + '>' + (r.cost != null ? '$' + Number(r.cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '') + '</td>' +
        '<td ' + td + '><span style="color:var(--mu)">' + esc(r.from) + '</span>' + (r.problem ? ' <span style="color:#f59e0b">· ' + esc(r.problem) + '</span>' : '') + '</td></tr>';
    }).join('');
    C.innerHTML = '<div class="ic-lbl">✔ Check before saving</div>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 8px"><button type="button" data-bil-save style="' + BTN + '"' + (good ? '' : ' disabled') + '>Save ' + good + ' bill' + (good === 1 ? '' : 's') + '</button>' +
      '<button type="button" data-bil-clear style="' + BTN2 + '">Discard</button><span class="loc-card-srcline" data-bil-smsg>' + _review.length + ' rows read · ' + (_review.length - good) + ' need attention or are unticked. Saving the same meter and period again replaces it.</span></div>' +
      (_review.some(function (r) { return r.month && (!r.start || r.approx); }) ? '<label style="display:flex;gap:8px;align-items:center;font-size:11px;color:#fff;margin:0 0 8px;cursor:pointer"><input type="checkbox" data-bil-cal' + (_calMonths ? ' checked' : '') + '> Save month-only history rows as calendar months (dates approximate; labelled on each saved bill)</label>' : '') +
      '<div style="overflow-x:auto;max-height:420px;overflow-y:auto"><table style="border-collapse:collapse;font-size:11px;color:#fff;width:100%"><thead><tr><th ' + th + '></th><th ' + th + '>Meter</th><th ' + th + '>Period</th><th ' + th + '>Usage</th><th ' + th + '>Demand</th><th ' + th + '>Cost</th><th ' + th + '>Source</th></tr></thead><tbody>' + body + '</tbody></table></div>';
    C.querySelectorAll('[data-bil-acct]').forEach(function (s) {
      s.addEventListener('change', function () {
        var r = _review[+s.getAttribute('data-bil-acct')], a = byId[s.value], was = r.account_id;
        // The same account on the same file is the same meter: one pick sets them all.
        _review.forEach(function (x) {
          if (x !== r && !(x.file_acct === r.file_acct && x.doc === r.doc && (!x.account_id || x.account_id === was))) return;
          x.account_id = s.value; x.ok = true;
          if (a && x.unit == null && x.raw_unit === '' && x.usage != null) x.unit = unitFor(a);
        });
        paintReview(C, accts);
      });
    });
    C.querySelectorAll('[data-bil-ok]').forEach(function (cb) { cb.addEventListener('change', function () { _review[+cb.getAttribute('data-bil-ok')].ok = cb.checked; paintReview(C, accts); }); });
    var cal = C.querySelector('[data-bil-cal]');
    if (cal) cal.addEventListener('change', function () { _calMonths = cal.checked; _review.forEach(function (x) { if (x.month) x.ok = true; }); paintReview(C, accts); });
    C.querySelector('[data-bil-clear]').addEventListener('click', function () { _review = []; paintReview(C, accts); });
    C.querySelector('[data-bil-save]').addEventListener('click', function () { save(C, accts); });
  }
  function save(C, accts) {
    var ctx = active(), c = sb(), m = C.querySelector('[data-bil-smsg]');
    var rows = _review.filter(function (r) { return r.ok && !r.problem; }).map(function (r) {
      return { account_id: r.account_id, period_start: r.start, period_end: r.end, consumption: r.usage, unit: r.unit,
        demand_kw: r.demand_kw, cost: r.cost, source: r.source, doc: (r.doc || '') + (r.approx ? ' · calendar month (approx dates)' : '') };
    });
    if (!rows.length || !c) return;
    m.textContent = 'Saving ' + rows.length + '…';
    c.rpc('bill_readings_save', { p_customer: ctx.cid, p_rows: rows }).then(function (r) {
      if (r.error) { m.textContent = 'Not saved: ' + r.error.message; m.style.color = '#ef4444'; return; }
      _review = _review.filter(function (x) { return !(x.ok && !x.problem); });
      _state.msg = 'Saved ' + r.data + ' bill' + (r.data === 1 ? '' : 's') + '.';
      _state.cid = null; _sig = '';
      paintReview(C, accts);          // clears the saved rows and the "Saving…" line
      var done = C.querySelector('[data-bil-smsg]');
      if (done) done.textContent = _state.msg + (_review.length ? ' ' + _review.length + ' rows still need attention.' : '');
      render();
    }, function (e) { m.textContent = 'Not saved: ' + ((e && e.message) || 'network error'); m.style.color = '#ef4444'; });
  }
  function bindUpload(B, C, accts) {
    var m = B.querySelector('[data-bil-msg]');
    B.querySelector('[data-bil-tpl]').addEventListener('click', template);
    B.querySelector('[data-bil-sheet]').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0]; ev.target.value = '';
      if (!f) return;
      m.textContent = 'Reading ' + f.name + '…'; m.style.color = '';
      readSheet(f).then(function (g) {
        var rows = rowsFromSheet(g, accts, f.name);
        _review = _review.concat(rows);
        m.textContent = f.name + ': ' + rows.length + ' rows. Check them below.';
        paintReview(C, accts);
      }).catch(function (e) { m.textContent = f.name + ': ' + e.message; m.style.color = '#ef4444'; });
    });
    B.querySelector('[data-bil-pdf]').addEventListener('change', function (ev) {
      var files = Array.prototype.slice.call(ev.target.files || []); ev.target.value = '';
      if (!files.length) return;
      m.style.color = '';
      var done = 0, notes = [];
      files.reduce(function (p, f) {
        return p.then(function () {
          m.textContent = 'Reading ' + f.name + ' (' + (done + 1) + ' of ' + files.length + ')… about 20 seconds a bill.';
          if (f.size > 10 * 1024 * 1024) { notes.push(f.name + ': over 10 MB'); return; }
          return b64(f).then(function (data) { return callFn('bill-extract', { pdf_base64: data, filename: f.name }); })
            .then(function (j) {
              var x = rowsFromPdf(j, accts, f.name);
              _review = _review.concat(x.rows);
              notes.push(f.name + ': ' + x.rows.length + ' rows' + (x.utility ? ' (' + x.utility + ')' : '') + (x.notes ? ' — ' + x.notes : ''));
              paintReview(C, accts);
            }, function (e) { notes.push(f.name + ': ' + e.message); });
        }).then(function () { done++; });
      }, Promise.resolve()).then(function () { m.textContent = notes.join(' · '); });
    });
  }

  function render() {
    if (_repainting) return;
    var hd = document.getElementById('bil-hd'), grid = document.getElementById('bil-grid');
    if (!hd || !grid) return;
    if (clientView()) { hd.style.display = 'none'; grid.style.display = 'none'; return; }
    var ctx = active();
    hd.style.display = ''; grid.style.display = '';
    var A = document.getElementById('bil-a'), B = document.getElementById('bil-b'), C = document.getElementById('bil-list');
    if (!B.getAttribute('data-cid') || B.getAttribute('data-cid') !== ctx.cid) {
      B.setAttribute('data-cid', ctx.cid);
      _review = [];
      B.innerHTML = tileB();
      bindUpload(B, C, ctx.accts);
      paintReview(C, ctx.accts);
    }
    if (_state.cid === ctx.cid && _state.hist) { A.innerHTML = tileA(ctx.accts, _state.hist.rows, _state.hist.wx); return; }
    var seq = ++_seq;
    A.innerHTML = '<div class="ic-lbl">🧾 Monthly bills on file</div><div class="loc-card-sub">Checking…</div>';
    if (window.__billHistory && window.__billHistory.client !== ctx.cid) window.__billHistory = undefined;
    var c = sb();
    (c && c.auth ? c.auth.getSession() : Promise.resolve(null)).then(function (s) {
      if (!(s && s.data && s.data.session)) { var e = new Error('sign in'); e.signin = true; throw e; }
      return loadHistory(ctx.cid);
    }).then(function (rows) {
      if (seq !== _seq) return;
      _state = { cid: ctx.cid, hist: { rows: rows, wx: null }, msg: _state.msg };
      A.innerHTML = tileA(ctx.accts, rows, null);
      if (!rows.length) { publish(ctx.cid, ctx.accts, rows); return; }
      return addDegreeDays(rows, ctx.accts).then(function (wx) {
        if (seq !== _seq) return;
        _state.hist.wx = wx;
        A.innerHTML = tileA(ctx.accts, rows, wx);
        publish(ctx.cid, ctx.accts, rows);
      });
    }).catch(function (e) {
      if (seq !== _seq) return;
      if (!e.signin) console.warn('[bills] failed', e.message || e);
      A.innerHTML = '<div class="ic-lbl">🧾 Monthly bills on file</div><div class="loc-card-sub">' + (e.signin ? 'Sign in to see and add this client’s monthly bills.' : 'Could not load bills: ' + esc(e.message || e)) + '</div>';
    });
  }

  window.BeaconBills = { render: render, _parseCsv: parseCsv, _rowsFromSheet: rowsFromSheet, _rowsFromPdf: rowsFromPdf, _convert: convert, _toIso: toIso, _matchAcct: matchAcct, _check: check, _headerMap: headerMap };
})();
