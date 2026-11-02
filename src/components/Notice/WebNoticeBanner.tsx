import { AlertTriangle } from 'lucide-react';
import { useWebNotice } from '@/services/webNotice';

/** The site-wide notice (sate_web_notice), shown on every page while it is active. */
export function WebNoticeBanner() {
  const n = useWebNotice();
  if (!n?.active || !n.message) return null;
  return (
    <div role="alert" className="sticky top-0 z-[1000] w-full bg-amber-50 border-b border-amber-300 text-amber-900">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-start gap-2 text-sm">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
        <p className="leading-snug">{n.message}</p>
      </div>
    </div>
  );
}
