// lsa-report — CORS proxy for the SATE LSA Report API (the service behind the
// "SATE Report" button).
//
// The upstream service (a FastAPI app on a lab server, exposed through ngrok) answers
// valid JSON but sends NO `Access-Control-Allow-Origin` header and has no OPTIONS route
// (a preflight returns 405), so a direct browser fetch is blocked. Same situation, same
// fix as `childes-norms`: call it server-side and return the JSON with CORS.
//
// Deploy WITH jwt verification (the default) — unlike childes-norms this carries a
// patient transcript, so only a signed-in account may use it:
//   supabase functions deploy lsa-report --use-api --project-ref zlgdpivcbmaodgokkdvz
//
// One request holds an LLM call for ~15-30 s. That fits the edge wall-clock limit
// (~150 s) with room to spare, which is why this may be an edge function at all; the
// upstream fetch is aborted at 120 s so a hung tunnel fails with a real message instead
// of the worker being killed mid-fetch.

const UPSTREAM = (Deno.env.get('LSA_API_URL') || 'https://sate-lsa-report.ngrok.app').replace(/\/+$/, '');
const UPSTREAM_TIMEOUT_MS = 120_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'JSON body required' }, 400);

  const { sample, transcript } = body as { sample?: unknown; transcript?: unknown };
  if (!sample || typeof sample !== 'object') return json({ error: 'sample is required' }, 400);
  if (typeof transcript !== 'string' || transcript.trim() === '') {
    return json({ error: 'transcript is required' }, 400);
  }

  try {
    const r = await fetch(`${UPSTREAM}/v1/lsa-report`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await r.text();
    if (!r.ok) {
      // Pass the upstream's own explanation through — a 422 names the offending field
      // and a 502 means its language-model call failed and the request can be retried.
      let detail = text.slice(0, 1000);
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed?.detail === 'string') detail = parsed.detail;
        else if (parsed?.detail) detail = JSON.stringify(parsed.detail).slice(0, 1000);
      } catch { /* not JSON — keep the raw text */ }
      return json({ error: `LSA report service ${r.status}`, detail }, r.status === 422 ? 422 : 502);
    }
    return new Response(text, { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    const msg = (e as Error)?.name === 'TimeoutError'
      ? `LSA report service did not answer within ${UPSTREAM_TIMEOUT_MS / 1000}s.`
      : `LSA report proxy failed: ${(e as Error)?.message || e}`;
    return json({ error: msg }, 502);
  }
});
