type Props = {
  currentNumber: number;
  totalQuestions: number;
  sectionLabel: string;
  sectionIndex: number;
  sectionCount: number;
};

export function AssessmentProgressBar({
  currentNumber,
  totalQuestions,
  sectionLabel,
  sectionIndex,
  sectionCount,
}: Props) {
  const percent = totalQuestions > 0 ? Math.round((currentNumber / totalQuestions) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-[#6B7A72]">
        <span>
          Question {currentNumber} of {totalQuestions}
        </span>
        <span className="truncate">
          Section {sectionIndex} of {sectionCount} · {sectionLabel}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#EFE9DB]"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Assessment progress"
      >
        <div
          className="h-full rounded-full bg-[#1B3A2D] transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
