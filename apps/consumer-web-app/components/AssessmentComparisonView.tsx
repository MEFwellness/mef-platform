import { TrendingUp, TrendingDown, Minus, Sparkles, Target, Gauge } from 'lucide-react';
import { STATUS_STYLES } from '@/lib/wellness/status';
import type { ComparisonMetric, ProgressSummary } from '@/lib/onboarding/comparison';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function DirectionBadge({ direction }: { direction: ComparisonMetric['direction'] }) {
  if (direction === null) {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES['no-data'].bg} ${STATUS_STYLES['no-data'].text}`}
      >
        Not yet compared
      </span>
    );
  }

  const status =
    direction === 'improved' ? 'good' : direction === 'declined' ? 'poor' : 'attention';
  const Icon =
    direction === 'improved' ? TrendingUp : direction === 'declined' ? TrendingDown : Minus;
  const label =
    direction === 'improved' ? 'Improved' : direction === 'declined' ? 'Declined' : 'Stable';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status].bg} ${STATUS_STYLES[status].text}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}

function MetricRow({ metric }: { metric: ComparisonMetric }) {
  if (!metric.trackedByAssessment) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 py-3">
        <span className="text-sm font-medium text-[#1B3A2D]">{metric.label}</span>
        <span className="text-xs text-[#6B7A72]">Not tracked by this assessment</span>
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-[#1B3A2D]">{metric.label}</span>
        <DirectionBadge direction={metric.direction} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wider text-[#6B7A72]">Baseline</span>
          {metric.baseline ? (
            <span className={`font-medium ${STATUS_STYLES[metric.baseline.status].text}`}>
              {metric.baseline.displayValue}
            </span>
          ) : (
            <span className="text-[#1B3A2D]/40">—</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wider text-[#6B7A72]">Latest</span>
          {metric.latest ? (
            <span className={`font-medium ${STATUS_STYLES[metric.latest.status].text}`}>
              {metric.latest.displayValue}
            </span>
          ) : (
            <span className="text-[#1B3A2D]/40">—</span>
          )}
        </div>
      </div>
    </div>
  );
}

type Props = {
  metrics: ComparisonMetric[];
  summary: ProgressSummary;
  hasLatest: boolean;
};

export function AssessmentComparisonView({ metrics, summary, hasLatest }: Props) {
  if (!hasLatest) {
    return (
      <section className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Gauge className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Baseline vs. Latest Comparison
          </p>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Complete a reassessment to see how things have changed since the baseline.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Target className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Progress Summary</p>
        </div>

        <div className="mt-4 space-y-3">
          {summary.biggestImprovement && (
            <div className={`rounded-2xl p-4 ${STATUS_STYLES.good.bg}`}>
              <div className={`flex items-center gap-2 ${STATUS_STYLES.good.text}`}>
                <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-xs font-semibold uppercase tracking-wider">
                  Biggest Improvement
                </p>
              </div>
              <p className={`mt-1 text-sm font-medium ${STATUS_STYLES.good.text}`}>
                {summary.biggestImprovement.label}:{' '}
                {summary.biggestImprovement.baseline?.displayValue} →{' '}
                {summary.biggestImprovement.latest?.displayValue}
              </p>
            </div>
          )}

          {summary.needsAttention && (
            <div
              className={`rounded-2xl p-4 ${STATUS_STYLES[summary.needsAttention.latest!.status].bg}`}
            >
              <div
                className={`flex items-center gap-2 ${STATUS_STYLES[summary.needsAttention.latest!.status].text}`}
              >
                <Target className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <p className="text-xs font-semibold uppercase tracking-wider">
                  Still Needs Attention
                </p>
              </div>
              <p
                className={`mt-1 text-sm font-medium ${STATUS_STYLES[summary.needsAttention.latest!.status].text}`}
              >
                {summary.needsAttention.label}: {summary.needsAttention.latest?.displayValue}
              </p>
              {summary.suggestedFocusAction && (
                <p className="mt-2 text-sm leading-relaxed text-[#1B3A2D]/75">
                  {summary.suggestedFocusAction}
                </p>
              )}
            </div>
          )}

          {summary.stableAreas.length > 0 && (
            <div className="rounded-2xl bg-[#F3F6F4] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
                Stable Areas
              </p>
              <p className="mt-1 text-sm text-[#1B3A2D]/75">
                {summary.stableAreas.map((m) => m.label).join(', ')}
              </p>
            </div>
          )}

          {!summary.biggestImprovement &&
            !summary.needsAttention &&
            summary.stableAreas.length === 0 && (
              <p className="text-sm text-[#6B7A72]">
                Not enough comparable data yet to summarize progress.
              </p>
            )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-[#6B7A72]">
          This summary reflects self-reported assessment answers only. It is a coaching guide, not a
          medical evaluation.
        </p>
      </section>

      <section className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Gauge className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Baseline vs. Latest Comparison
          </p>
        </div>
        <div className="mt-2 divide-y divide-[#1B3A2D]/5">
          {metrics.map((metric) => (
            <MetricRow key={metric.key} metric={metric} />
          ))}
        </div>
      </section>
    </div>
  );
}
