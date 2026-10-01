// SATE Device API — Supabase Edge Function              [v40]
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
// v24: GET /devices/:id/commands now requires the presented device key to MATCH that device —
//      it previously accepted the bare prefix `Bearer key-` for any device id, which leaked the
//      queued record command's patient payload and let a caller consume another recorder's
//      commands (swallowing a queued stop/record). POST /devices/register refuses a serial that
//      is already claimed by a different account.
// v25: EXTERNAL DEVICES (Plaud / Pendant / SATE L816) now appear in Connected Recorders.
//      They have no Wi-Fi and no device key, so they can never register themselves the way a
//      recorder does — their recordings used to arrive as sessions with no device behind them
//      and the fleet list simply never showed the hardware. Now: POST /devices/external lets
//      the phone register one at pairing time, GET /devices BACKFILLS a row for any external
//      serial that has uploaded but was never registered, and DELETE /devices/:id writes an
//      opt-out so a removed derived row does not reappear on the next 2 s poll.
//      🛑 The stale-offline sweep in listDevices SKIPS external rows: they are reachable over
//      Bluetooth from the phone, never over Wi-Fi, so sweeping them would peg every one of them
//      to "Offline" forever. `kind` is what the web keys its passive layout off — an external
//      row must NEVER be offered OTA or a remote command.
// v23: DELETE /sessions/:id checks EVERY removal's error instead of swallowing it, keeps the
//      session row on a partial failure so the delete stays retryable, and records what was
//      actually removed — the audit row used to assert a deletion that may not have happened.
// v22: POST /firmware is admin-gated (it was reachable by any signed-in account);
//      DELETE /sessions/:id also removes the derived `recordings` row + its audio
//      (delete used to leave the clinical copy behind); retry and delete both write
//      a `sate_session_audit` row so a failure stays traceable after a retry clears it.
// v18: GET /health/alerts?key=… — secret-gated error digest (pipeline errors/stuck,
//      recent errors, offline devices) for the 5-min status worker's email alerts.
// v27: POST /sessions/upload-url + POST /sessions/register — direct-to-Storage.
//      The ONLY path with no size ceiling: the client PUTs the WAV straight into
//      Storage with a signed URL and then registers it, so the audio never passes
//      through this function and the ~62-min limit of every byte-carrying route
//      (and the gateway's 502 above it) simply does not apply. `storage_path` is
//      confined to the caller's own `<user id>/` prefix and the byte count comes
//      from Storage, never from the client.
// v40: ONE NAME PER PHYSICAL UNIT, first phone wins. POST /devices/seen {serial, hw_serial, name} — the app
//      reports a unit the moment it connects. The FIRST report for a hw_serial fixes the unit's name in
//      sate_device_units (the app's own formula, `SATE L816 · <last 4 of its BLE id>R`, from whichever phone
//      got there first) and every later report — another iPhone's UUID serial, the Android MAC serial —
//      is only LINKED to it (sate_device_serial_units, first link wins) and told the name to use. The
//      session list, the device list and /admin/recorders all show that one name, and the holder rule
//      counts every linked serial, so the grouping no longer waits for an upload.
// v39: ONE IDENTITY PER PHYSICAL L81x. An L81x's `device_serial` is built from its BLE id, and on
//      iOS that id is a PER-PHONE UUID — so one unit uploaded as `l816-<MAC>` from Android and as a
//      different `l816-<uuid>` from every iPhone, and showed up as several devices with several names.
//      The app now sends `hw_serial` (the unit's OWN serial, opcode 0x01, identical on every phone) with
//      each upload; it is stored on the session row. `device_serial` is NOT changed — it is in every
//      storage path and in the upload dedup key, so rewriting it would duplicate takes. Instead the
//      holder rule (/devices/owner) and /admin/recorders treat every serial that carries the same
//      hw_serial as ONE unit, and one session carrying it is enough to attach a serial's whole history.
// v38: PROCESSING MONITOR for admins. GET /admin/processing?days=1|7|30 — every queued/processing
//      take across ALL accounts in claim order (length, attempts, wait, backoff, stuck), the unresolved
//      errors grouped by reason, and window stats (success rate, no-text, audio hours, turnaround
//      median/p90, per day, per device family, worker last-finished). POST /admin/sessions/retry
//      {ids} re-queues failed takes exactly like the owner's Retry (attempts reset, previous error kept
//      in sate_session_audit with the admin's email); POST /admin/sessions/requeue-stuck {ids} does
//      what the watchdog would, only for takes already past STUCK_MS.
//      GET /admin/recorders — EVERY device that exists anywhere (sate_devices rows AND every
//      device_serial a session was uploaded from, so app-only hardware like the L81x appears too),
//      with its holder computed by the SAME rules as /devices/owner (SATE recorder: the claiming
//      account; external: earliest registration, else latest uploader that has not released it),
//      every account that has used it, and a `shared` flag for cross-connected units.
// v37: OVERSIGHT EXPORT — GET /oversight/users/:uid/recordings/:rid/export/(audio|lsa|metrics). The same
//      per-target role check as viewing, audited as export_<type> BEFORE anything is returned. audio →
//      a 5-minute signed download URL (the bytes never pass through this function, so length is no
//      limit); lsa → the saved SATE Report exactly as stored (edits kept beside the draft); metrics →
//      the transcript the web computes the Language Analysis numbers from. Still GET-only/read-only.
// v36: MANAGER EMAIL — "an account assigned to you has new reports". GET /health/manager-digest
//      (HEALTH_ALERT_KEY-gated, read-only) lists, per manager with notify_email on, the recordings
//      created by their assigned accounts since sate_managers.notify_cursor — account email, time
//      and length ONLY, never a patient or a transcript. POST /health/manager-digest/ack
//      {manager_id, until} moves the cursor, and the sate-status Worker calls it only AFTER the email
//      was sent, so a failed send is retried rather than lost. A newly assigned account is counted
//      only from its assignment, never its history. POST /admin/managers/:id/notify {enabled}.
// v35: ACCOUNT MANAGEMENT for admins. GET /admin/users now carries per-account stats (recordings,
//      SATE reports, total audio, last recording, manager, disabled); GET /admin/users/:id the detail;
//      POST /admin/users (create), POST /admin/users/:id/password (force a new password),
//      POST /admin/users/:id/disable {disabled} (ban — reversible, data kept), DELETE /admin/users/:id
//      {confirm_email} (PERMANENT: auth.users deletion CASCADES to recordings, patients, sessions,
//      devices AND billing rows; this also removes the account's audio from Storage). An admin cannot
//      be deleted or disabled here, nor can you act on yourself. Everything is in sate_access_audit.
// v34: OVERSIGHT — READ-ONLY cross-account viewing. An ADMIN (sate_admins) may view any account; a
//      MANAGER (sate_managers) may view the accounts an admin assigned to them (sate_manager_members).
//      GET /oversight/me, /oversight/users/:uid/{recordings,recordings/:rid,patients,sessions,devices}.
//      Every read is checked against the viewer's role for THAT target and written to
//      sate_access_audit. Deliberately not RLS: widening SELECT on recordings/patients would change what
//      every existing query returns for an admin (the web's lists rely on RLS to mean "mine"). There is
//      no write route here, by design. Admin manages managers at /admin/managers*.
// v33: POST /admin/devices/release {serial, hw_serial?} — an ADMIN takes a Bluetooth device away
//      from whichever account holds it (the holder lost the phone, left, cannot be reached). It
//      deletes every registration of it and writes the opt-out for every account that uploaded
//      from it, so no one holds it until someone pairs it again; RECORDINGS ARE KEPT. Written to
//      sate_device_audit (who, when, from whom) — the only record once the rows are gone.
// v32: a device is CLAIMED by uploading from it, not only by registering it. v31 counted only
//      `sate_devices` registrations — and the apps in the field never register, so the registry was
//      empty and every unit read as "nobody's": the first phone to ask CLAIMED someone else's unit.
//      Now the owner is the earliest registration, else the account that uploaded from it most
//      recently (the one holding it), and either is released only by that account removing it
//      (DELETE /devices/:id, or POST /devices/release from the phone's Unpair) — both write the
//      opt-out that stops its uploads counting as a claim.
// v31: ONE ACCOUNT PER BLUETOOTH DEVICE. GET /devices/owner?serial=&hw= says whether an external
//      device (L81x, SonicNote, pendant, Plaud) is registered to ANOTHER account, and whose (email —
//      the research build shows it so the user knows who to ask); POST /devices/external refuses
//      (409) to register one that already belongs to someone else. The owner is the EARLIEST
//      registration; removing the device (DELETE /devices/:id) is what frees it. `hw_serial` is the
//      unit's own serial (L81x opcode 0x01) — the same on iPhone and Android, where `serial`
//      (l816-<BLE id>) is not. Also: externalKind() now knows l815 and sonic (both were rejected).
// v30: POST /sessions/upload-url takes `format: 'mp3'` — a SonicNote take, stored as `<id>.mp3`;
//      cf-processor converts it to the pipeline's 16 kHz mono WAV (ffmpeg) exactly like an `.asc`.
// v29: sessions carry `audio_seconds` (set here for an ASC take, exactly by cf-processor) and
//      the list returns it. `bytes` is the UPLOADED size, so for raw ASC it is ~7.8x smaller
//      than the audio and a duration computed from it — which every screen did — was wrong:
//      a 66-minute take showed as 8m 28s. Readers must prefer audio_seconds.
// v28: POST /sessions/upload-url takes `format: 'asc'` — a RAW SATE L816/L815 take, stored as
//      `<id>.asc` and registered exactly like a WAV. cf-processor decodes it (the vendor codec
//      now runs there, under qemu), uploads `<id>.wav`, repoints `storage_path` at it and
//      deletes the `.asc`. This is what lets an iPhone use the L816: the codec is an Android
//      binary and the phone used to have to run it. `bytes` stays the uploaded (ASC) size so
//      a retried register still dedups.
// v26: POST /sessions/chunk accepts a USER JWT, not only a device key. Hardware
//      with no `sate_devices` row (L816/L815, pendant, Plaud) uploads through the
//      phone, and the single-shot POST /sessions carries the whole WAV as base64
//      in one JSON body — which dies part-way through a long take. Parts are
//      rooted at `u_<user id>`, never at a caller-supplied serial (that would let
//      one account write parts under another's prefix).
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
    // [v24] This used to authorize on `authHeader.startsWith('Bearer key-')` and never compare
    // the presented key to the :deviceId in the URL — so the literal header `Bearer key-` with
    // any device id was accepted. That let anyone: read the queued `record` command's payload
    // (patient id, name, age, session type, clinician) and the OTA url; overwrite that device's
    // row; and — worst — CONSUME its commands, because the handler marks every unconsumed row
    // consumed. The real recorder polling seconds later got an empty list, so a queued `stop`
    // was swallowed (the take ran to the ~62-min ceiling) and a queued `record` never started
    // (the clinical session was simply never captured).
    //
    // The key is `'key-' + device id` (handleDeviceRegister), which is exactly what the firmware
    // stores and sends, so an equality check is what the fleet is already doing — no device is
    // affected. NOTE this only makes the key self-consistent; it does NOT make it a secret,
    // because it is still derived from the serial. See the header note on device-key auth.
    if (authHeader.startsWith('Bearer key-')) {
      if (authHeader !== `Bearer ${deviceKeyFor(deviceId)}`) {
        return err('Device key does not match this device', 401);
      }
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
  // [v36] Manager "new reports" digest + ack — same secret, no user JWT.
  if (subPath === '/health/manager-digest' || subPath === '/health/manager-digest/ack') {
    const key = url.searchParams.get('key') || '';
    const want = Deno.env.get('HEALTH_ALERT_KEY') || '';
    if (!want || key !== want) return err('forbidden', 403);
    if (subPath === '/health/manager-digest' && method === 'GET') return await managerDigest(supabase);
    if (subPath === '/health/manager-digest/ack' && method === 'POST') return await managerDigestAck(supabase, req);
    return err('method not allowed', 405);
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
    // [v25] Register a device the phone paired over Bluetooth. Distinct from
    // /devices/register, which is the RECORDER's own self-registration with a
    // claim token and a device key; this caller is the signed-in user and the
    // device it is vouching for has neither.
    if (subPath === '/devices/external' && method === 'POST') {
      return await registerExternalDevice(supabase, user.id, req);
    }
    if (subPath === '/devices/release' && method === 'POST') {
      return await releaseExternalDevice(supabase, user.id, req);
    }
    // [v31] Who owns this Bluetooth device? Asked by the phone BEFORE it pairs one.
    if (subPath === '/devices/owner' && method === 'GET') {
      const u = new URL(req.url);
      if (!/^[A-Za-z0-9:_.-]{0,96}$/.test(u.searchParams.get('serial') || '')) return err('bad serial', 400);
      const o = await externalOwner(supabase, user.id, u.searchParams.get('serial') || '', u.searchParams.get('hw') || '');
      return json(o);
    }
    // [v40] The phone reports a unit on connect; answers the ONE name everyone shows for it.
    if (subPath === '/devices/seen' && method === 'POST') {
      return await deviceSeen(supabase, user.id, req);
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

    // ---- [v34] Oversight: READ-ONLY viewing of another account -------------
    if (subPath.startsWith('/oversight')) {
      return await oversightRoute(supabase, user, subPath, method, url);
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
      if (subPath === '/admin/processing' && method === 'GET') {
        return await adminProcessing(supabase, url);
      }
      if (subPath === '/admin/recorders' && method === 'GET') {
        return await adminRecorders(supabase);
      }
      if (subPath === '/admin/sessions/retry' && method === 'POST') {
        return await adminRetrySessions(supabase, user, req);
      }
      if (subPath === '/admin/sessions/requeue-stuck' && method === 'POST') {
        return await adminRequeueStuck(supabase, user, req);
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
      if (subPath === '/admin/users' && method === 'POST') {
        return await adminCreateUser(supabase, user, req);
      }
      const accMatch = subPath.match(/^\/admin\/users\/([0-9a-f-]{36})(?:\/(password|disable))?$/);
      if (accMatch && !accMatch[2] && method === 'GET') return await adminGetUser(supabase, user, accMatch[1]);
      if (accMatch && !accMatch[2] && method === 'DELETE') return await adminDeleteUser(supabase, user, accMatch[1], req);
      if (accMatch && accMatch[2] === 'password' && method === 'POST') return await adminSetPassword(supabase, user, accMatch[1], req);
      if (accMatch && accMatch[2] === 'disable' && method === 'POST') return await adminSetDisabled(supabase, user, accMatch[1], req);
      if (subPath === '/admin/managers' && method === 'GET') {
        return await adminListManagers(supabase);
      }
      if (subPath === '/admin/managers' && method === 'POST') {
        return await adminAddManager(supabase, user, req);
      }
      const mgrMatch = subPath.match(/^\/admin\/managers\/([0-9a-f-]{36})$/);
      if (mgrMatch && method === 'DELETE') {
        return await adminRemoveManager(supabase, user, mgrMatch[1]);
      }
      const notifyMatch = subPath.match(/^\/admin\/managers\/([0-9a-f-]{36})\/notify$/);
      if (notifyMatch && method === 'POST') {
        return await adminSetManagerNotify(supabase, user, notifyMatch[1], req);
      }
      const memMatch = subPath.match(/^\/admin\/managers\/([0-9a-f-]{36})\/members(?:\/([0-9a-f-]{36}))?$/);
      if (memMatch && method === 'POST' && !memMatch[2]) {
        return await adminAssignMember(supabase, user, memMatch[1], req);
      }
      if (memMatch && method === 'DELETE' && memMatch[2]) {
        return await adminUnassignMember(supabase, user, memMatch[1], memMatch[2]);
      }
      if (subPath === '/admin/devices/release' && method === 'POST') {
        return await adminForceRelease(supabase, user, req);
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
    // [v27] DIRECT-TO-STORAGE upload. The only path with no size ceiling.
    //
    // 🛑 Every other route puts the audio THROUGH this function, so every other
    // route has a limit: the streaming reader made ~62 min survive where 10 min
    // used to die, and 90 min is a 502 at the gateway before the function is even
    // reached. Those limits are not in code any more, so no amount of tuning here
    // moves them.
    //
    // So the bytes stop coming here at all. The client asks for a signed upload
    // URL, PUTs the WAV straight into Storage — which is built for this and does
    // resumable uploads — and then registers it. This function only ever handles
    // metadata, and the take can be any length Storage accepts (a project-wide
    // setting, not a code limit).
    if (subPath === '/sessions/upload-url' && method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const sessionId = newSessionId();
      // [v28] `format: 'asc'` = a RAW SATE L816/L815 take. The phone no longer has to
      // decode it (only an Android phone could — the vendor codec is an Android binary);
      // cf-processor decodes it to a WAV, repoints the row at that WAV, and from then on
      // it is an ordinary session. The extension is the only signal the processor keys on,
      // so it is chosen here from a closed set, never taken from the client verbatim.
      // [v30] `mp3` = a SonicNote take (the recorder's own MP3); cf-processor converts it.
      const ext = body.format === 'asc' ? 'asc' : body.format === 'mp3' ? 'mp3' : 'wav';
      const path = sessionStoragePath(user.id, body.device_serial || 'external', sessionId, ext);
      const { data, error: sErr } = await supabase.storage.from('device-sessions')
        .createSignedUploadUrl(path);
      if (sErr) return err(`could not sign an upload: ${sErr.message}`, 500);
      // The id is handed out NOW and echoed back on register, so the object lands
      // at its final path and nothing has to be copied or moved afterwards.
      return json({ session_id: sessionId, storage_path: path, token: data.token,
                    signed_url: data.signedUrl });
    }

    // [v27] Register an object the client uploaded straight to Storage.
    if (subPath === '/sessions/register' && method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const storagePath = String(body.storage_path || '');
      // 🛑 The caller names the path, so the caller could name ANY path. Confine
      // it to this account's own prefix: without this, a signed-in user could
      // register another account's audio as their own session, or point a row at
      // an arbitrary object. The signed URL above only permits writes here, but
      // this route must not depend on that having been the way in.
      if (!storagePath.startsWith(`${user.id}/`) || storagePath.includes('..')) {
        return err('storage_path is not in this account', 403);
      }
      // A row whose object is not really there is the ghost the 413 bug left
      // behind, and it strands the recording on the device for ever. Confirm the
      // object AND take the byte count from Storage, never from the client.
      const bytes = await objectSize(supabase, 'device-sessions', storagePath);
      if (bytes === null) return err('no object at storage_path — upload it first', 409);
      if (bytes === 0) return err('uploaded object is empty', 400);

      const meta = {
        device_serial: String(body.device_serial || 'external'),
        patient_id: String(body.patient_id || 'PT'),
        session_number: Number(body.session_number || 0),
        sample_rate: Number(body.sample_rate || 16000),
        flags: Array.isArray(body.flags) ? body.flags.filter((n: unknown) => Number.isFinite(n)) : undefined,
        hw_serial: hwSerialOf(body.hw_serial),
      };
      // Same idempotency the byte-carrying routes have: a retried register must
      // not create a second session, and a second AI run.
      const { data: existing } = await supabase.from('sate_device_sessions')
        .select('id, storage_path')
        .eq('user_id', user.id)
        .eq('device_serial', meta.device_serial)
        .eq('patient_id', meta.patient_id)
        .eq('session_number', meta.session_number)
        .eq('bytes', bytes)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        const real = existing.storage_path &&
          await objectExists(supabase, 'device-sessions', existing.storage_path);
        if (real) return json({ id: existing.id, idempotent: true });
        await supabase.from('sate_device_sessions').delete().eq('id', existing.id);
      }

      const sessionId = String(body.session_id || '').match(/^s-[0-9a-f]{8}$/)
        ? String(body.session_id)
        : newSessionId();
      return await insertSessionRow(supabase, user.id, meta, sessionId, storagePath, bytes);
    }

    // [v26] CHUNKED upload for a signed-in user.
    //
    // The single-shot POST /sessions below carries the whole take as base64 in
    // one JSON body. That is fine for a short recording and fails part-way
    // through a long one: ~19 MB of PCM for ten minutes, ~26 MB base64'd, against
    // this function's body and wall-clock limits. The recording transfers off the
    // hardware perfectly and then cannot be handed over — the audio exists and
    // there is nothing to be done with it, which is the worst place to fail.
    //
    // The chunked path has no such ceiling and the firmware has used it for
    // 118 MB sessions all along; it was simply device-key-gated, and an L816,
    // a pendant and a Plaud have no device key. Same handler, same part objects,
    // same contiguity and idempotency checks — only the identity differs.
    if (subPath === '/sessions/chunk' && method === 'POST') {
      return await handleSessionUpload(supabase, req, subPath, {
        userId: user.id,
        serial: url.searchParams.get('device_serial') || 'external',
      });
    }
    if (subPath === '/sessions' && method === 'POST') {
      const { meta, wav: wavBytes } = await readSessionBody(req);
      return await storeSessionRecord(supabase, user.id, {
        device_serial: meta.device_serial || 'plaud',
        patient_id: meta.patient_id || 'PT',
        session_number: meta.session_number || 0,
        sample_rate: meta.sample_rate || 16000,
        flags: Array.isArray(meta.flags) ? meta.flags.filter((n: unknown) => Number.isFinite(n)) : undefined,
        hw_serial: hwSerialOf(meta.hw_serial),
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

/**
 * Which device family a serial belongs to, from the serial alone.
 *
 * The mobile app builds these prefixes (`l816-<MAC>`, `pendant-<id>`, `plaud`),
 * and `recordingName.ts` in the web app splits on exactly the same three when it
 * labels a take. Keep the three lists in step — a family that is known here and
 * unknown there shows up as a device whose recordings are named as if they came
 * from a recorder.
 */
function externalKind(serial: string): 'plaud' | 'pendant' | 'l816' | 'sonic' | null {
  const s = (serial || '').toLowerCase();
  if (s.startsWith('pendant')) return 'pendant';
  if (s.startsWith('plaud')) return 'plaud';
  // [v31] The whole L81x family (l816-, l815-, …) is one kind; only l816 was accepted.
  if (/^l81\d-/.test(s)) return 'l816';
  if (s.startsWith('sonic-')) return 'sonic';
  return null;
}

/**
 * [v31] Who a Bluetooth device belongs to. The owner is the account with the EARLIEST
 * registration of it — matched by `serial` or, when the phone read one, by the unit's own
 * `hw_serial` (an L81x's BLE id is a per-phone UUID on iOS, so `serial` alone would let an
 * iPhone and an Android phone each "own" the same unit). Removing the device deletes the
 * row, which is what frees it for someone else.
 */
async function externalOwner(supabase: any, userId: string, serial: string, hw: string) {
  serial = (serial || '').trim(); hw = (hw || '').trim();
  // Both go into a PostgREST `or=` filter: a comma or a parenthesis would change its meaning.
  if (serial && !/^[A-Za-z0-9:_.-]{1,96}$/.test(serial)) throw new Error('bad serial');
  if (hw && !/^[A-Za-z0-9_.-]{1,48}$/.test(hw)) hw = '';
  if (!serial && !hw) return { owner: 'none' };

  // 1. An explicit registration — the earliest one wins.
  let q = supabase.from('sate_devices').select('user_id, created_at, serial, hw_serial')
    .not('kind', 'is', null).neq('kind', 'sate');
  q = hw ? q.or(`serial.eq.${serial},hw_serial.eq.${hw}`) : q.eq('serial', serial);
  const { data, error } = await q.order('created_at', { ascending: true }).limit(1);
  if (error) throw new Error(error.message);
  let ownerId: string | null = data?.[0]?.user_id ?? null;
  let since: string | null = data?.[0]?.created_at ?? null;
  let source = 'registered';

  // 2. [v32] No registration: whoever UPLOADED from it most recently is holding it, unless
  //    they have since removed it (their opt-out is exactly "I let this device go").
  if (!ownerId && serial) {
    // [v39] With the unit's own serial, uploads from ANY phone's serial for this unit count —
    // an iPhone sees the same L816 under a different BLE id than Android does.
    // [v40] Plus every serial a phone has LINKED to this unit on connect, uploaded from or not.
    let linked: string[] = [];
    if (hw) {
      const { data: ls, error: le } = await supabase.from('sate_device_serial_units').select('serial').eq('hw_serial', hw);
      if (le && !/does not exist|schema cache/i.test(le.message)) throw new Error(le.message);
      linked = (ls || []).map((r: any) => r.serial).filter((x: string) => /^[A-Za-z0-9:_.-]{1,96}$/.test(x));
    }
    let sessQ = supabase.from('sate_device_sessions').select('user_id, created_at, device_serial');
    sessQ = hw ? sessQ.or([`device_serial.eq.${serial}`, `hw_serial.eq.${hw}`, ...linked.map((x) => `device_serial.eq.${x}`)].join(','))
      : sessQ.eq('device_serial', serial);
    const { data: sess, error: e1 } = await sessQ.order('created_at', { ascending: false }).limit(50);
    if (e1) throw new Error(e1.message);
    // A release is per serial; releasing the unit under ANY of its serials releases it.
    const serials = [...new Set([serial, ...linked, ...(sess || []).map((r: any) => r.device_serial)])];
    const { data: outs, error: e2 } = await supabase.from('sate_external_device_optouts')
      .select('user_id').in('serial', serials);
    if (e2) throw new Error(e2.message);
    const released = new Set((outs || []).map((o: any) => o.user_id));
    const holder = (sess || []).find((r: any) => !released.has(r.user_id));
    if (holder) { ownerId = holder.user_id; since = holder.created_at; source = 'uploads'; }
  }

  if (!ownerId) return { owner: 'none' };
  if (ownerId === userId) return { owner: 'me', source };
  let email: string | null = null;
  try {
    const { data: u } = await supabase.auth.admin.getUserById(ownerId);
    email = u?.user?.email ?? null;
  } catch { /* the refusal stands even if the name cannot be looked up */ }
  return { owner: 'other', owner_email: email, since, source };
}

// ============================================================================
// [v34] OVERSIGHT — read-only cross-account viewing
// ============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** [v39] A unit's own serial, if the client sent a plausible one. It goes into PostgREST `or=` filters,
 *  so the character set is closed: no comma, no parenthesis. */
const hwSerialOf = (v: unknown): string | null =>
  (typeof v === 'string' && /^[A-Za-z0-9_.-]{4,48}$/.test(v.trim()) ? v.trim() : null);

/** [v40] The app's own naming formula, for a serial reported without a name. */
function defaultUnitName(serial: string): string {
  const m = serial.match(/^(l81\d)-([0-9A-Za-z]+)$/i);
  if (!m) return serial;
  return `SATE ${m[1].toUpperCase()} · ${m[2].toUpperCase().slice(-4)}R`;
}

/** [v40] serial -> {hw, name} for the serials that have been linked to a unit. */
async function unitsForSerials(supabase: any, serials: string[]): Promise<Map<string, { hw: string; name: string }>> {
  const out = new Map<string, { hw: string; name: string }>();
  const list = [...new Set(serials.filter(Boolean))];
  for (let i = 0; i < list.length; i += 200) {
    const { data, error } = await supabase.from('sate_device_serial_units')
      .select('serial, hw_serial, unit:sate_device_units(name)').in('serial', list.slice(i, i + 200));
    if (error) {
      // Tables not migrated yet: no names, never a failed list.
      if (/does not exist|schema cache/i.test(error.message)) return out;
      throw new Error(error.message);
    }
    for (const r of data || []) out.set(r.serial, { hw: r.hw_serial, name: r.unit?.name ?? defaultUnitName(r.serial) });
  }
  return out;
}

async function deviceSeen(supabase: any, userId: string, req: Request) {
  const body = await req.json().catch(() => ({}));
  const serial = typeof body?.serial === 'string' ? body.serial.trim() : '';
  const hw = hwSerialOf(body?.hw_serial);
  if (!/^[a-z0-9]{2,12}-[A-Za-z0-9]{4,64}$/.test(serial) || !externalKind(serial)) return err('bad serial', 400);
  if (!hw) return err('hw_serial required', 400);
  const offered = typeof body?.name === 'string' ? body.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60) : '';
  const now = new Date().toISOString();
  // First report wins: insert-if-absent, never update the name.
  const { error: e1 } = await supabase.from('sate_device_units').upsert(
    { hw_serial: hw, name: offered || defaultUnitName(serial), first_serial: serial, first_user_id: userId },
    { onConflict: 'hw_serial', ignoreDuplicates: true });
  if (e1) throw new Error(e1.message);
  await supabase.from('sate_device_units').update({ last_seen_at: now }).eq('hw_serial', hw);
  // First link wins too: a serial already tied to ANOTHER unit is left alone (and reported).
  const { error: e2 } = await supabase.from('sate_device_serial_units').upsert(
    { serial, hw_serial: hw, first_user_id: userId }, { onConflict: 'serial', ignoreDuplicates: true });
  if (e2) throw new Error(e2.message);
  const [{ data: unit }, { data: link }] = await Promise.all([
    supabase.from('sate_device_units').select('name, first_serial, created_at').eq('hw_serial', hw).maybeSingle(),
    supabase.from('sate_device_serial_units').select('hw_serial').eq('serial', serial).maybeSingle(),
  ]);
  return json({ hw_serial: hw, name: unit?.name ?? defaultUnitName(serial), first: unit?.first_serial === serial,
    conflict: !!link && link.hw_serial !== hw });
}

async function emailOf(supabase: any, uid: string): Promise<string | null> {
  try { const { data } = await supabase.auth.admin.getUserById(uid); return data?.user?.email ?? null; }
  catch { return null; }
}

/** The viewer's oversight role. Admin wins over manager. */
async function oversightRole(supabase: any, user: any): Promise<'admin' | 'manager' | 'none'> {
  if (await isAdmin(supabase, user.email)) return 'admin';
  const { data } = await supabase.from('sate_managers').select('user_id').eq('user_id', user.id).maybeSingle();
  return data ? 'manager' : 'none';
}

/** May `user` view `target`? Returns the role that allows it, or null. */
async function canView(supabase: any, user: any, target: string): Promise<'admin' | 'manager' | null> {
  if (target === user.id) return null; // your own account is the app's job, not oversight's
  const role = await oversightRole(supabase, user);
  if (role === 'admin') return 'admin';
  if (role === 'manager') {
    const { data } = await supabase.from('sate_manager_members').select('member_id')
      .eq('manager_id', user.id).eq('member_id', target).maybeSingle();
    if (data) return 'manager';
  }
  return null;
}

async function auditAccess(supabase: any, user: any, role: string, target: string, resource: string, resourceId?: string | null) {
  const { error } = await supabase.from('sate_access_audit').insert({
    viewer_id: user.id, viewer_email: user.email ?? null, role,
    target_id: target, target_email: await emailOf(supabase, target),
    resource, resource_id: resourceId ?? null,
  });
  // A view that cannot be audited is not served: the record IS the permission's price.
  if (error) throw new Error('access audit failed: ' + error.message);
}

async function oversightRoute(supabase: any, user: any, subPath: string, method: string, url: URL) {
  if (method !== 'GET') return err('Oversight is read-only', 405);
  if (subPath === '/oversight/me') {
    const role = await oversightRole(supabase, user);
    let targets: { id: string; email: string | null }[] = [];
    if (role === 'admin') {
      const all: any[] = [];
      for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(error.message);
        all.push(...(data?.users || []));
        if (!data?.users?.length || data.users.length < 1000) break;
      }
      targets = all.filter((u) => u.id !== user.id).map((u) => ({ id: u.id, email: u.email ?? null }));
    } else if (role === 'manager') {
      const { data, error } = await supabase.from('sate_manager_members').select('member_id').eq('manager_id', user.id);
      if (error) throw new Error(error.message);
      for (const m of data || []) targets.push({ id: m.member_id, email: await emailOf(supabase, m.member_id) });
    }
    targets.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    return json({ role, targets });
  }

  const ex = subPath.match(/^\/oversight\/users\/([0-9a-f-]{36})\/recordings\/([0-9a-f-]{36})\/export\/(audio|lsa|metrics)$/);
  if (ex) return await oversightExport(supabase, user, ex[1], ex[2], ex[3] as 'audio' | 'lsa' | 'metrics');

  const m = subPath.match(/^\/oversight\/users\/([0-9a-f-]{36})\/(recordings|patients|sessions|devices)(?:\/([0-9a-f-]{36}))?$/);
  if (!m || !UUID_RE.test(m[1])) return err('Not found', 404);
  const [, target, kind, rid] = m;
  const role = await canView(supabase, user, target);
  if (!role) return err('Forbidden', 403);

  if (kind === 'recordings' && !rid) {
    await auditAccess(supabase, user, role, target, 'recordings');
    const { data, error } = await supabase.from('recordings')
      .select('id, recording_name, file_name, created_at, updated_at, duration, patient_id, protocol, needs_review, segments_edited, version, source_session_id')
      .eq('user_id', target).order('created_at', { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    return json(data || []);
  }
  if (kind === 'recordings' && rid) {
    if (!UUID_RE.test(rid)) return err('Not found', 404);
    const { data: rec, error } = await supabase.from('recordings').select('*').eq('id', rid).eq('user_id', target).maybeSingle();
    if (error) throw new Error(error.message);
    if (!rec) return err('Not found', 404);
    await auditAccess(supabase, user, role, target, 'recording', rid);
    let audio_url: string | null = null;
    if (rec.file_path) {
      const { data: signed } = await supabase.storage.from('recordings').createSignedUrl(rec.file_path, 3600);
      audio_url = signed?.signedUrl ?? null;
    }
    return json({ ...rec, audio_url });
  }
  if (kind === 'patients') {
    await auditAccess(supabase, user, role, target, 'patients');
    const { data, error } = await supabase.from('patients').select('*').eq('slp_id', target).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return json(data || []);
  }
  if (kind === 'sessions') {
    await auditAccess(supabase, user, role, target, 'sessions');
    return await listSessions(supabase, target, url.searchParams.get('device'), url.searchParams.get('limit'));
  }
  if (kind === 'devices') {
    await auditAccess(supabase, user, role, target, 'devices');
    return await listDevices(supabase, target, true);
  }
  return err('Not found', 404);
}

async function oversightExport(supabase: any, user: any, target: string, rid: string, type: 'audio' | 'lsa' | 'metrics') {
  if (!UUID_RE.test(target) || !UUID_RE.test(rid)) return err('Not found', 404);
  const role = await canView(supabase, user, target);
  if (!role) return err('Forbidden', 403);
  const { data: rec, error } = await supabase.from('recordings')
    .select('id, recording_name, file_name, file_path, created_at, duration, patient_id' +
      (type === 'lsa' ? ', lsa_report' : '') + (type === 'metrics' ? ', transcript, error_counts' : ''))
    .eq('id', rid).eq('user_id', target).maybeSingle();
  if (error) throw new Error(error.message);
  if (!rec) return err('Not found', 404);
  if (type === 'audio' && !rec.file_path) return err('This recording has no audio', 404);
  if (type === 'lsa' && !rec.lsa_report) return err('No SATE Report has been generated for this recording', 404);

  // Audit FIRST: an export that cannot be logged is not handed out.
  await auditAccess(supabase, user, role, target, `export_${type}`, rid);
  const meta = { id: rec.id, recording_name: rec.recording_name, file_name: rec.file_name,
    created_at: rec.created_at, duration: rec.duration, patient_id: rec.patient_id };

  if (type === 'audio') {
    const name = (rec.file_name || `${rec.id}.wav`).replace(/[^\w.\- ]+/g, '_');
    const { data: signed, error: se } = await supabase.storage.from('recordings')
      .createSignedUrl(rec.file_path, 300, { download: name });
    if (se || !signed?.signedUrl) throw new Error(se?.message || 'could not sign the audio');
    return json({ recording: meta, file_name: name, url: signed.signedUrl, expires_in: 300 });
  }
  if (type === 'lsa') return json({ recording: meta, lsa_report: rec.lsa_report });
  return json({ recording: meta, transcript: rec.transcript, error_counts: rec.error_counts });
}

async function adminListManagers(supabase: any) {
  const { data: mgrs, error } = await supabase.from('sate_managers').select('user_id, created_at, notify_email');
  if (error) throw new Error(error.message);
  const { data: mems, error: e2 } = await supabase.from('sate_manager_members').select('manager_id, member_id, created_at');
  if (e2) throw new Error(e2.message);
  const out = [];
  for (const g of mgrs || []) {
    const members = [];
    for (const x of (mems || []).filter((x: any) => x.manager_id === g.user_id)) {
      members.push({ id: x.member_id, email: await emailOf(supabase, x.member_id), since: x.created_at });
    }
    out.push({ id: g.user_id, email: await emailOf(supabase, g.user_id), since: g.created_at,
      notify_email: g.notify_email !== false, members });
  }
  out.sort((a: any, b: any) => (a.email || '').localeCompare(b.email || ''));
  return json(out);
}

async function adminSetManagerNotify(supabase: any, admin: any, managerId: string, req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body?.enabled !== 'boolean') return err('enabled (boolean) required', 400);
  // Switching it back ON restarts the cursor, so the email never mails the backlog from while it was off.
  const patch: Record<string, unknown> = { notify_email: body.enabled };
  if (body.enabled) patch.notify_cursor = new Date().toISOString();
  const { data, error } = await supabase.from('sate_managers').update(patch).eq('user_id', managerId).select('user_id');
  if (error) throw new Error(error.message);
  if (!data?.length) return err('Not a manager', 404);
  await auditAccess(supabase, admin, 'admin', managerId, 'manager_change', `new-report email ${body.enabled ? 'on' : 'off'}`);
  return json({ ok: true, notify_email: body.enabled });
}

// [v36] Per manager: the new recordings of their assigned accounts since the cursor.
// Snapshot `until` is taken 60 s in the past: a recording's created_at is set when its insert
// starts, so a row can become visible a moment after a later timestamp was read — counting only
// up to (now - 60 s) and starting the next window there means such a row is never skipped.
async function managerDigest(supabase: any) {
  const until = new Date(Date.now() - 60_000).toISOString();
  const { data: mgrs, error } = await supabase.from('sate_managers')
    .select('user_id, notify_cursor').eq('notify_email', true);
  if (error) throw new Error(error.message);
  const { data: mems, error: e2 } = await supabase.from('sate_manager_members').select('manager_id, member_id, created_at');
  if (e2) throw new Error(e2.message);

  const out = [];
  for (const m of mgrs || []) {
    const t = (v: string) => Date.parse(v);
    if (!(t(m.notify_cursor) < t(until))) continue;
    const accounts = [];
    for (const x of (mems || []).filter((y: any) => y.manager_id === m.user_id)) {
      // Only what was recorded since BOTH the cursor and the assignment.
      const from = t(x.created_at) > t(m.notify_cursor) ? x.created_at : m.notify_cursor;
      if (!(t(from) < t(until))) continue;
      const { data: recs, count, error: e3 } = await supabase.from('recordings')
        .select('created_at, duration', { count: 'exact' })
        .eq('user_id', x.member_id).gt('created_at', from).lte('created_at', until)
        .order('created_at', { ascending: false }).limit(10);
      if (e3) throw new Error(e3.message);
      if (!count) continue;
      accounts.push({ id: x.member_id, email: await emailOf(supabase, x.member_id), count,
        latest: (recs || []).map((r: any) => ({ created_at: r.created_at, duration: r.duration ?? null })) });
    }
    const email = await emailOf(supabase, m.user_id);
    // Nothing new still advances nothing: the cursor only moves when an email is acked, and a
    // window with no recordings stays open (it is cheap — one count per assigned account).
    if (accounts.length && email) out.push({ manager_id: m.user_id, email, until, accounts });
  }
  return json({ until, managers: out });
}

async function managerDigestAck(supabase: any, req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.manager_id === 'string' && UUID_RE.test(body.manager_id) ? body.manager_id : null;
  const until = typeof body?.until === 'string' && !Number.isNaN(Date.parse(body.until)) ? new Date(body.until).toISOString() : null;
  if (!id || !until) return err('manager_id and until required', 400);
  if (Date.parse(until) > Date.now()) return err('until is in the future', 400);
  // Only forward: a late or repeated ack can never re-open a window that was already mailed.
  const { data, error } = await supabase.from('sate_managers').update({ notify_cursor: until })
    .eq('user_id', id).lt('notify_cursor', until).select('user_id');
  if (error) throw new Error(error.message);
  return json({ ok: true, moved: !!data?.length });
}

async function resolveUserId(supabase: any, body: any): Promise<string | null> {
  if (typeof body?.user_id === 'string' && UUID_RE.test(body.user_id)) return body.user_id;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return null;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = (data?.users || []).find((u: any) => (u.email || '').toLowerCase() === email);
    if (hit) return hit.id;
    if (!data?.users?.length || data.users.length < 1000) return null;
  }
}

async function adminAddManager(supabase: any, admin: any, req: Request) {
  const uid = await resolveUserId(supabase, await req.json());
  if (!uid) return err('No such account', 404);
  const { error } = await supabase.from('sate_managers').upsert({ user_id: uid, created_by: admin.id }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  await auditAccess(supabase, admin, 'admin', uid, 'manager_change', 'granted manager');
  return json({ ok: true, id: uid });
}

async function adminRemoveManager(supabase: any, admin: any, managerId: string) {
  const { error } = await supabase.from('sate_managers').delete().eq('user_id', managerId);
  if (error) throw new Error(error.message);
  await auditAccess(supabase, admin, 'admin', managerId, 'manager_change', 'revoked manager');
  return noContent();
}

async function adminAssignMember(supabase: any, admin: any, managerId: string, req: Request) {
  const { data: g } = await supabase.from('sate_managers').select('user_id').eq('user_id', managerId).maybeSingle();
  if (!g) return err('Not a manager', 404);
  const uid = await resolveUserId(supabase, await req.json());
  if (!uid) return err('No such account', 404);
  if (uid === managerId) return err('A manager cannot be assigned to themselves', 400);
  const { error } = await supabase.from('sate_manager_members')
    .upsert({ manager_id: managerId, member_id: uid, assigned_by: admin.id }, { onConflict: 'manager_id,member_id' });
  if (error) throw new Error(error.message);
  await auditAccess(supabase, admin, 'admin', uid, 'manager_change', `assigned to manager ${managerId}`);
  return json({ ok: true, id: uid });
}

async function adminUnassignMember(supabase: any, admin: any, managerId: string, memberId: string) {
  const { error } = await supabase.from('sate_manager_members').delete().eq('manager_id', managerId).eq('member_id', memberId);
  if (error) throw new Error(error.message);
  await auditAccess(supabase, admin, 'admin', memberId, 'manager_change', `unassigned from manager ${managerId}`);
  return noContent();
}

/**
 * [v33] Admin force-release: free a Bluetooth device from EVERY account that holds it.
 * Registrations are deleted; every account that uploaded from it gets the opt-out that
 * stops those uploads counting as a claim. Recordings are untouched. Audited.
 */
async function adminForceRelease(supabase: any, admin: any, req: Request) {
  const { serial, hw_serial } = await req.json();
  if (!serial || !/^[A-Za-z0-9:_.-]{1,96}$/.test(serial)) return err('bad serial', 400);
  if (!externalKind(serial)) return err('Not an external device serial', 400);
  const hw = typeof hw_serial === 'string' && /^[A-Za-z0-9_.-]{1,48}$/.test(hw_serial) ? hw_serial : '';

  let sel = supabase.from('sate_devices').select('id, user_id, serial, hw_serial')
    .not('kind', 'is', null).neq('kind', 'sate');
  sel = hw ? sel.or(`serial.eq.${serial},hw_serial.eq.${hw}`) : sel.eq('serial', serial);
  const { data: regs, error: e1 } = await sel;
  if (e1) throw new Error(e1.message);
  const { data: sess, error: e2 } = await supabase.from('sate_device_sessions')
    .select('user_id').eq('device_serial', serial).limit(5000);
  if (e2) throw new Error(e2.message);

  const holders = new Set<string>([...(regs || []).map((r: any) => r.user_id), ...(sess || []).map((r: any) => r.user_id)]);
  const serials = new Set<string>([serial, ...(regs || []).map((r: any) => r.serial)]);
  if ((regs || []).length) {
    const { error } = await supabase.from('sate_devices').delete().in('id', regs.map((r: any) => r.id));
    if (error) throw new Error(error.message);
  }
  const outs = [...holders].flatMap((u) => [...serials].map((sr) => ({ user_id: u, serial: sr })));
  if (outs.length) {
    const { error } = await supabase.from('sate_external_device_optouts').upsert(outs, { onConflict: 'user_id,serial' });
    if (error) throw new Error(error.message);
  }
  const emails: string[] = [];
  for (const u of holders) {
    try { const { data } = await supabase.auth.admin.getUserById(u); if (data?.user?.email) emails.push(data.user.email); } catch { /* keep going */ }
  }
  const { error: e3 } = await supabase.from('sate_device_audit').insert({
    serial, hw_serial: hw || null, action: 'force_release', by_user: admin.id, by_email: admin.email,
    detail: { released_from: emails, registrations_deleted: (regs || []).length, serials: [...serials] },
  });
  if (e3) console.error('device audit failed:', e3.message);
  return json({ ok: true, released_from: emails, registrations_deleted: (regs || []).length });
}

/**
 * [v32] The phone's Unpair: let this device go, so another account can claim it. Deletes this
 * account's registration(s) of it and writes the opt-out that stops this account's uploads from
 * counting as a claim. The recordings are KEPT — this is about the hardware, not the data.
 */
async function releaseExternalDevice(supabase: any, userId: string, req: Request) {
  const { serial, hw_serial } = await req.json();
  if (!serial || !/^[A-Za-z0-9:_.-]{1,96}$/.test(serial)) return err('bad serial', 400);
  if (!externalKind(serial)) return err('Not an external device serial', 400);
  const hw = typeof hw_serial === 'string' && /^[A-Za-z0-9_.-]{1,48}$/.test(hw_serial) ? hw_serial : '';
  let del = supabase.from('sate_devices').delete().eq('user_id', userId).not('kind', 'is', null).neq('kind', 'sate');
  del = hw ? del.or(`serial.eq.${serial},hw_serial.eq.${hw}`) : del.eq('serial', serial);
  const { error } = await del;
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.from('sate_external_device_optouts')
    .upsert({ user_id: userId, serial }, { onConflict: 'user_id,serial' });
  if (e2) throw new Error(e2.message);
  return json({ ok: true });
}

const EXTERNAL_LABEL: Record<string, string> = {
  plaud: 'Plaud',
  pendant: 'SATE Pendant',
  l816: 'SATE L816',
  sonic: 'SonicNote',
};

async function listDevices(supabase: any, userId: string, readOnly = false) {
  // Mark a RECORDER offline when its heartbeat goes quiet.
  //
  // [v25] `kind is null` restricts this to real recorders. An external device is
  // reachable over Bluetooth from the phone and NEVER over Wi-Fi, so it has no
  // heartbeat to go stale — sweeping it would peg every Plaud, Pendant and L816
  // to "Offline" permanently, which reads as broken hardware rather than as
  // "this one works differently".
  const cutoff = new Date(Date.now() - 45000).toISOString();
  // [v34] Oversight passes readOnly: viewing someone's devices must not write to them.
  if (!readOnly) {
    await supabase.from('sate_devices')
      .update({ online: false, state: 'idle' })
      .eq('user_id', userId).lt('last_seen', cutoff).eq('online', true)
      .is('kind', null);
  }
  const { data, error } = await supabase.from('sate_devices')
    .select('*').eq('user_id', userId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data || []).map((d: any) => ({ ...d, kind: d.kind || 'sate' }));

  // Backfill: an external device that uploaded before /devices/external existed
  // (or was paired on another phone) has recordings but no row. Derive one from
  // its sessions so the hardware is visible, unless the user removed it.
  const [{ data: sessions }, { data: optouts }] = await Promise.all([
    supabase.from('sate_device_sessions')
      .select('device_serial, created_at').eq('user_id', userId),
    supabase.from('sate_external_device_optouts')
      .select('serial').eq('user_id', userId),
  ]);
  const hidden = new Set((optouts || []).map((o: any) => o.serial));
  const known = new Set(rows.map((d: any) => d.serial));
  const derived = new Map<string, any>();
  for (const s of sessions || []) {
    const serial = s.device_serial;
    const kind = externalKind(serial);
    if (!kind || known.has(serial) || hidden.has(serial)) continue;
    const seen = derived.get(serial);
    // `last_seen` is the newest upload — the only evidence we have of when this
    // device was last used, since it never sends a heartbeat.
    if (!seen || s.created_at > seen.last_seen) {
      derived.set(serial, {
        id: `ext:${serial}`,
        user_id: userId,
        name: EXTERNAL_LABEL[kind],
        serial,
        fw: EXTERNAL_LABEL[kind],
        kind,
        online: false,
        last_seen: s.created_at,
        pending_sessions: 0,
        state: 'idle',
        created_at: seen?.created_at ?? s.created_at,
      });
    }
  }
  const all = [...rows, ...derived.values()];
  const units = await unitsForSerials(supabase, all.filter((d: any) => d.kind && d.kind !== 'sate').map((d: any) => d.serial));
  return json(all.map((d: any) => {
    const u = units.get(d.serial);
    return u ? { ...d, name: u.name, hw_serial: d.hw_serial ?? u.hw, unit_name: u.name } : d;
  }));
}

/**
 * Register a device the PHONE paired over Bluetooth (Plaud / Pendant / L816).
 *
 * Upsert, keyed on (user, serial): pairing the same unit twice must not create a
 * second row, and re-pairing one you previously removed is an intention — so it
 * clears the opt-out that was hiding it.
 */
async function registerExternalDevice(supabase: any, userId: string, req: Request) {
  const { serial, name, hw_serial } = await req.json();
  if (!serial) return err('serial is required');
  const kind = externalKind(serial);
  // Refuse a serial that is not recognisably external. This route writes into
  // the same table the recorder fleet lives in, and a row claiming to be a SATE
  // recorder while having no device key would be offered OTA it can never apply.
  if (!kind) return err('Not an external device serial', 400);
  if (!/^[A-Za-z0-9:_.-]{1,96}$/.test(serial)) return err('bad serial', 400);
  // [v31] One account per device, enforced HERE — the phone's popup is courtesy.
  const o = await externalOwner(supabase, userId, serial, hw_serial || '');
  if (o.owner === 'other') {
    return json({ error: 'This device is registered to another account', ...o }, 409);
  }

  const { data: existing } = await supabase.from('sate_devices')
    .select('id').eq('user_id', userId).eq('serial', serial).maybeSingle();

  const row = {
    user_id: userId,
    name: (name || '').trim() || EXTERNAL_LABEL[kind],
    serial,
    fw: EXTERNAL_LABEL[kind],
    kind,
    hw_serial: (hw_serial || '').trim() || null,
    online: false,
    state: 'idle',
    last_seen: new Date().toISOString(),
  };
  if (existing) {
    const { error } = await supabase.from('sate_devices')
      .update({ last_seen: row.last_seen, kind, ...(row.hw_serial ? { hw_serial: row.hw_serial } : {}) })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('sate_devices')
      .insert({ id: crypto.randomUUID(), ...row });
    if (error) throw new Error(error.message);
  }
  // Pairing it again un-hides it.
  await supabase.from('sate_external_device_optouts')
    .delete().eq('user_id', userId).eq('serial', serial);
  return json({ ok: true, kind });
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

  // [v24] The upsert below keys on `id`, which is derived from the serial — so without this
  // check a caller holding a claim token for THEIR OWN account could re-point an already
  // provisioned recorder at themselves just by naming its serial. The physical device keeps
  // working (its stored key is unchanged and still valid), so every subsequent patient session
  // would land in the new owner's account while disappearing from the real clinician's.
  // Re-registering your own device is normal (factory reset, re-claim) and stays allowed.
  const { data: owned } = await supabase.from('sate_devices')
    .select('user_id').eq('id', id).maybeSingle();
  if (owned && owned.user_id && owned.user_id !== userId) {
    return err('That recorder is already claimed by another account. Have its current owner '
      + 'remove it first, or factory-reset the device.', 409);
  }

  const { error } = await supabase.from('sate_devices').upsert({
    id, user_id: userId, name: serial, serial, fw: fw || '', online: true,
    ip: req.headers.get('x-forwarded-for') || '',
    last_seen: new Date().toISOString(), pending_sessions: 0, state: 'idle',
    slp: slpName, slp_id: slpId,
  }, { onConflict: 'id' });
  if (error) throw new Error(error.message);

  return json({ device_id: id, device_key: deviceKeyFor(id), slp: slpName, slp_id: slpId });
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

/**
 * The device key for a device id. Derived, NOT a secret — it is `'key-' + id` and the id is
 * `'dev-' + serial`, so anyone who can read the serial off the case (or hear it over BLE) can
 * compute it. Keep every device-key route going through this ONE function so that when the
 * fleet is re-keyed to a stored random secret there is a single place to change.
 */
function deviceKeyFor(deviceId: string): string {
  return 'key-' + deviceId;
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

/**
 * Remove a device from Connected Recorders. RECORDINGS ARE KEPT — this deletes
 * the hardware row only; the sessions and the `recordings` they produced stay.
 *
 * [v25] For an EXTERNAL device the row is not the whole story: listDevices
 * re-derives one from the device's sessions, so a plain delete would be undone
 * on the next poll two seconds later and the button would look broken. Record an
 * opt-out that outlives the row (same shape as `note_optouts`). A derived device
 * has no row at all — its id is `ext:<serial>` — so the opt-out IS the delete.
 */
async function removeDevice(supabase: any, userId: string, deviceId: string) {
  let serial: string | null = null;
  let external = false;

  if (deviceId.startsWith('ext:')) {
    serial = deviceId.slice(4);
    external = true;
  } else {
    const { data: dev } = await supabase.from('sate_devices')
      .select('serial, kind').eq('id', deviceId).eq('user_id', userId).maybeSingle();
    if (dev) {
      serial = dev.serial;
      external = !!dev.kind && dev.kind !== 'sate';
    }
    const { error } = await supabase.from('sate_devices')
      .delete().eq('id', deviceId).eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  if (external && serial) {
    const { error } = await supabase.from('sate_external_device_optouts')
      .upsert({ user_id: userId, serial }, { onConflict: 'user_id,serial' });
    // A failed opt-out means the row comes back on the next poll. Surface it
    // rather than reporting a delete that will visibly undo itself.
    if (error) throw new Error(error.message);
  }
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
  // Must match cf-processor's STUCK_MINUTES (90). This one drives the operator's EMAIL
  // alerts, so a smaller number here means being paged about jobs that are simply still
  // running — and an alert that cries wolf is one nobody reads when it is real.
  const STUCK_MS = 90 * 60 * 1000;
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
  // Must match cf-processor's STUCK_MINUTES (90). If this is the SMALLER of the two, the
  // admin page calls a job stuck while the container is still legitimately working on it.
  const STUCK_MS = 90 * 60 * 1000;

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

// ---- [v38] Processing monitor ---------------------------------------------------------------

// Must match cf-processor STUCK_MINUTES (90) — see the THREE-copies note in CLAUDE.md.
const PROC_STUCK_MS = 90 * 60 * 1000;
const takeSeconds = (r: any) => (r.audio_seconds ?? Math.max((r.bytes || 0) - 44, 0) / 32000);
const familyOf = (serial?: string | null) => {
  const p = String(serial || '').toLowerCase().split('-')[0];
  if (p === 'sate') return 'SATE recorder';
  if (p === 'pendant') return 'Pendant';
  if (p === 'plaud') return 'Plaud';
  if (/^l81\d$/.test(p)) return 'L81x';
  if (p === 'sonic') return 'SonicNote';
  return p ? p : 'unknown';
};
// "download failed: Object not found (session 1234)" and the same with another id are ONE reason.
const errorReason = (e?: string | null) => String(e || 'unknown')
  .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>').replace(/\d+(\.\d+)?/g, 'N').trim().slice(0, 120);

async function adminProcessing(supabase: any, url: URL) {
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '7', 10) || 7, 1), 30);
  const now = Date.now();
  const since = new Date(now - days * 86400_000).toISOString();
  const emails = new Map<string, string | null>();
  const email = async (id: string) => { if (!emails.has(id)) emails.set(id, await emailOf(supabase, id)); return emails.get(id); };
  const cols = 'id, user_id, device_serial, session_number, bytes, audio_seconds, status, attempts, created_at, processing_started_at, heartbeat_at, not_before, processed_at, process_error, no_text, worker_id';

  // Live: everything not finished, in the order claim_next_session would take it.
  const { data: live, error: e1 } = await supabase.from('sate_device_sessions').select(cols)
    .in('status', ['queued', 'processing']).limit(500);
  if (e1) throw new Error(e1.message);
  // A take backing off (not_before in the future) is SKIPPED by the claim until then, so it
  // goes behind everything claimable now — ordering it by rank alone shows it in a place the
  // worker will not take it from.
  const rank = (r: any) => (r.not_before && Date.parse(r.not_before) > now ? 1e15 + Date.parse(r.not_before) : 0)
    + Date.parse(r.created_at) + Math.min(takeSeconds(r), 3600) * 100;
  const liveRows = [];
  for (const r of (live || []).sort((a: any, b: any) =>
    (a.status === b.status ? rank(a) - rank(b) : a.status === 'processing' ? -1 : 1))) {
    liveRows.push({
      id: r.id, email: await email(r.user_id), device_serial: r.device_serial, family: familyOf(r.device_serial),
      session_number: r.session_number, seconds: takeSeconds(r), status: r.status, attempts: r.attempts,
      created_at: r.created_at, processing_started_at: r.processing_started_at, heartbeat_at: r.heartbeat_at,
      not_before: r.not_before, worker_id: r.worker_id,
      stuck: r.status === 'processing' && !!r.processing_started_at && now - Date.parse(r.processing_started_at) > PROC_STUCK_MS,
    });
  }

  // Unresolved errors (any age — an error never clears by itself).
  const { data: errs, error: e2 } = await supabase.from('sate_device_sessions').select(cols)
    .eq('status', 'error').order('created_at', { ascending: false }).limit(300);
  if (e2) throw new Error(e2.message);
  const errorRows = [];
  const reasons = new Map<string, number>();
  for (const r of errs || []) {
    const k = errorReason(r.process_error);
    reasons.set(k, (reasons.get(k) || 0) + 1);
    errorRows.push({ id: r.id, email: await email(r.user_id), device_serial: r.device_serial, family: familyOf(r.device_serial),
      session_number: r.session_number, seconds: takeSeconds(r), attempts: r.attempts, created_at: r.created_at,
      process_error: r.process_error });
  }

  // Window stats, paged (a day can be thousands of rows).
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('sate_device_sessions')
      .select('status, created_at, processed_at, bytes, audio_seconds, device_serial, no_text')
      .gte('created_at', since).order('created_at', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000 || rows.length >= 50000) break;
  }
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const done = rows.filter((r) => r.status === 'done');
  const turn = done.filter((r) => r.processed_at).map((r) => (Date.parse(r.processed_at) - Date.parse(r.created_at)) / 1000)
    .filter((x) => x >= 0).sort((a, b) => a - b);
  const pct = (q: number) => (turn.length ? turn[Math.min(turn.length - 1, Math.floor(q * turn.length))] : null);
  const perDay = new Map<string, { done: number; error: number; no_text: number; seconds: number }>();
  for (let d = 0; d < days; d++) perDay.set(new Date(now - (days - 1 - d) * 86400_000).toISOString().slice(0, 10), { done: 0, error: 0, no_text: 0, seconds: 0 });
  const perFamily = new Map<string, { done: number; error: number; pending: number; seconds: number }>();
  for (const r of rows) {
    const day = perDay.get(String(r.created_at).slice(0, 10));
    const fam = familyOf(r.device_serial);
    if (!perFamily.has(fam)) perFamily.set(fam, { done: 0, error: 0, pending: 0, seconds: 0 });
    const f = perFamily.get(fam)!;
    if (r.status === 'done') { f.done++; f.seconds += takeSeconds(r); if (day) { day.done++; day.seconds += takeSeconds(r); if (r.no_text) day.no_text++; } }
    else if (r.status === 'error') { f.error++; if (day) day.error++; }
    else f.pending++;
  }
  const { data: last } = await supabase.from('sate_device_sessions').select('processed_at')
    .not('processed_at', 'is', null).order('processed_at', { ascending: false }).limit(1);
  const finished = count('done') + count('error');

  return json({
    generated_at: new Date(now).toISOString(),
    days,
    live: liveRows,
    errors: errorRows,
    error_reasons: [...reasons.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    stats: {
      uploaded: rows.length, done: count('done'), error: count('error'),
      queued: liveRows.filter((r) => r.status === 'queued').length,
      processing: liveRows.filter((r) => r.status === 'processing').length,
      stuck: liveRows.filter((r) => r.stuck).length,
      no_text: done.filter((r) => r.no_text).length,
      success_rate: finished ? count('done') / finished : null,
      audio_seconds_done: done.reduce((t, r) => t + takeSeconds(r), 0),
      queue_seconds: liveRows.filter((r) => r.status === 'queued').reduce((t, r) => t + r.seconds, 0),
      oldest_queued_at: liveRows.filter((r) => r.status === 'queued').map((r) => r.created_at).sort()[0] ?? null,
      turnaround_p50_s: pct(0.5), turnaround_p90_s: pct(0.9),
      worker_last_finished_at: last?.[0]?.processed_at ?? null,
      unresolved_errors: errorRows.length,
    },
    per_day: [...perDay.entries()].map(([day, v]) => ({ day, ...v })),
    per_family: [...perFamily.entries()].map(([family, v]) => ({ family, ...v,
      success_rate: v.done + v.error ? v.done / (v.done + v.error) : null })).sort((a, b) => (b.done + b.error) - (a.done + a.error)),
  });
}

async function adminRecorders(supabase: any) {
  const emails = new Map<string, string | null>();
  const email = async (id: string) => { if (!emails.has(id)) emails.set(id, await emailOf(supabase, id)); return emails.get(id); };
  const { data: devs, error: e1 } = await supabase.from('sate_devices')
    .select('id, serial, hw_serial, kind, name, user_id, created_at, online, last_seen, fw');
  if (e1) throw new Error(e1.message);
  const { data: outs, error: e2 } = await supabase.from('sate_external_device_optouts').select('user_id, serial');
  if (e2) throw new Error(e2.message);
  const sess: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('sate_device_sessions')
      .select('device_serial, user_id, created_at, hw_serial').order('created_at', { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    sess.push(...(data || []));
    if (!data || data.length < 1000 || sess.length >= 200000) break;
  }

  // [v39] Which serials are one physical unit: any serial seen with a hw_serial (on a session or a
  // registration) is keyed by it, so an L81x used from Android and from iPhones is ONE row.
  const hwOfSerial = new Map<string, string>();
  for (const d of devs || []) if (d.serial && hwSerialOf(d.hw_serial)) hwOfSerial.set(d.serial, d.hw_serial);
  for (const r of sess) if (r.device_serial && hwSerialOf(r.hw_serial) && !hwOfSerial.has(r.device_serial)) hwOfSerial.set(r.device_serial, r.hw_serial);
  // [v40] Links reported on connect win over everything (they are the unit's own answer), and name it.
  const { data: links } = await supabase.from('sate_device_serial_units').select('serial, hw_serial, unit:sate_device_units(name)');
  const unitName = new Map<string, string>();
  for (const l of links || []) { hwOfSerial.set(l.serial, l.hw_serial); if (l.unit?.name) unitName.set(l.hw_serial, l.unit.name); }
  const keyOf = (serial: string) => (hwOfSerial.has(serial) ? `hw:${hwOfSerial.get(serial)}` : serial);
  type Use = { user_id: string; uploads: number; last_upload: string | null; registered_at: string | null; released: boolean };
  const units = new Map<string, { serial: string; serials: Set<string>; kind: string | null; name: string | null; hw_serial: string | null;
    online: boolean; last_seen: string | null; fw: string | null; regs: any[]; uses: Map<string, Use> }>();
  const unit = (serial: string) => {
    const k = keyOf(serial);
    if (!units.has(k)) units.set(k, { serial, serials: new Set(), kind: null, name: null, hw_serial: hwOfSerial.get(serial) ?? null, online: false, last_seen: null, fw: null, regs: [], uses: new Map() });
    const u = units.get(k)!;
    u.serials.add(serial);
    return u;
  };
  const use = (u: ReturnType<typeof unit>, uid: string) => {
    if (!u.uses.has(uid)) u.uses.set(uid, { user_id: uid, uploads: 0, last_upload: null, registered_at: null, released: false });
    return u.uses.get(uid)!;
  };
  for (const d of devs || []) {
    if (!d.serial) continue;
    const u = unit(d.serial);
    u.kind = u.kind || d.kind; u.name = u.name || d.name; u.hw_serial = u.hw_serial || d.hw_serial;
    u.online = u.online || !!d.online;
    if (d.last_seen && (!u.last_seen || d.last_seen > u.last_seen)) u.last_seen = d.last_seen;
    u.fw = u.fw || d.fw;
    u.regs.push(d);
    if (d.user_id) { const x = use(u, d.user_id); if (!x.registered_at || d.created_at < x.registered_at) x.registered_at = d.created_at; }
  }
  for (const r of sess) {
    if (!r.device_serial || !r.user_id) continue;
    const x = use(unit(r.device_serial), r.user_id);
    x.uploads++;
    if (!x.last_upload || r.created_at > x.last_upload) x.last_upload = r.created_at;
  }
  // [v40] A serial a phone has only CONNECTED with (no upload, no registration) is still one of the
  // unit's names on that phone — list it, so the admin sees every phone that has met the unit.
  for (const l of links || []) unit(l.serial);
  for (const o of outs || []) {
    const u = units.get(keyOf(o.serial));
    if (u?.uses.has(o.user_id)) u.uses.get(o.user_id)!.released = true;
  }

  const out = [];
  for (const u of units.values()) {
    const isRecorder = u.kind === 'sate' || (!u.kind && /^sate-/i.test(u.serial));
    let holder: string | null = null, source: string | null = null;
    if (isRecorder) {
      const r = u.regs.filter((d: any) => d.user_id).sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))[0];
      if (r) { holder = r.user_id; source = 'claimed'; }
    } else {
      const reg = u.regs.filter((d: any) => d.user_id && d.kind && d.kind !== 'sate')
        .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : 1))[0];
      if (reg) { holder = reg.user_id; source = 'registered'; }
      else {
        const up = [...u.uses.values()].filter((x) => x.uploads && !x.released)
          .sort((a, b) => ((a.last_upload || '') < (b.last_upload || '') ? 1 : -1))[0];
        if (up) { holder = up.user_id; source = 'uploads'; }
      }
    }
    const accounts = [];
    for (const x of [...u.uses.values()].sort((a, b) => ((a.last_upload || a.registered_at || '') < (b.last_upload || b.registered_at || '') ? 1 : -1))) {
      accounts.push({ ...x, email: await email(x.user_id), holder: x.user_id === holder });
    }
    const active = accounts.filter((a) => !a.released);
    const lastUpload = accounts.map((a) => a.last_upload).filter(Boolean).sort().pop() || null;
    out.push({
      serial: u.serial, serials: [...u.serials], family: familyOf(u.serial), kind: u.kind,
      name: (u.hw_serial && unitName.get(u.hw_serial)) || u.name, hw_serial: u.hw_serial,
      online: u.online, last_seen: u.last_seen, fw: u.fw,
      holder_id: holder, holder_email: holder ? await email(holder) : null, holder_source: source,
      shared: active.length > 1, accounts, uploads: accounts.reduce((n, a) => n + a.uploads, 0),
      last_activity: [u.last_seen, lastUpload].filter(Boolean).sort().pop() || null,
    });
  }
  out.sort((a, b) => (a.last_activity || '') < (b.last_activity || '') ? 1 : -1);
  return json({ generated_at: new Date().toISOString(), recorders: out });
}

async function adminIds(req: Request): Promise<string[] | null> {
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string' && x.length <= 64) : [];
  return ids.length && ids.length <= 100 ? [...new Set<string>(ids)] : null;
}

// Same effect as the owner's Retry (retrySession): only a FAILED take, attempts reset, and the
// failure being retried is written to sate_session_audit first — with who pressed the button.
async function adminRetrySessions(supabase: any, admin: any, req: Request) {
  const ids = await adminIds(req);
  if (!ids) return err('ids: 1-100 session ids required', 400);
  const retried: string[] = [], skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const { data: row } = await supabase.from('sate_device_sessions')
      .select('id, user_id, status, process_error, attempts').eq('id', id).maybeSingle();
    if (!row) { skipped.push({ id, reason: 'not found' }); continue; }
    if (row.status !== 'error') { skipped.push({ id, reason: `status is ${row.status}` }); continue; }
    await auditSession(supabase, id, row.user_id, 'retry', {
      previous_error: row.process_error, previous_attempts: row.attempts, previous_status: row.status,
      by_admin: admin.email ?? admin.id,
    });
    // `.eq('status','error')` again: a row that changed under us is left alone.
    const { data: upd, error } = await supabase.from('sate_device_sessions')
      .update({ status: 'queued', process_error: null, attempts: 0, not_before: null, processing_started_at: null })
      .eq('id', id).eq('status', 'error').select('id');
    if (error) throw new Error(error.message);
    if (upd?.length) retried.push(id); else skipped.push({ id, reason: 'changed meanwhile' });
  }
  return json({ retried, skipped });
}

// What requeue_stale_sessions does, on demand — and ONLY for a take already past the stuck
// cutoff, so it can never yank a job out from under a worker that is legitimately on it.
async function adminRequeueStuck(supabase: any, admin: any, req: Request) {
  const ids = await adminIds(req);
  if (!ids) return err('ids: 1-100 session ids required', 400);
  const cutoff = new Date(Date.now() - PROC_STUCK_MS).toISOString();
  const requeued: string[] = [], skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const { data: row } = await supabase.from('sate_device_sessions')
      .select('id, user_id, status, processing_started_at, attempts, worker_id').eq('id', id).maybeSingle();
    if (!row) { skipped.push({ id, reason: 'not found' }); continue; }
    if (row.status !== 'processing' || !row.processing_started_at || row.processing_started_at >= cutoff) {
      skipped.push({ id, reason: 'not stuck' }); continue;
    }
    await auditSession(supabase, id, row.user_id, 'requeue_stuck', {
      processing_started_at: row.processing_started_at, attempts: row.attempts, worker_id: row.worker_id,
      by_admin: admin.email ?? admin.id,
    });
    const { data: upd, error } = await supabase.from('sate_device_sessions')
      .update({ status: 'queued', processing_started_at: null, not_before: null })
      .eq('id', id).eq('status', 'processing').lt('processing_started_at', cutoff).select('id');
    if (error) throw new Error(error.message);
    if (upd?.length) requeued.push(id); else skipped.push({ id, reason: 'changed meanwhile' });
  }
  return json({ requeued, skipped });
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
async function allAuthUsers(supabase: any): Promise<any[]> {
  const users: any[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    if (!data?.users?.length) break;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

/** [v35] Every recording's owner, length and whether it has a SATE report — paged (PostgREST caps a page). */
async function recordingStats(supabase: any, userId?: string) {
  const per: Record<string, { recordings: number; sate_reports: number; audio_seconds: number; last_recording_at: string | null }> = {};
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('recordings').select('user_id, duration, created_at, lsa:lsa_report->>generated_at')
      .order('id').range(from, from + 999);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const r of data || []) {
      const x = per[r.user_id] ||= { recordings: 0, sate_reports: 0, audio_seconds: 0, last_recording_at: null };
      x.recordings++;
      if (r.lsa) x.sate_reports++;
      x.audio_seconds += Number(r.duration) || 0;
      if (!x.last_recording_at || r.created_at > x.last_recording_at) x.last_recording_at = r.created_at;
    }
    if (!data || data.length < 1000) break;
  }
  return per;
}

function isBanned(u: any): boolean {
  return !!u.banned_until && Date.parse(u.banned_until) > Date.now();
}

async function adminListUsers(supabase: any) {
  const users = await allAuthUsers(supabase);
  const { data: devs } = await supabase.from('sate_devices').select('user_id');
  const deviceCount: Record<string, number> = {};
  for (const d of devs || []) deviceCount[d.user_id] = (deviceCount[d.user_id] || 0) + 1;
  const { data: admins } = await supabase.from('sate_admins').select('email');
  const adminSet = new Set((admins || []).map((a: any) => (a.email || '').toLowerCase()));
  const { data: mgrs } = await supabase.from('sate_managers').select('user_id');
  const mgrSet = new Set((mgrs || []).map((m: any) => m.user_id));
  const stats = await recordingStats(supabase);

  return json(users.map((u) => ({
    id: u.id,
    email: u.email || '',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at || null,
    devices: deviceCount[u.id] || 0,
    is_admin: adminSet.has((u.email || '').toLowerCase()),
    is_manager: mgrSet.has(u.id),
    disabled: isBanned(u),
    recordings: stats[u.id]?.recordings || 0,
    sate_reports: stats[u.id]?.sate_reports || 0,
    audio_seconds: Math.round(stats[u.id]?.audio_seconds || 0),
    last_recording_at: stats[u.id]?.last_recording_at || null,
  })).sort((a, b) => a.email.localeCompare(b.email)));
}

// ---- [v35] account management (admin) ----------------------------------------

async function adminTarget(supabase: any, admin: any, id: string) {
  if (!UUID_RE.test(id)) return { error: err('Not found', 404) };
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user) return { error: err('No such account', 404) };
  const u = data.user;
  const targetIsAdmin = await isAdmin(supabase, u.email);
  return { u, targetIsAdmin, self: id === admin.id };
}

async function adminGetUser(supabase: any, admin: any, id: string) {
  const t = await adminTarget(supabase, admin, id);
  if (t.error) return t.error;
  const [stats, pats, sess, devs, mgr] = await Promise.all([
    recordingStats(supabase, id),
    supabase.from('patients').select('id', { count: 'exact', head: true }).eq('slp_id', id),
    supabase.from('sate_device_sessions').select('id', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('sate_devices').select('id', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('sate_managers').select('user_id').eq('user_id', id).maybeSingle(),
  ]);
  const st = stats[id] || { recordings: 0, sate_reports: 0, audio_seconds: 0, last_recording_at: null };
  return json({
    id, email: t.u.email || '', created_at: t.u.created_at, last_sign_in_at: t.u.last_sign_in_at || null,
    email_confirmed_at: t.u.email_confirmed_at || null, disabled: isBanned(t.u),
    is_admin: t.targetIsAdmin, is_manager: !!mgr.data,
    stats: {
      recordings: st.recordings, sate_reports: st.sate_reports, audio_seconds: Math.round(st.audio_seconds),
      last_recording_at: st.last_recording_at, patients: pats.count || 0, sessions: sess.count || 0, devices: devs.count || 0,
    },
  });
}

const PASSWORD_MIN = 8;

async function adminCreateUser(supabase: any, admin: any, req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return err('A valid email is required', 400);
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return err(`Password must be at least ${PASSWORD_MIN} characters`, 400);
  const { data, error } = await supabase.auth.admin.createUser({ email: e, password, email_confirm: true });
  if (error) return err(error.message, 400);
  await auditAccess(supabase, admin, 'admin', data.user.id, 'account_change', 'created account');
  return json({ ok: true, id: data.user.id, email: e });
}

async function adminSetPassword(supabase: any, admin: any, id: string, req: Request) {
  const t = await adminTarget(supabase, admin, id);
  if (t.error) return t.error;
  if (t.self) return err('Change your own password from your profile', 400);
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return err(`Password must be at least ${PASSWORD_MIN} characters`, 400);
  const { error } = await supabase.auth.admin.updateUserById(id, { password });
  if (error) return err(error.message, 400);
  await auditAccess(supabase, admin, 'admin', id, 'account_change', 'password reset by admin');
  return json({ ok: true });
}

async function adminSetDisabled(supabase: any, admin: any, id: string, req: Request) {
  const t = await adminTarget(supabase, admin, id);
  if (t.error) return t.error;
  if (t.self) return err('You cannot disable your own account', 400);
  if (t.targetIsAdmin) return err('An admin cannot be disabled here — remove them from sate_admins first', 400);
  const { disabled } = await req.json().catch(() => ({}));
  // ~100 years = "until an admin re-enables it". 'none' lifts it. Data is untouched either way.
  const { error } = await supabase.auth.admin.updateUserById(id, { ban_duration: disabled ? '876000h' : 'none' });
  if (error) return err(error.message, 400);
  await auditAccess(supabase, admin, 'admin', id, 'account_change', disabled ? 'disabled account' : 're-enabled account');
  return json({ ok: true, disabled: !!disabled });
}

/** Every object under `<prefix>/` in a bucket (Storage lists one folder level at a time). */
async function listObjects(supabase: any, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const o of data) {
      const path = `${prefix}/${o.name}`;
      if (o.id === null) out.push(...await listObjects(supabase, bucket, path)); // a folder
      else out.push(path);
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function adminDeleteUser(supabase: any, admin: any, id: string, req: Request) {
  const t = await adminTarget(supabase, admin, id);
  if (t.error) return t.error;
  if (t.self) return err('You cannot delete your own account', 400);
  if (t.targetIsAdmin) return err('An admin cannot be deleted here — remove them from sate_admins first', 400);
  const { confirm_email } = await req.json().catch(() => ({}));
  if (typeof confirm_email !== 'string' || confirm_email.trim().toLowerCase() !== (t.u.email || '').toLowerCase()) {
    return err('Type the account email exactly to confirm', 400);
  }
  // Audit BEFORE: once the account is gone there is nothing left to say whose it was.
  const st = (await recordingStats(supabase, id))[id];
  await auditAccess(supabase, admin, 'admin', id, 'account_change',
    `DELETED account ${t.u.email} (${st?.recordings || 0} recordings, ${Math.round((st?.audio_seconds || 0) / 60)} min audio)`);
  // The audio is not covered by the database cascade: remove it explicitly, or it is orphaned
  // clinical audio nobody can see or delete.
  let removed = 0;
  for (const [bucket, prefix] of [['recordings', id], ['device-sessions', id], ['device-sessions', `u_${id}`]] as const) {
    const paths = await listObjects(supabase, bucket, prefix);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (!error) removed += Math.min(100, paths.length - i);
    }
  }
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) return err(`Audio removed (${removed} files) but the account could not be deleted: ${error.message}`, 500);
  return json({ ok: true, removed_files: removed });
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

async function handleSessionUpload(
  supabase: any,
  req: Request,
  subPath: string,
  // Set when the caller is a SIGNED-IN USER rather than a recorder holding a
  // device key.
  //
  // 🛑 This is what makes /sessions/chunk reachable for hardware that has no
  // `sate_devices` row and no device key — the L816/L815 handhelds, the pendant,
  // Plaud. They could only use the single-shot POST /sessions, which carries the
  // WHOLE take as base64 inside one JSON body: a 10-minute 16 kHz mono recording
  // is ~19 MB of PCM, ~26 MB once base64'd, and that dies part-way through
  // against this function's body and wall-clock limits. The take transfers off
  // the device perfectly and then cannot be handed over — which is the worst
  // place to fail, because the audio exists and nothing can be done with it.
  // The chunked path has no such ceiling and is the one the firmware has been
  // using for 118 MB sessions all along.
  asUser?: { userId: string; serial: string },
) {
  const authHeader = req.headers.get('Authorization') ?? '';
  let userId: string;
  let defaultSerial: string;
  // Root of the temp part directory. For a device it is the device row's id; for
  // a user it is the USER id and never a caller-supplied serial — the part dir is
  // a storage path, and taking it from the request would let one account write
  // parts under another account's prefix.
  let partRoot: string;
  if (asUser) {
    userId = asUser.userId;
    defaultSerial = asUser.serial;
    partRoot = `u_${asUser.userId}`;
  } else {
    const deviceId = authHeader.replace('Bearer key-', '');
    const { data: device } = await supabase.from('sate_devices')
      .select('user_id, serial').eq('id', deviceId).single();
    if (!device) return err('Device not found', 404);
    userId = device.user_id;
    defaultSerial = device.serial;
    partRoot = deviceId;
  }

  const url = new URL(req.url);

  if (subPath === '/sessions') {
    const { meta, wav: wavBytes } = await readSessionBody(req);
    return await storeSessionRecord(supabase, userId, {
      device_serial: meta.device_serial || defaultSerial,
      patient_id: meta.patient_id || 'PT',
      session_number: meta.session_number || 0,
      sample_rate: meta.sample_rate || 16000,
      flags: Array.isArray(meta.flags) ? meta.flags.filter((n: unknown) => Number.isFinite(n)) : undefined,
    }, wavBytes);
  }

  if (subPath === '/sessions/raw') {
    const wavBytes = new Uint8Array(await req.arrayBuffer());
    return await storeSessionRecord(supabase, userId, {
      device_serial: url.searchParams.get('device_serial') || defaultSerial,
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
    const partDir = `${partRoot}/_tmp/${patientId || 'PT'}/s${sessionNumber}`;
    // Zero-pad so a plain lexical sort is also numeric order.
    const partPath = `${partDir}/${String(offset).padStart(12, '0')}.part`;
    const serial = url.searchParams.get('device_serial') || defaultSerial;

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
        .eq('user_id', userId)
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
    const res = await storeSessionRecord(supabase, userId, {
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
      .remove([`${partRoot}/_tmp/s${sessionNumber}.wav`]).catch(() => {});
    return res;
  }

  return err('Unknown session endpoint', 404);
}

// ---------------------------------------------------------------------------
// Reading a `POST /sessions` body without ever holding the take more than once.
//
// 🛑 THIS IS WHY LONG RECORDINGS USED TO FAIL WITH HTTP 546 / WORKER_RESOURCE_LIMIT
// ("Function failed due to not having enough compute resources"). The old three
// lines looked harmless:
//
//     const body = await req.json();
//     const { wav_base64, ...meta } = body;
//     const wavBytes = Uint8Array.from(atob(wav_base64 || ''), c => c.charCodeAt(0));
//
// but for a ten-minute 16 kHz mono take (~19 MB of PCM, ~26 MB base64'd) they hold
// FOUR copies at once: the raw request text, the parsed object's copy of the
// base64 string, the binary string `atob` returns, and finally the byte array.
// That is upwards of 100 MB for 19 MB of audio, and the function is killed
// part-way through — which is exactly what the phone saw. The recording had
// already come off the hardware perfectly, so the audio existed and there was
// nothing to be done with it.
//
// This streams the body instead: metadata is collected as text (it is tiny), and
// the base64 value is decoded 4 characters at a time straight into ONE
// pre-sized output buffer. Peak memory is the audio itself, once.
const B64 = (() => {
  const tbl = new Int16Array(256).fill(-1);
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < A.length; i++) tbl[A.charCodeAt(i)] = i;
  return tbl;
})();

async function readSessionBody(req: Request): Promise<{ meta: any; wav: Uint8Array }> {
  if (!req.body) return { meta: {}, wav: new Uint8Array(0) };

  const declared = Number(req.headers.get('content-length') || 0);
  // 3 bytes per 4 base64 characters, and the value can never be longer than the
  // whole body — so this is an upper bound, sized once, never grown in the
  // normal case.
  let out = new Uint8Array(declared > 0 ? Math.ceil(declared * 0.75) + 16 : 1 << 20);
  let outLen = 0;
  const push = (b: number) => {
    if (outLen === out.length) {
      const bigger = new Uint8Array(out.length * 2);
      bigger.set(out);
      out = bigger;
    }
    out[outLen++] = b;
  };

  let quad = 0;
  let quadLen = 0;
  const feed = (code: number) => {
    const v = B64[code];
    if (v < 0) return;                       // whitespace, '=' padding, anything else
    quad = (quad << 6) | v;
    if (++quadLen === 4) {
      push((quad >> 16) & 255); push((quad >> 8) & 255); push(quad & 255);
      quad = 0; quadLen = 0;
    }
  };
  // A base64 string whose length is not a multiple of 4 still carries whole bytes.
  const flush = () => {
    if (quadLen === 3) { push((quad >> 10) & 255); push((quad >> 2) & 255); }
    else if (quadLen === 2) { push((quad >> 4) & 255); }
    quad = 0; quadLen = 0;
  };

  const KEY = '"wav_base64"';
  const dec = new TextDecoder();
  const reader = req.body.getReader();
  let envelope = '';
  let pending = '';
  let inValue = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    let text = pending + dec.decode(value, { stream: true });
    pending = '';
    while (text.length) {
      if (!inValue) {
        const k = text.indexOf(KEY);
        if (k < 0) {
          // Hold back enough to catch the key split across two chunks.
          const keep = Math.min(text.length, KEY.length + 8);
          envelope += text.slice(0, text.length - keep);
          pending = text.slice(text.length - keep);
          break;
        }
        // Skip past the ':' and any whitespace to the value's opening quote.
        let i = k + KEY.length;
        while (i < text.length && text[i] !== '"') i++;
        if (i >= text.length) { pending = text.slice(k); break; }
        // The envelope keeps the key with an EMPTY value, so it stays valid JSON
        // and the audio never appears in it.
        envelope += text.slice(0, k) + '"wav_base64":""';
        text = text.slice(i + 1);
        inValue = true;
      } else {
        // base64 has no escapes, so the first quote ends the value.
        const q = text.indexOf('"');
        const seg = q < 0 ? text : text.slice(0, q);
        for (let i = 0; i < seg.length; i++) feed(seg.charCodeAt(i));
        if (q < 0) { text = ''; break; }
        flush();
        text = text.slice(q + 1);
        inValue = false;
      }
    }
  }
  envelope += pending;
  if (inValue) flush();

  let meta: any = {};
  try { meta = JSON.parse(envelope || '{}'); } catch { meta = {}; }
  return { meta, wav: out.subarray(0, outLen) };
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
  meta: { device_serial: string; patient_id: string; session_number: number; sample_rate: number; flags?: number[]; hw_serial?: string | null },
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

  const sessionId = newSessionId();
  // [v24] device_serial goes into a storage PATH, and on the user-authed POST /sessions it comes
  // straight from the request body (the phone app uploads for a Plaud/BLE device that has no
  // device key). Unsanitised, a serial like "../../<other-uuid>/x" aims a SERVICE-KEY,
  // x-upsert:true write at another account's prefix. patient_id on the chunk path is already
  // stripped for exactly this reason (see partDir) — the serial was the one that got missed.
  // Only the path segment is sanitised: the ROW keeps the raw serial, because /sessions/verify
  // and the dedup probe match on the value the recorder sends.
  const storagePath = sessionStoragePath(userId, meta.device_serial, sessionId);

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

  return await insertSessionRow(supabase, userId, meta, sessionId, storagePath, wavBytes.length);
}

/** `s-1a2b3c4d`. */
function newSessionId() {
  return 's-' + crypto.randomUUID().slice(0, 8);
}

/**
 * Where a take's audio lives.
 *
 * [v24] `device_serial` goes into a storage PATH, and on the user-authed routes it comes
 * straight from the request (the phone uploads for hardware that has no device key).
 * Unsanitised, a serial like "../../<other-uuid>/x" aims a SERVICE-KEY, x-upsert:true write
 * at another account's prefix. Only the path segment is sanitised: the ROW keeps the raw
 * serial, because /sessions/verify and the dedup probe match the value the recorder sends.
 */
function sessionStoragePath(userId: string, serial: string, sessionId: string,
                            ext: 'wav' | 'asc' | 'mp3' = 'wav') {
  const segment = String(serial || '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown';
  return `${userId}/${segment}/${sessionId}.${ext}`;
}

/** The row half of storing a take, shared by every upload route: the bytes are
 *  already in Storage by the time this runs. */
async function insertSessionRow(
  supabase: any,
  userId: string,
  meta: { device_serial: string; patient_id: string; session_number: number; sample_rate: number; flags?: number[]; hw_serial?: string | null },
  sessionId: string,
  storagePath: string,
  bytes: number,
) {
  const { error: insertError } = await supabase.from('sate_device_sessions').insert({
    id: sessionId, user_id: userId, device_serial: meta.device_serial,
    patient_id: meta.patient_id, session_number: meta.session_number,
    sample_rate: meta.sample_rate, bytes, storage_path: storagePath,
    flags: meta.flags && meta.flags.length ? meta.flags : null,
    // [v39] Only when sent: an insert naming the column fails on a database without the migration.
    ...(meta.hw_serial ? { hw_serial: meta.hw_serial } : {}),
    // [v29] A RAW ASC take's `bytes` is ~7.8x smaller than the audio it holds, and
    // every screen used to turn `bytes` into a duration as if it were a WAV — a
    // 66-minute take read "8m 28s". So its length is stated here, from the frame
    // count (82 bytes = 20 ms; a SATEASC1 container's few header bytes are noise),
    // until cf-processor overwrites it with the exact figure. NULL for a WAV, whose
    // bytes still tell the truth.
    audio_seconds: storagePath.endsWith('.asc') ? Math.floor(bytes / 82) * 0.02
      // [v30] SonicNote MP3 is 32 kbps CBR = 4000 bytes/s; cf-processor writes the exact value.
      : storagePath.endsWith('.mp3') ? bytes / 4000 : null,
  });
  if (insertError) throw new Error(insertError.message);

  // Kick the AI/recordings bridge so the device session shows up exactly like a
  // manual upload (the cron sweep is the fallback if this trigger is dropped).
  triggerProcessor(sessionId);

  return json({ id: sessionId });
}

/** Size of a stored object, or null if it is not there. */
async function objectSize(supabase: any, bucket: string, path: string): Promise<number | null> {
  const cut = path.lastIndexOf('/');
  const dir = cut >= 0 ? path.slice(0, cut) : '';
  const name = cut >= 0 ? path.slice(cut + 1) : path;
  const { data } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 100 });
  const hit = data?.find((f: any) => f.name === name);
  const size = Number(hit?.metadata?.size ?? NaN);
  return Number.isFinite(size) ? size : null;
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
    .select('id, device_serial, patient_id, session_number, sample_rate, bytes, audio_seconds, created_at, processed, processed_at, recording_id, process_error, no_text, status, attempts, flags, processing_started_at, not_before, hw_serial')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (deviceSerial) query = query.eq('device_serial', deviceSerial);
  const { data, error } = await query.limit(limit);
  if (error) throw new Error(error.message);
  // [v38] Where each of MY queued takes stands in the ONE worker's line. Measured on prod: the
  // median take waits ~55 s queued but is processing for only ~7 s (19% under 4 s, faster than the
  // web's poll), so "queued → ready" with no visible "processing" is the normal sight, and the
  // wait is other people's takes ahead of it. A position (a bare number + seconds of audio ahead,
  // nothing about whose) makes that wait legible. Same order as claim_next_session.
  const mine = (data || []).filter((s: any) => s.status === 'queued');
  const pos = new Map<string, { position: number; ahead_seconds: number }>();
  if (mine.length) {
    const { data: q } = await supabase.from('sate_device_sessions')
      .select('id, created_at, audio_seconds, bytes, not_before').eq('status', 'queued').limit(2000);
    const t0 = Date.now();
    const rank = (r: any) => (r.not_before && Date.parse(r.not_before) > t0 ? 1e15 + Date.parse(r.not_before) : 0)
      + Date.parse(r.created_at) + Math.min(takeSeconds(r), 3600) * 100;
    const line = (q || []).sort((a: any, b: any) => rank(a) - rank(b));
    let ahead = 0;
    line.forEach((r: any, i: number) => { pos.set(r.id, { position: i + 1, ahead_seconds: ahead }); ahead += takeSeconds(r); });
  }
  const units = await unitsForSerials(supabase, (data || []).map((s: any) => s.device_serial));
  return json((data || []).map((s: any) => {
    const u = units.get(s.device_serial);
    return { ...s, at: s.created_at,
      ...(u ? { hw_serial: s.hw_serial ?? u.hw, unit_name: u.name } : {}),
      ...(pos.has(s.id) ? { queue_position: pos.get(s.id)!.position, queue_ahead_seconds: pos.get(s.id)!.ahead_seconds } : {}) };
  }));
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

  // [v23] Every removal below used to be fire-and-forget: `.remove([...]).catch(() => {})` plus
  // an unchecked `.delete()`. supabase-js storage does NOT throw on an API failure — it resolves
  // with { data, error } — so that `.catch` caught nothing and the error was never read. The
  // route then returned 204 and wrote an audit row asserting the audio was gone. A failed
  // deletion therefore reported success AND left an audit trail that said the clinical data was
  // destroyed when it was still sitting in the bucket, playable. An audit trail that lies is
  // worse than none, because it is the thing people check instead of looking.
  const failures: string[] = [];
  // Storage treats "already gone" as an error on some paths; that is the desired end state.
  const gone = (m?: string) => !!m && /not found|does not exist|no such/i.test(m);

  let sessionObject: 'removed' | 'absent' | 'failed' = 'absent';
  if (row.storage_path) {
    const { error } = await supabase.storage.from('device-sessions').remove([row.storage_path]);
    if (!error || gone(error.message)) sessionObject = 'removed';
    else { sessionObject = 'failed'; failures.push(`device-sessions object: ${error.message}`); }
  }

  let removedRecording: string | null = null;
  let recordingObject: 'removed' | 'absent' | 'failed' = 'absent';
  if (row.recording_id) {
    const { data: rec, error: lookupErr } = await supabase.from('recordings')
      .select('id, file_path').eq('id', row.recording_id).eq('user_id', userId).maybeSingle();
    if (lookupErr) failures.push(`recordings lookup: ${lookupErr.message}`);
    else if (rec) {
      // Object BEFORE row: the row is the only pointer to the object, so dropping it first
      // would strand the audio where nothing can find it again.
      if (rec.file_path) {
        const { error } = await supabase.storage.from('recordings').remove([rec.file_path]);
        if (!error || gone(error.message)) recordingObject = 'removed';
        else { recordingObject = 'failed'; failures.push(`recordings object: ${error.message}`); }
      }
      if (recordingObject !== 'failed') {
        const { error } = await supabase.from('recordings').delete()
          .eq('id', rec.id).eq('user_id', userId);
        if (error) failures.push(`recordings row: ${error.message}`);
        else removedRecording = rec.id;
      }
    }
  }

  // The session row is deleted LAST and only on a clean sweep. While it exists the take is
  // still listed, still auditable and the delete can simply be retried; remove it after a
  // partial failure and whatever survived becomes an orphan with no pointer to it.
  if (failures.length) {
    await auditSession(supabase, sessionId, userId, 'delete_failed', {
      device_serial: row.device_serial, session_number: row.session_number,
      session_object: sessionObject, recording_object: recordingObject,
      removed_recording: removedRecording, failures,
    });
    return err(
      `Could not fully delete this session: ${failures.join('; ')}. The session was kept so ` +
      `the delete can be retried — nothing was left orphaned.`, 500);
  }

  const { error } = await supabase.from('sate_device_sessions')
    .delete().eq('id', sessionId).eq('user_id', userId);
  if (error) throw new Error(error.message);

  await auditSession(supabase, sessionId, userId, 'delete', {
    device_serial: row.device_serial, session_number: row.session_number,
    patient_id: row.patient_id, bytes: row.bytes,
    storage_path: row.storage_path, session_object: sessionObject,
    recording_object: recordingObject, removed_recording: removedRecording,
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
