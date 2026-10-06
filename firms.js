/* ============================================================================
 * firms.js — Admin → Firms · Platform admin  (bundle 133)
 * ----------------------------------------------------------------------------
 * Only shows for users listed in public.platform_admins (checked server side by
 * the firm-admin edge function; everyone else gets nothing rendered at all).
 *
 * Lets a platform admin, without SQL:
 *   • see every firm: logo, accent, client / manager / rep counts, demo links
 *   • create a new firm with its brand (logo upload, accent, contact details)
 *   • edit any firm's brand and turn on private-link-only
 *   • copy a demo client into a firm (gets its own private link)
 *   • add a manager or rep (they sign in at gridientsuite.com/signin with a
 *     magic link — no password to send)
 * ========================================================================== */
(function () {
  'use strict';
  function sb() { return window._beaconSb || window.sb || null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  var INP = 'background:#0a0e1a;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:4px;font-size:12px;padding:6px 8px;width:100%;box-sizing:border-box';
  var BTN = 'background:#add540;color:#0a0e1a;border:0;border-radius:6px;padding:7px 14px;font-weight:700;font-size:12px;cursor:pointer';
  var BTN2 = 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer';
  var LBL = 'display:block;font-size:11px;color:var(--mu);margin-bottom:8px';
  var STATE = { firms: [], demos: [], open: null, mode: null };

  function call(action, extra) {
    var c = sb(); if (!c || !c.functions) return Promise.reject(new Error('Supabase not ready'));
    var body = Object.assign({ action: action }, extra || {});
    return c.functions.invoke('firm-admin', { body: body }).then(function (r) {
      if (r.error) {
        // functions-js wraps non-2xx; dig the message out of the response body when present.
        var ctx = r.error.context;
        if (ctx && typeof ctx.json === 'function') return ctx.json().then(function (j) { throw new Error((j && j.error) || r.error.message); }, function () { throw r.error; });
        throw r.error;
      }
      if (r.data && r.data.error) throw new Error(r.data.error);
      return r.data;
    });
  }

  function copy(text, btn) {
    var done = function () { if (btn) { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1400); } };
    try { navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this link:', text); }); }
    catch (e) { window.prompt('Copy this link:', text); }
  }

  function field(lbl, key, val, ph, type) {
    return '<label style="' + LBL + '">' + lbl + '<input data-f="' + key + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '" style="' + INP + '"></label>';
  }

  // Shared brand form (new firm + edit brand).
  function brandForm(f) {
    f = f || {};
    var logo = f.brand_logo || '';
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">' +
      '<div>' + (f.id ? '' : field('Firm name (internal)', 'name', '', 'e.g. Power Kiosk')) +
        field('Short name (shows in place of “STS”)', 'short', f.brand_short, 'e.g. Power Kiosk') +
        field('Full name', 'full', f.brand_full, 'e.g. Power Kiosk LLC') +
        field('Support email (also reply-to on emails)', 'email', f.brand_email, 'help@firm.com', 'email') +
        field('Phone', 'phone', f.brand_phone, '800.555.0100') +
        field('Website', 'website', f.brand_website, 'firm.com') + '</div>' +
      '<div><label style="' + LBL + '">Accent colour<input data-f="accent" type="color" value="' + esc(f.brand_accent || '#ADD540') + '" style="' + INP + ';height:34px;padding:2px"></label>' +
        '<div style="font-size:11px;color:var(--mu);margin-bottom:4px">Logo (PNG, JPG, SVG or WebP, under 300 KB; wide logos look best)</div>' +
        '<div data-logo-prev style="background:#0a0e1a;border:1px dashed rgba(255,255,255,.2);border-radius:6px;min-height:54px;display:flex;align-items:center;justify-content:center;padding:6px;margin-bottom:6px">' +
          (logo ? '<img src="' + esc(logo) + '" style="max-height:44px;max-width:100%">' : (f.has_logo ? '<span style="font-size:11px;color:var(--mu)">logo on file (large, not previewed)</span>' : '<span style="font-size:11px;color:var(--mu)">no logo — the short name shows instead</span>')) + '</div>' +
        '<input data-logo type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="font-size:11px;color:#fff"> ' +
        '<button type="button" data-logo-clear style="background:transparent;color:var(--mu);border:0;font-size:11px;cursor:pointer;text-decoration:underline">remove logo</button>' +
        '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#fff;margin-top:12px;cursor:pointer"><input data-f="require" type="checkbox"' + (f.require_share_token ? ' checked' : '') + '> <span>Private link codes only (old ?clientId links stop working for this firm)</span></label>' +
      '</div></div>';
  }

  function wireLogo(box, msg) {
    var st = { logo: null, cleared: false };
    var inp = box.querySelector('[data-logo]'), prev = box.querySelector('[data-logo-prev]');
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0]; if (!file) return;
      if (file.size > 300 * 1024) { say(msg, 'That logo is ' + Math.round(file.size / 1024) + ' KB; keep it under 300 KB.', true); inp.value = ''; return; }
      var fr = new FileReader();
      fr.onload = function () { st.logo = String(fr.result); st.cleared = false; prev.innerHTML = '<img src="' + st.logo + '" style="max-height:44px;max-width:100%">'; say(msg, 'Logo ready.'); };
      fr.readAsDataURL(file);
    });
    box.querySelector('[data-logo-clear]').addEventListener('click', function () { st.logo = null; st.cleared = true; inp.value = ''; prev.innerHTML = '<span style="font-size:11px;color:var(--mu)">no logo — the short name shows instead</span>'; });
    return st;
  }

  function vals(box) {
    var o = {};
    box.querySelectorAll('[data-f]').forEach(function (el) { o[el.getAttribute('data-f')] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    return o;
  }
  function readable(hex) { var n = parseInt(String(hex).slice(1), 16); if (isNaN(n)) return '#fff'; var l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l < 0.35 ? '#fff' : hex; }
  function say(el, t, bad) { if (!el) return; el.textContent = t; el.style.color = bad ? '#ef4444' : ''; }

  function firmCard(f) {
    var open = STATE.open === f.id, acc = f.brand_accent || '#ADD540';
    var head = '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
      '<div style="width:120px;height:40px;display:flex;align-items:center;justify-content:center;background:#0a0e1a;border-radius:6px;border:1px solid rgba(255,255,255,.1);overflow:hidden">' +
        (f.brand_logo ? '<img src="' + esc(f.brand_logo) + '" style="max-height:34px;max-width:112px">' : '<span style="font-weight:800;font-size:13px;color:' + esc(readable(acc)) + '">' + esc(f.brand_short || f.short_name || f.name) + '</span>') + '</div>' +
      '<div style="flex:1;min-width:160px"><div style="font-weight:700;color:#fff;font-size:14px">' + esc(f.name) + '</div>' +
        '<div class="loc-card-srcline"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + esc(acc) + ';vertical-align:-1px;margin-right:4px"></span>' +
        (f.brand_accent ? esc(f.brand_accent.toUpperCase()) : 'default look') + ' · ' + f.clients + ' client' + (f.clients === 1 ? '' : 's') + ' · ' + f.managers + ' manager' + (f.managers === 1 ? '' : 's') + ' · ' + f.reps + ' rep' + (f.reps === 1 ? '' : 's') +
        (f.require_share_token ? ' · private links only' : '') + '</div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        ['brand:Edit brand', 'demo:Add demo client', 'user:Add user'].map(function (x) { var p = x.split(':'); return '<button type="button" data-act="' + p[0] + '" data-org="' + esc(f.id) + '" style="' + (open && STATE.mode === p[0] ? BTN : BTN2) + '">' + p[1] + '</button>'; }).join('') +
      '</div></div>';
    var links = (f.demo_links || []).length ? '<div style="margin-top:10px;display:grid;gap:6px">' + f.demo_links.map(function (d) {
      return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px"><span style="color:#fff;min-width:150px">' + esc(d.name) + '</span>' +
        '<code style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mu);font-size:11px">' + esc(d.link) + '</code>' +
        '<button type="button" data-copy="' + esc(d.link) + '" style="' + BTN2 + ';padding:4px 10px">Copy link</button>' +
        '<a href="' + esc(d.link) + '" target="_blank" rel="noopener" style="color:var(--lime);font-size:11px">open</a></div>';
    }).join('') + '</div>' : '<div class="loc-card-srcline" style="margin-top:8px">No demo client yet. Use “Add demo client” to give this firm a portfolio to show.</div>';
    var body = '';
    if (open && STATE.mode === 'brand') body = brandForm(f) + '<div style="display:flex;gap:10px;align-items:center;margin-top:10px"><button type="button" data-save-brand style="' + BTN + '">Save brand</button><span class="loc-card-srcline" data-msg></span></div>';
    if (open && STATE.mode === 'demo') body = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">' +
      '<label style="' + LBL + '">Copy from<select data-f="source" style="' + INP + '">' + STATE.demos.filter(function (d) { return d.org_id !== f.id; }).concat(STATE.demos.filter(function (d) { return d.org_id === f.id; }))
        .map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === 'cust_sts_vandelay' ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select></label>' +
      field('Name for the copy (optional)', 'name', '', 'e.g. Vandelay Industries') + '</div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:4px"><button type="button" data-save-demo style="' + BTN + '">Copy demo client</button><span class="loc-card-srcline" data-msg>Copies the sites, accounts and meters (demo data only). Takes a few seconds for a large portfolio.</span></div>';
    if (open && STATE.mode === 'user') body = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">' +
      field('Email', 'email', '', 'name@firm.com', 'email') + field('Full name', 'full_name', '', 'Jane Smith') +
      '<label style="' + LBL + '">Role<select data-f="role" style="' + INP + '"><option value="manager">Manager (sees every client, edits brand)</option><option value="rep">Rep (sees assigned clients)</option></select></label></div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:4px"><button type="button" data-save-user style="' + BTN + '">Add user</button><span class="loc-card-srcline" data-msg>They sign in at gridientsuite.com/signin with a magic link. No password to send.</span></div>';
    return '<div class="icard" data-firm="' + esc(f.id) + '" style="min-width:0;margin-bottom:10px;' + (open ? 'border-color:' + esc(acc) + ';' : '') + '">' + head + links +
      (body ? '<div data-body style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)">' + body + '</div>' : '') + '</div>';
  }

  function render() {
    var root = document.getElementById('firms-root'); if (!root) return;
    root.style.display = '';
    root.innerHTML = '<div class="igrid-theme-hd" style="margin-top:0"><div class="igrid-theme-eye">Firms · Platform admin</div>' +
      '<div class="igrid-theme-title">Every firm on Beacon</div>' +
      '<div class="igrid-theme-sub">new firm · brand · demo clients · managers and reps · private links</div></div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap"><button type="button" data-new style="' + (STATE.open === '_new' ? BTN : BTN2) + '">+ New firm</button>' +
        '<button type="button" data-refresh style="' + BTN2 + '">Refresh</button><span class="loc-card-srcline" data-top-msg>Only platform admins see this panel.</span></div>' +
      (STATE.open === '_new' ? '<div class="icard" data-newbox style="min-width:0;margin-bottom:10px">' + brandForm({}) +
        '<div style="display:flex;gap:10px;align-items:center;margin-top:10px"><button type="button" data-create style="' + BTN + '">Create firm</button><span class="loc-card-srcline" data-msg>Next: add a demo client and a manager on its card below.</span></div></div>' : '') +
      STATE.firms.map(firmCard).join('');
    wire(root);
  }

  function wire(root) {
    root.querySelector('[data-new]').addEventListener('click', function () { STATE.open = STATE.open === '_new' ? null : '_new'; STATE.mode = null; render(); });
    root.querySelector('[data-refresh]').addEventListener('click', function () { load(); });
    root.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copy(b.getAttribute('data-copy'), b); }); });
    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var org = b.getAttribute('data-org'), m = b.getAttribute('data-act');
        if (STATE.open === org && STATE.mode === m) { STATE.open = null; STATE.mode = null; } else { STATE.open = org; STATE.mode = m; }
        render();
      });
    });

    var nb = root.querySelector('[data-newbox]');
    if (nb) {
      var nmsg = nb.querySelector('[data-msg]'), nlogo = wireLogo(nb, nmsg);
      nb.querySelector('[data-create]').addEventListener('click', function (ev) {
        var v = vals(nb); if (!v.name) { say(nmsg, 'Firm name is required.', true); return; }
        var accent = v.accent && v.accent.toUpperCase() !== '#ADD540' ? v.accent : '';
        ev.target.disabled = true; say(nmsg, 'Creating…');
        call('create_firm', { name: v.name, short: v.short, full: v.full, accent: accent, logo: nlogo.logo || '', email: v.email, phone: v.phone, website: v.website })
          .then(function (r) {
            var id = r.firm && r.firm.id;
            return (v.require && id ? call('update_brand', { org_id: id, short: v.short || v.name, full: v.full || v.name, accent: accent, logo: nlogo.logo || '', email: v.email, phone: v.phone, website: v.website, require_share_token: true }) : Promise.resolve())
              .then(function () { STATE.open = id; STATE.mode = 'demo'; return load('Created ' + v.name + '. Now copy a demo client into it.'); });
          })
          .catch(function (e) { ev.target.disabled = false; say(nmsg, 'Not created: ' + e.message, true); });
      });
    }

    var card = STATE.open && STATE.open !== '_new' ? root.querySelector('[data-firm="' + STATE.open + '"] [data-body]') : null;
    if (!card) return;
    var msg = card.querySelector('[data-msg]'), org = STATE.open;
    var sbtn = card.querySelector('[data-save-brand]');
    if (sbtn) {
      var firm = STATE.firms.filter(function (x) { return x.id === org; })[0] || {}, lg = wireLogo(card, msg);
      sbtn.addEventListener('click', function () {
        var v = vals(card), accent = v.accent && !(v.accent.toUpperCase() === '#ADD540' && !firm.brand_accent) ? v.accent : '';
        var body = { org_id: org, short: v.short, full: v.full, accent: accent, email: v.email, phone: v.phone, website: v.website, require_share_token: !!v.require };
        if (lg.logo) body.logo = lg.logo; else if (lg.cleared) body.logo = ''; else body.keep_logo = true;
        sbtn.disabled = true; say(msg, 'Saving…');
        call('update_brand', body).then(function () {
          // If this is the admin's own firm, repaint now.
          try { if (window.BeaconBrand && window.BeaconBrand.loadForSession) window.BeaconBrand.loadForSession(); } catch (e) {}
          return load('Saved ' + (firm.name || 'brand') + '.');
        }).catch(function (e) { sbtn.disabled = false; say(msg, 'Not saved: ' + e.message, true); });
      });
    }
    var dbtn = card.querySelector('[data-save-demo]');
    if (dbtn) dbtn.addEventListener('click', function () {
      var v = vals(card); dbtn.disabled = true; say(msg, 'Copying… this can take 10–20 seconds for a large portfolio.');
      call('copy_demo', { org_id: org, source: v.source, name: v.name }).then(function (r) {
        STATE.mode = null;
        return load('Demo client ready. Link copied below the firm.').then(function () { if (r.link) copy(r.link); });
      }).catch(function (e) { dbtn.disabled = false; say(msg, 'Not copied: ' + e.message, true); });
    });
    var ubtn = card.querySelector('[data-save-user]');
    if (ubtn) ubtn.addEventListener('click', function () {
      var v = vals(card); if (!v.email) { say(msg, 'Email is required.', true); return; }
      ubtn.disabled = true; say(msg, 'Adding…');
      call('add_user', { org_id: org, email: v.email, full_name: v.full_name, role: v.role }).then(function (r) {
        STATE.mode = null;
        return load(v.email + ' added as ' + v.role + (r.created ? '' : ' (existing login moved into this firm)') + '. They sign in at gridientsuite.com/signin.');
      }).catch(function (e) { ubtn.disabled = false; say(msg, 'Not added: ' + e.message, true); });
    });
  }

  function load(note) {
    return call('list').then(function (r) {
      STATE.firms = r.firms || []; STATE.demos = r.demos || [];
      render();
      if (note) { var t = document.querySelector('#firms-root [data-top-msg]'); if (t) { t.textContent = note; t.style.color = 'var(--lime)'; } }
    }, function (e) {
      var t = document.querySelector('#firms-root [data-top-msg]');
      if (t) say(t, 'Could not load firms: ' + e.message, true); else console.warn('[firms] list failed', e);
    });
  }

  var checked = false;
  function check() {
    if (checked) return;
    var c = sb(); if (!c || !c.auth) return;
    c.auth.getSession().then(function (s) {
      if (!s || !s.data || !s.data.session || checked) return;
      checked = true;
      call('me').then(function (r) { if (r && r.admin) load(); }, function () { /* not an admin or not signed in: render nothing */ });
    });
  }
  function boot() {
    var tries = 0;
    (function wait() {
      var c = sb();
      if (c && c.auth) {
        check();
        try { c.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_IN') check(); }); } catch (e) {}
      } else if (tries++ < 40) setTimeout(wait, 500);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
  window.BeaconFirms = { load: load, check: function () { checked = false; check(); }, _state: STATE };
})();
