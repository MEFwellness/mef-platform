const CARD = 'mef-card'; // Screen Layout System (Prompt 2): standardized card recipe, app/globals.css

/**
 * A one-off "coach beat" shown exactly once, right after primary_concern is
 * answered — acknowledges what the member just said before moving on, which
 * is what makes the reordering in lib/onboarding/branching.ts read as
 * adaptive rather than just a silent reshuffle. Not counted as a question
 * step by OnboardingProgress.
 *
 * Screen Layout System (Prompt 2): one short line plus one button — the
 * sparsest possible screen in this flow, so it's vertically centered
 * instead of hugging the top of app/onboarding/page.tsx's container. Uses
 * the same bounded `min-h-[55vh]` OnboardingForm.tsx's per-question steps
 * use, not the full-viewport `<CenterStage>` — this renders as a sibling
 * of OnboardingProgress inside the same normal-flow container, and
 * `<CenterStage>`'s own 100dvh minimum would stack on top of that
 * sibling's height instead of accounting for it.
 */
export function BranchTransition({ line, onContinue }: { line: string; onContinue: () => void }) {
  return (
    <div className="mef-animate-in flex min-h-[55vh] flex-col justify-center">
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
