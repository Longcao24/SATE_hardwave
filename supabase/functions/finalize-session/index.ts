// SATE — finalize-session
// The light half of async device-session processing. The CF container holds the
// long AI call, copies the audio into the recordings bucket, then calls THIS with
// the transcript JSON. Here we run the same analysis the web app uses, insert into
// `recordings`, and flip the session to done. No AI call, no big audio buffer here,
// so this always finishes inside the edge wall-clock.
//
// Deploy: supabase functions deploy finalize-session --no-verify-jwt --use-api
//         (verify_jwt MUST stay false — cf-processor calls it with the service key / secret.)
// v3 (2026-10-28): a WEB upload (session.web_meta, device-api ≥v51) keeps its real file name and
//         the patient the clinician picked (re-checked against the session's account), and is
//         marked needs_review so the web Save (or the review popup) names it.
// Auth: service role key OR PROCESSOR_SECRET (verify_jwt disabled).
// Idempotent: a session already `done` / already linked is a no-op.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { countErrors, calculateSpeechAnalysis } from './analysis.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const secret = Deno.env.get('PROCESSOR_SECRET') || '';
  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  if (auth !== serviceKey && (!secret || auth !== secret)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const sessionId = body?.session_id;
  if (!sessionId) return json({ error: 'session_id required' }, 400);

  const { data: s, error: selErr } = await supabase
    .from('sate_device_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (selErr) return json({ error: selErr.message }, 500);
  if (!s) return json({ error: 'session not found' }, 404);

  // Idempotent: already finalized.
  if (s.status === 'done') return json({ status: 'already_done', recording_id: s.recording_id });

  // No usable speech: mark done + no_text, no recording.
  if (body.no_text) {
    await supabase.from('sate_device_sessions').update({
      processed: true, processed_at: new Date().toISOString(),
      recording_id: null, no_text: true, process_error: null, status: 'done',
    }).eq('id', sessionId);
    return json({ status: 'no_text' });
  }

  const transcript = body.transcript;
  const recPath = body.rec_path;
  if (!transcript || !Array.isArray(transcript.segments)) return json({ error: 'transcript.segments required' }, 400);
  if (!recPath) return json({ error: 'rec_path required' }, 400);

  // Idempotent guard: a recording is already linked to this session.
  if (s.recording_id) {
    await supabase.from('sate_device_sessions').update({
      processed: true, status: 'done', processed_at: new Date().toISOString(), process_error: null,
    }).eq('id', sessionId);
    return json({ status: 'already_linked', recording_id: s.recording_id });
  }

  // A file uploaded on the WEB (device-api ≥v43.1-web) carries its real name and the patient the
  // clinician picked; it is not auto-imported hardware, so it is marked for review — the web
  // app's Save clears that once the clinician names it, and if the tab was closed first the
  // usual review popup asks next time the recording is opened.
  const web = s.web_meta && typeof s.web_meta === 'object' ? s.web_meta : null;
  // The patient is re-checked HERE, not trusted from web_meta: the row is owner-writable, and a
  // patient deleted since the upload would otherwise fail the insert on every attempt.
  let patientUuid: string | null = null;
  if (web) {
    if (web.patient_uuid) {
      const { data: pat } = await supabase.from('patients').select('id')
        .eq('id', web.patient_uuid).eq('slp_id', s.user_id).maybeSingle();
      patientUuid = pat?.id ?? null;
    }
  } else {
    patientUuid = await resolvePatient(supabase, s.user_id, s.patient_id);
  }
  const errorCounts = countErrors(transcript.segments);
  const analysis = calculateSpeechAnalysis(transcript);
  const fileName = (web && web.file_name) || body.file_name || `device_${s.device_serial}_s${s.session_number}.wav`;

  const { data: rec, error: insErr } = await supabase.from('recordings').insert({
    user_id: s.user_id,
    file_path: recPath,
    transcript,
    error_counts: errorCounts,
    analysis,
    file_name: fileName,
    file_size: body.file_size ?? null,
    duration: analysis.totalDuration || 0,
    patient_id: patientUuid,
    recording_name: fileName,
    protocol: web ? null : 'auto',
    notes: web ? null : 'Auto-imported from SATE hardware device',
    needs_review: !!web,
    flags: Array.isArray(s.flags) && s.flags.length ? s.flags : null,
  }).select('id').single();
  if (insErr) return json({ error: `recordings insert: ${insErr.message}` }, 500);

  await supabase.from('sate_device_sessions').update({
    processed: true, processed_at: new Date().toISOString(),
    recording_id: rec.id, process_error: null, status: 'done',
  }).eq('id', sessionId);

  return json({ recording_id: rec.id });
});

async function resolvePatient(supabase: any, userId: string, devicePatientId: string): Promise<string | null> {
  if (!devicePatientId) return null;
  const { data: rosterRow } = await supabase
    .from('sate_device_patients').select('clinical_patient_id')
    .eq('user_id', userId).eq('patient_id', devicePatientId).maybeSingle();
  if (rosterRow?.clinical_patient_id) return rosterRow.clinical_patient_id;
  const { data: tagged } = await supabase
    .from('patients').select('id')
    .eq('slp_id', userId).eq('device_patient_id', devicePatientId).maybeSingle();
  if (tagged?.id) return tagged.id;
  return null;
}
