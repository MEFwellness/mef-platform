'use client';

/**
 * THE INTERIM COMPLETION STATE (Build 1 of 4).
 *
 * Two beats and one button. "Assessment complete", a calm pause, then her
 * pattern with one sentence under it. That is the whole screen, and it is
 * deliberately the whole screen: the real result page, the meal system and
 * the seven day experiment are later builds, and a Build 1 reveal that
 * started sketching them would have to be unpicked rather than replaced.
 *
 * SELF CONTAINED ON PURPOSE. It reads one value, the pattern, and it
 * imports nothing from the rest of the instrument except its own copy. No
 * raw score, no confidence level and no tendency reaches it, because none
 * of those is hers to read: they are the coach's, in Build 2.
 *
 * Reduced motion gets the finished screen with no pause and no movement,
 * which is the same thing the app's other reveals do.
 */

import { useEffect, useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { CVS_DISPLAY_FONT, CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import { FPA_REVEAL_COPY, FUEL_PATTERN_LABEL, FUEL_PATTERN_SENTENCE } from '@/lib/fuel-pattern/copy';
import type { FuelPattern } from '@/lib/fuel-pattern/types';

/** How long "Assessment complete" holds before the pattern arrives. */
const PAUSE_MS = 2200;

export function FuelPatternReveal({
  pattern,
  /** True when a reload landed her back here, so the pause has already been had. */
  startAtPattern = false,
  onPatternShown,
}: {
  pattern: FuelPattern;
  startAtPattern?: boolean;
  onPatternShown?: () => void;
}) {
  const router = useRouter();
  const [showPattern, setShowPattern] = useState(startAtPattern);

  useEffect(() => {
    if (showPattern) return undefined;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setShowPattern(true), reduced ? 0 : PAUSE_MS);
    return () => clearTimeout(timer);
  }, [showPattern]);

  useEffect(() => {
    if (showPattern) onPatternShown?.();
  }, [showPattern, onPatternShown]);

  if (!showPattern) {
    return (
      <div className="mef-fade-in flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h2 className={`${CVS_DISPLAY_FONT} text-3xl leading-tight text-[#1B3A2D]`}>
          {FPA_REVEAL_COPY.completeHeadline}
        </h2>
        <p className="mt-3 text-sm text-[#6B7A72]">{FPA_REVEAL_COPY.completeLine}</p>
      </div>
    );
  }

  return (
    <div className="mef-screen-enter flex min-h-[60vh] flex-col justify-center">
      <div className="rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-7 text-center shadow-[0_20px_50px_-30px_rgba(27,58,45,0.5)] sm:p-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#B89340]">
          {FPA_REVEAL_COPY.patternEyebrow}
        </p>
        <h2 className={`${CVS_DISPLAY_FONT} mt-3 text-[38px] leading-[1.1] text-[#1B3A2D] sm:text-[44px]`}>
          {FUEL_PATTERN_LABEL[pattern]}
        </h2>
        <div className={`${CVS_GOLD_DIVIDER} mx-auto mt-5 max-w-[220px]`} aria-hidden="true" />
        <p className="mt-5 text-[15px] leading-relaxed text-[#1B3A2D]">
          {FUEL_PATTERN_SENTENCE[pattern]}
        </p>
        <p className="mt-4 text-[12.5px] leading-relaxed text-[#6B7A72]">{FPA_REVEAL_COPY.footnote}</p>
      </div>

      <button
        type="button"
        onClick={() => router.push('/dashboard' as Route)}
        className="mef-focus-ring mef-press mt-5 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
      >
        {FPA_REVEAL_COPY.button}
      </button>
    </div>
  );
}
