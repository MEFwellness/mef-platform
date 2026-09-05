'use client';

/**
 * DAY 8 AND AFTER, the screen a prospect whose free week is complete lands
 * on.
 *
 * PRESENTATION ONLY. Every word arrives as an already-rendered
 * RenderedTrialEndedContinuation, composed by
 * lib/trial-ended/continuationCopy.ts from her stored rows and the two door
 * addresses the page resolved. This file decides nothing, reads nothing,
 * computes no number and writes no row of its own.
 *
 * IT IS THE FIFTH CONSUMER OF THE PREMIUM CLOSING PACKAGE
 * (components/closing-screen/ClosingScreenPrimitives.tsx), not a fifth
 * implementation of it. The staged reveal, the elevated card and the fade
 * timings are the ones Core Values Snapshot's and Life Signal Check's
 * closing screens, day 6's recap and day 7's close already ship.
 *
 * WHAT IS DELIBERATELY NOT ON IT.
 *
 *   No countdown, no days remaining, no expiry, no deadline, no urgency. A
 *   guard test scans every string every state can render for that
 *   vocabulary, exactly as day 7's does.
 *
 *   No link into a member surface. Every screen behind the lock would
 *   redirect her straight back here, so a button pointing at one is a loop
 *   with a label on it. The one internal link on this screen is her own
 *   stored week, which lives inside the /trial-ended subtree for that
 *   reason.
 *
 *   No typewriter. Day 7's completion beat types one line because it is a
 *   moment. This screen is somewhere she may land repeatedly, and a line
 *   that types itself out on the fourth visit is an animation charging her
 *   for something she has already read.
 *
 * THE DOORS ARE LINKS, AND THE TAP IS A BEACON, exactly as on day 7:
 * pressing one navigates off this app, so the write rides `keepalive`
 * through the shared analytics beacon rather than a Server Action, which
 * would re-render the whole route on the way out. It is fired only in the
 * states that have a stored close for it to be recorded on, and the data
 * layer keeps first tap winning, so a door she pressed on day 7 is never
 * overwritten by opening this screen again.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { CVS_DISPLAY_FONT, CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import { RevealCard, useCloseScreenReveal } from '@/components/closing-screen/ClosingScreenPrimitives';
import { sendBeacon } from '@/lib/analytics/beacon';
import type { RenderedTrialEndedContinuation } from '@/lib/trial-ended/continuationTypes';
import type { TrialArcCloseAction } from '@/lib/trial-arc/closeTypes';

const STEP_MS = 240;
const INTRO_DELAY_MS = 320;

export function TrialEndedContinuationView({
  screen,
  /** Scopes the "seen once, then instant" reveal, so a second visit renders immediately. */
  revealKey,
  /** True only when she has a stored close for a door tap to be recorded on. */
  recordDoors,
}: {
  screen: RenderedTrialEndedContinuation;
  revealKey: string;
  recordDoors: boolean;
}) {
  const play = useCloseScreenReveal(`trial-ended:${revealKey}`);

  let step = 1;
  const nextDelay = () => INTRO_DELAY_MS + step++ * STEP_MS;

  const onDoor = (door: TrialArcCloseAction) => {
    if (!recordDoors) return;
    sendBeacon({ event: 'trial_arc_close_door', door });
  };

  return (
    <div className="space-y-4">
      <RevealCard play={play} delayMs={INTRO_DELAY_MS} elevated>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
          {screen.eyebrow}
        </p>
        <h1 className={`${CVS_DISPLAY_FONT} mt-2 text-3xl leading-tight text-[#1B3A2D]`}>
          {screen.heading}
        </h1>
        <div className={`${CVS_GOLD_DIVIDER} my-4`} />
        <div className="space-y-3">
          {screen.intro.map((paragraph) => (
            <p key={paragraph} className="text-[15px] leading-relaxed text-[#1B3A2D]">
              {paragraph}
            </p>
          ))}
        </div>
        {screen.countLine && (
          <p className="mt-4 text-[15px] leading-relaxed text-[#4F645A]">{screen.countLine}</p>
        )}
      </RevealCard>

      {screen.arrivalLine && (
        <RevealCard play={play} delayMs={nextDelay()}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Where you came in
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{screen.arrivalLine}</p>
        </RevealCard>
      )}

      {screen.outcome && (
        <RevealCard play={play} delayMs={nextDelay()} elevated>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            {screen.outcome.label}
          </p>
          <p className={`${CVS_DISPLAY_FONT} mt-1 text-2xl leading-snug text-[#1B3A2D]`}>
            {screen.outcome.title}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{screen.outcome.body}</p>
          {screen.outcome.nextStep && (
            <>
              <div className={`${CVS_GOLD_DIVIDER} my-4`} />
              <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{screen.outcome.nextStep}</p>
            </>
          )}
        </RevealCard>
      )}

      {screen.weekLink && (
        <RevealCard play={play} delayMs={nextDelay()}>
          <Link
            href={screen.weekLink.href as Route}
            className="mef-focus-ring mef-press block w-full rounded-2xl border border-[#1B3A2D]/20 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
          >
            {screen.weekLink.label}
          </Link>
        </RevealCard>
      )}

      <RevealCard play={play} delayMs={nextDelay()}>
        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{screen.doorsIntro}</p>
        <div className="mt-5 space-y-5">
          {screen.doors.map((door) => (
            <div key={door.door}>
              <a
                href={door.href}
                rel="noopener noreferrer"
                onClick={() => onDoor(door.door)}
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
      </RevealCard>

      <RevealCard play={play} delayMs={nextDelay()}>
        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{screen.keepLine}</p>
        <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
          {screen.supportLead}{' '}
          <a
            href={`mailto:${screen.supportEmail}`}
            className="font-medium text-[#1B3A2D] underline underline-offset-2"
          >
            {screen.supportEmail}
          </a>
        </p>
      </RevealCard>
    </div>
  );
}
