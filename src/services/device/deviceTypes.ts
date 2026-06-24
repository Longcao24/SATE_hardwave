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
  /** true = device is reachable over Wi-Fi right now */
  online: boolean;
  ip?: string;
  last_seen: string; // ISO timestamp
  pending_sessions: number;
  /** Live activity, reported in the recorder's heartbeat */
  state?: DeviceLiveState;
  /** OTA phase reported by firmware: 'idle' normally, 'updating' mid-flash. */
  ota_state?: string;
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
  id: string;
  device_serial: string;
  patient_id: string;
  session_number: number;
  sample_rate?: number;
  bytes: number;
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
