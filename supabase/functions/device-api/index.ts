// SATE Device API — Supabase Edge Function              [v22]
// Replaces the mock-server's Express endpoints with a single Edge Function
// that does internal path routing. Authenticated via Supabase JWT (users) or a
// device key (the recorder).
//
// Deploy:  npx supabase functions deploy device-api --no-verify-jwt
//          (verify_jwt MUST stay false — this function checks the device key /
//          user JWT itself; the CLI/MCP default of true breaks registration.)
// Invoke:  POST/GET ${SUPABASE_URL}/functions/v1/device-api/<path>
//
// Chunked session upload ASSEMBLES the firmware's ~1 MB slices (offset + final),
// patches the WAV header on the final slice, then fires process-device-session
// which runs the SAME AI pipeline as a manual web upload and writes the result
// into `recordings`.
//
// v12: /sessions/chunk stores each slice as its own _tmp/s<n>/<offset>.part and
//      stitches once on final (was: rewrite the whole temp blob per slice, which
//      was quadratic and stalled long uploads). Accepts &total= from firmware
//      >=1.5.9 and rejects a size mismatch instead of storing a corrupt WAV.
// v17: a `record` command may carry {seconds:N} — the firmware stops the take
//      ITSELF at exactly N seconds of PCM (sample-exact), instead of the caller
//      racing a `stop` through the poll channel (+3-12 s of slop)
// v22: POST /firmware is admin-gated (it was reachable by any signed-in account);
//      DELETE /sessions/:id also removes the derived `recordings` row + its audio
//      (delete used to leave the clinical copy behind); retry and delete both write
//      a `sate_session_audit` row so a failure stays traceable after a retry clears it.
// v18: GET /health/alerts?key=… — secret-gated error digest (pipeline errors/stuck,
//      recent errors, offline devices) for the 5-min status worker's email alerts.
// v16: GET /sessions/upload-progress — live bytes of an IN-FLIGHT chunked upload
//      (sums the _tmp/<patient>/s<n>/<offset>.part objects; read-only, user-authed)
// v14: async processing state machine. GET /sessions returns `status` + `attempts`
//      (queued|processing|done|error) so the UI shows real progress instead of
//      inferring from `processed`. POST /sessions/:id/retry re-queues an errored
//      session for the CF container. (Processing itself moved out of the edge:
//      process-device-session is a no-op now; a container holds the long AI call.)
// v15: GET /sessions/verify (device-key auth) — the recorder asks "is session N
//      with exactly B bytes durably stored?" BEFORE freeing its local audio copy
//      (fw >=1.5.13 verified trim). Answers stored:true only when the row exists
//      AND its storage object is really present (a row alone is not proof — the
//      413 bug once left ghost rows). Read-only; never mutates.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // DELETE (unlink) and PATCH (rename) are not CORS-safelisted, so the browser
  // preflight needs them listed explicitly or it fails with "Failed to fetch".
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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

  // Recorder asks whether a session is durably on the server before it frees
  // the local SD copy (fw >=1.5.13 verified trim). Device-key auth only.
  // [v18] Error digest for the alerting worker — gated by a shared secret (no user
  // JWT), read-only. Returns only what an alert needs: whether anything is wrong.
  if (subPath === '/health/alerts' && method === 'GET') {
    const key = url.searchParams.get('key') || '';
    const want = Deno.env.get('HEALTH_ALERT_KEY') || '';
    if (!want || key !== want) return err('forbidden', 403);
    return await healthAlerts(supabase);
  }

  if (subPath === '/sessions/verify' && method === 'GET' && authHeader.startsWith('Bearer key-')) {
    return await handleSessionVerify(supabase, req);
  }

  // Device fetches its own patient roster with its device key (fetchPatients).
  // listPatients below needs a user JWT, which the recorder doesn't have, so
  // resolve the device's owner here and return that user's patients.
  if (subPath === '/patients' && method === 'GET' && authHeader.startsWith('Bearer key-')) {
    const deviceId = authHeader.replace('Bearer key-', '');
    const { data: device } = await supabase.from('sate_devices')
      .select('user_id').eq('id', deviceId).single();
    if (!device) return err('Device not found', 404);
    return await listPatients(supabase, device.user_id, url.searchParams.get('slp'));
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
    if (subPath === '/firmware/latest' && method === 'GET') {
      return await getLatestFirmware(supabase);
    }
    if (subPath === '/firmware' && method === 'POST') {
      // [v22] This publishes an OTA image to the WHOLE fleet. It used to sit above the
      // `/admin` block with no authorization check at all, so any signed-in account could
      // push firmware to every recorder. Gate it like the rest of the admin surface.
      if (!(await isAdmin(supabase, user.email))) return err('Forbidden', 403);
      return await publishFirmware(supabase, req);
    }

    // ---- Admin (system-wide management) ----------------------------------
    // Gated on the caller's email being in sate_admins. Everything here spans
    // ALL users, so it must never be reachable by a normal account.
    if (subPath.startsWith('/admin')) {
      const admin = await isAdmin(supabase, user.email);
      if (subPath === '/admin/me' && method === 'GET') {
        return json({ isAdmin: admin });
      }
      if (!admin) return err('Forbidden', 403);
      if (subPath === '/admin/status' && method === 'GET') {
        return await adminStatus(supabase);
      }
      if (subPath === '/admin/devices' && method === 'GET') {
        return await adminListDevices(supabase);
      }
      // [v21] Every account in the system, so an admin can grant a per-account
      // feature (Voice Notes) from the app's own user manager instead of a
      // separate console. Read-only: this lists who exists, nothing more.
      if (subPath === '/admin/users' && method === 'GET') {
        return await adminListUsers(supabase);
      }
      if (subPath === '/admin/firmware' && method === 'GET') {
        return await adminListFirmware(supabase);
      }
      const fwMatch = subPath.match(/^\/admin\/firmware\/([^/]+)$/);
      if (fwMatch && method === 'DELETE') {
        return await adminDeleteFirmware(supabase, fwMatch[1]);
      }
      const devMatch = subPath.match(/^\/admin\/devices\/([^/]+)$/);
      if (devMatch && method === 'DELETE') {
        return await adminDeleteDevice(supabase, devMatch[1]);
      }
      return err('Not found', 404);
    }
    if (subPath === '/patients' && method === 'GET') {
      return await listPatients(supabase, user.id, url.searchParams.get('slp'));
    }
    if (subPath === '/patients' && method === 'PUT') {
      return await replacePatients(supabase, user.id, req);
    }
    // User-authenticated session upload. The SATE recorder POSTs with its
    // device key (handled earlier), but the phone app uploads on behalf of a
    // device that has NO device key of its own — a Plaud recorder (which is
    // never registered in sate_devices), or a BLE-bridged SATE session. Here
    // the caller is the signed-in user, so the session is stored under user.id.
    if (subPath === '/sessions' && method === 'POST') {
      const body = await req.json();
      const { wav_base64, ...meta } = body;
      const wavBytes = Uint8Array.from(atob(wav_base64 || ''), (c) => c.charCodeAt(0));
      return await storeSessionRecord(supabase, user.id, {
        device_serial: meta.device_serial || 'plaud',
        patient_id: meta.patient_id || 'PT',
        session_number: meta.session_number || 0,
        sample_rate: meta.sample_rate || 16000,
        flags: Array.isArray(meta.flags) ? meta.flags.filter((n: unknown) => Number.isFinite(n)) : undefined,
      }, wavBytes);
    }
    if (subPath === '/sessions' && method === 'GET') {
      return await listSessions(supabase, user.id, url.searchParams.get('device'),
                                url.searchParams.get('limit'));
    }
    if (subPath === '/sessions/upload-progress' && method === 'GET') {
      return await uploadProgress(supabase, user.id, url.searchParams.get('device_serial') || '');
    }
    const audioMatch = subPath.match(/^\/sessions\/([^/]+)\/audio$/);
    if (audioMatch && method === 'GET') {
      return await getSessionAudio(supabase, user.id, audioMatch[1]);
    }
    const sessionRetryMatch = subPath.match(/^\/sessions\/([^/]+)\/retry$/);
    if (sessionRetryMatch && method === 'POST') {
      return await retrySession(supabase, user.id, sessionRetryMatch[1]);
    }
    const sessionDelMatch = subPath.match(/^\/sessions\/([^/]+)$/);
    if (sessionDelMatch && method === 'DELETE') {
      return await deleteSession(supabase, user.id, sessionDelMatch[1]);
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
  const { op, patient, seconds } = body;
  // `seconds` rides in the jsonb payload col (the same trick `ota` uses). The
  // firmware ignores a patient payload without patient_id, so this cannot
  // accidentally set an active patient.
  const payload = (patient || seconds != null)
    ? { ...(patient || {}), ...(seconds != null ? { seconds: Number(seconds) } : {}) }
    : null;
  await supabase.from('sate_device_commands').insert({ device_id: deviceId, op, patient: payload });

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
  // If the SLP removed this recorder from their account, the row is gone. Tell
  // the device to reset itself back to first-time setup. This is the ONLY path
  // that unprovisions a recorder - holding BOOT just changes Wi-Fi now.
  const { data: exists } = await supabase.from('sate_devices')
    .select('id').eq('id', deviceId).maybeSingle();
  if (!exists) {
    return json({ unclaimed: true, commands: [] });
  }
  const updates: Record<string, unknown> = { online: true, last_seen: new Date().toISOString() };
  if (url.searchParams.has('pending')) updates.pending_sessions = Number(url.searchParams.get('pending'));
  if (url.searchParams.has('state')) updates.state = url.searchParams.get('state');
  // Firmware reports its running version + OTA phase each heartbeat so the
  // dashboard can detect available updates and show update progress.
  if (url.searchParams.has('fw')) updates.fw = url.searchParams.get('fw');
  if (url.searchParams.has('ota')) updates.ota_state = url.searchParams.get('ota');
  await supabase.from('sate_devices').update(updates).eq('id', deviceId);

  const { data: cmds } = await supabase.from('sate_device_commands')
    .select('op, patient').eq('device_id', deviceId).eq('consumed', false)
    .order('created_at', { ascending: true });
  if (cmds?.length) {
    await supabase.from('sate_device_commands').update({ consumed: true })
      .eq('device_id', deviceId).eq('consumed', false);
  }
  // OTA: an `ota` command stashes { url, version } in the jsonb `patient` col;
  // the firmware reads the sibling `ota` field, downloads the .bin and flashes.
  const otaCmd = cmds?.find((c: any) => c.op === 'ota');
  const recCmd = cmds?.find((c: any) => c.op === 'record');
  return json({
    commands: (cmds || []).map((c: any) => c.op),
    active_patient: recCmd?.patient || null,
    record_seconds: recCmd?.patient?.seconds ?? null,   // [v17] exact-duration take
    ota: otaCmd?.patient || null,
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

// [v16] Live progress of an in-flight chunked upload. The recorder streams a take
// as _tmp/<patient>/s<n>/<offset>.part objects and the session row only exists
// after the final stitch — so mid-upload the ONLY server-side truth is the part
// objects themselves. This sums them (read-only; user must own the device). The
// total is unknown server-side (the device knows it), so callers show bytes+rate.
async function uploadProgress(supabase: any, userId: string, serial: string) {
  if (!serial) return err('device_serial required', 400);
  const { data: dev } = await supabase.from('sate_devices')
    .select('id').eq('serial', serial).eq('user_id', userId).maybeSingle();
  if (!dev) return err('Device not found', 404);
  const bucket = supabase.storage.from('device-sessions');
  const uploads: Array<{ patient_id: string; session_number: number; parts: number; bytes: number }> = [];
  const { data: patients } = await bucket.list(`${dev.id}/_tmp`, { limit: 25 });
  for (const p of patients || []) {
    if (!p.name || p.id) continue;                    // folders only
    const { data: sessions } = await bucket.list(`${dev.id}/_tmp/${p.name}`, { limit: 25 });
    for (const sdir of sessions || []) {
      const m = /^s(\d+)$/.exec(sdir.name || '');
      if (!m) continue;
      const { data: parts } = await bucket.list(
        `${dev.id}/_tmp/${p.name}/${sdir.name}`, { limit: 1000 });
      // Orphaned parts from a long-dead upload must not read as "uploading" —
      // there is a real 31 MB orphan dir in prod. Only parts touched in the last
      // 10 minutes count as an upload in flight.
      const cutoff = Date.now() - 10 * 60 * 1000;
      let bytes = 0, n = 0, newest = 0;
      for (const f of parts || []) {
        if (!f.id) continue;
        const ts = Date.parse(f.updated_at || f.created_at || '') || 0;
        if (ts < cutoff) continue;
        n++; bytes += Number(f.metadata?.size || 0);
        if (ts > newest) newest = ts;
      }
      if (n) uploads.push({ patient_id: p.name, session_number: Number(m[1]), parts: n, bytes, last_activity: newest });
    }
  }
  uploads.sort((a: any, b: any) => (b.last_activity || 0) - (a.last_activity || 0));  // most recent ACTIVITY first (session numbers restart per patient)
  return json({ uploading: uploads.length > 0, uploads });
}

async function removeDevice(supabase: any, userId: string, deviceId: string) {
  const { error } = await supabase.from('sate_devices')
    .delete().eq('id', deviceId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return noContent();
}

async function getLatestFirmware(supabase: any) {
  const { data } = await supabase.from('sate_firmware')
    .select('version, url, notes, created_at')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return json(data || null);
}

// Publish a new firmware release from the web app: upload the .bin to the public
// `firmware` Storage bucket (service role, so it always succeeds) and record it
// in sate_firmware. getLatestFirmware then serves it, and the device update
// banner appears for any recorder running an older version. Body = raw .bin;
// version + notes ride in the query string.
async function publishFirmware(supabase: any, req: Request) {
  const url = new URL(req.url);
  const version = (url.searchParams.get('version') || '').trim();
  const notes = (url.searchParams.get('notes') || '').trim();
  if (!version) return err('A version is required (e.g. 1.1.0)');
  // Version must be plain semver: it becomes the storage key sate_<version>.bin and
  // the public OTA URL served to the whole fleet, so reject anything with spaces or
  // path characters that would break the key/URL.
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return err('Version must be plain semver, e.g. 1.5.13');
  }
  const bin = new Uint8Array(await req.arrayBuffer());
  if (bin.length < 1024) return err('That firmware file looks empty or too small');
  // Integrity gate: this .bin is flashed onto every recorder via OTA, and a wrong
  // or corrupt file (not an ESP32 app image, or absurdly large) bricks the fleet
  // with no rollback. Reject anything that isn't a plausible ESP32 image before it
  // can become "latest": ESP32 app images start with the 0xE9 magic byte, and the
  // real app bin is ~1.7 MB (cap generously at 4 MB - a full 8 MB merged image is
  // NOT an OTA image and must never be published here).
  if (bin[0] !== 0xE9) {
    return err('That does not look like an ESP32 firmware image (bad magic byte)');
  }
  if (bin.length > 4 * 1024 * 1024) {
    return err('Firmware too large - publish the app .bin (~1.7 MB), not the merged image');
  }

  const path = `sate_${version}.bin`;
  const { error: upErr } = await supabase.storage.from('firmware')
    .upload(path, bin, { contentType: 'application/octet-stream', upsert: true });
  if (upErr) return err('Storage upload failed: ' + upErr.message, 500);

  const { data: pub } = supabase.storage.from('firmware').getPublicUrl(path);
  const fwUrl = pub?.publicUrl;
  if (!fwUrl) return err('Could not resolve a public URL for the upload', 500);

  // Insert a fresh row; getLatestFirmware orders by created_at, so the newest
  // wins. Re-publishing a version overwrites its .bin (upsert above) and adds a
  // new row - no unique-constraint requirement on `version`.
  const { data, error } = await supabase.from('sate_firmware')
    .insert({ version, url: fwUrl, notes: notes || null })
    .select('version, url, notes, created_at').single();
  if (error) return err('Could not save the firmware record: ' + error.message, 500);
  return json(data);
}

// ---- Admin -----------------------------------------------------------------

async function isAdmin(supabase: any, email?: string | null): Promise<boolean> {
  if (!email) return false;
  const { data } = await supabase.from('sate_admins')
    .select('email').eq('email', email.toLowerCase()).maybeSingle();
  return !!data;
}

// Map every device's owner user_id -> email so the admin table reads clearly.
async function ownerEmailMap(supabase: any): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    let page = 1;
    // perPage max 1000; paginate defensively for larger fleets.
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      for (const u of data.users) map[u.id] = u.email || '';
      if (data.users.length < 1000) break;
      page++;
    }
  } catch { /* best effort - fall back to slp name in the UI */ }
  return map;
}

// Aggregated health for the service-monitoring dashboard. Admin-gated (service
// role, sate_admins). Live DB-derived: pipeline state machine, device fleet +
// firmware versions, stuck jobs, recent errors. Read-only.
// [v18] Compact error digest for the email-alerting worker. Same signals adminStatus
// surfaces, trimmed to what makes an alert: pipeline errors, wedged (stuck) jobs, the
// most recent error rows, and devices that have gone offline. Read-only, service role.
async function healthAlerts(supabase: any) {
  const now = Date.now();
  const STUCK_MS = 45 * 60 * 1000;
  const { count: errorCount } = await supabase.from('sate_device_sessions')
    .select('id', { count: 'exact', head: true }).eq('status', 'error');
  const stuckCutoff = new Date(now - STUCK_MS).toISOString();
  const { data: stuck } = await supabase.from('sate_device_sessions')
    .select('id, device_serial, session_number, attempts, processing_started_at')
    .eq('status', 'processing').lt('processing_started_at', stuckCutoff)
    .order('processing_started_at', { ascending: true }).limit(25);
  const { data: recentErrors } = await supabase.from('sate_device_sessions')
    .select('id, device_serial, session_number, attempts, process_error, created_at')
    .eq('status', 'error').order('created_at', { ascending: false }).limit(10);
  await supabase.from('sate_devices')
    .update({ online: false, state: 'idle' })
    .lt('last_seen', new Date(now - 45000).toISOString()).eq('online', true);
  const { data: offline } = await supabase.from('sate_devices')
    .select('serial, last_seen, fw').eq('online', false)
    .order('last_seen', { ascending: false }).limit(25);
  const errors = recentErrors || [];
  const stuckList = stuck || [];
  const offlineList = offline || [];
  return json({
    generated_at: new Date().toISOString(),
    // A stable signature of the CURRENT problem set, so the worker only mails on a CHANGE.
    signature: JSON.stringify({
      e: errors.map((r: any) => `${r.device_serial}#${r.session_number}`).sort(),
      s: stuckList.map((r: any) => r.id).sort(),
    }),
    error_count: errorCount || 0,
    stuck_count: stuckList.length,
    recent_errors: errors,
    stuck_list: stuckList,
    offline_devices: offlineList,
  });
}

async function adminStatus(supabase: any) {
  const now = Date.now();
  const STUCK_MS = 45 * 60 * 1000;               // matches cf-processor STUCK_MINUTES

  // Pipeline: head counts per status (cheap; no rows returned).
  const pipeline: Record<string, number> = {};
  for (const s of ['queued', 'processing', 'done', 'error']) {
    const { count } = await supabase.from('sate_device_sessions')
      .select('id', { count: 'exact', head: true }).eq('status', s);
    pipeline[s] = count || 0;
  }

  // Stuck: still 'processing' past the watchdog threshold (the container should
  // have finished or re-queued it). A non-empty list means the pipeline is wedged.
  const stuckCutoff = new Date(now - STUCK_MS).toISOString();
  const { data: stuck } = await supabase.from('sate_device_sessions')
    .select('id, device_serial, session_number, attempts, processing_started_at')
    .eq('status', 'processing').lt('processing_started_at', stuckCutoff)
    .order('processing_started_at', { ascending: true }).limit(25);

  const { data: recentErrors } = await supabase.from('sate_device_sessions')
    .select('id, device_serial, session_number, attempts, process_error, created_at')
    .eq('status', 'error').order('created_at', { ascending: false }).limit(25);

  // Fleet: flip stale rows offline first (same 45 s rule the admin list uses).
  await supabase.from('sate_devices')
    .update({ online: false, state: 'idle' })
    .lt('last_seen', new Date(now - 45000).toISOString()).eq('online', true);
  const { data: devices } = await supabase.from('sate_devices')
    .select('id, serial, online, last_seen, fw, state, pending_sessions, slp')
    .order('last_seen', { ascending: false });
  const fleet = devices || [];
  const online = fleet.filter((d: any) => d.online).length;
  const fwBreakdown: Record<string, number> = {};
  for (const d of fleet) {
    const v = d.fw || 'unknown';
    fwBreakdown[v] = (fwBreakdown[v] || 0) + 1;
  }

  const { data: fw } = await supabase.from('sate_firmware')
    .select('version, created_at').order('created_at', { ascending: false }).limit(5);
  const { count: recordingsTotal } = await supabase.from('recordings')
    .select('id', { count: 'exact', head: true });

  return json({
    generated_at: new Date().toISOString(),
    pipeline: {
      ...pipeline,
      stuck: (stuck || []).length,
      stuck_list: stuck || [],
      recent_errors: recentErrors || [],
    },
    fleet: {
      total: fleet.length,
      online,
      offline: fleet.length - online,
      fw_breakdown: fwBreakdown,
      devices: fleet,
    },
    firmware: { latest: fw?.[0]?.version ?? null, recent: fw || [] },
    recordings_total: recordingsTotal || 0,
  });
}

async function adminListDevices(supabase: any) {
  // Flip stale rows offline, same as the per-user list, then return everything.
  const cutoff = new Date(Date.now() - 45000).toISOString();
  await supabase.from('sate_devices')
    .update({ online: false, state: 'idle' })
    .lt('last_seen', cutoff).eq('online', true);
  const { data, error } = await supabase.from('sate_devices')
    .select('*').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const emails = await ownerEmailMap(supabase);
  return json((data || []).map((d: any) => ({ ...d, owner_email: emails[d.user_id] || '' })));
}

// [v21] All accounts, with the number of recorders each one owns.
// The uuid is the point: a per-account feature grant is keyed on the Supabase auth
// id, and asking a user to read their own uuid out of a JWT is not a workflow.
async function adminListUsers(supabase: any) {
  const users: any[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    if (!data?.users?.length) break;
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page++;
  }
  const { data: devs } = await supabase.from('sate_devices').select('user_id');
  const deviceCount: Record<string, number> = {};
  for (const d of devs || []) deviceCount[d.user_id] = (deviceCount[d.user_id] || 0) + 1;
  const { data: admins } = await supabase.from('sate_admins').select('email');
  const adminSet = new Set((admins || []).map((a: any) => (a.email || '').toLowerCase()));

  return json(users.map((u) => ({
    id: u.id,
    email: u.email || '',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at || null,
    devices: deviceCount[u.id] || 0,
    is_admin: adminSet.has((u.email || '').toLowerCase()),
  })).sort((a, b) => a.email.localeCompare(b.email)));
}

async function adminListFirmware(supabase: any) {
  const { data, error } = await supabase.from('sate_firmware')
    .select('id, version, url, notes, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return json(data || []);
}

async function adminDeleteFirmware(supabase: any, id: string) {
  const { data: row } = await supabase.from('sate_firmware')
    .select('url').eq('id', id).maybeSingle();
  // Best-effort remove the .bin from storage (path is the trailing file name).
  if (row?.url) {
    const file = row.url.split('/firmware/')[1];
    if (file) await supabase.storage.from('firmware').remove([file]).catch(() => {});
  }
  const { error } = await supabase.from('sate_firmware').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return noContent();
}

async function adminDeleteDevice(supabase: any, deviceId: string) {
  // No user_id filter: an admin can unlink any device. The recorder learns it
  // was removed on its next heartbeat ({unclaimed:true}) and resets to setup.
  const { error } = await supabase.from('sate_devices').delete().eq('id', deviceId);
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

// GET /sessions/verify?patient_id=&session_number=&bytes=[&device_serial=]
// The recorder calls this BEFORE freeing a synced take's audio from its SD card
// (fw >=1.5.13). { stored: true } ONLY when a byte-exact session row exists AND
// its storage object is really present — a row alone is not proof (the 413 bug
// left rows whose object never landed; trusting one would let the recorder
// delete its only copy). Read-only on purpose: ghost-row cleanup stays owned by
// the chunk-final idempotency check, this endpoint must never mutate anything.
async function handleSessionVerify(supabase: any, req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const deviceId = authHeader.replace('Bearer key-', '');
  const { data: device } = await supabase.from('sate_devices')
    .select('user_id, serial').eq('id', deviceId).single();
  if (!device) return err('Device not found', 404);

  const url = new URL(req.url);
  const sessionNumber = Number(url.searchParams.get('session_number') || 0);
  const bytes = Number(url.searchParams.get('bytes') || 0);
  const serial = url.searchParams.get('device_serial') || device.serial;
  const patientId = url.searchParams.get('patient_id') || '';
  if (!sessionNumber || !bytes) return err('session_number and bytes required', 400);

  let q = supabase.from('sate_device_sessions')
    .select('id, storage_path')
    .eq('user_id', device.user_id)
    .eq('device_serial', serial)
    .eq('session_number', sessionNumber)
    .eq('bytes', bytes)
    .order('created_at', { ascending: false })
    .limit(1);
  if (patientId) q = q.eq('patient_id', patientId);
  const { data: row } = await q.maybeSingle();

  const stored = !!(row?.storage_path &&
    await objectExists(supabase, 'device-sessions', row.storage_path));
  return json({ stored });
}

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
      flags: Array.isArray(meta.flags) ? meta.flags.filter((n: unknown) => Number.isFinite(n)) : undefined,
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

  // /sessions/chunk — collect the firmware's ~1 MB offset slices, stitch on final.
  //
  // Each slice is stored as its OWN object under _tmp/<patient>/s<n>/<offset>.part. The old
  // version kept one temp blob and did download-whole + upload-whole on EVERY
  // slice: quadratic, so a 30-min session moved ~1.5 GB through this function and
  // the late slices blew past the firmware's 12 s timeout. Every timeout was
  // retried, the retry restarted at offset 0, and offset 0 truncated the temp blob
  // back to the first slice — a backlog that could never drain ("8 recordings
  // uploading, no progress"). Writing parts makes each slice O(1); the full file
  // is materialised exactly once, on the final slice.
  if (subPath === '/sessions/chunk') {
    const offset = Number(url.searchParams.get('offset') || 0);
    const isFinal = url.searchParams.get('final') === '1';
    const sessionNumber = Number(url.searchParams.get('session_number') || 0);
    // Firmware (>=1.5.9) sends the session's full byte length so the assembled
    // result can be verified before it's accepted. 0 = older firmware: skip the check.
    const declaredTotal = Number(url.searchParams.get('total') || 0);
    const slice = new Uint8Array(await req.arrayBuffer());
    // The part dir MUST be scoped by patient: session numbers restart at 1 for each
    // patient, so `s1` alone collides between two patients on the same device. With
    // one shared dir, patient A's stalled parts and patient B's parts land together
    // and a resume can stitch a WAV out of BOTH patients' audio. Sanitised because
    // this goes into a storage path.
    const patientId = (url.searchParams.get('patient_id') || 'PT').replace(/[^A-Za-z0-9_-]/g, '');
    const partDir = `${deviceId}/_tmp/${patientId || 'PT'}/s${sessionNumber}`;
    // Zero-pad so a plain lexical sort is also numeric order.
    const partPath = `${partDir}/${String(offset).padStart(12, '0')}.part`;
    const serial = url.searchParams.get('device_serial') || device.serial;

    // Already stored? Answer before touching the parts.
    //
    // Assembling a long session takes a while, and the device gives up waiting
    // after 60 s. If it times out on a final that actually SUCCEEDED, it retries
    // the final - but by then the parts are gone (removed on success), so the
    // contiguity check below would 409 and the device would re-upload the entire
    // session from byte 0. For a 118 MB take that is ~9 minutes of pointless
    // upload, on repeat, and it would never converge. Confirming the existing row
    // instead makes a lost ACK a no-op: the device marks it synced and moves on.
    if (isFinal && declaredTotal > 0) {
      const { data: already } = await supabase.from('sate_device_sessions')
        .select('id, storage_path')
        .eq('user_id', device.user_id)
        .eq('device_serial', serial)
        .eq('session_number', sessionNumber)
        .eq('bytes', declaredTotal)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      // A row is NOT proof the audio is there. The 413 bug left rows whose object
      // never landed; trusting the row alone would answer "already stored" and
      // strand that recording on the device forever. Confirm the object, and bin
      // the row if it is a ghost so this upload can replace it.
      if (already) {
        const real = already.storage_path &&
          await objectExists(supabase, 'device-sessions', already.storage_path);
        if (real) {
          await supabase.storage.from('device-sessions')
            .remove([partPath]).catch(() => {});
          return json({ id: already.id, idempotent: true });
        }
        await supabase.from('sate_device_sessions').delete().eq('id', already.id);
        console.warn(`dropped ghost session row ${already.id} (no object) - re-storing`);
      }
    }

    // offset 0 = the device is (re)starting this session, so whatever is in the
    // part dir is from an abandoned attempt and must go. Without this, stale parts
    // with a HIGHER offset survive and get stitched onto the new upload: sessions
    // are renumbered when the SLP deletes one, so `s3` today can be different audio
    // than `s3` yesterday, and the leftover tail would silently corrupt it.
    if (offset === 0) {
      const { data: stale } = await supabase.storage.from('device-sessions')
        .list(partDir, { limit: 10000 });
      if (stale?.length) {
        await supabase.storage.from('device-sessions')
          .remove(stale.map((f: any) => `${partDir}/${f.name}`));
      }
    }

    // Re-sending a slice is normal (the firmware retries at the same offset), and
    // upsert makes it idempotent without reading anything back.
    const { error: partErr } = await supabase.storage.from('device-sessions')
      .upload(partPath, slice, { contentType: 'application/octet-stream', upsert: true });
    if (partErr) throw new Error(`part upload: ${partErr.message}`);

    if (!isFinal) return json({ ok: true, received: slice.length, offset });

    // Final slice: pull every part back, in offset order, and verify they form one
    // gap-free stream. A gap means the device and this function disagree about what
    // landed (e.g. a resume against parts written by an older firmware), so 409 and
    // let the device restart the session from 0 rather than store a corrupt WAV.
    const { data: listed, error: listErr } = await supabase.storage
      .from('device-sessions').list(partDir, { limit: 10000 });
    if (listErr) throw new Error(`part list: ${listErr.message}`);

    const parts = (listed || [])
      .filter((f: any) => f.name.endsWith('.part'))
      .map((f: any) => ({
        name: f.name,
        offset: Number(f.name.replace('.part', '')),
        size: Number(f.metadata?.size ?? 0),
      }))
      .sort((a: any, b: any) => a.offset - b.offset);

    // Verify contiguity from the LISTED sizes first, so a bad set is rejected
    // before a single byte is downloaded.
    let assembledLen = 0;
    for (const p of parts) {
      if (p.offset !== assembledLen) {
        return err(`offset gap: expected ${assembledLen}, have part at ${p.offset}`, 409);
      }
      assembledLen += p.size;
    }
    if (declaredTotal > 0 && assembledLen !== declaredTotal) {
      return err(`size mismatch: assembled ${assembledLen}, device says ${declaredTotal}`, 409);
    }
    if (assembledLen === 0) return err('no audio received', 400);

    // Allocate ONCE and stream each part straight into place. Collecting the parts
    // into an array first and then copying them into a second buffer held the whole
    // session in memory twice (~236 MB for a 62-min take) — enough to OOM this
    // function on exactly the long recordings that need it most.
    const assembled = new Uint8Array(assembledLen);
    // Fetch in parallel batches. A 62-minute take is ~118 parts; downloading them
    // one after another burned ~18 s of the device's 60 s final-slice budget for no
    // reason. Each part is written straight to its own offset, so order doesn't
    // matter and only the in-flight batch (~8 MB) is held on top of `assembled`.
    const DL_CONCURRENCY = 8;
    for (let i = 0; i < parts.length; i += DL_CONCURRENCY) {
      const batch = parts.slice(i, i + DL_CONCURRENCY);
      const fetched = await Promise.all(batch.map(async (p: any) => {
        const { data: pd, error: dlErr } = await supabase.storage
          .from('device-sessions').download(`${partDir}/${p.name}`);
        if (dlErr || !pd) return { p, bytes: null };
        return { p, bytes: new Uint8Array(await pd.arrayBuffer()) };
      }));
      for (const f of fetched) {
        if (!f.bytes) return err(`missing part at ${f.p.offset}`, 409);
        if (f.bytes.length !== f.p.size || f.p.offset + f.bytes.length > assembledLen) {
          return err(`part at ${f.p.offset} changed size`, 409);
        }
        assembled.set(f.bytes, f.p.offset);
      }
    }

    patchWavHeader(assembled);
    // Same `serial` the idempotency probe above used - if these two ever disagreed,
    // the probe could never match and every timed-out final would duplicate.
    const res = await storeSessionRecord(supabase, device.user_id, {
      device_serial: serial,
      patient_id: url.searchParams.get('patient_id') || 'PT',
      session_number: sessionNumber,
      sample_rate: Number(url.searchParams.get('sample_rate') || 16000),
      flags: parseFlags(url.searchParams.get('flags')),
    }, assembled);
    // Only bin the parts once the session is safely stored. Also clear the old
    // single-blob temp file a pre-1.5.9 attempt may have left behind.
    await supabase.storage.from('device-sessions')
      .remove(parts.map((p: any) => `${partDir}/${p.name}`));
    await supabase.storage.from('device-sessions')
      .remove([`${deviceId}/_tmp/s${sessionNumber}.wav`]).catch(() => {});
    return res;
  }

  return err('Unknown session endpoint', 404);
}

// True only if the object is really in the bucket. Used to tell a genuine
// "already uploaded" apart from a row whose object never landed.
async function objectExists(supabase: any, bucket: string, path: string): Promise<boolean> {
  const cut = path.lastIndexOf('/');
  const dir = cut >= 0 ? path.slice(0, cut) : '';
  const name = cut >= 0 ? path.slice(cut + 1) : path;
  const { data } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 100 });
  return !!data?.some((f: any) => f.name === name);
}

// Parse the firmware's "&flags=12000,45000" CSV (ms offsets) into a number[].
function parseFlags(raw: string | null): number[] {
  if (!raw) return [];
  return raw.split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

async function storeSessionRecord(
  supabase: any,
  userId: string,
  meta: { device_serial: string; patient_id: string; session_number: number; sample_rate: number; flags?: number[] },
  wavBytes: Uint8Array,
) {
  // Idempotency: a client retry of the SAME take must not create a second session
  // row (and a second AI/recordings run). This fires when a successful upload's
  // markSynced ACK is lost so the recorder re-uploads, or a user double-taps Sync.
  // Match the take by its natural identity and confirm the object is really stored
  // (a row alone isn't proof - the 413 bug left ghost rows). If it's genuinely
  // there, return that id; if it's a ghost, drop it and re-store below. Mirrors the
  // /sessions/chunk final-slice probe, which the streaming path already has.
  const { data: existing } = await supabase.from('sate_device_sessions')
    .select('id, storage_path')
    .eq('user_id', userId)
    .eq('device_serial', meta.device_serial)
    .eq('patient_id', meta.patient_id)
    .eq('session_number', meta.session_number)
    .eq('bytes', wavBytes.length)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    const stored = existing.storage_path &&
      await objectExists(supabase, 'device-sessions', existing.storage_path);
    if (stored) return json({ id: existing.id, idempotent: true });
    await supabase.from('sate_device_sessions').delete().eq('id', existing.id);
  }

  const sessionId = 's-' + crypto.randomUUID().slice(0, 8);
  const storagePath = `${userId}/${meta.device_serial}/${sessionId}.wav`;

  // THROW - never just log. This used to `console.error` and carry on inserting
  // the row, so a rejected upload still returned 2xx: the recorder marked the
  // session synced and (pre-1.5.9) deleted its only copy, while the server held a
  // row pointing at nothing. A 118 MB session hit Storage's global file-size limit
  // (413) and was lost exactly this way. A failed upload must fail the request so
  // the device keeps the audio and retries.
  const { error: uploadError } = await supabase.storage.from('device-sessions')
    .upload(storagePath, wavBytes, { contentType: 'audio/wav', upsert: true });
  if (uploadError) {
    throw new Error(
      `storage upload failed for ${wavBytes.length} bytes: ${uploadError.message}` +
      ` (if this is "exceeded the maximum allowed size", raise the project's global` +
      ` file size limit in Storage settings - the bucket limit alone is not enough)`,
    );
  }

  const { error: insertError } = await supabase.from('sate_device_sessions').insert({
    id: sessionId, user_id: userId, device_serial: meta.device_serial,
    patient_id: meta.patient_id, session_number: meta.session_number,
    sample_rate: meta.sample_rate, bytes: wavBytes.length, storage_path: storagePath,
    flags: meta.flags && meta.flags.length ? meta.flags : null,
  });
  if (insertError) throw new Error(insertError.message);

  // Kick the AI/recordings bridge so the device session shows up exactly like a
  // manual upload (the cron sweep is the fallback if this trigger is dropped).
  triggerProcessor(sessionId);

  return json({ id: sessionId });
}

// v19: the cap was 20, which quietly hid a recorder's older takes — the Devices page is the
// only place a session's history exists once the audio has been reclaimed from the card, so a
// take falling off the list looks like it was never made. Default 200 (months of use for a
// recorder that runs a few times a day; the firmware only numbers 1..99 anyway), overridable
// per request. Still bounded: this is one JSON response, and an unbounded list is a footgun
// for an account with a fleet.
const SESSION_LIST_DEFAULT = 200;
const SESSION_LIST_MAX     = 1000;

async function listSessions(
  supabase: any, userId: string, deviceSerial: string | null, limitParam: string | null,
) {
  const asked = Number(limitParam);
  const limit = Number.isFinite(asked) && asked > 0
    ? Math.min(asked, SESSION_LIST_MAX)
    : SESSION_LIST_DEFAULT;
  let query = supabase.from('sate_device_sessions')
    // v20: `flags` joined the list. The flag button's ms offsets were stored on the row from
    // the beginning but never returned here, so nothing downstream of this endpoint could see
    // them — a meeting note generated from a session silently lost every mark the user had
    // pressed the button for, which is the one thing the hardware does that a phone cannot.
    .select('id, device_serial, patient_id, session_number, sample_rate, bytes, created_at, processed, processed_at, recording_id, process_error, no_text, status, attempts, flags')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (deviceSerial) query = query.eq('device_serial', deviceSerial);
  const { data, error } = await query.limit(limit);
  if (error) throw new Error(error.message);
  return json((data || []).map((s: any) => ({ ...s, at: s.created_at })));
}

// Re-queue an errored session for the async container. Scoped to the caller's own
// sessions; only an 'error' session may be retried. Resets attempts so the watchdog
// gives the fresh try its full stall budget again.
async function retrySession(supabase: any, userId: string, sessionId: string) {
  const { data: row } = await supabase.from('sate_device_sessions')
    .select('id, status, process_error, attempts').eq('id', sessionId).eq('user_id', userId).maybeSingle();
  if (!row) return err('Session not found', 404);
  if (row.status !== 'error') return err('Only a failed session can be retried', 409);
  // [v22] Clearing process_error/attempts is what lets the retry start clean, but it also
  // erased every trace of the failure being retried. Record it first, so "previous failure
  // remains traceable" is actually true.
  await auditSession(supabase, sessionId, userId, 'retry', {
    previous_error: row.process_error, previous_attempts: row.attempts,
    previous_status: row.status,
  });
  const { error } = await supabase.from('sate_device_sessions')
    .update({ status: 'queued', process_error: null, attempts: 0 })
    .eq('id', sessionId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return json({ id: sessionId, status: 'queued' });
}

// Delete a single uploaded session (its DB row + the stored WAV). Scoped to the
// caller's own sessions. Used for "no text in audio" sessions and any cleanup.
// A linked recording, if any, is left intact (delete that from the report view).
// [v22] Deleting a session used to remove the session row and its device-sessions object
// and stop there — the `recordings` row the pipeline derived from it, and that row's copy
// of the audio in the recordings bucket, both survived. The take still showed in the web
// app and the audio was still downloadable, so "delete" did not delete the clinical data.
// Now the derived record goes too, and the deletion is written to the audit trail (which
// deliberately outlives the row).
async function deleteSession(supabase: any, userId: string, sessionId: string) {
  const { data: row } = await supabase.from('sate_device_sessions')
    .select('storage_path, recording_id, device_serial, session_number, patient_id, bytes')
    .eq('id', sessionId).eq('user_id', userId).maybeSingle();
  if (!row) return err('Session not found', 404);

  if (row.storage_path) {
    await supabase.storage.from('device-sessions').remove([row.storage_path]).catch(() => {});
  }

  let removedRecording: string | null = null;
  if (row.recording_id) {
    const { data: rec } = await supabase.from('recordings')
      .select('id, file_path').eq('id', row.recording_id).eq('user_id', userId).maybeSingle();
    if (rec) {
      if (rec.file_path) {
        await supabase.storage.from('recordings').remove([rec.file_path]).catch(() => {});
      }
      // recording_versions cascades from this delete, so the edit history goes as well.
      await supabase.from('recordings').delete().eq('id', rec.id).eq('user_id', userId);
      removedRecording = rec.id;
    }
  }

  const { error } = await supabase.from('sate_device_sessions')
    .delete().eq('id', sessionId).eq('user_id', userId);
  if (error) throw new Error(error.message);

  await auditSession(supabase, sessionId, userId, 'delete', {
    device_serial: row.device_serial, session_number: row.session_number,
    patient_id: row.patient_id, bytes: row.bytes,
    storage_path: row.storage_path, removed_recording: removedRecording,
  });
  return noContent();
}

// Append-only trail. Best effort: an audit write must never fail the user's action, but
// it must also never be silently skipped, so a failure is logged.
async function auditSession(
  supabase: any, sessionId: string, userId: string, action: string, detail: unknown,
) {
  const { error } = await supabase.from('sate_session_audit')
    .insert({ session_id: sessionId, user_id: userId, action, detail });
  if (error) console.error(`audit ${action} ${sessionId} failed:`, error.message);
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
