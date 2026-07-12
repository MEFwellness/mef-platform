import { Gauge, TrendingUp, TrendingDown, Minus, Sparkles, Target } from 'lucide-react';
import { STATUS_STYLES } from './status';
import type { WellnessIndexResult } from './wellness-index';
import { WELLNESS_COACHING } from './coaching';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

type Props = {
  result: WellnessIndexResult | null;
  previousScore: number | null;
};

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = current - previous;
  const status = delta > 0 ? 'good' : delta < 0 ? 'poor' : 'attention';
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${STATUS_STYLES[status].bg} ${STATUS_STYLES[status].text}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {delta === 0
        ? 'Steady vs yesterday'
        : `${Math.abs(delta)} pt${Math.abs(delta) === 1 ? '' : 's'} ${delta > 0 ? 'up' : 'down'} vs yesterday`}
    </span>
  );
}

export function WellnessIndexCard({ result, previousScore }: Props) {
  return (
    <section className={`${CARD} p-7`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Gauge className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Daily Wellness Index</p>
        </div>
        {result && previousScore !== null && (
          <DeltaBadge current={result.score} previous={previousScore} />
        )}
      </div>

      {result ? (
        <>
          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <span
              className={`font-[family-name:var(--font-cormorant-garamond)] text-6xl leading-none ${STATUS_STYLES[result.status].text}`}
            >
              {result.score}
            </span>
            <span className="text-lg text-[#6B7A72]">/ 100</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[result.status].bg} ${STATUS_STYLES[result.status].text}`}
            >
              {result.label}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
            A coaching metric calculated from today&apos;s check-in and your recent wellness trends
            — not a medical score.
          </p>

          {result.strongest && (
            <div className={`mt-6 rounded-2xl p-5 ${STATUS_STYLES[result.strongest.status].bg}`}>
              <div
                className={`flex items-center gap-2 ${STATUS_STYLES[result.strongest.status].text}`}
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-xs font-semibold uppercase tracking-wider">Strongest Area</p>
              </div>
              <p
                className={`mt-1.5 text-lg font-semibold ${STATUS_STYLES[result.strongest.status].text}`}
              >
                {result.strongest.label}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#1B3A2D]/75">
                {WELLNESS_COACHING[result.strongest.key].strongestNote}
              </p>
            </div>
          )}

          {result.priority && (
            <div className="mt-4 rounded-2xl bg-[#F3F6F4] p-6">
              <div className="flex items-center gap-2 text-[#854D0E]">
                <Target className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-xs font-semibold uppercase tracking-wider">
                  Today&apos;s Priority
                </p>
              </div>
              <h2
                className={`mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-snug ${STATUS_STYLES[result.priority.status].text}`}
              >
                {WELLNESS_COACHING[result.priority.key].priorityTitle}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]/75">
                {WELLNESS_COACHING[result.priority.key].priorityWhy}
              </p>
              <div className="mt-4 rounded-xl bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
                  Today&apos;s Action
                </p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-[#1B3A2D]">
                  {WELLNESS_COACHING[result.priority.key].priorityAction}
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
            Building your Daily Wellness Index
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
            Complete today&apos;s check-in to see your first score.
          </p>
        </>
      )}

      <p className="mt-6 text-xs leading-relaxed text-[#6B7A72]">
        Your Daily Wellness Index summarizes today&apos;s wellness check-in and recent patterns. It
        is intended as a wellness coaching guide and is not a medical diagnosis.
      </p>
    </section>
  );
}
