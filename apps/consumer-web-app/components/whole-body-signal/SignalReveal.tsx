'use client';

/**
 * The completion reveal. A body outline drawing itself while its signal
 * points come up, over one to two seconds, and then her results.
 *
 * IT IS A REVEAL, NOT A LOADING SPINNER. The work is already done: her
 * sitting was scored and stored by the submit that got her here, so this
 * beat is not waiting on anything. That is why it has a fixed length and a
 * button at the end of it rather than a spinner that might never stop.
 *
 * THE OUTLINE SAYS NOTHING ABOUT HER. Ten points, evenly placed on an
 * abstract figure, in one ink. Not her sections, not her Zones, not her
 * loudest area. A drawing that mapped her own answers onto a body would be
 * the practitioner layer arriving on her screen through a picture.
 *
 * aria-hidden on the drawing, because the two lines beside it say
 * everything a screen reader needs.
 */

const GOLD = '#C4A050';
const CREAM = '#F5F0E4';

/** Evenly spaced, fixed, and the same for every member. */
const POINTS: [number, number][] = [
  [60, 18],
  [60, 34],
  [44, 44],
  [76, 44],
  [60, 52],
  [60, 68],
  [48, 84],
  [72, 84],
  [50, 106],
  [70, 106],
];

export function SignalReveal() {
  return (
    <svg
      viewBox="0 0 120 128"
      className="mx-auto h-40 w-auto"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {/* One continuous abstract figure: head, spine, arms, legs. */}
      <g
        fill="none"
        stroke={CREAM}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.55"
        className="mef-wbs-reveal-outline"
        style={{ ['--mef-wbs-dash' as string]: '420' }}
      >
        <circle cx="60" cy="18" r="9" />
        <path d="M60 28 L60 72" />
        <path d="M60 38 L42 50 M60 38 L78 50" />
        <path d="M60 72 L48 106 M60 72 L72 106" />
      </g>

      {POINTS.map(([x, y], index) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r="2.6"
          fill={GOLD}
          opacity="0.85"
          className="mef-wbs-reveal-point"
          style={{ animationDelay: `${400 + index * 90}ms`, transformOrigin: `${x}px ${y}px` }}
        />
      ))}
    </svg>
  );
}
