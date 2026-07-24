'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sparkles, CalendarDays, Sunrise } from 'lucide-react';
import { buildGuestOnboardingObservation } from '@/lib/onboarding/guestObservation';
import { buildJourneyPreview } from '@/lib/onboarding/journeyPreview';
import type { OnboardingAnswerInput } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-[2.15rem] leading-[1.15] text-[#1B3A2D] md:text-[2.75rem]';
const CHAPTER_HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-lg font-semibold leading-snug text-[#1B3A2D] md:text-xl';

/**
 * Shown once, immediately after a GUEST (no account) finishes the
 * assessment — the premium "discovery moment" the product brief asks for:
 * the emotional high point of the whole experience, not a normal
 * questionnaire ending. The guest-mode counterpart to
 * OnboardingCompletionScreen, which talks about morning/evening check-ins
 * that don't apply to someone without an account yet. Their answers
 * already live in localStorage (see lib/onboarding/guestStorage.ts);
 * nothing here has been saved to Postgres — that only happens after they
 * sign up, when OnboardingFlow's member-mode branch auto-submits the same
 * payload via the existing, unmodified submitOnboarding() action.
 *
 * Two acts, advanced with a single "Continue" (mirrors BranchTransition's
 * one-button pacing) so the moment isn't dumped on the member all at once:
 * Act 0 is the one personalized observation plus why it's worth tracking
 * (lib/onboarding/guestObservation.ts); Act 1 is the "next chapter"
 * preview of the platform (lib/onboarding/journeyPreview.ts) leading into
 * account creation framed as saving progress, not registering for software.
 */
export function GuestObservationScreen({ answers }: { answers: OnboardingAnswerInput[] }) {
  const [act, setAct] = useState<0 | 1>(0);
  const observation = buildGuestOnboardingObservation(answers);
  const journey = buildJourneyPreview(answers);

  if (act === 0) {
    return (
      <div className="text-center">
        <h1 className={`${HEADING} mef-animate-in`}>{observation.headline}</h1>

        <div className={`${CARD} mef-animate-in mt-7 p-6 text-left md:p-7`} style={{ animationDelay: '80ms' }}>
          <div className="flex items-start gap-3.5">
            <Sparkles
              className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-[15.5px] leading-relaxed text-[#1B3A2D]">{observation.observation}</p>
          </div>

          <div className="mt-5 border-t border-[#1B3A2D]/10 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1B3A2D]/45">
              Why this matters
            </p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[#1B3A2D]/75">
              {observation.whyItMatters}
            </p>
          </div>

          <p className="mt-4 border-t border-[#1B3A2D]/10 pt-4 text-[12.5px] leading-relaxed text-[#6B7A72]">
            {observation.disclaimer}
          </p>
        </div>

        <p
          className="mef-animate-in mt-6 text-[15px] leading-relaxed text-[#6B7A72]"
          style={{ animationDelay: '160ms' }}
        >
          This is only the beginning of what we can see together.
        </p>

        <button
          type="button"
          onClick={() => setAct(1)}
          className="mef-animate-in mef-focus-ring mt-4 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
          style={{ animationDelay: '220ms' }}
        >
          See what happens next
        </button>
      </div>
    );
  }

  const chapters = [
    { Icon: CalendarDays, title: journey.timeline.title, body: journey.timeline.body },
    { Icon: Sparkles, title: journey.personalized.title, body: journey.personalized.body },
    { Icon: Sunrise, title: journey.checkins.title, body: journey.checkins.body },
  ];

  return (
    <div className="text-center">
      <p className="mef-animate-in text-xs font-semibold uppercase tracking-[0.14em] text-[#1B3A2D]/45">
        The next chapter
      </p>
      <h1 className={`${HEADING} mef-animate-in mt-2`} style={{ animationDelay: '40ms' }}>
        You&apos;ve only scratched the surface
      </h1>
      <p
        className="mef-animate-in mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#6B7A72]"
        style={{ animationDelay: '80ms' }}
      >
        Today&apos;s reflection is the first entry in something ongoing. Here&apos;s what Rooted
        Reset builds from here.
      </p>

      <div className={`${CARD} mef-animate-in mt-7 p-6 text-left md:p-7`} style={{ animationDelay: '140ms' }}>
        {chapters.map(({ Icon, title, body }, index) => (
          <div
            key={title}
            className={`flex items-start gap-3.5 ${
              index > 0 ? 'mt-4 border-t border-[#1B3A2D]/10 pt-4' : ''
            }`}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className={CHAPTER_HEADING}>{title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-[#1B3A2D]/75">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <p
        className="mef-animate-in mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-[#6B7A72]"
        style={{ animationDelay: '200ms' }}
      >
        {journey.closing}
      </p>

      <p
        className="mef-animate-in mt-7 text-[15px] leading-relaxed text-[#6B7A72]"
        style={{ animationDelay: '240ms' }}
      >
        Create your free account to save today&apos;s reflection and continue building your
        wellness story.
      </p>

      <Link
        href="/signup"
        className="mef-animate-in mef-focus-ring mt-4 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
        style={{ animationDelay: '280ms' }}
      >
        Save My Wellness Story
      </Link>

      <Link
        href="/login"
        className="mef-animate-in mef-focus-ring mt-3 flex w-full items-center justify-center rounded-full px-6 py-3.5 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
        style={{ animationDelay: '280ms' }}
      >
        I already have an account
      </Link>
    </div>
  );
}
