// childes-norms — CORS proxy for the CHILDES normative-metrics API.
//
// The upstream norms service (an ngrok tunnel) returns valid JSON but sends NO
// `Access-Control-Allow-Origin` header, so a direct browser fetch is blocked and the
// Analysis tab shows "Failed to fetch". This edge function calls the upstream
// server-side (no browser CORS in play) and returns the JSON to the browser WITH CORS.
//
// Deploy: supabase functions deploy childes-norms --no-verify-jwt  (public reference data)

const UPSTREAM = (Deno.env.get('CHILDES_API_URL') || 'https://childes-metrics.ngrok.app').replace(/\/+$/, '');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // Params come from a POST JSON body (supabase-js `functions.invoke`) or, as a
    // fallback, from the query string of a plain GET.
    let q: Record<string, unknown> = {};
    if (req.method === 'POST') {
      q = await req.json().catch(() => ({}));
    } else {
      q = Object.fromEntries(new URL(req.url).searchParams.entries());
    }

    const num = (v: unknown) =>
      v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v);

    if (num(q.year) === undefined) return json({ error: 'year is required' }, 400);

    const p = new URLSearchParams();
    p.set('language', String(q.language ?? 'Eng-NA'));
    p.set('task', String(q.task ?? 'narrative'));
    if (q.clinical) p.set('clinical', String(q.clinical));
    p.set('year', String(num(q.year)));
    const month = num(q.month);
    if (month !== undefined) {
      p.set('month', String(month));
      const range = num(q.range);
      if (range !== undefined) p.set('range', String(range));
    }
    p.set('samples', '0'); // means + counts only

    const r = await fetch(`${UPSTREAM}/query?${p.toString()}`, {
      headers: { 'ngrok-skip-browser-warning': '1', accept: 'application/json' },
    });
    const text = await r.text();
    if (!r.ok) return json({ error: `norms upstream ${r.status}`, detail: text.slice(0, 500) }, 502);
    return new Response(text, { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    return json({ error: `norms proxy failed: ${(e as Error)?.message || e}` }, 502);
  }
});
