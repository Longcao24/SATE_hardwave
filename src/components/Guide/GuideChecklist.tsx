// "Getting started" checklist (2026-11-03): a small card in the corner — not a modal — listing six hands-on tasks.
// Clicking a task starts it on the real screen; a task is ticked when the user actually did it. It opens by itself
// once (an account's first sign-in, `welcome`) and afterwards from "Guidelines".
import { CheckCircle2, ChevronRight, PlayCircle, Sparkles, X } from 'lucide-react';
import { TOURS } from './tours';

export function GuideChecklist({ welcome, doneTours, onStart, onClose }: {
  welcome: boolean; doneTours: string[]; onStart: (id: string) => void; onClose: () => void;
}) {
  const done = TOURS.filter((t) => doneTours.includes(t.id)).length;
  const all = done === TOURS.length;
  const nextId = TOURS.find((t) => !doneTours.includes(t.id))?.id;
  return (
    <div role="dialog" aria-label="Getting started"
      className="fixed z-[999] bottom-4 right-4 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-2xl border border-gray-200">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-600" /> {welcome ? 'Welcome to SATE' : 'Getting started'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {all ? 'All done — you know the basics.' : welcome ? 'Six quick tries on the real screen — a click or two each.' : 'Click a task to try it on the real screen.'}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close" data-track="Guide: close checklist">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 pt-2.5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${(done / TOURS.length) * 100}%` }} />
          </div>
          <span className="tabular-nums">{done}/{TOURS.length}</span>
        </div>
      </div>

      <ul className="px-2 py-2">
        {TOURS.map((t) => {
          const isDone = doneTours.includes(t.id);
          const isNext = t.id === nextId;
          return (
            <li key={t.id}>
              <button onClick={() => onStart(t.id)} data-track={`Guide: start ${t.id}`}
                className={`w-full text-left flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50 ${isNext ? 'bg-blue-50/70 hover:bg-blue-50' : ''}`}>
                {isDone
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  : <span className={`w-5 h-5 rounded-full border-2 shrink-0 ${isNext ? 'border-blue-500' : 'border-gray-300'}`} />}
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium ${isDone ? 'text-gray-500' : 'text-gray-900'}`}>{t.title}</span>
                  <span className="block text-xs text-gray-500 truncate">{t.summary}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-2.5">
        <a href="https://sate.agency/guideline" target="_blank" rel="noreferrer" data-track="Guide: video"
          className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
          <PlayCircle className="w-3.5 h-3.5" /> Video guide
        </a>
        <div className="flex-1" />
        <span className="text-[11px] text-gray-400">Reopen any time from “Guidelines”</span>
      </div>
    </div>
  );
}
