// SATE device API client — calls the Supabase Edge Function (device-api).
// Uses the user's Supabase JWT for authentication, so device management
// is fully integrated with the web app's auth system.

import type {
  ManagedDevice,
  RemoteCommand,
  UploadedSession,
  DevicePatient,
} from './deviceTypes';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/device-api`;
}

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// ---------------------------------------------------------------------------
// Low-level HTTP helper
// ---------------------------------------------------------------------------

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Supabase Edge Functions require the apikey header
      ...(anonKey ? { apikey: anonKey } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${body || res.statusText}`);
  }
  if (res.status === 204 || res.status === 302) return undefined as T;
  return res.json();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const deviceApiService = {
  /** List all devices claimed to this account. */
  async listDevices(): Promise<ManagedDevice[]> {
    return req<ManagedDevice[]>('/devices');
  },

  /** Generate a one-time claim token for provisioning a new recorder. */
  async claimToken(): Promise<string> {
    const r = await req<{ token: string }>('/devices/claim-token', {
      method: 'POST',
    });
    return r.token;
  },

  /** Rename a device. */
  async renameDevice(id: string, name: string): Promise<void> {
    await req(`/devices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  /** Remove (unlink) a device from this account. */
  async removeDevice(id: string): Promise<void> {
    await req(`/devices/${id}`, { method: 'DELETE' });
  },

  /**
   * Queue a remote command for a recorder.
   * For "record", pass the patient the session should be tagged to.
   */
  async sendCommand(
    id: string,
    op: RemoteCommand,
    patient?: Partial<DevicePatient>
  ): Promise<void> {
    await req(`/devices/${id}/commands`, {
      method: 'POST',
      body: JSON.stringify(patient ? { op, patient } : { op }),
    });
  },

  /** List the patient roster (optionally filtered by clinician name). */
  async listPatients(slp?: string): Promise<DevicePatient[]> {
    const q = slp ? `?slp=${encodeURIComponent(slp)}` : '';
    return req<DevicePatient[]>(`/patients${q}`);
  },

  /** Replace the entire patient roster. */
  async setPatients(patients: DevicePatient[]): Promise<void> {
    await req('/patients', {
      method: 'PUT',
      body: JSON.stringify(patients),
    });
  },

  /** List uploaded sessions (optionally filtered to one device serial). */
  async listSessions(deviceSerial?: string): Promise<UploadedSession[]> {
    const q = deviceSerial ? `?device=${encodeURIComponent(deviceSerial)}` : '';
    return req<UploadedSession[]>(`/sessions${q}`);
  },

  /**
   * Get the playable audio URL for a session.
   * The Edge Function returns a 302 redirect to a Supabase Storage signed URL.
   */
  getSessionAudioUrl(sessionId: string): string {
    return `${getBaseUrl()}/sessions/${sessionId}/audio`;
  },

  /** Check if the device API is reachable and we have a valid token. */
  async healthCheck(): Promise<boolean> {
    try {
      await req<ManagedDevice[]>('/devices');
      return true;
    } catch {
      return false;
    }
  },

  /** Check if the user is authenticated (has a Supabase session). */
  async isConfigured(): Promise<boolean> {
    const token = await getAuthToken();
    return !!token;
  },
};
