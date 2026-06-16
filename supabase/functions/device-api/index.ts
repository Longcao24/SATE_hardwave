// SATE Device API — Supabase Edge Function
// Replaces the mock-server's Express endpoints with a single Edge Function
// that does internal path routing. Authenticated via Supabase JWT (users) or a
// device key (the recorder).
//
// Deploy:  npx supabase functions deploy device-api
// Invoke:  POST/GET ${SUPABASE_URL}/functions/v1/device-api/<path>
//
// Chunked session upload now ASSEMBLES the firmware's ~1 MB slices (offset +
// final, exactly like the mock-server), patches the WAV header on the final
// slice, then fires the process-device-session function which runs the SAME AI
// pipeline as a manual web upload and writes the result into `recordings`.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function noContent() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// Patch a standard 44-byte WAV header in place: RIFF chunk size (offset 4) and
// data chunk size (offset 40), so the stitched file is a valid WAV.
function patchWavHeader(buf: Uint8Array) {
  const size = buf.length;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (size >= 8) dv.setUint32(4, size - 8, true);
  if (size >= 44) dv.setUint32(40, size - 44, true);
}

// Fire-and-forget: kick the AI/recordings processor for one session. Kept alive
// past the response with waitUntil so the device's HTTP POST returns immediately.
function triggerProcessor(sessionId: string) {
  const base = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const p = fetch(`${base}/functions/v1/process-device-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  }).catch(() => {});
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* best effort */ }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');

  const url = new URL(req.url);
  const fullPath = url.pathname;
  const pathMatch = fullPath.match(/\/device-api(\/.*)?$/);
  // Firmware posts to /api/sessions/chunk; accept both /api/* and /* aliases.
  let subPath = pathMatch?.[1] || '/';
  if (subPath.startsWith('/api')) subPath = subPath.slice(4) || '/';
  const method = req.method;

  // Firmware posts /api/devices/register (mock-server convention) -> after the
  // /api strip that is /devices/register; accept both it and /register.
  if ((subPath === '/register' || subPath === '/devices/register') && method === 'POST') {
    return await handleDeviceRegister(supabase, req);
  }

  const deviceCommandMatch = subPath.match(/^\/devices\/([^/]+)\/commands$/);
  if (deviceCommandMatch && method === 'GET') {
    const deviceId = deviceCommandMatch[1];
    if (authHeader.startsWith('Bearer key-')) {
      return await handleDeviceHeartbeat(supabase, req, deviceId);
    }
  }

  if ((subPath === '/sessions/raw' || subPath === '/sessions/chunk' || subPath === '/sessions') && method === 'POST') {
    if (authHeader.startsWith('Bearer key-')) {
      return await handleSessionUpload(supabase, req, subPath);
    }
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return err('Unauthorized', 401);
  }

  try {
    if (subPath === '/devices' && method === 'GET') {
      return await listDevices(supabase, user.id);
    }
    if (subPath === '/devices/claim-token' && method === 'POST') {
      return await createClaimToken(supabase, user);
    }
    if (deviceCommandMatch && method === 'POST') {
      return await sendCommand(supabase, user.id, deviceCommandMatch[1], req);
    }
    if (deviceCommandMatch && method === 'GET') {
      return await handleDeviceHeartbeatUser(supabase, user.id, deviceCommandMatch[1], req);
    }
    const deviceIdMatch = subPath.match(/^\/devices\/([^/]+)$/);
    if (deviceIdMatch && method === 'PATCH') {
      return await renameDevice(supabase, user.id, deviceIdMatch[1], req);
    }
    if (deviceIdMatch && method === 'DELETE') {
      return await removeDevice(supabase, user.id, deviceIdMatch[1]);
    }
    if (subPath === '/patients' && method === 'GET') {
      return await listPatients(supabase, user.id, url.searchParams.get('slp'));
    }
    if (subPath === '/patients' && method === 'PUT') {
      return await replacePatients(supabase, user.id, req);
    }
    if (subPath === '/sessions' && method === 'GET') {
      return await listSessions(supabase, user.id, url.searchParams.get('device'));
    }
    const audioMatch = subPath.match(/^\/sessions\/([^/]+)\/audio$/);
    if (audioMatch && method === 'GET') {
      return await getSessionAudio(supabase, user.id, audioMatch[1]);
    }
    return err('Not found', 404);
  } catch (e) {
    console.error('Device API error:', e);
    return err((e as Error).message || 'Internal error', 500);
  }
});

// ============================================================================

async function listDevices(supabase: any, userId: string) {
  const cutoff = new Date(Date.now() - 45000).toISOString();
  await supabase.from('sate_devices')
    .update({ online: false, state: 'idle' })
    .eq('user_id', userId).lt('last_seen', cutoff).eq('online', true);
  const { data, error } = await supabase.from('sate_devices')
    .select('*').eq('user_id', userId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return json(data || []);
}

async function createClaimToken(supabase: any, user: any) {
  const token = 'claim-' + crypto.randomUUID().slice(0, 8);
  const { error } = await supabase.from('sate_claim_tokens').insert({
    token, user_id: user.id,
    user_name: user.user_metadata?.full_name || user.email || 'SLP',
  });
  if (error) throw new Error(error.message);
  return json({ token });
}

async function handleDeviceRegister(supabase: any, req: Request) {
  const { serial, claim_token, fw } = await req.json();
  if (!serial) return err('serial is required');

  let userId: string;
  let slpName = 'SLP';
  let slpId = '';

  if (claim_token) {
    const { data: claim } = await supabase.from('sate_claim_tokens')
      .select('*').eq('token', claim_token).eq('used', false).single();
    if (!claim) return err('Invalid or used claim token', 401);
    userId = claim.user_id;
    slpName = claim.user_name;
    slpId = claim.user_id;
    await supabase.from('sate_claim_tokens').update({ used: true }).eq('token', claim_token);
  } else {
    return err('claim_token is required', 401);
  }

  const id = 'dev-' + serial.toLowerCase();
  const { error } = await supabase.from('sate_devices').upsert({
    id, user_id: userId, name: serial, serial, fw: fw || '', online: true,
    ip: req.headers.get('x-forwarded-for') || '',
    last_seen: new Date().toISOString(), pending_sessions: 0, state: 'idle',
    slp: slpName, slp_id: slpId,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);

  return json({ device_id: id, device_key: 'key-' + id, slp: slpName, slp_id: slpId });
}

async function sendCommand(supabase: any, userId: string, deviceId: string, req: Request) {
  const { data: device } = await supabase.from('sate_devices')
    .select('id').eq('id', deviceId).eq('user_id', userId).single();
  if (!device) return err('Device not found', 404);

  const body = await req.json();
  const { op, patient } = body;
  await supabase.from('sate_device_commands').insert({ device_id: deviceId, op, patient: patient || null });

  if (patient?.patient_id) {
    await supabase.from('sate_device_patients').upsert({
      user_id: userId, patient_id: patient.patient_id,
      name: patient.name || patient.patient_id, age: patient.age || '',
      session_type: patient.session_type || '', clinician: patient.clinician || '',
    }, { onConflict: 'user_id,patient_id' });
  }
  return noContent();
}

async function handleDeviceHeartbeat(supabase: any, req: Request, deviceId: string) {
  const url = new URL(req.url);
  const updates: Record<string, unknown> = { online: true, last_seen: new Date().toISOString() };
  if (url.searchParams.has('pending')) updates.pending_sessions = Number(url.searchParams.get('pending'));
  if (url.searchParams.has('state')) updates.state = url.searchParams.get('state');
  await supabase.from('sate_devices').update(updates).eq('id', deviceId);

  const { data: cmds } = await supabase.from('sate_device_commands')
    .select('op, patient').eq('device_id', deviceId).eq('consumed', false)
    .order('created_at', { ascending: true });
  if (cmds?.length) {
    await supabase.from('sate_device_commands').update({ consumed: true })
      .eq('device_id', deviceId).eq('consumed', false);
  }
  return json({
    commands: (cmds || []).map((c: any) => c.op),
    active_patient: cmds?.find((c: any) => c.op === 'record')?.patient || null,
  });
}

async function handleDeviceHeartbeatUser(supabase: any, userId: string, deviceId: string, req: Request) {
  const { data: device } = await supabase.from('sate_devices')
    .select('id').eq('id', deviceId).eq('user_id', userId).single();
  if (!device) return err('Device not found', 404);
  return await handleDeviceHeartbeat(supabase, req, deviceId);
}

async function renameDevice(supabase: any, userId: string, deviceId: string, req: Request) {
  const { name } = await req.json();
  const { error } = await supabase.from('sate_devices')
    .update({ name }).eq('id', deviceId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return noContent();
}

async function removeDevice(supabase: any, userId: string, deviceId: string) {
  const { error } = await supabase.from('sate_devices')
    .delete().eq('id', deviceId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return noContent();
}

async function listPatients(supabase: any, userId: string, slp: string | null) {
  let query = supabase.from('sate_device_patients')
    .select('patient_id, name, age, session_type, clinician').eq('user_id', userId);
  if (slp) query = query.eq('clinician', slp);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return json(data || []);
}

async function replacePatients(supabase: any, userId: string, req: Request) {
  const patients = await req.json();
  if (!Array.isArray(patients)) return err('Expected an array');
  await supabase.from('sate_device_patients').delete().eq('user_id', userId);
  if (patients.length > 0) {
    const rows = patients.map((p: any) => ({
      user_id: userId, patient_id: p.patient_id, name: p.name || '', age: p.age || '',
      session_type: p.session_type || '', clinician: p.clinician || '',
      clinical_patient_id: p.clinical_patient_id || null,
    }));
    const { error } = await supabase.from('sate_device_patients').insert(rows);
    if (error) throw new Error(error.message);
  }
  return noContent();
}

// ---- Sessions ----

async function handleSessionUpload(supabase: any, req: Request, subPath: string) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const deviceId = authHeader.replace('Bearer key-', '');
  const { data: device } = await supabase.from('sate_devices')
    .select('user_id, serial').eq('id', deviceId).single();
  if (!device) return err('Device not found', 404);

  const url = new URL(req.url);

  if (subPath === '/sessions') {
    const body = await req.json();
    const { wav_base64, ...meta } = body;
    const wavBytes = Uint8Array.from(atob(wav_base64 || ''), (c) => c.charCodeAt(0));
    return await storeSessionRecord(supabase, device.user_id, {
      device_serial: meta.device_serial || device.serial,
      patient_id: meta.patient_id || 'PT',
      session_number: meta.session_number || 0,
      sample_rate: meta.sample_rate || 16000,
    }, wavBytes);
  }

  if (subPath === '/sessions/raw') {
    const wavBytes = new Uint8Array(await req.arrayBuffer());
    return await storeSessionRecord(supabase, device.user_id, {
      device_serial: url.searchParams.get('device_serial') || device.serial,
      patient_id: url.searchParams.get('patient_id') || 'PT',
      session_number: Number(url.searchParams.get('session_number') || 0),
      sample_rate: Number(url.searchParams.get('sample_rate') || 16000),
    }, wavBytes);
  }

  // /sessions/chunk — stitch the firmware's offset slices into one WAV.
  if (subPath === '/sessions/chunk') {
    const offset = Number(url.searchParams.get('offset') || 0);
    const isFinal = url.searchParams.get('final') === '1';
    const sessionNumber = Number(url.searchParams.get('session_number') || 0);
    const slice = new Uint8Array(await req.arrayBuffer());
    const tmpPath = `${deviceId}/_tmp/s${sessionNumber}.wav`;

    let assembled: Uint8Array;
    if (offset === 0) {
      assembled = slice;
    } else {
      const { data: cur } = await supabase.storage.from('device-sessions').download(tmpPath);
      const curBytes = cur ? new Uint8Array(await cur.arrayBuffer()) : new Uint8Array(0);
      if (curBytes.length >= offset + slice.length) {
        return json({ ok: true, idempotent: true, total: curBytes.length });
      }
      if (curBytes.length < offset) {
        return err(`offset gap: have ${curBytes.length}, got ${offset}`, 409);
      }
      assembled = new Uint8Array(offset + slice.length);
      assembled.set(curBytes.subarray(0, offset), 0);
      assembled.set(slice, offset);
    }

    if (!isFinal) {
      const { error: tmpErr } = await supabase.storage.from('device-sessions')
        .upload(tmpPath, assembled, { contentType: 'audio/wav', upsert: true });
      if (tmpErr) throw new Error(`tmp upload: ${tmpErr.message}`);
      return json({ ok: true, received: slice.length, total: assembled.length });
    }

    patchWavHeader(assembled);
    const res = await storeSessionRecord(supabase, device.user_id, {
      device_serial: url.searchParams.get('device_serial') || device.serial,
      patient_id: url.searchParams.get('patient_id') || 'PT',
      session_number: sessionNumber,
      sample_rate: Number(url.searchParams.get('sample_rate') || 16000),
    }, assembled);
    await supabase.storage.from('device-sessions').remove([tmpPath]);
    return res;
  }

  return err('Unknown session endpoint', 404);
}

async function storeSessionRecord(
  supabase: any,
  userId: string,
  meta: { device_serial: string; patient_id: string; session_number: number; sample_rate: number },
  wavBytes: Uint8Array,
) {
  const sessionId = 's-' + crypto.randomUUID().slice(0, 8);
  const storagePath = `${userId}/${meta.device_serial}/${sessionId}.wav`;

  const { error: uploadError } = await supabase.storage.from('device-sessions')
    .upload(storagePath, wavBytes, { contentType: 'audio/wav', upsert: true });
  if (uploadError) console.error('Storage upload error:', uploadError);

  const { error: insertError } = await supabase.from('sate_device_sessions').insert({
    id: sessionId, user_id: userId, device_serial: meta.device_serial,
    patient_id: meta.patient_id, session_number: meta.session_number,
    sample_rate: meta.sample_rate, bytes: wavBytes.length, storage_path: storagePath,
  });
  if (insertError) throw new Error(insertError.message);

  // Kick the AI/recordings bridge so the device session shows up exactly like a
  // manual upload (the cron sweep is the fallback if this trigger is dropped).
  triggerProcessor(sessionId);

  return json({ id: sessionId });
}

async function listSessions(supabase: any, userId: string, deviceSerial: string | null) {
  let query = supabase.from('sate_device_sessions')
    .select('id, device_serial, patient_id, session_number, sample_rate, bytes, created_at, processed, processed_at, recording_id, process_error')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (deviceSerial) query = query.eq('device_serial', deviceSerial);
  const { data, error } = await query.limit(20);
  if (error) throw new Error(error.message);
  return json((data || []).map((s: any) => ({ ...s, at: s.created_at })));
}

async function getSessionAudio(supabase: any, userId: string, sessionId: string) {
  const { data: session } = await supabase.from('sate_device_sessions')
    .select('storage_path').eq('id', sessionId).eq('user_id', userId).single();
  if (!session?.storage_path) return err('Session not found', 404);
  const { data: signedUrl, error: signError } = await supabase.storage
    .from('device-sessions').createSignedUrl(session.storage_path, 3600);
  if (signError || !signedUrl) return err('Could not generate audio URL', 500);
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: signedUrl.signedUrl } });
}
