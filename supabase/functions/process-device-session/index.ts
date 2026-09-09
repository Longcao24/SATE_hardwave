// SATE — process-device-session (DISABLED / no-op).
//
// Device processing moved to the async pipeline: sessions are `status='queued'`
// (column default), a Cloudflare container claims them via claim_next_session(),
// holds the long AI call outside any serverless wall-clock, copies the audio, and
// calls the `finalize-session` edge to write `recordings`.
//
// This old synchronous path used to run the AI INSIDE the edge function, which the
// Supabase wall-clock timeout kills mid-request on long takes (the bug that left
// sessions stuck in "processing"). It is kept as a 200 no-op only because device-api
// still fire-and-forgets a call here after a session's final chunk. It must NOT
// process anything, or it would race the container and create duplicate recordings.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  return new Response(
    JSON.stringify({ disabled: true, message: 'device processing handled by the async container pipeline' }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
