'use client';

/**
 * The beat between one section and the next.
 *
 * WHAT IT IS FOR. A questionnaire cut into screens of two or three
 * questions is a long walk, and without a marker every screen looks like
 * the one before it. This is the marker: a check, "Section complete", and
 * one line saying there is another area coming. It is over in about a
 * second and a quarter and it is not a loading screen: the save it covers
 * has already been sent, and the next screen is already built.
 *
 * IT NEVER NAMES ANYTHING IT HAS NOT BEEN GIVEN. `nextLine` is written by
 * the caller. The Body Systems Survey is answered blind, so it passes a
 * neutral sentence and no name ever reaches this component; the generic
 * questionnaire, which shows its category names on every screen anyway,
 * passes a line that names the next one. This component holds no copy
 * about what is coming and cannot leak what it was never handed.
 *
 * REDUCED MOTION SKIPS IT ENTIRELY. The honest reading of "respect reduced
 * motion" for a purely decorative pause is not to play it without motion,
 * it is not to make her wait at all. The caller checks the media query and
 * goes straight to the next screen (see `useSectionTransition`).
 */

import { useEffect, useRef, useState } from 'react';
import { SuccessCheck } from '@/components/motion/SuccessCheck';

/** About a second and a quarter, inside the 1 to 1.5 second brief. */
export const SECTION_TRANSITION_MS = 1250;

export const SECTION_COMPLETE_LABEL = 'Section complete';

/** The neutral line, for a survey whose sections are deliberately unnamed. */
export const NEUTRAL_NEXT_LINE = "Next, we'll look at another area.";

export type TransitionTone = 'light' | 'forest';

const TONE = {
  light: {
    surface: 'bg-[#F7FAF8]',
    heading: 'text-[#1B3A2D]',
    body: 'text-[#4F645A]',
    track: 'bg-[#1B3A2D]/10',
    check: '#B89340',
  },
  forest: {
    surface: 'bg-transparent',
    heading: 'text-[#F5F0E4]',
    body: 'text-[#F5F0E4]/70',
    track: 'bg-[#F5F0E4]/12',
    check: '#C4A050',
  },
} as const;

export function SectionTransition({
  tone,
  nextLine,
}: {
  tone: TransitionTone;
  nextLine: string;
}) {
  const colors = TONE[tone];
  /*
    THE LINE MOVES, IT DOES NOT SIT AT A WIDTH. Starting at 0 and setting
    the real width on the next frame is what makes the CSS transition run;
    rendering it already full would be a bar that never moved.
  */
  const [swept, setSwept] = useState(false);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    frame.current = requestAnimationFrame(() => setSwept(true));
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-[220px] flex-col items-center justify-center px-6 py-12 text-center ${colors.surface}`}
    >
      <SuccessCheck size={40} color={colors.check} haptic={false} />

      <p
        className={`mef-reveal-step mt-5 font-[family-name:var(--font-cormorant-garamond)] text-[24px] leading-tight ${colors.heading}`}
        style={{ animationDelay: '160ms' }}
      >
        {SECTION_COMPLETE_LABEL}
      </p>

      <p
        className={`mef-reveal-step mt-2 text-[14px] leading-relaxed ${colors.body}`}
        style={{ animationDelay: '380ms' }}
      >
        {nextLine}
      </p>

      <div className={`mt-7 h-px w-40 overflow-hidden rounded-full ${colors.track}`}>
        <div
          className="h-full rounded-full bg-[#C4A050] transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: swept ? '100%' : '0%' }}
        />
      </div>
    </div>
  );
}
