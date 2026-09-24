// One note: player on top, then Summary / Transcript as tabs.
//
// The old version stacked tl;dr, key points, actions, highlights, chapters AND the full
// transcript into one column, so the summary — the thing this feature exists to produce — was
// pushed off-screen by the transcript on any recording longer than a minute. Tabs put both one
// click away and let each one use the full width.
//
// While audio plays the transcript follows it: the spoken line highlights and scrolls itself
// into view. Reading along was the whole reason to show a transcript next to a player.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Copy, Link2, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { NotePlayer } from './NotePlayer';
import { NoteProgress } from './NoteProgress';
import { notesApiService, isWorking, type Note, type NoteShare, type NoteSummary } from '@/services/notesApiService';
import { sessionLabel } from '@/services/recordingName';

const mmss = (s?: number | null) => {
  const v = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

export function NoteDetail({ note, onDeleted }: { note: Note; onDeleted?: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<'summary' | 'transcript'>('summary');

  // Which summary to show is a PAIR: a template (what is extracted) and a model (who wrote it).
  // A pair the note already has appears instantly; one it does not costs a single model call —
  // never a re-transcription, which is ~96% of the cost and is already paid. The model menu is
  // there so a user can compare models on their own recording.
  const defaultModel = note.models?.find((m) => m.default)?.id ?? '';
  const [tpl, setTpl] = useState(note.summary?.template || 'meeting');
  const [model, setModel] = useState(note.summary?.model || defaultModel);
  const [alt, setAlt] = useState<NoteSummary | null>(null);
  const [tplBusy, setTplBusy] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);
  // Pairs generated during this visit. `note.templates` / `note.models` were fetched before they
  // existed, so without this the menus keep offering to "generate" what was just generated.
  const [madeHere, setMadeHere] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => {
    setTpl(note.summary?.template || 'meeting');
    setModel(note.summary?.model || defaultModel);
    setAlt(null); setMadeHere(new Set()); setShareOpen(false);
  }, [note.id]);

  const load = async (nextTpl: string, nextModel: string, force = false) => {
    setTpl(nextTpl);
    setModel(nextModel);
    setTplError(null);
    if (!force && nextTpl === note.summary?.template && nextModel === note.summary?.model) {
      setAlt(null);
      return;
    }
    setTplBusy(true);
    try {
      let fresh = await notesApiService.get(note.id, nextTpl, nextModel);
      const before = force ? JSON.stringify(fresh.summary?.json ?? null) : null;
      if (!fresh.summary || force) {
        await notesApiService.summarizeAs(note.id, nextTpl, nextModel, force);
        // The generation runs in a Workflow, so poll rather than assume. A long meeting on the
        // largest model can take a few minutes; give it six before saying so.
        const changed = () => fresh.summary && (!force || JSON.stringify(fresh.summary.json) !== before);
        for (let i = 0; i < 72 && !changed(); i++) {
          await new Promise((r) => setTimeout(r, 5000));
          fresh = await notesApiService.get(note.id, nextTpl, nextModel);
        }
        if (!changed()) throw new Error('still generating — try again in a moment');
      }
      setAlt(fresh.summary!.json);
      setMadeHere((cur) => new Set(cur).add(`${nextTpl}|${nextModel}`));
    } catch (e) {
      setTplError((e as Error).message);
      setTpl(note.summary?.template || 'meeting');
      setModel(note.summary?.model || defaultModel);
      setAlt(null);
    } finally {
      setTplBusy(false);
    }
  };
  const isReadyModel = (id: string) =>
    madeHere.has(`${tpl}|${id}`) || (tpl === note.summary?.template && note.models?.find((m) => m.id === id)?.ready);

  const summary = alt ?? note.summary?.json;
  const segments = note.transcript?.segments ?? [];

  // A note still being made has no summary to show; land on the transcript, which fills in as
  // the chunks complete, rather than on an empty tab.
  useEffect(() => { setTab(summary ? 'summary' : 'transcript'); }, [note.id, Boolean(summary)]);

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed; }, [speed]);
  useEffect(() => { setAt(0); setPlaying(false); }, [note.id]);

  // The line being spoken — or, in a pause between sentences, the last one that was.
  //
  // Matching "the segment containing t" looks correct and is not: a speaker drawing breath
  // leaves a sub-second hole between segments, and for that second NOTHING is highlighted.
  // On a real recording that happens every few sentences and reads as the follow-along
  // breaking. Anchoring to the last segment that has started keeps the marker where a reader
  // expects it.
  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start <= at) idx = i; else break;
    }
    return idx;
  }, [segments, at]);

  const play = () => { const p = audioRef.current?.play(); if (p) p.catch(() => {}); };
  const seek = (s: number) => { if (audioRef.current) { audioRef.current.currentTime = s; play(); } };

  const hasContent = Boolean(summary) || segments.length > 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Top bar: where you are, and the actions on this note. Fixed, like the app's own. */}
      <header className="h-14 px-6 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
        <span className="text-sm text-gray-400">Meeting notes</span>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="text-sm font-medium text-gray-900 truncate">
          {note.title || 'Untitled recording'}
        </span>
        <div className="ml-auto flex items-center gap-2 relative">
          <button
            type="button"
            disabled={!summary}
            title={summary ? 'Share this summary by link' : 'Nothing to share until the summary is ready'}
            onClick={() => setShareOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-40"
          >
            <Link2 className="w-3.5 h-3.5" />
            Share
          </button>
          {shareOpen && summary && (
            <SharePanel noteId={note.id} template={tpl} model={model} onClose={() => setShareOpen(false)} />
          )}
          <button
            type="button"
            disabled={deleting}
            title="Delete this note"
            onClick={async () => {
              // The recording itself is untouched — this removes the note and its copy of the
              // audio. Worth saying out loud, because "delete" next to a recording reads as if
              // it might take the recording with it.
              if (!window.confirm(
                `Delete the note "${note.title || 'Untitled recording'}"?\n\n` +
                'The recording itself stays in Devices; only this note and its transcript go. ' +
                'It will not be generated again automatically.',
              )) return;
              setDeleting(true);
              try {
                await notesApiService.remove(note.id);
                onDeleted?.();
              } catch (e) {
                window.alert(`Could not delete the note: ${(e as Error).message}`);
              } finally {
                setDeleting(false);
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-500 rounded-lg hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete
          </button>
        </div>
      </header>

      {/* Player strip. Kept on both tabs, unlike the reference, because the summary's chapter
          chips seek — a control the summary itself uses cannot live on the other tab. */}
      <div className="px-6 pb-3 border-b border-gray-200 flex-shrink-0">
        <NotePlayer
          duration={note.duration_s || 0}
          at={at}
          playing={playing}
          flags={note.flags || []}
          speed={speed}
          onToggle={() => { const a = audioRef.current; if (!a) return; a.paused ? play() : a.pause(); }}
          onSeek={seek}
          onSpeed={setSpeed}
        />
      </div>

      <audio
        ref={audioRef}
        src={notesApiService.audioUrl(note)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setAt((e.currentTarget as HTMLAudioElement).currentTime)}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 pt-6">
          {note.status === 'error' ? (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {note.error || 'Processing failed'}
            </div>
          ) : isWorking(note.status) && !summary ? (
            <NoteProgress note={note} />
          ) : null}

          {hasContent && (
            <>
              {/* Tabs as plain text, the way a document switches views — not as chrome. */}
              <div className="flex items-center gap-5 text-sm">
                <Tab active={tab === 'summary'} onClick={() => setTab('summary')} disabled={!summary}>
                  Summary
                </Tab>
                <Tab active={tab === 'transcript'} onClick={() => setTab('transcript')} disabled={!segments.length}>
                  Transcript
                </Tab>

                {tab === 'summary' && note.templates?.length > 0 && (
                  <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
                    {tplBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <label className="flex items-center gap-1.5">
                      <span>Summarise as</span>
                      <select
                        value={tpl}
                        disabled={tplBusy}
                        onChange={(e) => load(e.target.value, model)}
                        className="text-xs font-medium text-gray-700 bg-transparent border-0 focus:ring-0 cursor-pointer hover:text-gray-900"
                      >
                        {note.templates.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}{t.ready || madeHere.has(`${t.key}|${model}`) ? '' : ' · generate'}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(note.models?.length ?? 0) > 0 && (
                      <label className="flex items-center gap-1.5" title="Which AI model writes the summary">
                        <span>Model</span>
                        <select
                          value={model}
                          disabled={tplBusy}
                          onChange={(e) => load(tpl, e.target.value)}
                          className="text-xs font-medium text-gray-700 bg-transparent border-0 focus:ring-0 cursor-pointer hover:text-gray-900"
                        >
                          {note.models!.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}{isReadyModel(m.id) ? '' : ' · generate'}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      disabled={tplBusy || !summary}
                      title="Write this summary again with the selected model"
                      onClick={() => load(tpl, model, true)}
                      className="flex items-center gap-1 font-medium text-gray-500 hover:text-gray-900 disabled:opacity-40"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                    </button>
                  </div>
                )}
              </div>

              {tplError && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {tplError}
                </div>
              )}

              <div className="mt-7">
                {tab === 'summary' && summary && (
                  <SummaryView note={note} summary={summary} onSeek={seek} />
                )}
                {tab === 'transcript' && (
                  <TranscriptView segments={segments} activeIndex={activeIndex} playing={playing} onSeek={seek} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Tab({ active, disabled, onClick, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`pb-1 border-b-2 transition-colors ${
        active
          ? 'border-gray-900 text-gray-900 font-semibold'
          : 'border-transparent text-gray-400 hover:text-gray-700 disabled:text-gray-300 disabled:hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A summary reads as a DOCUMENT, not a grid of cards: title, a metadata block, headings, and
 * bullets with a bold lead-in and their own sub-points. Two columns of one-line bullets looked
 * like a dashboard; meeting notes are something you read top to bottom.
 */
function SummaryView({ note, summary, onSeek }: {
  note: Note;
  summary: NonNullable<Note['summary']>['json'];
  onSeek: (s: number) => void;
}) {
  const sections = summary.sections ?? [];
  const empty = sections.length === 0 && summary.chapters.length === 0;

  return (
    <div className="pb-16">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-gray-900">
        {summary.title || note.title || 'Untitled recording'}
      </h1>

      {/* The facts we actually know, set apart from anything a model wrote. */}
      <dl className="mt-5 border-l-2 border-gray-200 pl-4 space-y-1.5 text-[15px]">
        <Meta label="Date" value={new Date(note.created_at).toLocaleString()} />
        {/* The SAME name the recording carries in the sidebar and the report — a note and
            its recording must be recognisably the same thing. */}
        <Meta label="Recording" value={`${sessionLabel(note.device_serial, note.session_number)} · ${note.device_serial}`} />
        <Meta label="Length" value={mmss(note.duration_s)} />
        {summary.meta?.location ? <Meta label="Location" value={summary.meta.location} /> : null}
        {summary.meta?.participants?.length ? (
          <Meta label="Participants" value={summary.meta.participants.join(', ')} />
        ) : null}
        {note.flags?.length > 0 && (
          <Meta label="Flagged" value={`${note.flags.length} moment${note.flags.length > 1 ? 's' : ''}`} />
        )}
      </dl>

      {summary.tldr && (
        <p className="mt-6 text-[15px] leading-relaxed text-gray-600"><Rich text={summary.tldr} /></p>
      )}

      {summary.chapters.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {summary.chapters.map((c, i) => (
            <button
              key={i}
              onClick={() => onSeek(c.at)}
              className="px-2.5 py-1 rounded-md border border-gray-200 bg-gray-50 text-[13px] text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700"
            >
              <span className="tabular-nums font-semibold mr-1.5 text-gray-400">{mmss(c.at)}</span>
              {c.title}
            </button>
          ))}
        </div>
      )}

      {sections.map((sec) => (
        <section key={sec.key} className="mt-8">
          <h2 className="text-[17px] font-semibold text-gray-900">{sec.title}</h2>
          {sec.kind === 'prose' ? (
            <div className="mt-3 space-y-3">
              {sec.items.map((it, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-gray-700"><Rich text={it.text} /></p>
              ))}
            </div>
          ) : sec.kind === 'todo' ? (
            <ul className="mt-3 space-y-2.5">
              {sec.items.map((it, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-[5px] w-4 h-4 rounded border-[1.5px] border-gray-400 shrink-0" />
                  <span className="text-[15px] leading-relaxed text-gray-700"><Rich text={it.text} /></span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-3 space-y-3">
              {sec.items.map((it, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <Lead text={it.text} />
                    {it.sub && it.sub.length > 0 && (
                      <ul className="mt-2.5 space-y-2 pl-1">
                        {it.sub.map((x, j) => (
                          <li key={j} className="flex gap-3">
                            <span className="mt-[9px] w-1.5 h-1.5 rounded-full border border-gray-400 shrink-0" />
                            <div className="min-w-0"><Lead text={x} /></div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {empty && (
        <p className="mt-8 text-[15px] text-gray-500">
          Not much was said in this recording, so there is nothing more to summarise.
        </p>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-semibold text-gray-700">{label}:</dt>
      <dd className="text-gray-500">{value}</dd>
    </div>
  );
}

/**
 * "Label: what was said" renders the label in bold, the way real notes are written. Only a
 * SHORT lead-in counts — otherwise a sentence that merely contains a colon would get half of
 * itself bolded.
 */
function Lead({ text }: { text: string }) {
  const i = text.indexOf(':');
  const label = i > 0 && i <= 60 ? text.slice(0, i) : null;
  if (!label || /[.!?]/.test(label) || label.includes('**')) {
    return <span className="text-[15px] leading-relaxed text-gray-700"><Rich text={text} /></span>;
  }
  return (
    <span className="text-[15px] leading-relaxed text-gray-700">
      <strong className="font-semibold text-gray-900">{label}:</strong>
      <Rich text={text.slice(i + 1)} />
    </span>
  );
}

/** `**bold**` inside model text. Rendered as elements, never as HTML: the text is untrusted. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\*\*[^*]+\*\*$/.test(p)
          ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>)}
    </>
  );
}

/**
 * Share by link. The link is the credential — whoever has it can read THIS summary (not the
 * transcript, not the audio) until it expires or is turned off here. So the panel says exactly
 * that, and every live link can be revoked from the same place it was made.
 */
function SharePanel({ noteId, template, model, onClose }: {
  noteId: string; template: string; model: string; onClose: () => void;
}) {
  const [shares, setShares] = useState<NoteShare[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const refresh = () => notesApiService.listShares(noteId).then(setShares).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, [noteId]);

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 1500); }
    catch { window.prompt('Copy this link:', url); }
  };
  const create = async () => {
    setBusy(true); setError(null);
    try {
      const s = await notesApiService.share(noteId, template, model, days);
      await copy(s.url);
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const revoke = async (token: string) => {
    setBusy(true);
    try { await notesApiService.revokeShare(noteId, token); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const active = (shares ?? []).filter((s) => s.active);

  return (
    <div className="absolute right-0 top-9 z-20 w-[360px] rounded-xl border border-gray-200 bg-white p-4 shadow-lg text-left">
      <div className="flex items-center">
        <h3 className="text-sm font-semibold text-gray-900">Share this summary</h3>
        <button type="button" onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
        Anyone with the link can read this summary — not the transcript or the audio — until it
        expires or you turn it off. Check it for anything that should not leave your team first.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}
          className="text-xs border border-gray-200 rounded-md px-2 py-1.5">
          <option value={1}>1 day</option>
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
        <button type="button" disabled={busy} onClick={create}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
          Create link &amp; copy
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {active.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
          {active.map((s) => (
            <li key={s.token} className="flex items-center gap-2 text-xs">
              <span className="truncate text-gray-600 flex-1" title={s.url}>…/s/{s.token.slice(0, 8)}</span>
              <span className="text-gray-400 shrink-0">
                {s.expires_at ? `until ${new Date(s.expires_at).toLocaleDateString()}` : 'no expiry'}
              </span>
              <button type="button" title="Copy link" onClick={() => copy(s.url)} className="text-gray-500 hover:text-gray-900">
                {copied === s.url ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button type="button" title="Turn this link off" disabled={busy} onClick={() => revoke(s.token)}
                className="text-gray-400 hover:text-red-600">Turn off</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TranscriptView({ segments, activeIndex, playing, onSeek }: {
  segments: Array<{ start: number; end: number; text: string }>;
  activeIndex: number;
  playing: boolean;
  onSeek: (s: number) => void;
}) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);

  // Follow the audio. Only while playing: yanking the view while someone is reading a line
  // further down would be worse than not scrolling at all.
  useEffect(() => {
    if (!playing || activeIndex < 0) return;
    rows.current[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex, playing]);

  if (!segments.length) return <p className="pt-5 text-sm text-gray-500">No transcript yet.</p>;

  return (
    <div className="pt-5">
      {segments.map((g, i) => (
        <div
          key={i}
          ref={(el) => { rows.current[i] = el; }}
          onClick={() => onSeek(g.start)}
          className={`flex gap-4 px-3 py-2 rounded-lg cursor-pointer ${
            i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
          }`}
        >
          <span className={`text-xs tabular-nums pt-1 shrink-0 w-10 ${
            i === activeIndex ? 'text-blue-700 font-semibold' : 'text-gray-400'
          }`}>
            {mmss(g.start)}
          </span>
          <p className={`leading-relaxed ${i === activeIndex ? 'text-gray-900' : 'text-gray-700'}`}>
            {g.text}
          </p>
        </div>
      ))}
    </div>
  );
}



