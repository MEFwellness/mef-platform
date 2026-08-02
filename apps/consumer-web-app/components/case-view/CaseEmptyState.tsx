import type { CaseEmptyStateView } from '@/lib/case-view/types';
import { buildStillBuildingSentence } from '@/lib/case-view/emptyState';

function ProgressBar({ fraction }: { fraction: number }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1B3A2D]/[0.07]">
      <div className="h-full rounded-full bg-[#1B3A2D]/40 transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Requirement 6, treated as the most important screen in this feature —
 * honest about where she actually is, never a fabricated finding and
 * never generic wellness copy standing in for real progress.
 */
export function CaseEmptyState({ emptyState }: { emptyState: CaseEmptyStateView }) {
  const { checkinCount, daysSinceFirstCheckin, stillGathering } = emptyState;

  return (
    <div className="mef-card space-y-5 p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">Still building your case</p>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">
          {buildStillBuildingSentence(checkinCount, daysSinceFirstCheckin)}
        </p>
      </div>

      {stillGathering.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-[#1B3A2D]">What&apos;s still being gathered</p>
          {stillGathering.map((row) => {
            const observationFraction = row.observationCount / row.neededObservations;
            const spanFraction = row.spanDays / row.neededSpanDays;
            const closest = Math.min(observationFraction, spanFraction);
            return (
              <div key={row.pairKey}>
                <div className="flex items-center justify-between text-[12px] text-[#6B7A72]">
                  <span className="font-medium text-[#1B3A2D]">{row.label}</span>
                  <span>
                    {row.observationCount} of {row.neededObservations} days logged
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar fraction={closest} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
