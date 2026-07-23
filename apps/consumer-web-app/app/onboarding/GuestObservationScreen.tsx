import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { buildGuestOnboardingObservation } from '@/lib/onboarding/guestObservation';
import type { OnboardingAnswerInput } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';

/**
 * Shown once, immediately after a GUEST (no account) finishes the 12
 * questions — the guest-mode counterpart to OnboardingCompletionScreen,
 * which talks about morning/evening check-ins that don't apply to someone
 * without an account yet. Their answers already live in localStorage (see
 * lib/onboarding/guestStorage.ts); nothing here has been saved to Postgres
 * — that only happens after they sign up, when OnboardingFlow's
 * member-mode branch auto-submits the same payload via the existing,
 * unmodified submitOnboarding() action.
 */
export function GuestObservationScreen({ answers }: { answers: OnboardingAnswerInput[] }) {
  const observation = buildGuestOnboardingObservation(answers);

  return (
    <div className="text-center">
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
        Create a free account to save this and get a personalized plan from your coach.
      </p>

      <Link
        href="/signup"
        className="mt-4 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
      >
        Create your free account
      </Link>

      <Link
        href="/login"
        className="mt-3 flex w-full items-center justify-center rounded-full px-6 py-3.5 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
      >
        I already have an account
      </Link>
    </div>
  );
}
