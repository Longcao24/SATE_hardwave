import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Smartphone, X, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../lib/supabase';

// "Sign in on phone": the logged-in web user mints a one-time code (via the
// `mobile-link` edge function) and shows it as a QR + text. The mobile app
// scans/types it to get its own session. Codes expire in a few minutes.

interface CreateResp {
  code: string;
  expires_at: string;
  expires_in: number;
}

export const MobileLinkButton: React.FC<{ className?: string }> = ({ className }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? 'w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors'}
      >
        <Smartphone className="w-4 h-4" />
        Sign in on phone
      </button>
      {open && <MobileLinkModal onClose={() => setOpen(false)} />}
    </>
  );
};

const MobileLinkModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [data, setData] = useState<CreateResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const createCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: resp, error: err } = await supabase.functions.invoke('mobile-link', {
        body: { action: 'create' },
      });
      if (err) throw err;
      if ((resp as any)?.error) throw new Error((resp as any).error);
      const r = resp as CreateResp;
      setData(r);
      setSecondsLeft(r.expires_in);
    } catch (e: any) {
      setError(e?.message ?? 'Could not create a sign-in code.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Mint a code as soon as the modal opens.
  useEffect(() => {
    createCode();
  }, [createCode]);

  // Live countdown so the user knows when the code lapses.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const expired = !!data && secondsLeft <= 0;
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  // Portal to <body> so the overlay is truly full-screen and centered, instead
  // of being trapped inside the sidebar's positioned/overflow subtree (which
  // made it appear pinned to the left).
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-semibold text-gray-900 mb-1">Sign in on phone</h2>
        <p className="text-sm text-gray-600 mb-5">
          Open the SATE Companion app, choose <span className="font-medium">Quick sign-in</span>,
          then scan this QR code or type the code below.
        </p>

        <div className="flex flex-col items-center">
          {loading && <p className="text-sm text-gray-500 py-12">Generating code…</p>}

          {error && !loading && (
            <div className="py-6 text-center">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button
                onClick={createCode}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                Try again
              </button>
            </div>
          )}

          {data && !loading && !error && (
            <>
              <div className={`p-4 bg-white rounded-xl border border-gray-200 ${expired ? 'opacity-30' : ''}`}>
                <QRCodeSVG value={data.code} size={196} level="M" />
              </div>

              <div className="mt-4 text-center">
                <p className="text-2xl font-mono font-bold tracking-widest text-gray-900">
                  {data.code}
                </p>
                {expired ? (
                  <p className="text-sm text-red-600 mt-2">Code expired</p>
                ) : (
                  <p className="text-sm text-gray-500 mt-2">
                    Expires in {mm}:{ss}
                  </p>
                )}
              </div>

              <button
                onClick={createCode}
                className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg"
              >
                <RefreshCw className="w-4 h-4" />
                {expired ? 'Generate new code' : 'Regenerate'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MobileLinkModal;
