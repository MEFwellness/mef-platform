'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sparkles, MapPin, BookOpen } from 'lucide-react';
import { buildGuestOnboardingObservation } from '@/lib/onboarding/guestObservation';
import { buildJourneyPreview } from '@/lib/onboarding/journeyPreview';
import type { OnboardingAnswerInput } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';
const CHAPTER_HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-xl font-semibold leading-snug text-[#1B3A2D] md:text-[1.4rem]';

/**
 * Shown once, immediately after a GUEST (no account) finishes the 12
 * questions — the guest-mode counterpart to OnboardingCompletionScreen,
 * which talks about morning/evening check-ins that don't apply to someone
 * without an account yet. Their answers already live in localStorage (see
 * lib/onboarding/guestStorage.ts); nothing here has been saved to Postgres
 * — that only happens after they sign up, when OnboardingFlow's
 * member-mode branch auto-submits the same payload via the existing,
 * unmodified submitOnboarding() action.
 *
 * Two acts, advanced with a single "Continue" (mirrors BranchTransition's
 * one-button pacing): the personalized observation first, then a "next
 * chapter" preview of the platform the member is about to unlock — so the
 * experience doesn't end the instant the last question is answered.
 */
export function GuestObservationScreen({ answers }: { answers: OnboardingAnswerInput[] }) {
  const [act, setAct] = useState<0 | 1>(0);
  const observation = buildGuestOnboardingObservation(answers);
  const journey = buildJourneyPreview(answers);

  if (act === 0) {
    return (
      <div className="mef-animate-in text-center">
        <h1 className={HEADING}>{observation.headline}</h1>

        <div className={`${CARD} mt-7 p-6 text-left`}>
          <div className="flex items-start gap-3">
            <Sparkles
              className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="space-y-3 text-[15px] leading-relaxed text-[#1B3A2D]">
              {observation.reflection.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <p className="mt-4 border-t border-[#1B3A2D]/10 pt-4 text-sm leading-relaxed text-[#6B7A72]">
            {observation.disclaimer}
          </p>
        </div>

        <p className="mt-7 text-[15px] leading-relaxed text-[#6B7A72]">
          This is only the beginning of what we can see together.
        </p>

        <button
          type="button"
          onClick={() => setAct(1)}
          className="mef-focus-ring mt-4 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
        >
          See what happens next
        </button>
      </div>
    );
  }

  return (
    <div className="mef-animate-in text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1B3A2D]/45">
        The next chapter
      </p>
      <h1 className={`${HEADING} mt-2`}>You&apos;ve only scratched the surface</h1>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#6B7A72]">
        Today&apos;s reflection is the first entry in something ongoing. Here&apos;s what Rooted
        Reset builds from here.
      </p>

      <div className="mt-7 space-y-4 text-left">
        <div className={`${CARD} p-6`}>
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className={CHAPTER_HEADING}>{journey.timeline.title}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-[#1B3A2D]/80">
                {journey.timeline.body}
              </p>
            </div>
          </div>
        </div>

        <div className={`${CARD} p-6`}>
          <div className="flex items-start gap-3">
            <Sparkles
              className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div>
              <p className={CHAPTER_HEADING}>{journey.personalized.title}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-[#1B3A2D]/80">
                {journey.personalized.body}
              </p>
            </div>
          </div>
        </div>

        <div className={`${CARD} p-6`}>
          <div className="flex items-start gap-3">
            <BookOpen
              className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div>
              <p className={CHAPTER_HEADING}>{journey.checkins.title}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-[#1B3A2D]/80">
                {journey.checkins.body}
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-[#6B7A72]">
        {journey.closing}
      </p>

      <p className="mt-7 text-[15px] leading-relaxed text-[#6B7A72]">
        Create a free account to save today&apos;s reflection and start the next chapter.
      </p>

      <Link
        href="/signup"
        className="mef-focus-ring mt-4 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
      >
        Continue my wellness journey
      </Link>

      <Link
        href="/login"
        className="mef-focus-ring mt-3 flex w-full items-center justify-center rounded-full px-6 py-3.5 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
      >
        I already have an account
      </Link>
    </div>
  );
}
