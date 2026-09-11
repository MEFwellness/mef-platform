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
 * =====================================================================
 * IT ARRIVES WHOLE. (2026-09-11, found on a real phone)
 * =====================================================================
 *
 * The first version staggered its own parts: the heading carried
 * `animation-delay: 160ms` and the line under it `380ms`, both starting
 * from opacity 0. On a desktop that reads as a considered reveal. On a
 * phone, inside a beat that is only 1250ms long, it reads as a screen
 * that has not finished loading: a lone check mark on an empty panel, a
 * heading appearing a moment later, a sentence appearing after that, and
 * a member watching a screen assemble itself instead of reading it.
 *
 * So the rule for this screen is now the strict one. **Every element is
 * laid out and occupying its final box in the first frame, and the only
 * thing that ever animates is how it is painted inside that box.** One
 * fade, on the group, with no per element delay, so the three parts are
 * one statement rather than three arrivals. Nothing here starts at a
 * different time from anything else here.
 *
 * NO LAYOUT SHIFT EITHER. The panel's height is fixed by `min-h-[220px]`
 * and every element inside it is present from the first frame, so nothing
 * appearing can push anything down. The gold line's TRACK is drawn
 * immediately at its full width and the sweep happens inside it, which is
 * why the sweep is not a layout change.
 *
 * AND IT NEVER WAITS ON A FONT. The heading is Cormorant Garamond, which
 * is a `next/font` face preloaded in the document head and already painted
 * on every section screen this beat can follow, so it is in the browser's
 * cache long before this screen exists. There is no image, no icon font
 * and no lazily imported chunk here: the check is inline SVG and this
 * component is a static import of the taker that shows it.
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
 * goes straight to the next screen (see `useSectionTransition`). The
 * classes below still carry their own reduced motion overrides, because a
 * caller that shows it anyway must not animate anything.
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

    This is the one thing on the screen that is deliberately not final in
    the first frame, and it is not a partial paint: the track it runs
    inside is drawn at its full width immediately, so the element is
    present and nothing moves around it.
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
      data-testid="section-transition"
      className={`mef-section-beat flex min-h-[220px] flex-col items-center justify-center px-6 py-12 text-center ${colors.surface}`}
    >
      <SuccessCheck size={40} color={colors.check} haptic={false} />

      <p
        className={`mt-5 font-[family-name:var(--font-cormorant-garamond)] text-[24px] leading-tight ${colors.heading}`}
      >
        {SECTION_COMPLETE_LABEL}
      </p>

      <p className={`mt-2 text-[14px] leading-relaxed ${colors.body}`}>{nextLine}</p>

      <div className={`mt-7 h-px w-40 overflow-hidden rounded-full ${colors.track}`}>
        <div
          className="h-full rounded-full bg-[#C4A050] transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: swept ? '100%' : '0%' }}
        />
      </div>
    </div>
  );
}
