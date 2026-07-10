// PendantDeviceGraphic — SVG likeness of the SATE Pendant (Sona/Nuna): a smooth
// white pebble on a black necklace cord, lanyard hole up top, tiny mic hole at
// the bottom. Shown on the web /devices page when the selected device is a
// paired pendant (parallels PlaudDeviceGraphic).

interface Props {
  width?: number;
  /** Pulse an indigo ring while streaming/recording. */
  recording?: boolean;
}

export function PendantDeviceGraphic({ width = 190, recording = false }: Props) {
  const height = Math.round(width * (220 / 200));
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="SATE Pendant"
    >
      <defs>
        {/* Glossy white body: highlight top-left, soft grey lower-right. */}
        <radialGradient id="pendant-body" cx="0.38" cy="0.32" r="0.85">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#f2f3f5" />
          <stop offset="1" stopColor="#d7dade" />
        </radialGradient>
        <linearGradient id="pendant-cord" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2a2e" />
          <stop offset="1" stopColor="#111113" />
        </linearGradient>
        <filter id="pendant-shadow" x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="7" stdDeviation="9" floodColor="#0b0c0e" floodOpacity="0.28" />
        </filter>
      </defs>

      {/* Necklace cord — two strands rising from the lanyard hole to the top. */}
      <path d="M100 92 C 86 54 66 30 52 8" stroke="url(#pendant-cord)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M100 92 C 114 54 134 30 148 8" stroke="url(#pendant-cord)" strokeWidth="3.2" strokeLinecap="round" />

      {/* Pendant body (pebble) */}
      <ellipse
        cx="100"
        cy="128"
        rx="72"
        ry="60"
        fill="url(#pendant-body)"
        stroke="#cfd2d8"
        strokeWidth="1"
        filter="url(#pendant-shadow)"
      />
      {/* Top-left sheen */}
      <ellipse cx="78" cy="104" rx="34" ry="20" fill="#ffffff" opacity="0.55" />

      {/* Lanyard hole (cord passes through) */}
      <ellipse cx="100" cy="90" rx="8" ry="6" fill="#e7e9ec" stroke="#b9bdc4" strokeWidth="1" />
      <ellipse cx="100" cy="90.5" rx="4.5" ry="3" fill="#3a3c42" />

      {/* Mic hole */}
      <circle cx="100" cy="176" r="2.6" fill="#b3b7bf" />

      {recording && (
        <ellipse cx="100" cy="128" rx="72" ry="60" fill="none" stroke="#6366f1" strokeWidth="2">
          <animate attributeName="opacity" values="0.9;0.2;0.9" dur="1.6s" repeatCount="indefinite" />
        </ellipse>
      )}
    </svg>
  );
}
