'use client';

/**
 * DAY 7, "Your 7-Day Reset", the screen.
 *
 * PRESENTATION ONLY. Every word on it arrives as an already-rendered
 * RenderedTrialArcClose, composed by lib/trial-arc/closeCopy.ts from the
 * stored plan and the two door addresses the page resolved. This file
 * decides nothing, reads nothing, computes no number and composes no row.
 * It is the fourth consumer of the premium closing package
 * (components/closing-screen/ClosingScreenPrimitives.tsx), not a fourth
 * implementation of it: the staged reveal, the elevated card, the checkmark
 * that draws itself, the gold sweep and the fade timings are the ones Core
 * Values Snapshot's and Life Signal Check's own closing screens, and day
 * 6's recap, already ship.
 *
 * WHAT IT REUSES, AND WHY EACH ONE IS THE RIGHT PIECE.
 *
 *   useCloseScreenReveal   The screen plays its reveal the first time she
 *   / RevealCard           reaches it and renders instantly on every later
 *                          visit, so re-reading her own close is never a
 *                          two second wait. Reduced motion always renders
 *                          instantly.
 *   CompletionMark         The checkmark and gold sweep the progress line
 *                          already draws, at the size a completion beat
 *                          wants. One implementation, two callers.
 *   IntroReveal            The completion line, typed out, exactly as the
 *                          Life Signal Check closing screen types its own
 *                          observation. One typewriter line on the screen,
 *                          and it is the short one.
 *
 * THE DOORS ARE LINKS, AND THE TAP IS A BEACON. Pressing one navigates away
 * (the booking page and the membership page are both off this app), so the
 * write rides `keepalive` through the same analytics beacon every other
 * tracker on this app uses rather than a Server Action, which would
 * re-render the whole route on the way out. "Back to Home" is recorded the
 * same way and with the same weight: choosing no door is a real outcome of
 * this screen, not an absence.
 *
 * NOTHING ON IT SAYS ACCESS IS ENDING. There is no countdown here, no
 * remaining days, no expiry and no urgency, because there is none in the
 * copy module this renders and none in the plan it renders from.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { CVS_DISPLAY_FONT, CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import { IntroReveal } from '@/components/IntroReveal';
import {
  CompletionMark,
  RevealCard,
  useCloseScreenReveal,
  useDelayedReveal,
} from '@/components/closing-screen/ClosingScreenPrimitives';
import { BackToHomeButton } from '@/components/closing-screen/BackToHomeButton';
import { sendBeacon } from '@/lib/analytics/beacon';
import type { RenderedTrialArcClose, TrialArcCloseAction } from '@/lib/trial-arc/closeTypes';

// The same shape of staging as the recap and the two closing screens.
const STEP_MS = 240;
const INTRO_DELAY_MS = 320;
const LINE_DELAY_MS = INTRO_DELAY_MS + STEP_MS;

function recordDoor(action: TrialArcCloseAction): void {
  sendBeacon({ event: 'trial_arc_close_door', door: action });
}

export function TrialArcCloseView({
  close,
  /** Scopes the "seen once, then instant" reveal. Her own composed date, so a second day genuinely replays nothing. */
  revealKey,
}: {
  close: RenderedTrialArcClose;
  revealKey: string;
}) {
  const play = useCloseScreenReveal(`trial-arc-close:${revealKey}`);
  // Mounted rather than merely hidden, for the reason
  // ClosingScreenPrimitives documents: a typewriter that starts while its
  // card is still faded out finishes typing invisibly.
  const lineRevealed = useDelayedReveal(play, LINE_DELAY_MS);

  let step = 1;
  const nextDelay = () => INTRO_DELAY_MS + step++ * STEP_MS;

  return (
    <div className="space-y-4">
      <RevealCard play={play} delayMs={INTRO_DELAY_MS} elevated>
        <div className="flex items-center gap-3">
          <CompletionMark play={play} sizeClass="h-11 w-11" glyphPx={22} />
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
            {close.eyebrow}
          </p>
        </div>
        <h1 className={`${CVS_DISPLAY_FONT} mt-3 text-3xl leading-tight text-[#1B3A2D]`}>
          {close.heading}
        </h1>
        <div className={`${CVS_GOLD_DIVIDER} my-4`} />
        <div className="min-h-[1.5em]">
          {lineRevealed && (
            <IntroReveal
              title={close.completionLine}
              lines={[]}
              titleClassName={`${CVS_DISPLAY_FONT} text-xl leading-snug text-[#1B3A2D]`}
              storageKey={`trial-arc-close-line:${revealKey}`}
            />
          )}
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{close.completionBody}</p>
      </RevealCard>

      {close.arrivalLine && (
        <RevealCard play={play} delayMs={nextDelay()}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Where you came in
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{close.arrivalLine}</p>
        </RevealCard>
      )}

      <RevealCard play={play} delayMs={nextDelay()} elevated>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          {close.focus.label}
        </p>
        <p className={`${CVS_DISPLAY_FONT} mt-1 text-2xl leading-snug text-[#1B3A2D]`}>
          {close.focus.title}
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{close.focus.body}</p>
        {close.focus.nextStep && (
          <>
            <div className={`${CVS_GOLD_DIVIDER} my-4`} />
            <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{close.focus.nextStep}</p>
          </>
        )}
        {close.focus.cta && (
          <Link
            href={close.focus.cta.href as Route}
            className="mef-focus-ring mef-press mt-5 block w-full rounded-2xl border border-[#1B3A2D]/20 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {close.focus.cta.label}
          </Link>
        )}
      </RevealCard>

      <RevealCard play={play} delayMs={nextDelay()}>
        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{close.doorsIntro}</p>
        <div className="mt-5 space-y-5">
          {close.doors.map((door) => (
            <div key={door.door}>
              <a
                href={door.href}
                rel="noopener noreferrer"
                onClick={() => recordDoor(door.door)}
                className={
                  door.primary
                    ? 'mef-focus-ring mef-press block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]'
                    : 'mef-focus-ring mef-press block w-full rounded-2xl border border-[#1B3A2D]/20 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]'
                }
              >
                {door.label}
              </a>
              <p className="mt-2 text-[13px] leading-relaxed text-[#4F645A]">{door.body}</p>
            </div>
          ))}
        </div>

        {/* The way out, at the same weight as the doors above it rather
            than as a footnote under them (2026-09-05). Choosing no door is
            a real outcome of this screen, and it is still recorded as one:
            the beacon is unchanged, and so are its words. */}
        <div className="mt-5">
          <BackToHomeButton label={close.exitLabel} onClick={() => recordDoor('home')} />
        </div>
      </RevealCard>
    </div>
  );
}
