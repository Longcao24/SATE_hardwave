// CHILDES normative-metrics API client.
// Backend returns age-windowed reference means/SDs (MLUm, MLUw) from CHILDES
// corpora, used by the Analysis tab to compare a speaker against TD norms.

const BASE_URL =
  (import.meta.env.VITE_CHILDES_API_URL as string | undefined) ||
  'https://childes-metrics.ngrok.app';

export interface ChildesMetric {
  mean: number;
  sd: number;
  n: number;
}

export interface ChildesNormsResponse {
  filters: {
    language: string[] | null;
    task: string[] | null;
    clinical: string[] | null;
    year: string | null;
    month: string | null;
    range_months: number | null;
    age_window_months: [number, number] | null;
  };
  n_samples: number;
  corpora: string[];
  n_corpora: number;
  MLUm: ChildesMetric;
  MLUw: ChildesMetric;
}

export interface ChildesNormsQuery {
  language?: string; // default Eng-NA
  task?: string; // default narrative
  clinical?: string; // e.g. TD
  year: number; // mandatory
  month?: number; // optional; when omitted, whole-year window is used
  range?: number; // ± months around year;month (ignored when month omitted)
}

export async function fetchChildesNorms(
  q: ChildesNormsQuery,
): Promise<ChildesNormsResponse> {
  const params = new URLSearchParams();
  params.set('language', q.language ?? 'Eng-NA');
  params.set('task', q.task ?? 'narrative');
  if (q.clinical) params.set('clinical', q.clinical);
  params.set('year', String(q.year));
  if (q.month !== undefined && q.month !== null && !Number.isNaN(q.month)) {
    params.set('month', String(q.month));
    if (q.range !== undefined && q.range !== null && !Number.isNaN(q.range)) {
      params.set('range', String(q.range));
    }
  }
  params.set('samples', '0'); // means + counts only

  const res = await fetch(`${BASE_URL}/query?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`CHILDES norms API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as ChildesNormsResponse;
}
