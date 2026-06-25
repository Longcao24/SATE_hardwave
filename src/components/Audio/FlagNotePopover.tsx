import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Play, X, Check } from 'lucide-react';

interface FlagNotePopoverProps {
  sec: number;
  rawMs: number;
  note: string;
  /** Click coords (clientX/clientY) used to position the popup near the click. */
  position: { x: number; y: number };
  onClose: () => void;
  onSeek: () => void;
  isEditable?: boolean;
  onSave?: (rawMs: number, note: string) => void;
  onDelete?: () => void;
}

const FlagNotePopover: React.FC<FlagNotePopoverProps> = ({
  sec,
  rawMs,
  note,
  position,
  onClose,
  onSeek,
  isEditable = false,
  onSave,
  onDelete,
}) => {
  const [draft, setDraft] = useState(note);
  const [saved, setSaved] = useState(false);
  const [adjustedPos, setAdjustedPos] = useState(position);
  const [visible, setVisible] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(note); setSaved(false); }, [note]);

  // Clamp popup within viewport after first paint (same pattern as AnnotationPopup).
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const rect = popup.getBoundingClientRect();
    const pad = 12;
    let x = position.x;
    let y = position.y;
    if (x + rect.width + pad > window.innerWidth) x = window.innerWidth - rect.width - pad;
    if (y + rect.height + pad > window.innerHeight) y = window.innerHeight - rect.height - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    setAdjustedPos({ x, y });
    setVisible(true);
  }, [position]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
  };

  const commit = () => {
    if (onSave) { onSave(rawMs, draft); setSaved(true); }
  };

  // The popup lives inside a fixed inset-0 backdrop. The backdrop is the
  // containing block for the absolute popup, so left/top = clientX/clientY. ✓
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        ref={popupRef}
        className={`absolute z-50 w-72 bg-white border border-amber-200 rounded-lg shadow-xl p-4 transition-opacity duration-100 ${visible ? 'opacity-100' : 'opacity-0'}`}
        style={{ left: adjustedPos.x, top: adjustedPos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — amber dot + time + play + close */}
        <div className="flex items-center gap-2 mb-3">
          <span className="w-3 h-3 rounded-full bg-amber-500 flex-none" />
          <span className="text-sm font-semibold text-amber-800 flex-1">Flag · {fmt(sec)}</span>
          <button
            type="button"
            title="Play from here"
            onClick={() => { onSeek(); onClose(); }}
            className="text-blue-500 hover:text-blue-700 flex-none"
          >
            <Play className="w-4 h-4" />
          </button>
          <button type="button" title="Close" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-none ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View mode: note in amber highlighted box */}
        {!isEditable && note && (
          <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900 leading-relaxed">
            {note}
          </div>
        )}

        {/* View mode: no note placeholder */}
        {!isEditable && !note && (
          <p className="text-xs text-gray-400 italic">No note for this flag.</p>
        )}

        {/* Edit mode: input + save + delete */}
        {isEditable && (
          <>
            {saved && (
              <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-green-50 rounded text-xs text-green-800">
                <Check className="w-3 h-3 text-green-500 flex-none" />
                <span>{draft || '(note cleared)'}</span>
              </div>
            )}
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onClose(); }}
              placeholder="Add a note…"
              className="w-full text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:border-amber-400 mb-3"
            />
            <div className="flex items-center gap-2">
              {onSave && (
                <button type="button" onClick={commit}
                  className="flex-1 text-sm bg-amber-500 text-white rounded px-3 py-2 hover:bg-amber-600 font-medium"
                >
                  Save note
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => { onDelete!(); onClose(); }}
                  title="Delete flag"
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FlagNotePopover;
