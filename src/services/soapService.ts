// SOAP Note client — talks to the `sate-soap` Cloudflare Worker (soap/ in the monorepo).
//
// The Worker, not this browser, owns the model call, the anti-fabrication validator and the
// stored versions: a draft that only existed in this tab could not be reviewed later, and a
// validator that ran in the browser could be skipped by anything that called the model directly.
// Identity is the Supabase session; the Worker reads the recording back with the caller's own
// token, so RLS — not this file — decides whose recordings can be documented.

import { supabase } from '@/lib/supabase';
import { trackAction } from './usage/tracker';
import type {
  SoapEdits,
  SoapError,
  SoapErrorCode,
  SoapInputs,
  SoapListResponse,
  SoapPatientDefaults,
  SoapPatientDefaultsResponse,
  SoapVersion,
} from './soapTypes';

// Only the production web hosts talk to the production Worker (its own D1). Every other host — a
// Vercel Preview, localhost — gets the sandbox Worker, so trying a build never writes notes into
// production. VITE_SOAP_URL overrides both (a local `wrangler dev`: http://localhost:8787).
const PROD_HOSTS = ['sate-hardware.vercel.app', 'app.sate.agency'];
export const SOAP_URL: string =
  (import.meta.env.VITE_SOAP_URL as string | undefined)
  || (typeof window !== 'undefined' && PROD_HOSTS.includes(window.location.hostname)
    ? 'https://sate-soap.longcao.workers.dev'
    : 'https://sate-soap-sandbox.longcao.workers.dev');

/** A non-2xx answer from the Worker, with its machine-readable code. */
export class SoapApiError extends Error {
  code: SoapErrorCode | 'network';
  status: number;
  retryAfter?: number;
  constructor(message: string, code: SoapErrorCode | 'network', status: number, retryAfter?: number) {
    super(message);
    this.name = 'SoapApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new SoapApiError('You are signed out. Sign in again to use SOAP notes.', 'unauthorized', 401);

  let r: Response;
  try {
    r = await fetch(`${SOAP_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch() only rejects when no response arrived at all (offline, DNS, CORS refusal).
    throw new SoapApiError('Could not reach the SOAP note service. Check your connection and try again.', 'network', 0);
  }

  if (!r.ok) {
    let err: Partial<SoapError> = {};
    try { err = await r.json(); } catch { /* not JSON — fall back to the status line */ }
    throw new SoapApiError(
      err.error || `SOAP note service error (HTTP ${r.status}).`,
      err.code || 'server_error',
      r.status,
      err.retry_after,
    );
  }
  return r.json() as Promise<T>;
}

const rid = (recordingId: string) => encodeURIComponent(recordingId);

/** The newest version for this recording (null when none) and the version list, newest first. */
export function loadSoap(recordingId: string): Promise<SoapListResponse> {
  return call<SoapListResponse>('GET', `/v1/soap/${rid(recordingId)}`);
}

/** One specific version, for the version history picker. */
export function loadSoapVersion(recordingId: string, version: number): Promise<SoapVersion> {
  return call<SoapVersion>('GET', `/v1/soap/${rid(recordingId)}/${version}`);
}

/** Usage analytics: one 'soap:generate' per draft produced, 'soap:failed' otherwise. */
export async function generateSoap(recordingId: string, inputs: SoapInputs): Promise<SoapVersion> {
  try {
    const v = await call<SoapVersion>('POST', `/v1/soap/${rid(recordingId)}/generate`, { inputs });
    trackAction('soap:generate');
    return v;
  } catch (e) {
    trackAction('soap:failed');
    throw e;
  }
}

/**
 * The clinician's edits, stored BESIDE the draft. Always the complete edits object for that
 * version (not a patch): the Worker replaces what it has, so "revert this section" is simply an
 * edits object without that key.
 */
export function saveSoapEdits(recordingId: string, version: number, edits: SoapEdits): Promise<SoapVersion> {
  return call<SoapVersion>('PUT', `/v1/soap/${rid(recordingId)}/${version}/edits`, { edits });
}

const pid = (patientId: string) => encodeURIComponent(patientId);

/**
 * This clinician's SOAP defaults for one patient, plus the inputs of their newest reviewed note
 * for that patient (the fallback prefill). The Worker checks the patient is visible to the caller
 * through RLS first, so a patient id from another account is a 404, not an empty answer.
 */
export function loadPatientDefaults(patientId: string): Promise<SoapPatientDefaultsResponse> {
  return call<SoapPatientDefaultsResponse>('GET', `/v1/soap/patients/${pid(patientId)}/defaults`);
}

/** REPLACES the stored defaults (a blank field is cleared; all blank deletes them). */
export function savePatientDefaults(patientId: string, defaults: SoapPatientDefaults): Promise<SoapPatientDefaultsResponse> {
  return call<SoapPatientDefaultsResponse>('PUT', `/v1/soap/patients/${pid(patientId)}/defaults`, { defaults });
}
