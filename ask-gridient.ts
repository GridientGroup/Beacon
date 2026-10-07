// ask-gridient.ts — Supabase Edge Function "ask-gridient"   (v23 — bundle 153)
//
// Receives: POST { message, history: [{role,content}], channel, context?, stream?, tier? }
// Returns:  { reply: "<html>" }                       (stream false / absent)
//           text/plain stream of the HTML reply      (stream true)
//           { error } with a real HTTP status on failure
//
// bundle 153:
//   • context: a plain-text briefing Beacon builds from the open client (portfolio,
//     program estimates, next 120 days, open location, live market). Answers use
//     those numbers; the model is told never to invent figures.
//   • stream: the reply streams as it is written, so the first words show at once.
//   • tier: 'fast' (default) or 'smart'.
//
// SECRETS: ANTHROPIC_API_KEY; SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (platform).
// ABUSE CONTROL: origin allow-list, per-user / per-IP / all-anonymous hourly caps
// via ask_gridient_check_rate() (fail-closed), input caps.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MODELS: Record<string, string> = { fast: 'claude-haiku-4-5-20251001', smart: 'claude-sonnet-4-5' };
const DEFAULT_TIER = 'fast';
const MAX_TOKENS = 700;

const ANON_HOURLY_LIMIT = 20;
const ANON_ALL_HOURLY_LIMIT = 120;
const USER_HOURLY_LIMIT = 100;
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 2000;
const MAX_CONTEXT_CHARS = 8000;

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  let host: string;
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return false; }
  if (host === 'gridientsuite.com' || host.endsWith('.gridientsuite.com')) return true;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return false;
}
function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
}

const CHANNEL_CONTEXT: Record<string, string> = {
  switchboard: 'The user is in Switchboard — the energy procurement workspace where brokers manage accounts, run pricing analysis, build RFPs, and track deals.',
  linework: 'The user is in Linework — LOAs and procurement documents with e-signature routing.',
  ledger: 'The user is in Ledger — commission reconciliation against supplier payments.',
  conductor: 'The user is in Conductor — the broker command center with live ISO prices, Henry Hub, EIA storage and the renewal pipeline.',
  beacon: 'The user is in Beacon — the energy-intelligence portal a broker uses with a commercial client (and the client sees their own version of).',
};

function buildSystemPrompt(channel: string, context: string): string {
  const channelCtx = CHANNEL_CONTEXT[channel] ?? 'The user is using Gridient Suite.';
  const ctx = context
    ? `\n\nLIVE DATA FROM THE SCREEN (computed by Beacon for the open client; treat as the source of truth):\n<data>\n${context}\n</data>\n\nUSING THE DATA:\n- When a question is about this client, their locations, contracts, opportunities, the next 120 days or today's market, answer from <data> and quote its numbers exactly (round only as shown there).\n- Never invent a number, date, location or supplier that is not in <data>. If the answer needs data that isn't there, say what is missing in one line and what would provide it.\n- Beacon's dollar figures are estimates; call them estimates. Program estimates overlap, so never add them together.\n- Do not calculate anything: no totals, sums, "together", "combined", percentages, ratios or "×" comparisons. Quote each figure on its own. Annual spend is spend, not savings: never use the words "at risk" or "savings" for spend.
- Do not describe market history, seasons or trends beyond the figures in <data>.
- Never name companies, vendors, suppliers or products that are not in <data>. Never suggest a number of buildings, a timeline or a savings figure that is not in <data>.
- For market direction, use the interpretation written in <data> (e.g. storage ABOVE average = bearish). Power figures are spot prices, not quotes.\n- Only call something electric or gas when <data> says so (contract lines are labelled Electric or Gas). Do not tie gas market moves to electric contracts.
- Keep it to 120 words or fewer unless asked for more. End with one clear next step; do not end with a question.\n- If AUDIENCE is a broker, speak to the broker about "the client" and suggest the next move (who to call, what to send, what to price). If AUDIENCE is the client, speak to them directly ("your portfolio") in plain, formal business language and suggest they talk to their advisor.\n- Lead with the answer in the first sentence; then 2–4 short supporting points.`
    : '';
  return `You are Ask Gridient — the AI assistant built into Gridient Suite for commercial energy brokers and their clients. You are an expert in energy markets, procurement and building energy programs.

CHANNEL:
${channelCtx}

YOU ANSWER confidently: natural gas and power markets (Henry Hub, storage vs the 5-year average, ISO/LMP, capacity), retail supply (fixed/index/blend, default service, price to compare, renewals, RFPs), utility tariffs and demand charges, efficiency, solar, demand response, rebates, RECs, building performance standards, and how to use Gridient tools.
- Storage BELOW the 5-year average is bullish (upward price pressure); ABOVE is bearish.

STYLE:
- Direct and concise: a short paragraph and/or a short list. Busy professionals.
- Format as clean HTML using only <p>, <strong>, <ul>, <li>, <br>. No markdown, no headings, no filler.${ctx}`;
}

function ensureHtml(text: string): string {
  if (/<p>|<ul>|<li>|<strong>/.test(text)) return text;
  return text.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>').trim()}</p>`).join('');
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const allowed = isAllowedOrigin(origin);
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://beacon.gridientsuite.com',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const fail = (status: number, msg: string, replyHtml?: string) =>
    Response.json(replyHtml ? { error: msg, reply: replyHtml } : { error: msg }, { status, headers: corsHeaders });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'Method not allowed');
  if (!allowed) { console.error('[ask-gridient] rejected origin:', origin || '(none)'); return fail(403, 'This endpoint is not available from that origin.'); }
  if (!ANTHROPIC_KEY) return fail(503, 'Ask Gridient is not configured.', '<p>Ask Gridient is not yet configured. Please contact your administrator.</p>');
  if (!SUPABASE_URL || !SERVICE_KEY) return fail(503, 'Ask Gridient is temporarily unavailable.');

  let body: { message?: string; history?: { role: string; content: string }[]; channel?: string; context?: string; stream?: boolean; tier?: string };
  try { body = await req.json(); } catch { return fail(400, 'Invalid JSON'); }

  const message = (body.message ?? '').trim();
  const channel = (body.channel ?? 'suite').trim().slice(0, 40);
  const context = String(body.context ?? '').slice(0, MAX_CONTEXT_CHARS);
  const wantStream = body.stream === true;
  const model = MODELS[String(body.tier ?? DEFAULT_TIER)] ?? MODELS[DEFAULT_TIER];
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  if (!message) return fail(400, 'No message provided');
  if (message.length > MAX_MESSAGE_CHARS) return fail(413, `Message too long. Please keep it under ${MAX_MESSAGE_CHARS} characters.`);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  let userId: string | null = null;
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer) {
    try { const { data, error } = await db.auth.getUser(bearer); if (!error && data?.user?.id) userId = data.user.id; }
    catch (e) { console.error('[ask-gridient] token check failed:', String(e)); }
  }
  const checks: [string, number][] = userId
    ? [[`user:${userId}`, USER_HOURLY_LIMIT]]
    : [[`ip:${clientIp(req)}`, ANON_HOURLY_LIMIT], ['anon:all', ANON_ALL_HOURLY_LIMIT]];
  try {
    for (const [key, limit] of checks) {
      const { data, error } = await db.rpc('ask_gridient_check_rate', { p_key: key, p_limit: limit });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.allowed !== true) return fail(429, 'Ask Gridient is busy right now. Please try again in a few minutes.');
    }
  } catch (e) {
    console.error('[ask-gridient] rate-limit check failed, refusing:', String(e));
    return fail(503, 'Ask Gridient is temporarily unavailable. Please try again shortly.');
  }

  const messages: { role: string; content: string }[] = [];
  for (const turn of rawHistory.slice(0, -1).slice(-MAX_HISTORY_TURNS)) {
    if (turn.role === 'user' || turn.role === 'assistant') messages.push({ role: turn.role, content: String(turn.content ?? '').slice(0, MAX_HISTORY_CHARS) });
  }
  messages.push({ role: 'user', content: message });
  const payload = { model, max_tokens: MAX_TOKENS, temperature: 0.2, system: buildSystemPrompt(channel, context), messages };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(wantStream ? { ...payload, stream: true } : payload),
    });
    if (!response.ok) {
      console.error('[ask-gridient] Anthropic API error:', response.status, await response.text());
      return fail(502, 'Ask Gridient encountered an error. Please try again in a moment.', '<p>Ask Gridient encountered an error. Please try again in a moment.</p>');
    }
    if (!wantStream) {
      const data = await response.json();
      return Response.json({ reply: ensureHtml(data?.content?.[0]?.text ?? '') }, { status: 200, headers: corsHeaders });
    }
    // stream: forward only the text deltas
    const enc = new TextEncoder(), dec = new TextDecoder();
    const reader = response.body!.getReader();
    const out = new ReadableStream({
      async pull(ctrl) {
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) { ctrl.close(); return; }
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            try {
              const ev = JSON.parse(line.slice(5));
              if (ev.type === 'content_block_delta' && ev.delta?.text) ctrl.enqueue(enc.encode(ev.delta.text));
              if (ev.type === 'message_stop') { ctrl.close(); return; }
            } catch { /* keep-alive or partial */ }
          }
        }
      },
      cancel() { try { reader.cancel(); } catch { /* */ } },
    });
    return new Response(out, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
  } catch (e) {
    console.error('[ask-gridient] fetch error:', e);
    return fail(502, 'Ask Gridient encountered a network error. Please try again.', '<p>Ask Gridient encountered a network error. Please try again.</p>');
  }
});
