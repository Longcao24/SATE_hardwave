-- The generated SATE Report is kept with the recording it describes, so opening the
-- report again shows the one that was already generated instead of spending another
-- 20 s and another LLM call on the same transcript.
--
-- One report per recording: regenerating replaces it. The stored object holds the
-- sample information the clinician entered, the SALT lines that were analysed, a
-- fingerprint of those lines (so a report can be shown as stale once the transcript is
-- edited underneath it) and the service's response WITHOUT its `latex` field — the web
-- app renders its own HTML and the LaTeX is ~19 KB of dead weight in every row.
--
-- No policy change: `recordings` is already RLS-scoped to its owner, and this column is
-- read and written through the same authenticated client as `flags`.

alter table public.recordings
  add column if not exists lsa_report jsonb;

comment on column public.recordings.lsa_report is
  'Generated SATE LSA report for this recording (sample info, analysed SALT lines, transcript fingerprint, service response minus latex). Null until a report is generated; replaced on regenerate.';
