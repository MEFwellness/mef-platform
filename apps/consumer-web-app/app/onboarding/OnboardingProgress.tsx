/**
 * Lightweight progress indicator for the one-question-at-a-time onboarding
 * flow. Same visual language as components/assessments/AssessmentProgressBar.tsx
 * (same colors/classes) but without that component's sectionLabel/sectionIndex/
 * sectionCount props — onboarding is a flat 12-question sequence, not a
 * multi-section questionnaire, so forcing that shape would mean fabricating
 * fake section indices. `domainLabel` is an optional soft "what we're
 * covering right now" cue (from lib/onboarding/baseline.ts's DOMAIN_LABEL),
 * not a real section count.
 */
export function OnboardingProgress({
  questionNumber,
  totalQuestions,
  domainLabel,
}: {
  questionNumber: number;
  totalQuestions: number;
  domainLabel?: string | undefined;
}) {
  const percent = totalQuestions > 0 ? Math.round((questionNumber / totalQuestions) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-[#6B7A72]">
        <span>
          Question {questionNumber} of {totalQuestions}
        </span>
        {domainLabel ? <span className="truncate">{domainLabel}</span> : null}
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#EFE9DB]"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Onboarding assessment progress"
      >
        <div
          className="h-full rounded-full bg-[#1B3A2D] transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
