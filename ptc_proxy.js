export const meta = {
  name: 'ptc-proxy',
  description: 'Find published average supply prices to use as proxy price-to-compare for classes with no published default price',
  phases: [
    { title: 'Find', detail: 'one Sonnet worker per state finds a proxy for every hole' },
    { title: 'Verify', detail: 'a second Sonnet worker re-opens each proxy source' },
  ],
}
// args: { asOf, dir, states: [{code, name}] }
const STATES = args.states
const AS_OF = args.asOf
const DIR = args.dir
const PROXY = {
  type: 'object',
  properties: {
    utility_name: { type: 'string', description: 'EXACTLY as in the hole row' },
    fuel: { type: 'string', enum: ['electric', 'gas'] },
    service_class: { type: 'string', description: 'EXACTLY as in the hole row' },
    proxy_price: { type: ['number', 'null'], description: 'null if no defensible proxy found' },
    proxy_unit: { type: ['string', 'null'], enum: ['cents_per_kwh', 'dollars_per_therm', 'dollars_per_ccf', 'dollars_per_mcf', 'dollars_per_dth', null] },
    proxy_basis: { type: 'string', description: 'What the number is and how it was derived, e.g. "Con Ed historical MSC monthly average, SC-9 Rate I, Sept 2026" or "EIA TX commercial avg 11.2c minus Oncor secondary delivery 4.1c"' },
    proxy_period_start: { type: ['string', 'null'] },
    proxy_period_end: { type: ['string', 'null'] },
    proxy_source_url: { type: 'string', description: 'Page actually opened; if derived from two sources, list the main one here and the other in proxy_basis' },
    proxy_source_quote: { type: 'string', description: 'Exact line(s) the figure(s) came from' },
  },
  required: ['utility_name', 'fuel', 'service_class', 'proxy_price', 'proxy_unit', 'proxy_basis', 'proxy_source_url', 'proxy_source_quote'],
}
const FIND = { type: 'object', properties: { proxies: { type: 'array', items: PROXY }, notes: { type: 'array', items: { type: 'string' } } }, required: ['proxies', 'notes'] }
const VERIFY = { type: 'object', properties: { proxies: { type: 'array', items: { type: 'object', properties: Object.assign({}, PROXY.properties, { proxy_verified: { type: 'boolean' }, proxy_note: { type: 'string' } }), required: PROXY.required.concat(['proxy_verified', 'proxy_note']) } } }, required: ['proxies'] }

const GUIDE = `Today is ${AS_OF}. These commercial classes have no single published default-service price to compare (the price is hourly, calculator-only, or the market has no utility default service). Matt wants a defensible ESTIMATE for each, clearly labelled, instead of a hole. Exact is not required; transparent is.
Good proxy sources, in order of preference:
1. The utility's or PUC's own published monthly/historical AVERAGE supply price for that class (e.g. Con Edison historical Market Supply Charge averages by service class; NYSEG/RG&E historical supply price by SC; National Grid NY historical ESC; PJM utilities' hourly-priced service monthly average; NY DPS / PA PUC / NJ BPU published average default prices).
2. A state-agency monthly average (e.g. PUCT or Power to Choose average commercial offers; NY DPS monthly price-to-compare averages).
3. Derived: wholesale monthly average for the zone (ISO-published average day-ahead/real-time LMP for the month) plus the utility's published adders (capacity, ancillary, admin) for hourly classes; or EIA monthly average commercial retail price for the state minus the TDU's published delivery charges (Texas). Show the arithmetic in proxy_basis.
Use the most recent complete month. Electric in cents per kWh. Every number must come from a page you opened (quote it); never from memory. If nothing defensible exists, return proxy_price null and say why.
Use WebSearch/WebFetch (load via ToolSearch "select:WebSearch,WebFetch" if needed). Budget about 40 fetches.`

const results = await pipeline(
  STATES,
  (st) => agent(`Proxy price-to-compare research for ${st.code} (${st.name}). Read ${DIR}/${st.code}.json with the Read tool: it lists the hole rows (utility_name, fuel, service_class, price_type, notes). Return one proxy per hole row.\n${GUIDE}`,
    { label: `proxy:${st.code}`, phase: 'Find', schema: FIND, model: 'sonnet' }),
  (found, st) => found && found.proxies.length ? agent(`Adversarial check of proxy price-to-compare estimates for ${st.code} (${st.name}). For EACH proxy: open proxy_source_url (and any second source named in proxy_basis), confirm the quoted figures, period and arithmetic, and that the basis is a reasonable stand-in for that class's default SUPPLY price. proxy_verified=true only if you confirmed it yourself. Correct anything you can prove wrong. Keep utility_name/fuel/service_class exactly.\n${GUIDE}\nProxies:\n${JSON.stringify(found.proxies)}`,
    { label: `verify:${st.code}`, phase: 'Verify', schema: VERIFY, model: 'sonnet' }).then(v => ({ state: st.code, found, verify: v }))
    : { state: st.code, found, verify: { proxies: [] } }
)
return results.filter(Boolean)
