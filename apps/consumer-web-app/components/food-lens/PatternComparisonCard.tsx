/**
 * The coaching verdict card — Root's dynamically generated coaching
 * sentence (lib/food-lens/coachingNarrative.ts), never raw model output
 * shown without the disclaimer/confidence context around it. A visible
 * "these are AI estimates" line is rendered every time, no exceptions
 * (docs/food-lens/01-architecture.md §1.3).
 */

import type { FoodLensComparisonSignal } from '@mef/shared-types-contracts';

const DIRECTION_LABEL: Record<FoodLensComparisonSignal['direction'], string> = {
  match: 'Match',
  heavy: 'Heavier',
  light: 'Lighter',
};

const DIRECTION_STYLE: Record<FoodLensComparisonSignal['direction'], string> = {
  match: 'bg-[#1B3A2D]/10 text-[#1B3A2D]',
  heavy: 'bg-[#B45309]/10 text-[#B45309]',
  light: 'bg-[#854D0E]/10 text-[#854D0E]',
};

export function PatternComparisonCard({
  patternLabel,
  narrative,
  signals,
  confidence,
}: {
  patternLabel: string;
  narrative: string;
  signals: FoodLensComparisonSignal[];
  confidence: number;
}) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
          Root&apos;s take
        </p>
        <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
          {(confidence * 100).toFixed(0)}% confidence
        </span>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{narrative}</p>

      <p className="mt-3 text-xs text-[#9AA79F]">Compared against your {patternLabel} pattern</p>

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

      <p className="mt-4 text-[11px] leading-relaxed text-[#9AA79F]">
        This reflects one meal, not a verdict on your overall eating — and it&apos;s built from AI
        estimates, not exact measurements.
      </p>
    </div>
  );
}
