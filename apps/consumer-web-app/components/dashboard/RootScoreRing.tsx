/**
 * The Root Score, as a thin arc.
 *
 * WHAT THIS REPLACED (Home presentation pass, 2026-09-13). The score was
 * a 60px numeral with a `/100` beside it and a bordered change chip next
 * to that, taking the lower half of a 500px photograph, which is to say
 * it took the whole of the first screen on a phone. It is a reading, not
 * the day's action, so it is now a designed mark rather than the biggest
 * thing on the page: a 64px ring drawn once on arrival, the number inside
 * it, the change said underneath in words.
 *
 * PRESENTATION ONLY, and strictly. It is handed a score and a change that
 * `lib/scoring/service.ts` computed and `app/dashboard/page.tsx` read; it
 * calculates the arc's geometry and nothing else. No fetch, no rounding,
 * no interpretation of what the number means.
 *
 * THE ARC IS THE ONE GOLD MOMENT IN THE HERO. Gold on this screen is
 * reserved for progress and for a state that genuinely matters, and this
 * is the progress. The track behind it is the cream at low opacity, so
 * the ring reads against any of the three hero photographs.
 *
 * HOW IT DRAWS. `--mef-arc-length` and `--mef-arc-offset` are set inline
 * from the real score and animated between by `.mef-arc-draw`
 * (app/globals.css), which carries its own reduced-motion override that
 * lands the arc on its final value with no sweep. A custom property
 * substituted into `stroke-dashoffset` resolves to a length before the
 * keyframe interpolates, so this is a real animation and not a step.
 */

import { RootScoreCountUp } from './RootScoreCountUp';

const SIZE = 64;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RootScoreRing({ score }: { score: number }) {
  // The arc can never overrun its own track, whatever arrives.
  const fraction = Math.max(0, Math.min(1, score / 100));
  const offset = CIRCUMFERENCE * (1 - fraction);

  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      {/*
       * THE SCRIM, AND WHY IT IS NOT OPTIONAL. The ring sits in the
       * right-hand third of the band, and the hero's legibility wash is
       * deliberately weakest there (`heroOverlayForGreeting`, a diagonal
       * strongest at top-left so the photograph still reads as a
       * photograph). Both hero images put their light source in exactly
       * that corner, so a 3px gold arc and a cream numeral landed on the
       * brightest pixels either photo has. Measured on the evening image,
       * the arc was all but invisible. This is a soft dark disc behind
       * the ring only: it buys the contrast back without darkening the
       * band, and it moves with the ring rather than being a second wash
       * the overlay has to know about.
       */}
      <div
        className="pointer-events-none absolute -inset-2 rounded-full bg-black/30 blur-lg"
        aria-hidden="true"
      />
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
        className="relative -rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(245, 240, 228, 0.28)"
          strokeWidth={STROKE}
        />
        <circle
          className="mef-arc-draw"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#E2C583"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          style={
            {
              '--mef-arc-length': `${CIRCUMFERENCE}`,
              '--mef-arc-offset': `${offset}`,
            } as React.CSSProperties
          }
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <RootScoreCountUp
          value={score}
          className="font-[family-name:var(--font-cormorant-garamond)] text-[1.5rem] leading-none text-[#FAFAF8]"
        />
      </span>
    </div>
  );
}
