// SATE — process-device-session
// Bridges a hardware-recorded device session into the SAME pipeline a manual
// web upload uses: run the AI (sate.ngrok.io/process), compute error_counts +
// analysis, and insert into `recordings` assigned to the SLP's existing patient.
//
// Invoked: (a) fire-and-forget by device-api after a session's final chunk,
//          (b) a cron fallback. Idempotent via sate_device_sessions.processed.
//
// Auth: not a user JWT. Caller must present the service role key OR the
// PROCESSOR_SECRET in the Authorization header. (verify_jwt is disabled.)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { countErrors, calculateSpeechAnalysis } from './analysis.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_PROCESS_URL = Deno.env.get('AI_PROCESS_URL') || 'https://sate-v1-5.ngrok.io/process';
const BATCH_LIMIT = 5;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const processorSecret = Deno.env.get('PROCESSOR_SECRET') || '';
  const auth = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (auth !== serviceKey && (!processorSecret || auth !== processorSecret)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

  // Optional: process one specific session id (passed by device-api), else sweep.
  let onlyId: string | null = null;
  try { onlyId = (await req.json())?.session_id ?? null; } catch { /* no body = sweep */ }

  let query = supabase
    .from('sate_device_sessions')
    .select('id, user_id, device_serial, patient_id, session_number, sample_rate, bytes, storage_path, flags')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);
  if (onlyId) query = supabase
    .from('sate_device_sessions')
    .select('id, user_id, device_serial, patient_id, session_number, sample_rate, bytes, storage_path, flags')
    .eq('id', onlyId)
    .eq('processed', false);

  const { data: sessions, error: selErr } = await query;
  if (selErr) return json({ error: selErr.message }, 500);
  if (!sessions || sessions.length === 0) return json({ processed: [], message: 'nothing to process' });

  const results: any[] = [];
  for (const s of sessions) {
    try {
      const rec = await processOne(supabase, s);
      results.push({ session: s.id, recording_id: rec, status: 'ok' });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      await supabase.from('sate_device_sessions')
        .update({ process_error: msg }).eq('id', s.id);
      results.push({ session: s.id, status: 'error', error: msg });
    }
  }
  return json({ processed: results });
});

async function processOne(supabase: any, s: any): Promise<string> {
  // 1. Download the WAV the device uploaded.
  const { data: blob, error: dlErr } = await supabase.storage.from('device-sessions').download(s.storage_path);
  if (dlErr || !blob) throw new Error(`download failed: ${dlErr?.message || 'no blob'}`);
  const wavBytes = new Uint8Array(await blob.arrayBuffer());

  // 2. Resolve the SLP's EXISTING patient from the device patient_id.
  //    (device = SLP's device; the patient already exists — never fabricate.)
  const patientUuid = await resolvePatient(supabase, s.user_id, s.patient_id);

  // 3. Run the SAME AI the web app uses (multipart audio_file).
  const fd = new FormData();
  const fileName = `device_${s.device_serial}_s${s.session_number}.wav`;
  fd.append('audio_file', new Blob([wavBytes], { type: 'audio/wav' }), fileName);
  fd.append('device', 'cuda');
  fd.append('pause_threshold', '0.25');

  const aiRes = await fetch(AI_PROCESS_URL, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
  if (!aiRes.ok) throw new Error(`AI ${aiRes.status}: ${(await aiRes.text()).slice(0, 200)}`);
  const transcript = await aiRes.json();
  if (!transcript || !transcript.segments) throw new Error('AI returned no segments');

  // 4. Same derived metrics as manual upload.
  const errorCounts = countErrors(transcript.segments);
  const analysis = calculateSpeechAnalysis(transcript);

  // 5. Copy audio into the `recordings` bucket so app playback works identically.
  const recPath = `${s.user_id}/${Date.now()}_${fileName}`;
  const { error: upErr } = await supabase.storage.from('recordings')
    .upload(recPath, wavBytes, { contentType: 'audio/wav', upsert: true, cacheControl: '3600' });
  if (upErr) throw new Error(`recordings upload: ${upErr.message}`);

  // 6. Insert into `recordings` — identical shape to a manual save.
  const { data: rec, error: insErr } = await supabase.from('recordings').insert({
    user_id: s.user_id,
    file_path: recPath,
    transcript,
    error_counts: errorCounts,
    analysis,
    file_name: fileName,
    file_size: wavBytes.length,
    duration: analysis.totalDuration || 0,
    patient_id: patientUuid,
    // Use the exact name the device sent to the server (its WAV file name),
    // not a reformatted label — the recording shows up named as the device made it.
    recording_name: fileName,
    // Device recordings are shown directly: protocol auto-filled, name kept as
    // the device's WAV file name. No review form — needs_review stays false so
    // the report opens straight away.
    protocol: 'auto',
    notes: 'Auto-imported from SATE hardware device',
    needs_review: false,
    // Flag markers (ms offsets) the clinician hit on the device during the take.
    flags: Array.isArray(s.flags) && s.flags.length ? s.flags : null,
  }).select('id').single();
  if (insErr) {
    await supabase.storage.from('recordings').remove([recPath]);
    throw new Error(`recordings insert: ${insErr.message}`);
  }

  // 7. Mark the device session done + link back (idempotent).
  await supabase.from('sate_device_sessions').update({
    processed: true, processed_at: new Date().toISOString(),
    recording_id: rec.id, process_error: null,
  }).eq('id', s.id);

  return rec.id;
}

// Resolve a device patient_id (text, e.g. "PT-2001") to an existing clinical
// patients.id (uuid) owned by this SLP. Two paths, no creation:
//   1. the device roster row's explicit clinical_patient_id link
//   2. a patients row tagged with device_patient_id for this slp
// Returns null (unassigned) if no existing patient matches.
async function resolvePatient(supabase: any, userId: string, devicePatientId: string): Promise<string | null> {
  if (!devicePatientId) return null;

  const { data: rosterRow } = await supabase
    .from('sate_device_patients')
    .select('clinical_patient_id')
    .eq('user_id', userId)
    .eq('patient_id', devicePatientId)
    .maybeSingle();
  if (rosterRow?.clinical_patient_id) return rosterRow.clinical_patient_id;

  const { data: tagged } = await supabase
    .from('patients')
    .select('id')
    .eq('slp_id', userId)
    .eq('device_patient_id', devicePatientId)
    .maybeSingle();
  if (tagged?.id) return tagged.id;

  return null;
}
