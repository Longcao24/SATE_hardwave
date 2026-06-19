// DeviceFrame — renders the real SATE recorder body (PNG with a transparent
// screen cutout) with live content showing through the screen. The bezel image
// sits on top (pointer-events-none) so the screen content stays interactive.

import type { ReactNode } from 'react';

// Screen cutout as a fraction of the frame image (732×1385), measured from the
// transparent region of sate-device-frame.png.
const SCREEN = { left: '16.80%', top: '18.56%', width: '66.80%', height: '52.64%' };
const FRAME_SRC = '/assets/sate-device-frame.png';

export function DeviceFrame({
  children,
  width = 200,
}: {
  children: ReactNode;
  width?: number;
}) {
  return (
    <div className="relative mx-auto" style={{ width }}>
      {/* Keep the frame's real proportions (732 × 1385). */}
      <div className="relative w-full" style={{ aspectRatio: '732 / 1385' }}>
        {/* Live screen — sits behind the bezel and shows through the cutout. */}
        <div
          className="absolute overflow-hidden bg-white"
          style={{ ...SCREEN }}
        >
          {children}
        </div>
        {/* Device bezel overlay. */}
        <img
          src={FRAME_SRC}
          alt="SATE recorder"
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
