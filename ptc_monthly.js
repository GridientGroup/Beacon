export const meta = {
  name: 'ptc-monthly',
  description: 'Monthly re-check of commercial price-to-compare rates: re-open each saved source page, capture revisions, verify changes',
  phases: [
    { title: 'Recheck', detail: 'one Sonnet worker per state re-opens the saved source pages' },
    { title: 'Verify', detail: 'a second Sonnet worker confirms every changed or new figure' },
  ],
}

// args: { asOf: 'YYYY-MM-DD', dir: '/abs/path/with/<STATE>.json', states: [{code, name}] }
const STATES = args.states
const AS_OF = args.asOf
const DIR = args.dir

const KINDS = ['tariff_filing', 'puc_site', 'utility_site', 'state_shopping_site', 'other']
const ROW = {
  type: 'object',
  properties: {
    state: { type: 'string' },
    utility_name: { type: 'string', description: 'Use EXACTLY the utility_name of the existing row when updating it' },
    fuel: { type: 'string', enum: ['electric', 'gas'] },
    service_class: { type: 'string', description: 'Use EXACTLY the service_class of the existing row when updating it' },
    service_class_desc: { type: 'string' },
    customer_size: { type: 'string', enum: ['small', 'medium', 'large', 'all'] },
    price_type: { type: 'string', enum: ['fixed', 'monthly_variable', 'hourly_index', 'none_published'] },
    price: { type: ['number', 'null'] },
    unit: { type: ['string', 'null'], enum: ['cents_per_kwh', 'dollars_per_therm', 'dollars_per_ccf', 'dollars_per_mcf', 'dollars_per_dth', null] },
    components: { type: 'string' },
    effective_start: { type: ['string', 'null'], description: 'YYYY-MM-DD; a NEW period must carry its own start date' },
    effective_end: { type: ['string', 'null'] },
    source_url: { type: 'string' },
    source_kind: { type: 'string', enum: KINDS },
    source_quote: { type: 'string', description: 'Exact line/cell the figure was read from' },
  },
  required: ['state', 'utility_name', 'fuel', 'service_class', 'customer_size', 'price_type', 'price', 'unit', 'effective_start', 'source_url', 'source_kind', 'source_quote'],
}
const KEY = { type: 'object', properties: { utility_name: { type: 'string' }, fuel: { type: 'string' }, service_class: { type: 'string' } }, required: ['utility_name', 'fuel', 'service_class'] }
const RECHECK = {
  type: 'object',
  properties: {
    changed_rows: { type: 'array', items: ROW, description: 'New price periods, corrected values, and newly found classes. Not unchanged rows.' },
    unchanged: { type: 'array', items: KEY, description: 'Existing rows you re-confirmed are still in effect today' },
    source_status: { type: 'array', items: {
      type: 'object',
      properties: {
        utility_name: { type: 'string' }, fuel: { type: 'string' }, url: { type: 'string', description: 'EXACT url of the saved source' },
        last_status: { type: 'string', enum: ['ok_unchanged', 'ok_changed', 'moved', 'unreachable'] },
        notes: { type: 'string', description: 'If moved: the new URL and what happened' },
      },
      required: ['utility_name', 'fuel', 'url', 'last_status'],
    } },
    new_sources: { type: 'array', items: {
      type: 'object',
      properties: {
        utility_name: { type: 'string' }, fuel: { type: 'string', enum: ['electric', 'gas'] }, url: { type: 'string' },
        source_kind: { type: 'string', enum: KINDS }, publishes: { type: 'string' }, update_pattern: { type: 'string' },
      },
      required: ['utility_name', 'fuel', 'url', 'source_kind', 'publishes', 'update_pattern'],
    } },
    notes: { type: 'array', items: { type: 'string' }, description: 'Anything a human should look at' },
  },
  required: ['changed_rows', 'unchanged', 'source_status', 'new_sources', 'notes'],
}
const VERIFY = {
  type: 'object',
  properties: {
    rows: { type: 'array', items: { type: 'object', properties: Object.assign({}, ROW.properties, { verified: { type: 'boolean' }, verification_note: { type: 'string' } }), required: ROW.required.concat(['verified', 'verification_note']) } },
  },
  required: ['rows'],
}

const RULES = `Rules:
- Today is ${AS_OF}. We want the default-service SUPPLY price ("price to compare") a commercial customer pays today if they have NOT chosen a competitive supplier. Not all-in bill rates, not distribution.
- Utilities and PUCs publish these in the same place every period. Go to the saved source pages FIRST. Only search the web if a page has moved or no longer carries the figure; then record the new URL in source_status.notes and new_sources.
- Hourly-priced classes: price_type "hourly_index", price null. Unpublished: "none_published". Never invent a number; never use memory for a number.
- Electric in cents per kWh ($/kWh x 100). Gas in the utility's own unit.
- Use WebSearch/WebFetch (load via ToolSearch "select:WebSearch,WebFetch" if needed). PDFs can be fetched. If a page is JavaScript-rendered, look for the PDF/tariff sheet/PUC filing behind it.`

const results = await pipeline(
  STATES,
  (st) => agent(
    `Monthly re-check of commercial price-to-compare rates for ${st.code} (${st.name}). Read ${DIR}/${st.code}.json with the Read tool: "rows" are the catalog's current rows, "sources" are the standing pages where they are published.\n1. Open EVERY source page. Record its status.\n2. For EVERY row, decide whether the value in effect today differs from the stored one (new month, new six-month period, new annual factor, correction). If so, return a changed row with the new value, its own effective_start/end, and the quote. If still in effect, list it under "unchanged".\n3. Rows with status needs_review: try again to confirm or correct them.\n4. If a source now lists a commercial class the catalog lacks, add it as a changed row.\nBudget: about 40 fetches.\n${RULES}`,
    { label: `recheck:${st.code}`, phase: 'Recheck', schema: RECHECK, model: 'sonnet' }),
  (rc, st) => {
    if (!rc) return { state: st.code, recheck: null, verify: null }
    if (!rc.changed_rows.length) return { state: st.code, recheck: rc, verify: { rows: [] } }
    return agent(
      `You are an adversarial checker for commercial price-to-compare rates in ${st.code} (${st.name}). For EACH row below, open its source_url yourself and confirm price, unit, class, effective dates, and that it is a default-service SUPPLY price. verified=true only if you confirmed it yourself; otherwise false with the reason. Correct values you can prove wrong. Keep utility_name and service_class exactly as given.\n${RULES}\nRows:\n${JSON.stringify(rc.changed_rows)}`,
      { label: `verify:${st.code}`, phase: 'Verify', schema: VERIFY, model: 'sonnet' })
      .then(v => ({ state: st.code, recheck: rc, verify: v }))
  }
)
return results.filter(Boolean)
