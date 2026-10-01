// Oversight: READ-ONLY viewing of another account, for admins (any account) and managers
// (the accounts an admin assigned them). device-api v34 /oversight/* and /admin/managers*.
//
// 🛑 This service has NO write to another account's data — there is no such route on the
// server either. Every read is checked per target and audited (sate_access_audit) there.

import { supabase } from '@/lib/supabase';

export type OversightRole = 'admin' | 'manager' | 'none';
export interface OversightTarget { id: string; email: string | null }
export interface OversightMe { role: OversightRole; targets: OversightTarget[] }

export interface OversightRecordingRow {
  id: string;
  recording_name: string | null;
  file_name: string | null;
  created_at: string;
  updated_at: string | null;
  duration: number | null;
  patient_id: string | null;
  protocol: string | null;
  needs_review: boolean | null;
  segments_edited: boolean | null;
  version: number | null;
  source_session_id: string | null;
}

export interface OversightExportMeta {
  id: string;
  recording_name: string | null;
  file_name: string | null;
  created_at: string;
  duration: number | null;
  patient_id: string | null;
}

export interface ManagerRow {
  id: string;
  email: string | null;
  since: string;
  /** Emailed when an assigned account uploads a new report (device-api v36). */
  notify_email?: boolean;
  members: { id: string; email: string | null; since: string }[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/device-api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(anonKey ? { apikey: anonKey } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = body;
    try { msg = JSON.parse(body).error || body; } catch { /* plain text */ }
    throw new Error(`${res.status} ${msg || res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const oversightService = {
  /** Never throws: an old server (no /oversight) or a network error simply means "no role". */
  async me(): Promise<OversightMe> {
    try { return await req<OversightMe>('/oversight/me'); }
    catch { return { role: 'none', targets: [] }; }
  },
  recordings: (uid: string) => req<OversightRecordingRow[]>(`/oversight/users/${uid}/recordings`),
  recording: (uid: string, rid: string) => req<Record<string, any> & { audio_url: string | null }>(`/oversight/users/${uid}/recordings/${rid}`),
  patients: (uid: string) => req<Record<string, any>[]>(`/oversight/users/${uid}/patients`),
  sessions: (uid: string) => req<Record<string, any>[]>(`/oversight/users/${uid}/sessions`),
  devices: (uid: string) => req<Record<string, any>[]>(`/oversight/users/${uid}/devices`),
  /** Export one report (device-api v37) — role-checked and audited server-side like a view. */
  exportAudio: (uid: string, rid: string) =>
    req<{ recording: OversightExportMeta; file_name: string; url: string; expires_in: number }>(`/oversight/users/${uid}/recordings/${rid}/export/audio`),
  exportLsa: (uid: string, rid: string) =>
    req<{ recording: OversightExportMeta; lsa_report: any }>(`/oversight/users/${uid}/recordings/${rid}/export/lsa`),
  exportMetrics: (uid: string, rid: string) =>
    req<{ recording: OversightExportMeta; transcript: { segments?: any[] } | null; error_counts: any }>(`/oversight/users/${uid}/recordings/${rid}/export/metrics`),

  // ---- admin: managers ----
  listManagers: () => req<ManagerRow[]>('/admin/managers'),
  addManager: (email: string) => req<{ ok: true; id: string }>('/admin/managers', { method: 'POST', body: JSON.stringify({ email }) }),
  removeManager: (id: string) => req<void>(`/admin/managers/${id}`, { method: 'DELETE' }),
  assignMember: (managerId: string, email: string) =>
    req<{ ok: true; id: string }>(`/admin/managers/${managerId}/members`, { method: 'POST', body: JSON.stringify({ email }) }),
  setManagerNotify: (managerId: string, enabled: boolean) =>
    req<{ ok: true }>(`/admin/managers/${managerId}/notify`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  unassignMember: (managerId: string, memberId: string) =>
    req<void>(`/admin/managers/${managerId}/members/${memberId}`, { method: 'DELETE' }),
};
