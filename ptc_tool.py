"""Price-to-compare catalog helper (Beacon). Talks to Supabase only through token-gated RPCs.

Env: PTC_TOKEN (one-time loader token whose sha256 is in ptc_private.loader_token), PTC_ANON (project anon key).

  python3 ptc_tool.py export <dir>              -> <dir>/<STATE>.json per state (rows + sources) and <dir>/states.json
  python3 ptc_tool.py load <workflow_output> <dir>  -> loads monthly results, writes <dir>/report.md and <dir>/stats.json
  python3 ptc_tool.py load-initial <workflow_output> -> loads canvass/verify (initial or pass-2) output
  python3 ptc_tool.py export-holes <dir>         -> <dir>/<STATE>.json listing rows with no price (none_published / hourly_index) + <dir>/states.json
  python3 ptc_tool.py load-proxy <workflow_output> -> writes proxy_* fields onto those rows
"""
import json, sys, os, html, urllib.request, datetime, collections

BASE = "https://wnzpoacrdxrddwptpeiz.supabase.co/rest/v1/rpc/"
ANON = os.environ["PTC_ANON"]; TOKEN = os.environ["PTC_TOKEN"]
UNITS = {'cents_per_kwh', 'dollars_per_therm', 'dollars_per_ccf', 'dollars_per_mcf', 'dollars_per_dth'}
KINDS = {'tariff_filing', 'puc_site', 'utility_site', 'state_shopping_site', 'other'}
NAMES = {'PA': 'Pennsylvania', 'OH': 'Ohio', 'IL': 'Illinois', 'MA': 'Massachusetts', 'NY': 'New York', 'NJ': 'New Jersey',
         'MD': 'Maryland', 'DC': 'District of Columbia', 'DE': 'Delaware', 'CT': 'Connecticut', 'RI': 'Rhode Island',
         'NH': 'New Hampshire', 'ME': 'Maine', 'MI': 'Michigan', 'TX': 'Texas'}

def rpc(fn, payload):
    payload = dict(payload, p_token=TOKEN)
    req = urllib.request.Request(BASE + fn, data=json.dumps(payload).encode(), method="POST",
        headers={"apikey": ANON, "Authorization": "Bearer " + ANON, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode() or 'null')

def u(v): return html.unescape(v) if isinstance(v, str) else v

def clean_row(r, state):
    r = {k: u(x) for k, x in r.items()}
    pt = r['price_type']; price = r.get('price'); unit = r.get('unit')
    if pt in ('hourly_index', 'none_published'): price = unit = None
    if pt in ('fixed', 'monthly_variable') and (price is None or unit not in UNITS):
        r['verification_note'] = '[Loader] No single price/unit, stored without a price. ' + (r.get('verification_note') or '')
        r['verified'] = False; pt = 'none_published'; price = unit = None
    return dict(state=r.get('state') or state, utility_name=r['utility_name'], fuel=r['fuel'], service_class=r['service_class'],
        service_class_desc=r.get('service_class_desc'),
        customer_size=r.get('customer_size') if r.get('customer_size') in ('small', 'medium', 'large', 'all') else None,
        price_type=pt, price=price, unit=unit, components=r.get('components'),
        effective_start=r.get('effective_start') or None, effective_end=r.get('effective_end') or None,
        source_url=r['source_url'], source_kind=r.get('source_kind') if r.get('source_kind') in KINDS else 'other',
        source_quote=r.get('source_quote'), verified=bool(r.get('verified')), verification_note=r.get('verification_note'),
        status='current' if r.get('verified') else 'needs_review')

def dedup(rows):
    seen, out = set(), []
    for r in rows:
        k = (r['state'], r['utility_name'], r['fuel'], r['service_class'], r['effective_start'])
        if k not in seen: seen.add(k); out.append(r)
    return out

def clean_src(x, state):
    x = {k: u(y) for k, y in x.items()}
    return dict(state=state, utility_name=x['utility_name'], fuel=x['fuel'], url=x['url'],
        source_kind=x.get('source_kind') if x.get('source_kind') in KINDS else 'other',
        publishes=x.get('publishes'), update_pattern=x.get('update_pattern'))

def read_output(fn):
    d = json.load(open(fn))
    return d.get('result', d) if isinstance(d, dict) else d

def export(dirn):
    os.makedirs(dirn, exist_ok=True)
    d = rpc('ptc_export', {})
    by = collections.defaultdict(lambda: {'rows': [], 'sources': []})
    for r in d['rows']: by[r['state']]['rows'].append(r)
    for s in d['sources']: by[s['state']]['sources'].append(s)
    for st, v in by.items(): json.dump(v, open(f"{dirn}/{st}.json", 'w'), indent=1)
    states = [{'code': s, 'name': NAMES.get(s, s)} for s in sorted(by)]
    json.dump(states, open(f"{dirn}/states.json", 'w'))
    print(len(d['rows']), 'rows', len(d['sources']), 'sources', [s['code'] for s in states])

def load_monthly(fn, dirn):
    res = read_output(fn)
    rows, new_src, status, touch, notes, flagged = [], [], [], [], [], []
    for s in res:
        st = s['state']; rc = s.get('recheck') or {}; v = s.get('verify') or {}
        if not rc: notes.append(f"{st}: recheck worker returned nothing"); continue
        for r in v.get('rows', []):
            cr = clean_row(r, st); rows.append(cr)
            if not cr['verified']: flagged.append(cr)
        touch += [dict(state=st, utility_name=u(k['utility_name']), fuel=k['fuel'], service_class=u(k['service_class'])) for k in rc.get('unchanged', [])]
        status += [dict(state=st, utility_name=u(x['utility_name']), fuel=x['fuel'], url=u(x['url']), last_status=x['last_status'], notes=x.get('notes')) for x in rc.get('source_status', [])]
        new_src += [clean_src(x, st) for x in rc.get('new_sources', [])]
        notes += [f"{st}: {u(n)}" for n in rc.get('notes', [])]
    rows = dedup(rows)
    r1 = rpc('ptc_load', {'p_rows': rows, 'p_sources': new_src})
    r2 = rpc('ptc_touch', {'p_keys': touch})
    r3 = rpc('ptc_source_status', {'p_status': status})
    stats = dict(rows_changed=len(rows), rows_flagged=len(flagged), unchanged_touched=r2, sources_status=r3,
                 new_sources=len(new_src), load=r1, moved=[x for x in status if x['last_status'] in ('moved', 'unreachable')])
    json.dump(stats, open(f"{dirn}/stats.json", 'w'), indent=1)
    today = datetime.date.today().isoformat()
    L = [f"# Price-to-compare monthly run, {today}", "",
         f"{len(rows)} changed or new rows ({len(rows)-len(flagged)} verified, {len(flagged)} needs_review). "
         f"{r2} rows re-confirmed unchanged. {r1.get('superseded', 0)} older rows superseded. {len(new_src)} new source pages.", "",
         "## Changes", "", "| State | Utility | Fuel | Class | Price | Unit | Effective | Status |", "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['state']} | {r['utility_name']} | {r['fuel']} | {r['service_class']} | {r['price'] if r['price'] is not None else r['price_type']} | {r['unit'] or ''} | {r['effective_start'] or ''} to {r['effective_end'] or ''} | {r['status']} |")
    L += ["", "## Source pages that moved or failed", ""] + [f"- {x['state']} {x['utility_name']} ({x['fuel']}): {x['last_status']}, {x['url']}. {x.get('notes') or ''}" for x in stats['moved']] or ["- none"]
    L += ["", "## Needs review", ""] + [f"- {r['state']} {r['utility_name']} {r['service_class']}: {r['verification_note']}" for r in flagged]
    L += ["", "## Worker notes", ""] + [f"- {n}" for n in notes]
    open(f"{dirn}/report.md", 'w').write("\n".join(L) + "\n")
    print(json.dumps(stats)[:2000])

def load_initial(fn):
    res = read_output(fn); rows, srcs = [], []
    for s in res:
        st = s['state']; f = s.get('found') or {}; v = s.get('verify') or {}
        rows += [clean_row(r, st) for r in v.get('rows', [])]
        srcs += [clean_src(x, st) for x in f.get('sources', []) or []]
    rows = dedup(rows)
    seen, sd = set(), []
    for x in srcs:
        k = (x['state'], x['utility_name'], x['fuel'], x['url'])
        if k not in seen: seen.add(k); sd.append(x)
    print(len(rows), 'rows', len(sd), 'sources', rpc('ptc_load', {'p_rows': rows, 'p_sources': sd}))

def export_holes(dirn):
    os.makedirs(dirn, exist_ok=True)
    d = rpc('ptc_export', {})
    by = collections.defaultdict(list)
    for r in d['rows']:
        if r.get('price') is None:
            by[r['state']].append({k: r.get(k) for k in ('utility_name', 'fuel', 'service_class', 'service_class_desc', 'customer_size',
                'price_type', 'components', 'verification_note', 'source_url', 'proxy_price', 'proxy_basis', 'proxy_source_url')})
    for st, v in by.items(): json.dump({'holes': v}, open(f"{dirn}/{st}.json", 'w'), indent=1)
    states = [{'code': s, 'name': NAMES.get(s, s)} for s in sorted(by)]
    json.dump(states, open(f"{dirn}/states.json", 'w'))
    print(sum(len(v) for v in by.values()), 'holes', {k: len(v) for k, v in sorted(by.items())})

def load_proxy(fn):
    res = read_output(fn); out = []
    for s in res:
        for p in (s.get('verify') or {}).get('proxies', []):
            p = {k: u(x) for k, x in p.items()}
            if p.get('proxy_price') is None: continue
            out.append(dict(state=s['state'], utility_name=p['utility_name'], fuel=p['fuel'], service_class=p['service_class'],
                proxy_price=p['proxy_price'], proxy_unit=p.get('proxy_unit') if p.get('proxy_unit') in UNITS else None,
                proxy_basis=p.get('proxy_basis'), proxy_period_start=p.get('proxy_period_start') or None,
                proxy_period_end=p.get('proxy_period_end') or None, proxy_source_url=p.get('proxy_source_url'),
                proxy_source_quote=p.get('proxy_source_quote'), proxy_verified=bool(p.get('proxy_verified')), proxy_note=p.get('proxy_note')))
    out = [p for p in out if p['proxy_unit']]
    print(len(out), 'proxies', 'updated', rpc('ptc_set_proxy', {'p_rows': out}))

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == 'export': export(sys.argv[2])
    elif cmd == 'load': load_monthly(sys.argv[2], sys.argv[3])
    elif cmd == 'load-initial': load_initial(sys.argv[2])
    elif cmd == 'export-holes': export_holes(sys.argv[2])
    elif cmd == 'load-proxy': load_proxy(sys.argv[2])
