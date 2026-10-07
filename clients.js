/* ============================================================================
 * clients.js — brokers run their own book inside Beacon            bundle 135
 * ----------------------------------------------------------------------------
 *   • + Add Client (header, client picker, upload panel). The firm always comes
 *     from the signed-in broker (RPC client_create); a rep's new client is
 *     assigned to them, a manager can assign it to any active rep/partner.
 *     Every client gets its own private link code automatically.
 *   • Setup flow: after creating a client Beacon opens it on Admin → Upload
 *     Portfolio with the template link, so the accounts go in straight away.
 *   • Team (managers): list reps / partners, invite by email (magic-link
 *     sign-in, no password), switch someone off. Uses firm-admin team_* —
 *     always the manager's own firm.
 *   • Getting started checklist for a new firm's managers (brand, first
 *     client, accounts, team, private link) until done or dismissed.
 *   • STS's internal tools (Switchboard, Ledger, Conductor, Linework) are
 *     hidden for every firm except STS.
 * Nothing here runs for client links or client logins (body.client-view).
 * ========================================================================== */
(function () {
  'use strict';
  function sb() { return window._beaconSb || window.sb || null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function clientView() { return document.body.classList.contains('client-view'); }
  var INP = 'background:#0a0e1a;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:4px;font-size:12px;padding:7px 9px;width:100%;box-sizing:border-box';
  var BTN = 'background:var(--lime);color:#0a0e1a;border:0;border-radius:6px;padding:8px 16px;font-weight:700;font-size:12px;cursor:pointer';
  var BTN2 = 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:6px;padding:7px 12px;font-size:12px;cursor:pointer';
  var LBL = 'display:block;font-size:11px;color:var(--mu);margin-bottom:10px';
  var TYPES = [
    ['Office & Retail', [['office', 'Office'], ['retail', 'Retail'], ['bank', 'Bank / Financial']]],
    ['Hospitality & Food', [['hospitality', 'Hotel / Hospitality'], ['restaurant', 'Restaurant'], ['quick_service', 'Quick Service Restaurant'], ['supermarket', 'Supermarket / Grocery'], ['convenience_store', 'Convenience Store']]],
    ['Healthcare', [['healthcare', 'Medical Office / Outpatient'], ['hospital', 'Hospital'], ['senior_care', 'Senior Living / Assisted Care']]],
    ['Industrial & Specialized', [['industrial', 'Industrial / Manufacturing'], ['data_center', 'Data Center'], ['laboratory', 'Laboratory'], ['refrigerated_warehouse', 'Cold Storage'], ['warehouse', 'Warehouse / Distribution'], ['self_storage', 'Self Storage']]],
    ['Education', [['college', 'College / University'], ['k12', 'K-12 School']]],
    ['Residential', [['multifamily', 'Multifamily Residential']]],
  ];
  var ME = null;          // firm_onboarding() result for the signed-in broker
  var LS_DISMISS = 'beacon_onboarding_dismissed_v1', LS_SHARED = 'beacon_shared_link_v1';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function isManager() { return ME && (ME.role === 'manager' || ME.role === 'superadmin'); }
  function errMsg(e) { return (e && (e.message || e.error_description)) || String(e); }

  // ── Add Client modal ─────────────────────────────────────────────────────
  function openAdd() {
    if (!ME) { alert('Sign in to add clients.'); return; }
    var old = document.getElementById('ac-modal'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'ac-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(5,8,16,.72);display:flex;align-items:center;justify-content:center;padding:40px 16px;overflow:auto';
    // bundle 142: Esc closes it
    var onEsc = function (e) { if (e.key === 'Escape' && document.getElementById('ac-modal')) { document.getElementById('ac-modal').remove(); document.removeEventListener('keydown', onEsc); } };
    document.addEventListener('keydown', onEsc);
    var opts = TYPES.map(function (g) { return '<optgroup label="' + esc(g[0]) + '">' + g[1].map(function (p) { return '<option value="' + p[0] + '">' + esc(p[1]) + '</option>'; }).join('') + '</optgroup>'; }).join('');
    m.innerHTML = '<div class="icard" style="max-width:480px;width:100%;background:#0f1524;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
      '<div class="igrid-theme-eye">New client</div><div class="igrid-theme-title" style="margin-bottom:12px">Add a client to ' + esc(ME.brand || ME.name || 'your firm') + '</div>' +
      '<label style="' + LBL + '">Client name<input data-ac="name" maxlength="120" placeholder="e.g. Lakeside Holdings" style="' + INP + '"></label>' +
      '<label style="' + LBL + '">Main building type<select data-ac="type" style="' + INP + '"><option value="">— Pick one (optional) —</option>' + opts + '</select></label>' +
      '<label style="' + LBL + '">Status<select data-ac="status" style="' + INP + '"><option value="prospect_new">Prospect</option><option value="prospect_eligible">Prospect · qualified</option><option value="customer_active">Active client</option></select></label>' +
      (isManager() ? '<label style="' + LBL + '">Assigned to (rep / partner)<select data-ac="rep" style="' + INP + '"><option value="">Loading…</option></select></label>' : '<div class="loc-card-srcline" style="margin-bottom:10px">This client will be assigned to you.</div>') +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:6px"><button type="button" data-ac-go style="' + BTN + '">Create client</button><button type="button" data-ac-x style="' + BTN2 + '">Cancel</button><span class="loc-card-srcline" data-ac-msg></span></div>' +
      '<div class="loc-card-srcline" style="margin-top:12px">Next you’ll upload the client’s sites and accounts with the portfolio template. The client gets a private link you can send them.</div></div>';
    document.body.appendChild(m);
    var q = function (k) { return m.querySelector('[data-ac="' + k + '"]'); }, msg = m.querySelector('[data-ac-msg]');
    q('name').focus();
    q('name').addEventListener('input', function () { msg.textContent = ''; });
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    m.querySelector('[data-ac-x]').addEventListener('click', function () { m.remove(); });
    if (isManager()) sb().rpc('firm_people').then(function (r) {
      var sel = q('rep'); if (!sel) return;
      var ppl = (r && r.data) || [];
      sel.innerHTML = ppl.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === ME.uid ? ' selected' : '') + '>' + esc(p.full_name) + (p.id === ME.uid ? ' (you)' : '') + ' · ' + esc(p.role === 'rep' ? 'rep / partner' : p.role) + '</option>'; }).join('') || '<option value="">You</option>';
    });
    m.querySelector('[data-ac-go]').addEventListener('click', function (ev) {
      var name = q('name').value.trim(); if (!name) { msg.textContent = 'Client name is required.'; msg.style.color = '#ef4444'; return; }
      ev.target.disabled = true; msg.textContent = 'Creating…'; msg.style.color = '';
      sb().rpc('client_create', { p_name: name, p_type: q('type').value || null, p_status: q('status').value, p_rep: isManager() && q('rep') && q('rep').value ? q('rep').value : null })
        .then(function (r) {
          if (r.error) throw r.error;
          var u = new URL(location.href);
          ['clientId', 'client', 'share', 'location', 'view'].forEach(function (k) { u.searchParams.delete(k); });
          u.searchParams.set('clientId', r.data.id); u.searchParams.set('setup', '1');
          location.href = u.toString();
        }).catch(function (e) { ev.target.disabled = false; msg.textContent = 'Not created: ' + errMsg(e); msg.style.color = '#ef4444'; });
    });
  }

  // ── after creating: go straight to the upload ─────────────────────────────
  function setupFlow() {
    var q = new URLSearchParams(location.search); if (q.get('setup') !== '1') return;
    var tries = 0;
    (function go() {
      if (typeof showView !== 'function' || !document.getElementById('upload-add-btn')) { if (tries++ < 40) setTimeout(go, 250); return; }
      showView('admin');
      var add = document.getElementById('upload-add-btn'), box = add.closest('div');
      var title = null; document.querySelectorAll('#adm-upload .admin-title, #admin-panel .admin-title').forEach(function (t) { if (/Upload Portfolio/.test(t.textContent)) title = t; });
      if (title && !document.getElementById('ac-setup-card')) {
        var c = document.createElement('div'); c.id = 'ac-setup-card'; c.className = 'icard';
        c.style.cssText = 'margin:14px 0 4px;border-color:var(--lime)';
        c.innerHTML = '<div class="ic-lbl">Client created · step 2 of 2</div><div style="font-size:13px;color:#fff;line-height:1.5">Download the blank template, fill in one row per meter (site address, utility, account number, annual usage, contract end date), then <b>Add to Portfolio</b>. Bills, interval data, Triggers and the Trading Desk light up for this client as soon as the accounts are in.</div>' +
          '<div class="loc-card-srcline" style="margin-top:6px">Required columns are green in the template. You can come back and add more rows any time.</div>';
        title.parentNode.insertBefore(c, title);
      }
      (title || box).scrollIntoView({ behavior: 'smooth', block: 'start' });
      try { var u = new URL(location.href); u.searchParams.delete('setup'); history.replaceState({}, '', u); } catch (e) {}
    })();
  }

  // ── buttons ──────────────────────────────────────────────────────────────
  function mkBtn(id, cls, style) {
    var b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = '＋ Add Client';
    if (cls) b.className = cls; if (style) b.style.cssText = style;
    b.addEventListener('click', openAdd); return b;
  }
  function placeButtons() {
    if (clientView() || !ME) return;
    var edit = document.getElementById('edit-client-btn');
    if (edit && !document.getElementById('ac-hdr-btn')) { var hb = mkBtn('ac-hdr-btn', edit.className); hb.style.marginRight = '6px'; edit.parentNode.insertBefore(hb, document.getElementById('switch-customer-btn') || edit); }
    var cpb = document.getElementById('cpb-new-btn');
    if (cpb && !document.getElementById('ac-cpb-btn')) cpb.parentNode.insertBefore(mkBtn('ac-cpb-btn', '', 'background:var(--lime);border:0;color:#0a0e1a;padding:10px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;align-self:center;white-space:nowrap'), cpb);
    var up = document.getElementById('upload-add-btn');
    if (up && !document.getElementById('ac-up-btn')) {
      var sw = null; up.parentNode.querySelectorAll('a[href*="switchboard.gridientsuite.com"]').forEach(function (a) { sw = a; });
      up.parentNode.insertBefore(mkBtn('ac-up-btn', '', 'background:transparent;border:1px solid var(--lime);color:var(--lime);padding:10px 16px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer'), sw || up.nextSibling);
    }
    var tpl = document.querySelector('a[data-cfg-href="uploadTemplate"]'); if (tpl) tpl.setAttribute('download', 'Beacon_Portfolio_Upload_Template.xlsx');
  }

  // ── STS's internal tools: STS only ────────────────────────────────────────
  function hideInternalTools() {
    if (!ME || ME.is_sts) return;
    document.querySelectorAll('a[href*="switchboard.gridientsuite.com"], a[href*="ledger.gridientsuite.com"], a[href*="linework.gridientsuite.com"], a[href*="conductor.gridientsuite.com"]').forEach(function (a) { a.style.display = 'none'; });
    var trig = document.getElementById('ws-trigger'), menu = document.getElementById('ws-menu');
    if (trig) {
      var chev = trig.querySelector('.ws-chev'); if (chev) chev.style.display = 'none';
      trig.style.cursor = 'default'; trig.removeAttribute('aria-haspopup'); trig.removeAttribute('aria-expanded');
      if (!trig._acBlocked) { trig._acBlocked = true; trig.addEventListener('click', function (e) { e.stopImmediatePropagation(); e.preventDefault(); if (menu) menu.hidden = true; }, true); }
    }
    if (menu) menu.hidden = true;
    var sub = document.getElementById('cpb-sub');
    if (sub && /Switchboard/.test(sub.textContent)) sub.textContent = 'Pick one of your clients below, or add a new one with “＋ Add Client”.';
  }

  // ── Team (managers) ──────────────────────────────────────────────────────
  function team(action, body) {
    return sb().functions.invoke('firm-admin', { body: Object.assign({ action: action }, body || {}) }).then(function (r) {
      if (r.error) { var ctx = r.error.context; if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { throw new Error((j && j.error) || r.error.message); }, function () { throw r.error; }); throw r.error; }
      if (r.data && r.data.error) throw new Error(r.data.error);
      return r.data;
    });
  }
  function renderTeam(note) {
    var root = document.getElementById('team-root'); if (!root || !isManager() || clientView()) return;
    root.innerHTML = '<div class="igrid-theme-hd" style="margin-top:0"><div class="igrid-theme-eye">Team · ' + esc(ME.brand || ME.name) + '</div>' +
      '<div class="igrid-theme-title">Your reps and partners</div><div class="igrid-theme-sub">each rep / partner sees only the clients assigned to them · managers see the whole firm</div></div>' +
      '<div class="icard" style="min-width:0"><div data-tm-list class="loc-card-sub">Loading…</div>' +
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)"><div class="ic-lbl">Invite someone</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">' +
        '<label style="' + LBL + '">Email<input data-tm="email" type="email" placeholder="name@firm.com" style="' + INP + '"></label>' +
        '<label style="' + LBL + '">Full name<input data-tm="full_name" placeholder="Jane Smith" style="' + INP + '"></label>' +
        '<label style="' + LBL + '">Role<select data-tm="role" style="' + INP + '"><option value="rep">Rep / partner (sees assigned clients)</option><option value="manager">Manager (sees every client)</option></select></label></div>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" data-tm-add style="' + BTN + '">Invite</button><span class="loc-card-srcline" data-tm-msg>' + esc(note || 'They sign in at gridientsuite.com/signin with a magic link — no password to send.') + '</span></div></div></div>';
    var list = root.querySelector('[data-tm-list]'), msg = root.querySelector('[data-tm-msg]');
    team('team_list').then(function (r) {
      var ppl = r.people || [];
      list.innerHTML = ppl.length ? '<table style="width:100%;border-collapse:collapse;font-size:12px">' + ppl.map(function (p) {
        return '<tr><td style="padding:6px 8px 6px 0;border-bottom:1px solid rgba(255,255,255,.05);color:#fff">' + esc(p.full_name || '—') + (p.me ? ' <span class="loc-pill gray">you</span>' : '') + '<div style="font-size:10.5px;color:var(--mu)">' + esc(p.email || '') + '</div></td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.05)"><span class="loc-pill ' + (p.role === 'manager' ? 'blue' : 'green') + '">' + (p.role === 'manager' ? 'manager' : 'rep / partner') + '</span></td>' +
          '<td style="padding:6px 0 6px 8px;border-bottom:1px solid rgba(255,255,255,.05);text-align:right">' + (p.me ? '' : '<button type="button" data-tm-act="' + esc(p.id) + '" data-on="' + (p.is_active === false ? '1' : '0') + '" style="' + BTN2 + ';padding:4px 10px">' + (p.is_active === false ? 'Switch back on' : 'Switch off') + '</button>') +
          (p.is_active === false ? '<div style="font-size:10.5px;color:#f59e0b;margin-top:2px">off — cannot sign in to clients</div>' : '') + '</td></tr>';
      }).join('') + '</table>' : '<div class="loc-card-sub">Just you so far.</div>';
      list.querySelectorAll('[data-tm-act]').forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          team('team_active', { user_id: b.getAttribute('data-tm-act'), active: b.getAttribute('data-on') === '1' }).then(function () { renderTeam('Updated.'); }, function (e) { b.disabled = false; msg.textContent = 'Not changed: ' + errMsg(e); msg.style.color = '#ef4444'; });
        });
      });
    }, function (e) { list.textContent = 'Could not load the team: ' + errMsg(e); });
    root.querySelector('[data-tm-add]').addEventListener('click', function (ev) {
      var v = function (k) { return root.querySelector('[data-tm="' + k + '"]').value.trim(); };
      if (!v('email')) { msg.textContent = 'Email is required.'; msg.style.color = '#ef4444'; return; }
      ev.target.disabled = true; msg.textContent = 'Inviting…'; msg.style.color = '';
      team('team_add', { email: v('email'), full_name: v('full_name'), role: v('role') }).then(function () {
        ME.people = (ME.people || 0) + 1; renderChecklist();
        renderTeam(v('email') + ' added. Tell them to sign in at gridientsuite.com/signin with that email.');
      }, function (e) { ev.target.disabled = false; msg.textContent = 'Not added: ' + errMsg(e); msg.style.color = '#ef4444'; });
    });
  }

  // ── Getting started (new firms) ──────────────────────────────────────────
  function renderChecklist() {
    var host = document.getElementById('ac-start');
    if (!ME || ME.is_sts || !isManager() || clientView() || lsGet(LS_DISMISS)) { if (host) host.remove(); return; }
    var steps = [
      { done: !!ME.has_logo, t: 'Add your logo and colours', d: 'Admin → Brand', go: function () { showView('admin'); var b = document.getElementById('brand-root'); if (b) b.scrollIntoView({ behavior: 'smooth' }); } },
      { done: ME.real_clients > 0, t: 'Add your first client', d: '＋ Add Client', go: openAdd },
      { done: ME.real_accounts > 0, t: 'Upload that client’s accounts', d: 'Admin → Upload Portfolio', go: function () { showView('admin'); var u = document.getElementById('upload-add-btn'); if (u) u.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
      { done: ME.people > 1, t: 'Invite your reps / partners', d: 'Admin → Team', go: function () { showView('admin'); var t = document.getElementById('team-root'); if (t) t.scrollIntoView({ behavior: 'smooth' }); } },
      { done: !!lsGet(LS_SHARED), t: 'Send a client their private link', d: 'Copy Customer URL', go: function () { showView('admin'); var c = document.getElementById('copy-customer-url-btn'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
    ];
    var n = steps.filter(function (s) { return s.done; }).length;
    if (n === steps.length) { if (host) host.remove(); return; }
    if (!host) {
      host = document.createElement('div'); host.id = 'ac-start'; host.className = 'broker-only';
      host.style.cssText = 'max-width:1400px;margin:14px auto 0;padding:0 28px';
      var anchor = document.getElementById('client-picker-banner');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor.nextSibling); else document.body.insertBefore(host, document.body.firstChild);
    }
    host.innerHTML = '<div class="icard" style="min-width:0;border-color:rgba(173,213,64,.35)"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div class="ic-lbl" style="margin:0">Getting started · ' + n + ' of ' + steps.length + ' done</div><span style="flex:1"></span><button type="button" data-st-x style="background:transparent;border:0;color:var(--mu);font-size:11px;cursor:pointer;text-decoration:underline">hide</button></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:8px">' + steps.map(function (s, i) {
        return '<button type="button" data-st="' + i + '" style="text-align:left;background:' + (s.done ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.03)') + ';border:1px solid ' + (s.done ? 'rgba(34,197,94,.35)' : 'rgba(255,255,255,.1)') + ';border-radius:8px;padding:9px 11px;cursor:pointer;color:#fff">' +
          '<div style="font-size:12px;font-weight:600">' + (s.done ? '✓ ' : (i + 1) + '. ') + esc(s.t) + '</div><div style="font-size:10.5px;color:var(--mu);margin-top:2px">' + esc(s.d) + '</div></button>';
      }).join('') + '</div></div>';
    host.querySelector('[data-st-x]').addEventListener('click', function () { lsSet(LS_DISMISS, '1'); host.remove(); });
    host.querySelectorAll('[data-st]').forEach(function (b) { b.addEventListener('click', function () { steps[+b.getAttribute('data-st')].go(); }); });
  }

  // ── boot ─────────────────────────────────────────────────────────────────
  function load() {
    var c = sb(); if (!c || !c.auth) return;
    c.auth.getSession().then(function (s) {
      var u = s && s.data && s.data.session && s.data.session.user; if (!u) return;
      return c.rpc('firm_onboarding').then(function (r) {
        if (r.error || !r.data) return;
        if (!/^(manager|rep|superadmin)$/.test(r.data.role || '')) return;
        ME = r.data; ME.uid = u.id;
        try { var cur = window.BeaconBrand && window.BeaconBrand.current && window.BeaconBrand.current(); ME.brand = cur && (cur.short || cur.full); } catch (e) {}
        if (clientView()) return;
        placeButtons(); hideInternalTools(); renderChecklist(); renderTeam();
        setTimeout(function () { placeButtons(); hideInternalTools(); }, 1500);   // late-built header pills
      });
    }).catch(function (e) { console.warn('[clients] boot failed', e); });
  }
  function boot() {
    document.addEventListener('click', function (e) { var t = e.target; if (t && t.closest && t.closest('#copy-customer-url-btn')) lsSet(LS_SHARED, '1'); }, true);
    setupFlow();
    var tries = 0;
    (function wait() { var c = sb(); if (c && c.auth) { load(); try { c.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_IN' && !ME) load(); }); } catch (e) {} } else if (tries++ < 40) setTimeout(wait, 500); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  window.BeaconClients = { openAdd: openAdd, _me: function () { return ME; }, _load: load, _renderTeam: renderTeam, _renderChecklist: renderChecklist };
})();
