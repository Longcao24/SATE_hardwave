// L816DeviceGraphic — SVG likeness of the SATE L816: a slim dark stick recorder
// with a speaker grille, a small blue screen and a red record key. Shown on the
// web /devices page when the selected device is a paired L816 (parallels
// PlaudDeviceGraphic and PendantDeviceGraphic).
//
// It exists so an L816 does not borrow the Plaud drawing. The panel picks the
// graphic from `kind`, and before this file the fallback branch was Plaud — so
// an L816 rendered as a completely different manufacturer's device, which is a
// quiet lie in exactly the place a user goes to check WHICH recorder they are
// looking at.

interface Props {
  width?: number;
  /** Pulse a red ring while the device is recording. */
  recording?: boolean;
}

export function L816DeviceGraphic({ width = 190, recording = false }: Props) {
  const height = Math.round(width * (220 / 200));
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="SATE L816"
    >
      <defs>
        <linearGradient id="l816-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2A2F38" />
          <stop offset="45%" stopColor="#14171C" />
          <stop offset="100%" stopColor="#23272F" />
        </linearGradient>
        <linearGradient id="l816-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0C1B2A" />
          <stop offset="100%" stopColor="#06101A" />
        </linearGradient>
        <filter id="l816-shadow" x="-25%" y="-12%" width="150%" height="128%">
          <feDropShadow dx="0" dy="7" stdDeviation="9" floodColor="#0B1020" floodOpacity="0.30" />
        </filter>
      </defs>

      {recording && (
        <rect
          x="60"
          y="10"
          width="80"
          height="200"
          rx="18"
          fill="none"
          stroke="#EF4444"
          strokeWidth="3"
          opacity="0.5"
        >
          <animate attributeName="opacity" values="0.15;0.6;0.15" dur="1.6s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Body */}
      <rect
        x="68"
        y="18"
        width="64"
        height="184"
        rx="14"
        fill="url(#l816-body)"
        stroke="#3A404A"
        strokeWidth="1"
        filter="url(#l816-shadow)"
      />

      {/* Speaker grille */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x="84" y={34 + i * 7} width="32" height="3" rx="1.5" fill="#333A44" />
      ))}

      {/* Screen */}
      <rect x="80" y="72" width="40" height="34" rx="5" fill="url(#l816-screen)" stroke="#1E3852" />
      <text
        x="100"
        y="93"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        letterSpacing="0.5"
        fill="#4FB0FF"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        L816
      </text>

      {/* Record key */}
      <circle cx="100" cy="140" r="17" fill="#242932" stroke="#3C424C" />
      <circle cx="100" cy="140" r="6" fill={recording ? '#EF4444' : '#C2454A'} />

      {/* Mic port */}
      <rect x="92" y="184" width="16" height="5" rx="2.5" fill="#333A44" />
    </svg>
  );
}
