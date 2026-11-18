import { ArrowRight, Sparkles } from 'lucide-react';

// Owner 2026-11-18: point 1.x users at web 2.0 on app.sate.agency. Same Supabase project, so the same account
// signs in there and every recording, patient and report is already there. Shown on every page, not dismissible.
const NEW_APP = 'https://app.sate.agency';

export function NewVersionBanner() {
  return (
    <div role="region" aria-label="New version of SATE" className="sticky top-0 z-[1001] w-full bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        <p className="flex items-center gap-2 leading-snug text-center">
          <Sparkles className="w-4 h-4 shrink-0 text-blue-300" aria-hidden="true" />
          <span>
            <strong className="font-semibold">SATE has a new version at app.sate.agency.</strong>{' '}
            Use the same account to log in. All your data stays the same.
          </span>
        </p>
        <a
          href={NEW_APP}
          className="inline-flex items-center gap-1.5 rounded-full bg-white text-gray-900 px-4 py-1.5 font-medium hover:bg-gray-100 whitespace-nowrap"
        >
          Open the new SATE
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
