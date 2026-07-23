const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * A one-off "coach beat" shown exactly once, right after primary_concern is
 * answered — acknowledges what the member just said before moving on, which
 * is what makes the reordering in lib/onboarding/branching.ts read as
 * adaptive rather than just a silent reshuffle. Not counted as a question
 * step by OnboardingProgress.
 */
export function BranchTransition({ line, onContinue }: { line: string; onContinue: () => void }) {
  return (
    <div className="mef-animate-in">
      <div className={`${CARD} p-6 md:p-7`}>
        <p className="font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold leading-snug text-[#1B3A2D] md:text-[1.75rem]">
          {line}
        </p>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mef-focus-ring mt-6 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
      >
        Continue
      </button>
    </div>
  );
}
