'use client';

/**
 * DAY 6, "What This Week Showed", the screen.
 *
 * PRESENTATION ONLY. Every word on it arrives as an already-rendered
 * RenderedTrialArcRecap, composed by lib/trial-arc/recapCopy.ts from the
 * stored plan. This file decides nothing, reads nothing, computes no
 * number and writes no row. It is the third consumer of the premium
 * closing package (components/closing-screen/ClosingScreenPrimitives.tsx),
 * not a third implementation of it: the staged reveal, the elevated card
 * and the fade timings are the ones Core Values Snapshot's and Life Signal
 * Check's own closing screens already ship.
 *
 * WHAT IT REUSES, AND WHY EACH ONE IS THE RIGHT PIECE.
 *
 *   useCloseScreenReveal   The screen plays its reveal the first time she
 *   / RevealCard           reaches it and renders instantly on every later
 *                          visit, so re-reading her own week is never a
 *                          two second wait. Reduced motion always renders
 *                          instantly.
 *   IntroReveal            Root's noticing, typed out, exactly as the Life
 *                          Signal Check closing screen types its own
 *                          observation. One typewriter line on the screen,
 *                          and it is the counted one.
 *   LoudnessVisual         Her real loudness bars, the same component her
 *                          Life Signal Check results screen drew, fed from
 *                          her own stored 0 to 3 scores. Not a second bar
 *                          chart that looks similar.
 *
 * THE REVEAL ORDER IS THE PLAN'S ORDER. The cards are rendered in the order
 * the stored plan holds them, which is where the arrival callback's "first"
 * is decided (lib/trial-arc/recapPlan.ts moves it to the front on the way
 * in and on the way out). This file never reorders anything.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { CVS_DISPLAY_FONT, CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import { IntroReveal } from '@/components/IntroReveal';
import { BackToHomeButton } from '@/components/closing-screen/BackToHomeButton';
import {
  RevealCard,
  useCloseScreenReveal,
  useDelayedReveal,
} from '@/components/closing-screen/ClosingScreenPrimitives';
import { LoudnessVisual } from '@/components/life-signal-check/LoudnessVisual';
import type { RenderedRecapCard, RenderedTrialArcRecap } from '@/lib/trial-arc/recapTypes';

// The same shape of staging as the two closing screens: roughly two and a
// half seconds end to end on the first view, instant on a revisit.
const STEP_MS = 240;
const INTRO_DELAY_MS = 320;
const CARDS_DELAY_MS = INTRO_DELAY_MS + STEP_MS;
const NOTICING_EXTRA_MS = STEP_MS;

function RecapCard({ card }: { card: RenderedRecapCard }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{card.label}</p>
      {card.title && (
        <p className={`${CVS_DISPLAY_FONT} mt-1 text-xl leading-snug text-[#1B3A2D]`}>{card.title}</p>
      )}
      <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{card.body}</p>
      {card.bars && <LoudnessVisual rows={card.bars} />}
    </>
  );
}

export function TrialArcRecapView({
  recap,
  /** Scopes the "seen once, then instant" reveal. Her own composed date, so a second day genuinely replays nothing. */
  revealKey,
  /**
   * Where the way out goes, and what it is called.
   *
   * DEFAULTS TO HOME, WHICH IS RIGHT ON DAY 6 AND WRONG ON DAY 8. The day 8
   * continuation screen renders this same recap from the same stored row,
   * and by then Home is behind the lock, so a "Back to Home" link there
   * would bounce her straight back to the screen she just left. The
   * continuation screen passes its own way out instead. One component, two
   * callers, and neither one has a dead link on it.
   */
  back = { href: '/dashboard', label: 'Back to Home' },
}: {
  recap: RenderedTrialArcRecap;
  revealKey: string;
  back?: { href: string; label: string };
}) {
  const play = useCloseScreenReveal(`trial-arc-recap:${revealKey}`);
  const noticingDelay = CARDS_DELAY_MS + recap.cards.length * STEP_MS;
  // Mounted rather than merely hidden, for the reason
  // ClosingScreenPrimitives documents: a typewriter that starts while its
  // card is still faded out finishes typing invisibly.
  const noticingRevealed = useDelayedReveal(play, noticingDelay + NOTICING_EXTRA_MS);

  return (
    <div className="space-y-4">
      <RevealCard play={play} delayMs={INTRO_DELAY_MS} elevated>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
          {recap.eyebrow}
        </p>
        <h1 className={`${CVS_DISPLAY_FONT} mt-2 text-3xl leading-tight text-[#1B3A2D]`}>
          {recap.heading}
        </h1>
        <div className={`${CVS_GOLD_DIVIDER} my-4`} />
        <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{recap.intro}</p>
      </RevealCard>

      {recap.cards.map((card, index) => (
        <RevealCard key={`${card.kind}-${index}`} play={play} delayMs={CARDS_DELAY_MS + index * STEP_MS}>
          <RecapCard card={card} />
        </RevealCard>
      ))}

      <RevealCard play={play} delayMs={noticingDelay}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Root&apos;s noticing
        </p>
        <div className="mt-2 min-h-[1.5em]">
          {noticingRevealed && (
            <IntroReveal
              title={recap.noticing}
              lines={[]}
              titleClassName="text-[15px] leading-relaxed text-[#1B3A2D]"
              storageKey={`trial-arc-recap-noticing:${revealKey}`}
            />
          )}
        </div>
      </RevealCard>

      <RevealCard play={play} delayMs={noticingDelay + STEP_MS * 2} elevated>
        <p className={`${CVS_DISPLAY_FONT} text-xl leading-snug text-[#1B3A2D]`}>{recap.tomorrow}</p>
        {recap.cta && (
          <>
            <div className={`${CVS_GOLD_DIVIDER} my-5`} />
            <Link
              href={recap.cta.href as Route}
              className="mef-focus-ring mef-press block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              {recap.cta.label}
            </Link>
          </>
        )}
        {/* The way out, as a real control rather than a small underlined
            line under the card (2026-09-05). Same address, same words, and
            the day 8 caller still passes its own. */}
        <div className="mt-5">
          <BackToHomeButton href={back.href} label={back.label} />
        </div>
      </RevealCard>
    </div>
  );
}
