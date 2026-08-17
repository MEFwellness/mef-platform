/**
 * The coaching verdict card — Root's dynamically generated coaching
 * sentence (lib/food-lens/coachingNarrative.ts), never raw model output
 * shown without the disclaimer/confidence context around it. A visible
 * "these are AI estimates" line is rendered every time, no exceptions
 * (docs/food-lens/01-architecture.md §1.3).
 */

import type { FoodLensComparisonSignal } from '@mef/shared-types-contracts';
import { formatPatternComparisonCaption } from '@/lib/food-lens/comparison';

const DIRECTION_LABEL: Record<FoodLensComparisonSignal['direction'], string> = {
  match: 'Match',
  heavy: 'Heavier',
  light: 'Lighter',
};

const DIRECTION_STYLE: Record<FoodLensComparisonSignal['direction'], string> = {
  match: 'bg-[#1B3A2D]/10 text-[#1B3A2D]',
  heavy: 'bg-[#B45309]/10 text-[#B45309]',
  light: 'bg-[#854D0E]/10 text-[#6B7A72]',
};

export function PatternComparisonCard({
  patternLabel,
  narrative,
  signals,
  isThinBaseline = false,
}: {
  patternLabel: string;
  narrative: string;
  signals: FoodLensComparisonSignal[];
  /** True when the member's Primal Pattern target is still at its untouched defaults — lib/food-lens/comparison.ts's isPatternBaselineThin. There's no real eating-pattern data behind a match/heavier/lighter claim yet, so the chips are skipped and the caption points at setup instead of claiming a comparison happened. */
  isThinBaseline?: boolean;
}) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      {/* Trust cleanup, 2026-08-17: the "78% confidence" chip that used to
          sit opposite this heading is gone, with every other confidence
          claim on a member screen. The comparison's confidence is still
          computed and still stored on the row; the card just no longer
          tells her a number whose meaning nothing on screen explains. */}
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Root&apos;s take
      </p>

      <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{narrative}</p>

      {isThinBaseline ? (
        <p className="mt-3 text-xs text-[#6B7A72]">
          Not enough of your Primal Pattern target is set up yet for a real comparison.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-[#6B7A72]">{formatPatternComparisonCaption(patternLabel)}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {signals.map((signal) => (
              <span
                key={signal.dimension}
                className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${DIRECTION_STYLE[signal.direction]}`}
              >
                {signal.dimension}: {DIRECTION_LABEL[signal.direction]}
              </span>
            ))}
          </div>
        </>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-[#6B7A72]">
        This reflects one meal, not a verdict on your overall eating, and it&apos;s built from AI
        estimates, not exact measurements.
      </p>
    </div>
  );
}
