import { AlertCircle, Clock, Loader2, MicOff } from 'lucide-react';
import type { RecordingProcessing } from '@/hooks/useRecordings';

/**
 * Where a report saved before its upload finished processing stands (Save-first, 2026-11-02).
 * Renders nothing for an ordinary, ready recording. A failure says only "Processing failed": the cause
 * is for admins (Admin → Processing and the operator mail), the clinician gets Retry on the report page.
 */
export function ProcessingChip({ state, className = '' }: { state?: RecordingProcessing | null; className?: string }) {
  if (!state) return null;
  const s = {
    queued: { cls: 'bg-sky-50 text-sky-700 border-sky-200', icon: <Clock className="w-3 h-3" />, text: 'Queued' },
    processing: { cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: <Loader2 className="w-3 h-3 animate-spin" />, text: 'Processing' },
    failed: { cls: 'bg-red-50 text-red-700 border-red-200', icon: <AlertCircle className="w-3 h-3" />, text: 'Processing failed' },
    no_audio: { cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: <MicOff className="w-3 h-3" />, text: 'No sound in file' },
    no_speech: { cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: <MicOff className="w-3 h-3" />, text: 'No speech' },
    removed: { cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: <AlertCircle className="w-3 h-3" />, text: 'Upload removed' },
  }[state];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${s.cls} ${className}`}>
      {s.icon}{s.text}
    </span>
  );
}
