// DeviceFrame — renders the real SATE recorder body (PNG with a transparent
// screen cutout) with live content showing through the screen. The bezel image
// sits on top (pointer-events-none) so the screen content stays interactive.

import type { ReactNode } from 'react';

// Screen cutout as a fraction of the frame image (1024×1536), measured from the
// transparent region of device.png.
const SCREEN = { left: '26.95%', top: '20.90%', width: '45.90%', height: '43.42%' };
const FRAME_SRC = '/assets/device.png';

export function DeviceFrame({
  children,
  width = 200,
}: {
  children: ReactNode;
  width?: number;
}) {
  return (
    <div className="relative mx-auto" style={{ width }}>
      {/* Keep the frame's real proportions (1024 × 1536). */}
      <div className="relative w-full" style={{ aspectRatio: '1024 / 1536' }}>
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
