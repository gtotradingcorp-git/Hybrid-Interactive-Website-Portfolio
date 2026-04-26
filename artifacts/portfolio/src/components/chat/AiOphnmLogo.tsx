import React from "react";

interface AiOphnmLogoProps {
  className?: string;
  title?: string;
  /**
   * When true, the logo is treated as decorative — no role/label/title is
   * exposed to assistive tech. Use this when an adjacent label or the
   * parent control already announces "AI OPHNM".
   */
  decorative?: boolean;
}

export function AiOphnmLogo({
  className,
  title = "AI OPHNM",
  decorative = false,
}: AiOphnmLogoProps) {
  const gid = React.useId();
  const goldId = `ai-ophnm-gold-${gid}`;
  const baseId = `ai-ophnm-base-${gid}`;
  const strokeId = `ai-ophnm-stroke-${gid}`;
  return (
    <svg
      viewBox="0 0 64 64"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      focusable="false"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {!decorative && <title>{title}</title>}
      <defs>
        <linearGradient id={baseId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="55%" stopColor="#141414" />
          <stop offset="100%" stopColor="#1f1a10" />
        </linearGradient>
        <linearGradient id={goldId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7e7a4" />
          <stop offset="45%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#8a6a14" />
        </linearGradient>
        <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8c768" />
          <stop offset="100%" stopColor="#7a5a10" />
        </linearGradient>
      </defs>

      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="14"
        ry="14"
        fill={`url(#${baseId})`}
        stroke={`url(#${strokeId})`}
        strokeWidth="2"
      />

      <g fill={`url(#${goldId})`}>
        {/* Stylized "A" — diagonal strokes + crossbar */}
        <path d="M14 44 L22 18 L26 18 L19 44 Z" />
        <path d="M30 44 L22 18 L26 18 L34 44 Z" />
        <rect x="19.5" y="33" width="9" height="3" rx="0.5" />
        {/* Stylized "I" — slim serif column */}
        <rect x="40" y="18" width="8" height="3.5" rx="0.5" />
        <rect x="42.5" y="21" width="3" height="20" rx="0.5" />
        <rect x="40" y="40.5" width="8" height="3.5" rx="0.5" />
      </g>
    </svg>
  );
}
