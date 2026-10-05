/**
 * rebates_renderer.js — Renders the Suite-shared DSIRE rebate intelligence
 * section on Beacon's Intelligence page (between ENERGY STAR Pathway and
 * the closing of the Intelligence section).
 *
 * DATA SOURCE: ./rebates_database.json — built from DSIRE monthly archives
 * via build_dsire.py. See DSIRE_REFRESH.md for monthly refresh procedure.
 *
 * LIFECYCLE:
 *   1. On first Intelligence view, fetch the JSON and cache on window._rebatesDB
 *   2. Filter by portfolio: only programs in portfolio states + federal programs
 *   3. Render KPI strip + tech category filter chips + grouped program list
 *   4. Modal opens on click showing full program details (matches Contract
 *      Calendar modal pattern: backdrop, card, ESC dismissal, body scroll lock)
 *
 * PER-PORTFOLIO FILTERING:
 *   - Programs must be in a state present in the portfolio (or federal)
 *   - Must have at least one Commercial-friendly sector tag
 *   - Tech category filter chips are user-driven (default: All)
 *
 * The renderer is idempotent — safe to call multiple times. State is held
 * on window._rebatesDB (the dataset) and window._rebatesViewState (the
 * active filter chip + portfolio state list).
 */

(function () {
  'use strict';

  // ── Dataset loader ────────────────────────────────────────────────
  // Three load paths, tried in order:
  //   1. window.REBATES_DB set by rebates_data.js (preferred — works on
  //      file:// AND http(s)://; the JS-wrapped JSON loads via <script>
  //      tag, no fetch needed)
  //   2. Cached window._rebatesDB from a previous call
  //   3. fetch('./rebates_database.json') as last-resort fallback
  //
  // The JS-wrapped path was added May 14, 2026 after discovering fetch()
  // is silently blocked on file:// URLs in Chromium. Now the rebates
  // section works whether the user opens the HTML directly or serves it
  // over http.
  window.loadRebatesDB = async function () {
    // Path 1: inline-script-set data (works everywhere)
    if (window.REBATES_DB) {
      window._rebatesDB = window.REBATES_DB;
      console.log('[rebates] using inline window.REBATES_DB', window._rebatesDB._meta);
      return window._rebatesDB;
    }
    // Path 2: previously-cached fetch result
    if (window._rebatesDB) return window._rebatesDB;
    // Path 3: fetch (only works on http(s)://; will fail silently on file://)
    try {
      var res = await fetch('./rebates_database.json', { cache: 'force-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      window._rebatesDB = await res.json();
      console.log('[rebates] loaded via fetch', window._rebatesDB._meta);
      return window._rebatesDB;
    } catch (e) {
      console.error('[rebates] load failed:', e);
      return null;
    }
  };

  // Lightweight HTML escape — reused across the renderer
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  function $id(id) { return document.getElementById(id); }

  // Money formatter shared with rest of Beacon
  function fmtMoney(n) {
    if (typeof window.fmtMoney === 'function') return window.fmtMoney(n);
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  // ── Type badge color mapping ─────────────────────────────────────
  // Different program types get different visual treatments so a broker
  // can scan the list and immediately see "rebate vs grant vs tax credit"
  // without reading.
  var TYPE_COLORS = {
    'Rebate Program':       'green',
    'Grant Program':        'lime',
    'Loan Program':         'blue',
    'PACE Financing':       'blue',
    'Corporate Tax Credit': 'purple',
    'Corporate Tax Deduction': 'purple',
    'Corporate Tax Exemption': 'purple',
    'Corporate Depreciation': 'purple',
    'Sales Tax Incentive':  'purple',
    'Property Tax Incentive': 'purple',
    'Property Tax Assessment': 'purple',
    'Performance-Based Incentive': 'amber',
    'Production Incentive': 'amber',
    'Feed-in Tariff':       'amber',
    'Solar Renewable Energy Credit Program': 'amber',
    'Green Building Incentive': 'green',
    'Net Metering':         'cyan',
    'Bond Program':         'blue',
    'Other Incentive':      'gray',
    'Leasing Program':      'gray',
  };

  // Default filter chips — the categories brokers most commonly ask about.
  // Order matters: most-clicked first.
  var FILTER_CHIPS = [
    { key: 'all',     label: 'All Programs' },
    { key: 'Solar Technologies',   label: 'Solar' },
    { key: 'Lighting',             label: 'Lighting' },
    { key: 'HVAC',                 label: 'HVAC' },
    { key: 'Battery',              label: 'Storage' },
    { key: 'Charging Equipment',   label: 'EV' },
    { key: 'Building Envelope',    label: 'Envelope' },
    { key: 'Geothermal Technologies', label: 'Geothermal' },
    { key: 'Industrial Equipment', label: 'Industrial' },
    { key: 'Wind',                 label: 'Wind' },
  ];

  // ── Per-portfolio filter ─────────────────────────────────────────
  // Given the portfolio's state list, return the union of (1) programs
  // in those states and (2) federal programs (state='US'). Plus optional
  // tech category filter from the active chip.
  function getApplicablePrograms(db, portfolioStates, techCatFilter) {
    if (!db || !db.programs) return [];

    var byState = db.lookups.by_state || {};
    var ids = new Set();

    // Federal programs always apply
    (byState['US'] || []).forEach(function (id) { ids.add(id); });

    // Programs from portfolio states
    portfolioStates.forEach(function (st) {
      (byState[st] || []).forEach(function (id) { ids.add(id); });
    });

    // Resolve IDs to program records
    var programMap = {};
    db.programs.forEach(function (p) { programMap[p.id] = p; });

    var result = [];
    ids.forEach(function (id) {
      var p = programMap[id];
      if (!p) return;
      // Apply tech category filter if set
      if (techCatFilter && techCatFilter !== 'all') {
        if (!p.tech_categories || p.tech_categories.indexOf(techCatFilter) < 0) return;
      }
      result.push(p);
    });

    // Sort: federal first, then by state alpha, then by program name alpha
    result.sort(function (a, b) {
      if (a.state === 'US' && b.state !== 'US') return -1;
      if (a.state !== 'US' && b.state === 'US') return  1;
      if (a.state !== b.state) return a.state.localeCompare(b.state);
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  // ── Main renderer entry point ────────────────────────────────────
  // Called from Intelligence render flow. Reads portfolio from
  // localStorage (same pattern as other Beacon renderers), loads the DB
  // lazily, then paints the section.
  window.renderRebatesSection = async function () {
    var sec = $id('rebates-sec');
    if (!sec) return;

    // Resolve client + portfolio
    var qp  = new URLSearchParams(window.location.search);
    var cid = window._beaconClientId || qp.get('clientId') || qp.get('client') || '';
    var accounts = [];
    try {
      var all = JSON.parse(localStorage.getItem('sts_portfolios_v1') || '{}');
      accounts = (all[cid] && Array.isArray(all[cid])) ? all[cid] : [];
    } catch (e) {}

    if (!accounts.length) { sec.style.display = 'none'; return; }

    // Show "loading" state immediately so the user sees the section
    sec.style.display = '';
    var listEl  = $id('rebates-list');
    var statsEl = $id('rebates-stats');
    if (listEl)  listEl.innerHTML  = '<div class="rebates-loading">Loading rebate intelligence…</div>';
    if (statsEl) statsEl.innerHTML = '';

    // Lazy-load the DB (cached after first call)
    var db = await window.loadRebatesDB();
    if (!db) {
      if (listEl) listEl.innerHTML = '<div class="rebates-loading rebates-error">Could not load rebate database. Check that rebates_database.json deployed alongside the app.</div>';
      return;
    }

    // Distill portfolio states
    var stateSet = {};
    accounts.forEach(function (a) {
      var st = String((a && a.state) || '').trim().toUpperCase();
      if (st) stateSet[st] = true;
    });
    var portfolioStates = Object.keys(stateSet).sort();

    // Initialize view state if needed (search, sort, showAll, filter, portfolioStates)
    if (!window._rebatesViewState) {
      window._rebatesViewState = {
        filter: 'all', search: '', sort: 'relevance', showAll: false,
        portfolioStates: portfolioStates
      };
    } else {
      // Portfolio changed (client switch) — reset everything
      var oldStates = window._rebatesViewState.portfolioStates.join(',');
      var newStates = portfolioStates.join(',');
      if (oldStates !== newStates) {
        window._rebatesViewState = {
          filter: 'all', search: '', sort: 'relevance', showAll: false,
          portfolioStates: portfolioStates
        };
        // Clear UI form inputs when client switches
        var inp = $id('rebates-search'); if (inp) inp.value = '';
        var sel = $id('rebates-sort');   if (sel) sel.value = 'relevance';
      }
    }

    paintRebatesSection(db);
  };

  // Cap on initial render — show first N, with "See all" button to expand
  var DEFAULT_CAP = 8;

  // ── Paint the visible section ────────────────────────────────────
  function paintRebatesSection(db) {
    var state = window._rebatesViewState;
    var portfolioStates = state.portfolioStates;
    var activeFilter    = state.filter;
    var searchQuery     = (state.search || '').trim().toLowerCase();
    var sortMode        = state.sort || 'relevance';
    var showAll         = !!state.showAll;

    // Get full applicable set (used for chip counts and stat strip)
    var allApplicable = getApplicablePrograms(db, portfolioStates, null);
    // Get filtered set (chip filter applied)
    var chipFiltered = getApplicablePrograms(db, portfolioStates, activeFilter);
    // Apply search to chip-filtered set
    var searched = chipFiltered;
    if (searchQuery) {
      searched = chipFiltered.filter(function (p) {
        // Match against name, administrator, technologies, tech categories, summary
        var hay = (
          (p.name || '') + '|' +
          (p.administrator || '') + '|' +
          (p.technologies || []).join('|') + '|' +
          (p.tech_categories || []).join('|') + '|' +
          (p.type || '') + '|' +
          (p.summary || '').slice(0, 500)
        ).toLowerCase();
        return hay.indexOf(searchQuery) >= 0;
      });
    }
    // Apply sort
    var sorted = applySort(searched, sortMode);

    // Cap (unless searching — when searching, show all matches; or unless showAll toggled)
    var displayList;
    var capActive = !showAll && !searchQuery && sorted.length > DEFAULT_CAP;
    if (capActive) {
      displayList = sorted.slice(0, DEFAULT_CAP);
    } else {
      displayList = sorted;
    }

    // ── Subtitle ──
    var subEl = $id('rebates-sub');
    if (subEl) {
      var sub = allApplicable.length + ' program' + (allApplicable.length === 1 ? '' : 's') +
                ' across ' + portfolioStates.length + ' state' + (portfolioStates.length === 1 ? '' : 's') +
                ' + federal · data current as of ' + (db._meta.source_version || '');
      subEl.textContent = sub;
    }

    // ── KPI strip — by program type (always from full unfiltered set) ──
    var statsEl = $id('rebates-stats');
    if (statsEl) {
      var byType = {};
      allApplicable.forEach(function (p) { byType[p.type] = (byType[p.type] || 0) + 1; });
      var typeOrder = ['Rebate Program','Grant Program','Loan Program','Corporate Tax Credit','PACE Financing','Net Metering','Property Tax Incentive','Sales Tax Incentive'];
      var pickedTypes = typeOrder.filter(function (t) { return byType[t]; }).slice(0, 4);
      Object.keys(byType).forEach(function (t) {
        if (pickedTypes.length < 4 && pickedTypes.indexOf(t) < 0) pickedTypes.push(t);
      });
      statsEl.innerHTML = pickedTypes.map(function (t) {
        var color = TYPE_COLORS[t] || 'gray';
        return '<div class="rebates-stat ' + color + '">' +
          '<div class="rebates-stat-num">' + byType[t] + '</div>' +
          '<div class="rebates-stat-lbl">' + _esc(t) + 's</div>' +
        '</div>';
      }).join('');
    }

    // ── Filter chips ──
    var chipsEl = $id('rebates-chips');
    if (chipsEl) {
      chipsEl.innerHTML = FILTER_CHIPS.map(function (chip) {
        var count = (chip.key === 'all')
          ? allApplicable.length
          : allApplicable.filter(function (p) {
              return p.tech_categories && p.tech_categories.indexOf(chip.key) >= 0;
            }).length;
        if (count === 0 && chip.key !== 'all') return '';
        var activeClass = (activeFilter === chip.key) ? ' active' : '';
        return '<button type="button" class="rebates-chip' + activeClass + '" ' +
               'onclick="window._setRebatesFilter(\'' + chip.key + '\')">' +
          _esc(chip.label) + ' <span class="rebates-chip-ct">' + count + '</span>' +
        '</button>';
      }).join('');
    }

    // ── List body ──
    var listEl = $id('rebates-list');
    if (listEl) {
      if (displayList.length === 0) {
        var msg = searchQuery
          ? '<strong>No programs match "' + _esc(searchQuery) + '".</strong><br><span>Try different keywords, change the technology filter, or clear search to see all programs.</span>'
          : '<strong>No programs match the current filter.</strong><br><span>Try "All Programs" or a different technology category.</span>';
        listEl.innerHTML = '<div class="sec-noresults">' + msg + '</div>';
      } else {
        // Flat list — each card has a state badge inline so context is clear
        listEl.innerHTML =
          '<div class="rebates-group-body">' +
          displayList.map(function (p, idx) { return renderProgramCard(p, idx); }).join('') +
          '</div>';
      }
    }

    // ── Cap footer ──
    var capEl    = $id('rebates-cap');
    var capMsgEl = $id('rebates-cap-msg');
    var capBtnEl = $id('rebates-cap-btn');
    if (capEl) {
      if (capActive) {
        capEl.style.display = 'flex';
        if (capMsgEl) capMsgEl.textContent = 'Showing top ' + DEFAULT_CAP + ' of ' + sorted.length + ' applicable programs';
        if (capBtnEl) capBtnEl.textContent = 'See all ' + sorted.length + ' →';
      } else if (showAll && sorted.length > DEFAULT_CAP) {
        capEl.style.display = 'flex';
        if (capMsgEl) capMsgEl.textContent = 'Showing all ' + sorted.length + ' programs';
        if (capBtnEl) capBtnEl.textContent = '← Show top ' + DEFAULT_CAP;
      } else if (searchQuery && sorted.length > 0) {
        capEl.style.display = 'flex';
        if (capMsgEl) capMsgEl.textContent = sorted.length + ' result' + (sorted.length === 1 ? '' : 's') + ' for "' + searchQuery + '"';
        if (capBtnEl) capBtnEl.style.display = 'none';
      } else {
        capEl.style.display = 'none';
        if (capBtnEl) capBtnEl.style.display = '';
      }
      // Re-show button if it was hidden (search exited)
      if (capBtnEl && !searchQuery) capBtnEl.style.display = '';
    }
  }

  // ── Sort modes ───────────────────────────────────────────────────
  function applySort(list, mode) {
    var arr = list.slice();
    switch (mode) {
      case 'budget':
        arr.sort(function (a, b) {
          // Parse budgets that look like "$3.267 billion" or "$1.5M" — best-effort
          return parseBudget(b.budget) - parseBudget(a.budget);
        });
        break;
      case 'state':
        arr.sort(function (a, b) {
          if (a.state === 'US' && b.state !== 'US') return -1;
          if (a.state !== 'US' && b.state === 'US') return  1;
          if (a.state !== b.state) return a.state.localeCompare(b.state);
          return a.name.localeCompare(b.name);
        });
        break;
      case 'name':
        arr.sort(function (a, b) { return a.name.localeCompare(b.name); });
        break;
      case 'relevance':
      default:
        // Federal first, then alphabetical
        arr.sort(function (a, b) {
          if (a.state === 'US' && b.state !== 'US') return -1;
          if (a.state !== 'US' && b.state === 'US') return  1;
          return a.name.localeCompare(b.name);
        });
    }
    return arr;
  }

  function parseBudget(s) {
    if (!s) return 0;
    var str = String(s).toLowerCase();
    var m = str.match(/\$?\s*([\d,.]+)\s*(billion|million|m|b|k|thousand)?/);
    if (!m) return 0;
    var n = parseFloat(m[1].replace(/,/g, ''));
    if (isNaN(n)) return 0;
    var unit = m[2] || '';
    if (unit.indexOf('b') === 0) return n * 1e9;
    if (unit.indexOf('m') === 0) return n * 1e6;
    if (unit.indexOf('thousand') === 0 || unit === 'k') return n * 1e3;
    return n;
  }

  // ── One program card (flat-list form — state shown as inline badge) ──
  function renderProgramCard(p, cardId) {
    var color = TYPE_COLORS[p.type] || 'gray';
    var preview = (p.summary || '').slice(0, 180);
    if ((p.summary || '').length > 180) preview += '…';

    var stateLabel = (p.state === 'US') ? 'FEDERAL' : p.state;
    var stateClass = (p.state === 'US') ? 'rebates-state-badge federal' : 'rebates-state-badge';

    var techPills = '';
    if (p.tech_categories && p.tech_categories.length) {
      techPills = p.tech_categories.slice(0, 3).map(function (tc) {
        return '<span class="rebates-pill">' + _esc(tc) + '</span>';
      }).join('');
      if (p.tech_categories.length > 3) {
        techPills += '<span class="rebates-pill rebates-pill-more">+' + (p.tech_categories.length - 3) + '</span>';
      }
    }

    return '<div class="rebates-card" onclick="window._openRebateModal(\'' + p.id + '\')">' +
      '<div class="rebates-card-hd">' +
        '<div class="rebates-card-name">' + _esc(p.name) + '</div>' +
        '<div class="rebates-card-badges">' +
          '<span class="' + stateClass + '">' + _esc(stateLabel) + '</span>' +
          '<span class="rebates-badge ' + color + '">' + _esc(p.type) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="rebates-card-admin">' + _esc(p.administrator || p.implementing_sector || '—') + '</div>' +
      (preview ? '<div class="rebates-card-preview">' + _esc(preview) + '</div>' : '') +
      (techPills ? '<div class="rebates-card-pills">' + techPills + '</div>' : '') +
    '</div>';
  }

  // ── Click handlers exposed globally ──────────────────────────────
  window._setRebatesFilter = function (filterKey) {
    if (!window._rebatesViewState) return;
    window._rebatesViewState.filter = filterKey;
    window._rebatesViewState.showAll = false;  // Reset "see all" when filter changes
    if (window._rebatesDB) paintRebatesSection(window._rebatesDB);
  };

  window._setRebatesSearch = function (q) {
    if (!window._rebatesViewState) return;
    window._rebatesViewState.search = q || '';
    if (window._rebatesDB) paintRebatesSection(window._rebatesDB);
  };

  window._clearRebatesSearch = function () {
    var inp = $id('rebates-search');
    if (inp) inp.value = '';
    window._setRebatesSearch('');
  };

  window._setRebatesSort = function (sortMode) {
    if (!window._rebatesViewState) return;
    window._rebatesViewState.sort = sortMode || 'relevance';
    if (window._rebatesDB) paintRebatesSection(window._rebatesDB);
  };

  window._toggleRebatesShowAll = function () {
    if (!window._rebatesViewState) return;
    window._rebatesViewState.showAll = !window._rebatesViewState.showAll;
    if (window._rebatesDB) paintRebatesSection(window._rebatesDB);
    // Scroll back to top of rebates section so user sees the change in context
    var sec = $id('rebates-sec');
    if (sec && window._rebatesViewState.showAll === false) {
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // ── Modal: show one program's full detail ────────────────────────
  window._openRebateModal = function (programId) {
    if (!window._rebatesDB) return;
    var p = window._rebatesDB.programs.find(function (x) { return x.id === programId; });
    if (!p) return;

    var modal = $id('rebate-modal');
    if (!modal) return;

    var color = TYPE_COLORS[p.type] || 'gray';

    // Header
    var eyeEl   = $id('rebate-modal-eye');
    var titleEl = $id('rebate-modal-title');
    var subEl   = $id('rebate-modal-sub');
    if (eyeEl)   eyeEl.textContent   = (p.state === 'US' ? 'FEDERAL' : p.state) + ' · ' + (p.type || '').toUpperCase();
    if (titleEl) titleEl.textContent = p.name;

    var subParts = [];
    if (p.administrator) subParts.push(p.administrator);
    if (p.state_name && p.state !== 'US') subParts.push(p.state_name);
    if (p.implementing_sector) subParts.push(p.implementing_sector + ' program');
    if (subEl) subEl.textContent = subParts.join(' · ');

    // Body — assembled from program fields
    var bodyEl = $id('rebate-modal-body');
    if (bodyEl) {
      var html = '';

      // Quick-facts strip: dates, budget, funding source
      var facts = [];
      if (p.start_date)     facts.push({ lbl: 'Started',         val: p.start_date });
      if (p.end_date)       facts.push({ lbl: 'Expires',         val: p.end_date });
      if (p.funding_source) facts.push({ lbl: 'Funding source',  val: p.funding_source });
      if (p.budget)         facts.push({ lbl: 'Budget',          val: p.budget });
      if (p.energy_categories && p.energy_categories.length) {
        facts.push({ lbl: 'Energy category', val: p.energy_categories.join(', ') });
      }
      if (facts.length) {
        html += '<div class="rebate-modal-facts">' +
          facts.map(function (f) {
            return '<div class="rebate-modal-fact">' +
              '<div class="rebate-modal-fact-lbl">' + _esc(f.lbl) + '</div>' +
              '<div class="rebate-modal-fact-val">' + _esc(f.val) + '</div>' +
            '</div>';
          }).join('') +
        '</div>';
      }

      // Parameters (the dollar-amount entries)
      if (p.parameters && p.parameters.length) {
        html += '<div class="rebate-modal-section"><div class="rebate-modal-section-hd">Incentive Amounts</div>' +
          '<div class="rebate-modal-params">' +
            p.parameters.map(function (pm) {
              var amt = pm.amount;
              if (pm.units && pm.units.indexOf('$') === 0 && amt < 100) {
                // Show as currency at appropriate precision
                amt = '$' + amt.toFixed(2);
              } else {
                amt = String(amt);
              }
              return '<div class="rebate-modal-param">' +
                '<div class="rebate-modal-param-amount">' + _esc(amt) + ' <span class="rebate-modal-param-units">' + _esc(pm.units || '') + '</span></div>' +
                '<div class="rebate-modal-param-qual">' + _esc((pm.source || '') + (pm.qualifier ? ' (' + pm.qualifier + ')' : '')) + '</div>' +
              '</div>';
            }).join('') +
          '</div></div>';
      }

      // Summary
      if (p.summary) {
        html += '<div class="rebate-modal-section"><div class="rebate-modal-section-hd">Summary</div>' +
          '<div class="rebate-modal-prose">' + _esc(p.summary).replace(/\n/g, '<br>') + '</div></div>';
      }

      // Structured detail sections (Incentive Amount, Eligible System Size, etc.)
      if (p.details && p.details.length) {
        p.details.forEach(function (d) {
          html += '<div class="rebate-modal-section"><div class="rebate-modal-section-hd">' + _esc(d.label) + '</div>' +
            '<div class="rebate-modal-prose">' + _esc(d.value).replace(/\n/g, '<br>') + '</div></div>';
        });
      }

      // Tech + sector tags
      var tagRows = [];
      if (p.technologies && p.technologies.length) {
        tagRows.push({ lbl: 'Technologies', vals: p.technologies });
      }
      if (p.sectors && p.sectors.length) {
        // Filter to broker-relevant sectors only
        var relevantSectors = p.sectors.filter(function (s) {
          return ['Commercial','Industrial','Multifamily Residential','Institutional','Schools','Agricultural','Nonprofit','Local Government','State Government','Federal Government'].indexOf(s) >= 0;
        });
        if (relevantSectors.length) tagRows.push({ lbl: 'Eligible sectors', vals: relevantSectors });
      }
      if (p.utilities && p.utilities.length) {
        tagRows.push({ lbl: 'Utilities', vals: p.utilities });
      }
      tagRows.forEach(function (row) {
        html += '<div class="rebate-modal-section"><div class="rebate-modal-section-hd">' + _esc(row.lbl) + '</div>' +
          '<div class="rebate-modal-tags">' +
            row.vals.map(function (v) { return '<span class="rebate-modal-tag">' + _esc(v) + '</span>'; }).join('') +
          '</div></div>';
      });

      // Links
      var links = [];
      if (p.website)    links.push({ lbl: 'Official program page',  url: p.website });
      if (p.public_url) links.push({ lbl: 'DSIRE database detail',  url: p.public_url });
      if (links.length) {
        html += '<div class="rebate-modal-section"><div class="rebate-modal-section-hd">Links</div>' +
          '<div class="rebate-modal-links">' +
            links.map(function (l) {
              return '<a href="' + _esc(l.url) + '" target="_blank" rel="noopener" class="rebate-modal-link">' + _esc(l.lbl) + ' ↗</a>';
            }).join('') +
          '</div></div>';
      }

      bodyEl.innerHTML = html;
    }

    // Set badge color on the close button area
    var headerEl = modal.querySelector('.rebate-modal-hd');
    if (headerEl) {
      headerEl.className = 'rebate-modal-hd ' + color;
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window._closeRebateModal = function () {
    var modal = $id('rebate-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  };

  // ESC key dismissal
  (function attachEsc() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var modal = $id('rebate-modal');
      if (modal && modal.style.display === 'flex') {
        window._closeRebateModal();
      }
    });
  })();
})();
