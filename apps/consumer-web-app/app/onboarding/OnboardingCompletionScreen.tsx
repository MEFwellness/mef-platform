import Link from 'next/link';
import { Sunrise, Moon } from 'lucide-react';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';

/**
 * Shown once, immediately after a member's first onboarding submission
 * succeeds (see OnboardingFlow.tsx). Replaces the old plain "Onboarding
 * already complete" text swap, which was easy to miss and gave no sense
 * of what to do next. Purely presentational: submitOnboarding() already
 * ran and already succeeded by the time this renders, so this component
 * has no data to fetch and nothing to validate.
 *
 * `justMigrated` is true only when this is a guest's answers being saved
 * for the first time after signup (OnboardingFlow's migration effect) —
 * without it, this screen would reset a member fresh off the guest
 * observation/journey-preview experience back to a completely generic
 * "you're all set," undoing the momentum those screens just built.
 */
export function OnboardingCompletionScreen({
  justMigrated = false,
}: {
  justMigrated?: boolean;
}) {
  return (
    <div className="text-center">
      <h1 className={HEADING}>
        {justMigrated ? 'Your Story Is Saved' : <>You&apos;re All Set</>}
      </h1>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-[#6B7A72]">
        {justMigrated ? (
          <>
            <p>Today&apos;s reflection is now the first entry in your Wellness Timeline.</p>
            <p>From here, every check-in adds to the picture we started building together.</p>
          </>
        ) : (
          <>
            <p>You&apos;ve completed your initial wellness assessment.</p>
            <p>
              Your answers will help personalize your experience as you continue using MEF
              Wellness.
            </p>
          </>
        )}
      </div>

      <div className={`${CARD} mt-7 p-6 text-left`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          What happens next?
        </p>
        <div className="mt-4 flex items-start gap-3">
          <Sunrise
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-[15px] leading-relaxed text-[#1B3A2D]">
            Morning Readiness helps us understand how you&apos;re beginning your day.
          </p>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <Moon
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-[15px] leading-relaxed text-[#1B3A2D]">
            Evening Reflection helps us understand how your day actually unfolded.
          </p>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-[#6B7A72]">
          Together they create a clearer picture of your health over time.
        </p>
      </div>

      <Link
        href="/checkin"
        className="mt-7 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
      >
        Continue to Morning Readiness
      </Link>
    </div>
  );
}
