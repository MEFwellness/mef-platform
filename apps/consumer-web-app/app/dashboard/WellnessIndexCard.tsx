import { Gauge, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { STATUS_STYLES } from './status';
import { WELLNESS_PRIORITY_ACTION, type WellnessIndexResult } from './wellness-index';

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

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {result.strongest && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
                  Strongest area
                </p>
                <p
                  className={`mt-1 text-base font-semibold ${STATUS_STYLES[result.strongest.status].text}`}
                >
                  {result.strongest.label}
                </p>
              </div>
            )}
            {result.priority && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
                  Priority area
                </p>
                <p
                  className={`mt-1 text-base font-semibold ${STATUS_STYLES[result.priority.status].text}`}
                >
                  {result.priority.label}
                </p>
              </div>
            )}
          </div>

          {result.priority && (
            <div className="mt-5 rounded-2xl bg-[#F3F6F4] p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
                Today&apos;s Priority
              </p>
              <p className="mt-1.5 text-lg font-semibold text-[#1B3A2D]">
                {WELLNESS_PRIORITY_ACTION[result.priority.key]}
              </p>
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
