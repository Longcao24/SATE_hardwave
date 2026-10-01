// SATE Recorder device types — web-compatible port of sate-companion-main/src/protocol.ts.
// These mirror the firmware and mock-server types so the web app can manage
// the recorder fleet over the REST API (Wi-Fi path only; BLE is mobile-only).

// ---------------------------------------------------------------------------
// Device identity (read from the recorder over BLE — informational in web)
// ---------------------------------------------------------------------------

export interface DeviceIdentity {
  model: string;
  fw: string;
  serial: string;
  provisioned: boolean;
}

// ---------------------------------------------------------------------------
// Managed device — as the server sees it (GET /api/devices)
// ---------------------------------------------------------------------------

/** Live activity the recorder reports in its heartbeat. */
export type DeviceLiveState = 'idle' | 'recording' | 'uploading';

export interface ManagedDevice {
  id: string;
  name: string;
  serial: string;
  fw: string;
  /** Device family. 'sate' = ESP32-S3 recorder (default); 'plaud' = a paired
   *  Plaud NotePin/NotePro; 'pendant' = a SATE Pendant; 'l816' = a SATE L816 or L815
   *  handheld. Everything except 'sate' is an EXTERNAL device with no
   *  `sate_devices` row, so it can't be commanded or OTA'd from the web.
   *
   *  Populated by device-api >=v25: the phone registers an external device when
   *  it pairs (`POST /devices/external`), and `GET /devices` backfills a row for
   *  any external serial that has uploaded sessions but was never registered.
   *  An external row is NEVER offered OTA or a remote command — it has no device
   *  key and no network of its own. Kept in step with the mobile `ManagedDevice`
   *  (src/protocol.ts) so the two unions cannot drift. */
  kind?: 'sate' | 'plaud' | 'pendant' | 'l816';
  /** [v39] Every device_serial this ONE physical unit has uploaded under (an L81x used from Android
   *  and from iPhones has several, because iOS randomises the BLE id). Absent = just `serial`. */
  serials?: string[];
  /** [v40] The unit's own serial and its ONE shared name, when a phone has reported it. */
  hw_serial?: string | null;
  unit_name?: string | null;
  /** true = device is reachable over Wi-Fi right now */
  online: boolean;
  ip?: string;
  last_seen: string; // ISO timestamp
  pending_sessions: number;
  /** Live activity, reported in the recorder's heartbeat */
  state?: DeviceLiveState;
  /** OTA phase reported by firmware: 'idle' normally, 'updating' mid-flash. */
  ota_state?: string;
  /** Battery state-of-charge % from the heartbeat; null/undefined = unknown. */
  battery_pct?: number | null;
  /** Raw cell voltage (mV) from the heartbeat, for battery calibration; null = unknown. */
  battery_mv?: number | null;
  /** Lifetime recording count from the heartbeat (survives on-device auto-trim). */
  total_recordings?: number;
  /** Clinician the recorder is assigned to (set at registration) */
  slp?: string;
  slp_id?: string;
}

// ---------------------------------------------------------------------------
// Firmware (GET /api/firmware/latest)
// ---------------------------------------------------------------------------

/** The latest firmware image the fleet should run. */
export interface FirmwareInfo {
  version: string;
  url: string;
  notes?: string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Admin (system-wide management — only for users in sate_admins)
// ---------------------------------------------------------------------------

/** A recorder as the admin sees it: a ManagedDevice plus its owner's email. */
export interface AdminDevice extends ManagedDevice {
  user_id?: string;
  owner_email?: string;
  created_at?: string;
}

/** An account in the system (admin user manager). `id` is the Supabase auth uuid — the key
 *  a per-account feature grant is written against. */
export interface AdminUser {
  id: string;
  email: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  devices: number;
  is_admin: boolean;
  // [device-api v35] — optional so an older server still type-checks
  is_manager?: boolean;
  disabled?: boolean;
  recordings?: number;
  sate_reports?: number;
  audio_seconds?: number;
  last_recording_at?: string | null;
}

/** GET /admin/users/:id (device-api v35). */
export interface AdminUserDetail {
  id: string;
  email: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  disabled: boolean;
  is_admin: boolean;
  is_manager: boolean;
  stats: {
    recordings: number;
    sate_reports: number;
    audio_seconds: number;
    last_recording_at: string | null;
    patients: number;
    sessions: number;
    devices: number;
  };
}

/** A published firmware release row (admin firmware manager). */
export interface AdminFirmware {
  id: string;
  version: string;
  url: string;
  notes?: string | null;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Uploaded sessions (GET /api/sessions)
// ---------------------------------------------------------------------------

export interface UploadedSession {
  /** Flag-button marks, ms from the start of the take. Absent on older rows. */
  flags?: number[] | null;
  id: string;
  device_serial: string;
  patient_id: string;
  session_number: number;
  sample_rate?: number;
  /** The UPLOADED size. For a raw ASC take (L81x) it is ~7.8x smaller than the
   *  audio — never derive a duration from it; use `audio_seconds`. */
  bytes: number;
  /** Real audio length (device-api v29). Null for older WAV sessions, whose
   *  `bytes` still gives the length. */
  audio_seconds?: number | null;
  /** ISO timestamp the server stored it */
  at: string;
  /** Processing state of the auto AI/recordings bridge. */
  processed?: boolean;
  processed_at?: string | null;
  /** The recordings.id once processing finishes (null while pending). */
  recording_id?: string | null;
  /** Set if processing failed. */
  process_error?: string | null;
  /** True when the AI returned no usable text: no report is created. */
  no_text?: boolean;
  /** Async pipeline state machine: queued → processing → done | error.
   *  Authoritative once the CF container is live; falls back to the legacy
   *  processed/process_error/no_text fields when absent. */
  status?: 'queued' | 'processing' | 'done' | 'error';
  /** How many times the container has claimed this session. */
  attempts?: number;
  /** When the worker claimed it (device-api v38 returns it in the list). */
  processing_started_at?: string | null;
  /** [v39] The unit's OWN serial (L81x opcode 0x01), identical on every phone. */
  hw_serial?: string | null;
  /** [v40] The unit's ONE shared name (the first phone to report it named it). */
  unit_name?: string | null;
  /** While queued: place in the ONE worker's line (1 = next) and audio ahead of it (v38). */
  queue_position?: number;
  queue_ahead_seconds?: number;
}

// ---------------------------------------------------------------------------
// Remote commands (POST /api/devices/:id/commands)
// ---------------------------------------------------------------------------

export type RemoteCommand =
  | 'sync_now'
  | 'reload_patients'
  | 'reboot'
  | 'record'
  | 'ota';

// ---------------------------------------------------------------------------
// Device-format patient (simpler than the Supabase CRM patient)
// ---------------------------------------------------------------------------

export interface DevicePatient {
  patient_id: string;
  name: string;
  age: string;
  session_type: string;
  clinician: string;
}

// ---------------------------------------------------------------------------
// User (device API auth response shape)
// ---------------------------------------------------------------------------

export interface DeviceUser {
  id: string;
  name: string;
  email: string;
}

// ---- [v38] processing monitor + all recorders -------------------------------------------
export interface ProcLiveRow {
  id: string; email: string | null; device_serial: string; family: string; session_number: number | null;
  seconds: number; status: 'queued' | 'processing'; attempts: number; created_at: string;
  processing_started_at: string | null; heartbeat_at: string | null; not_before: string | null;
  worker_id: string | null; stuck: boolean;
}
export interface ProcErrorRow {
  id: string; email: string | null; device_serial: string; family: string; session_number: number | null;
  seconds: number; attempts: number; created_at: string; process_error: string | null;
}
export interface AdminProcessing {
  generated_at: string; days: number;
  live: ProcLiveRow[]; errors: ProcErrorRow[]; error_reasons: { reason: string; n: number }[];
  stats: {
    uploaded: number; done: number; error: number; queued: number; processing: number; stuck: number;
    no_text: number; success_rate: number | null; audio_seconds_done: number; queue_seconds: number;
    oldest_queued_at: string | null; turnaround_p50_s: number | null; turnaround_p90_s: number | null;
    worker_last_finished_at: string | null; unresolved_errors: number;
  };
  per_day: { day: string; done: number; error: number; no_text: number; seconds: number }[];
  per_family: { family: string; done: number; error: number; pending: number; seconds: number; success_rate: number | null }[];
}
export interface AdminRecorder {
  serial: string; family: string; kind: string | null; name: string | null; hw_serial: string | null;
  online: boolean; last_seen: string | null; fw: string | null;
  holder_id: string | null; holder_email: string | null; holder_source: 'claimed' | 'registered' | 'uploads' | null;
  shared: boolean; uploads: number; last_activity: string | null;
  accounts: { user_id: string; email: string | null; uploads: number; last_upload: string | null;
    registered_at: string | null; released: boolean; holder: boolean }[];
}
