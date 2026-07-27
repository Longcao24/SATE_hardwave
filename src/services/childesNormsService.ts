// CHILDES normative-metrics API client.
// Returns age-windowed reference means/SDs (MLUm, MLUw) from CHILDES corpora, used by
// the Analysis tab to compare a speaker against TD norms.
//
// Calls go through the `childes-norms` Supabase edge function, which proxies the
// upstream norms service server-side and adds the CORS headers the upstream lacks — a
// direct browser fetch to it fails with "Failed to fetch".

import { supabase } from '../lib/supabase';

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
  const { data, error } = await supabase.functions.invoke('childes-norms', {
    body: {
      language: q.language ?? 'Eng-NA',
      task: q.task ?? 'narrative',
      clinical: q.clinical,
      year: q.year,
      month: q.month,
      range: q.range,
    },
  });
  if (error) throw new Error(error.message || 'Failed to fetch norms.');
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as ChildesNormsResponse;
}
