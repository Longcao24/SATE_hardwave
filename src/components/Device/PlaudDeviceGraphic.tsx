// PlaudDeviceGraphic — a clean SVG likeness of the Plaud NotePro shown on the
// web /devices page when the selected device is a paired Plaud. Redrawn from the
// product photo: dark fluted card, black top bar with the PLAUD wordmark + round
// capture button, and the small rotated PLAUD mark near the bottom-left.

interface Props {
  /** Rendered width in px (height follows the device's ~0.66 aspect). */
  width?: number;
  /** Pulse the capture button red while recording. */
  recording?: boolean;
}

export function PlaudDeviceGraphic({ width = 190, recording = false }: Props) {
  const height = Math.round(width * (300 / 200));
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Plaud NotePro recorder"
    >
      <defs>
        {/* Body sheen: slightly lighter at the top, deeper at the bottom. */}
        <linearGradient id="plaud-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3c3f45" />
          <stop offset="1" stopColor="#26282c" />
        </linearGradient>
        {/* Black header bar. */}
        <linearGradient id="plaud-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1c1f" />
          <stop offset="1" stopColor="#26282b" />
        </linearGradient>
        {/* One convex rib: dark edges, highlit centre — tiled to make the flutes. */}
        <linearGradient id="plaud-rib" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#232529" />
          <stop offset="0.5" stopColor="#42464d" />
          <stop offset="1" stopColor="#232529" />
        </linearGradient>
        <pattern id="plaud-ribs" width="18" height="1" patternUnits="userSpaceOnUse">
          <rect x="0.5" y="0" width="16" height="300" rx="2" fill="url(#plaud-rib)" />
        </pattern>
        {/* Round the flutes to the body's silhouette. */}
        <clipPath id="plaud-clip">
          <rect x="12" y="8" width="176" height="284" rx="22" />
        </clipPath>
        <filter id="plaud-shadow" x="-20%" y="-15%" width="140%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="9" floodColor="#0b0c0e" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Body */}
      <rect
        x="12"
        y="8"
        width="176"
        height="284"
        rx="22"
        fill="url(#plaud-body)"
        filter="url(#plaud-shadow)"
      />

      {/* Fluted texture (clipped to the body, kept below the header) */}
      <g clipPath="url(#plaud-clip)">
        <rect x="12" y="62" width="176" height="230" fill="url(#plaud-ribs)" />
      </g>

      {/* Header bar — top corners rounded, flat bottom */}
      <path
        d="M12 30 A22 22 0 0 1 34 8 H166 A22 22 0 0 1 188 30 V62 H12 Z"
        fill="url(#plaud-head)"
      />
      <line x1="12" y1="62" x2="188" y2="62" stroke="#101113" strokeWidth="1" />

      {/* PLAUD wordmark (stylised A = up-triangle, matching the logo) */}
      <g fill="#ececed" fontFamily="Inter, Arial, sans-serif" fontSize="17" fontWeight="700" letterSpacing="1.5">
        <text x="42" y="40">PL</text>
        {/* triangular "A" — the Plaud logo mark, kept tight to the letters */}
        <path d="M70 40 L75.5 28 L81 40 Z" />
        <text x="82" y="40">UD</text>
      </g>

      {/* Capture button */}
      <circle cx="164" cy="35" r="13" fill="#202225" stroke="#4c4f55" strokeWidth="1.5" />
      <circle cx="164" cy="35" r="7" fill={recording ? "#ef4444" : "#2c2f34"} />
      {recording && (
        <circle cx="164" cy="35" r="13" fill="none" stroke="#ef4444" strokeWidth="1.5">
          <animate attributeName="r" values="10;15;10" dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0;0.8" dur="1.4s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Rotated PLAUD near the bottom-left */}
      <text
        transform="translate(30 274) rotate(-90)"
        fill="#5a5d63"
        fontFamily="Inter, Arial, sans-serif"
        fontSize="9"
        fontWeight="700"
        letterSpacing="2"
      >
        PLAUD
      </text>
    </svg>
  );
}
