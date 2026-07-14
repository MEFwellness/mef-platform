import { HeartPulse, TrendingUp, Moon, Footprints, Wind } from 'lucide-react';
import type { WearableDailyMetric } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function lastNDays<T extends { numeric_value: number }>(history: T[], days: number): number[] {
  return history.slice(-days).map((m) => m.numeric_value);
}

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatSleepHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

type WeeklyInsightRow = {
  key: string;
  Icon: typeof Moon;
  label: string;
  value: string;
};

/**
 * Recovery Trends (a real bar-per-day rendering over readiness_score
 * history, same visual idiom as the Dashboard's water/sleep trackers) +
 * Weekly Insights (a real 7-day rollup across sleep/steps/stress, not
 * only readiness). Every line is computed from real WearableDailyMetric
 * history and omitted — never fabricated — when that metric has no data
 * yet, matching the honest-empty-state discipline of every other real-
 * data surface in this app. Renders nothing at all when the member has
 * no wearable data of any kind.
 */
export function WearableTrendsPanel({
  readinessHistory,
  sleepHistory,
  stepsHistory,
  stressHistory,
}: {
  readinessHistory: WearableDailyMetric[]; // oldest first
  sleepHistory: WearableDailyMetric[];
  stepsHistory: WearableDailyMetric[];
  stressHistory: WearableDailyMetric[];
}) {
  const hasAnyData =
    readinessHistory.length > 0 ||
    sleepHistory.length > 0 ||
    stepsHistory.length > 0 ||
    stressHistory.length > 0;
  if (!hasAnyData) return null;

  const readinessWeeklyAverage = average(lastNDays(readinessHistory, 7));
  const latestReadiness = readinessHistory.at(-1)?.numeric_value ?? null;

  const weeklyRows: WeeklyInsightRow[] = [];

  const sleepWeeklyAverage = average(lastNDays(sleepHistory, 7));
  if (sleepWeeklyAverage !== null) {
    weeklyRows.push({
      key: 'sleep',
      Icon: Moon,
      label: 'Avg sleep',
      value: formatSleepHours(sleepWeeklyAverage),
    });
  }

  const stepsWeeklyAverage = average(lastNDays(stepsHistory, 7));
  if (stepsWeeklyAverage !== null) {
    weeklyRows.push({
      key: 'steps',
      Icon: Footprints,
      label: 'Avg steps',
      value: Math.round(stepsWeeklyAverage).toLocaleString('en-US'),
    });
  }

  const stressWeeklyAverage = average(lastNDays(stressHistory, 7));
  if (stressWeeklyAverage !== null) {
    weeklyRows.push({
      key: 'stress',
      Icon: Wind,
      label: 'Avg stress',
      value: `${Math.round(stressWeeklyAverage)}/100`,
    });
  }

  return (
    <section className={`${CARD} mef-animate-in mt-5 p-6`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <HeartPulse className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Recovery Trends</p>
        </div>
        {readinessWeeklyAverage !== null && (
          <span className="flex items-center gap-1 text-xs text-[#6B7A72]">
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Weekly avg readiness {Math.round(readinessWeeklyAverage)}
          </span>
        )}
      </div>

      {readinessHistory.length > 0 && (
        <>
          <div className="mt-4 flex items-end gap-1.5" style={{ height: 96 }}>
            {readinessHistory.map((metric) => (
              <div key={metric.id} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-full ${
                    metric.numeric_value >= 85
                      ? 'bg-green-600'
                      : metric.numeric_value >= 70
                        ? 'bg-green-400'
                        : metric.numeric_value >= 50
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                  }`}
                  style={{ height: `${Math.max(6, (metric.numeric_value / 100) * 72)}px` }}
                  title={`${formatDate(metric.local_date)}: readiness ${metric.numeric_value}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-[#1B3A2D]/70">
            <span>{formatDate(readinessHistory[0]!.local_date)}</span>
            <span>{formatDate(readinessHistory[readinessHistory.length - 1]!.local_date)}</span>
          </div>
          {latestReadiness !== null && (
            <p className="mt-3 text-sm text-[#6B7A72]">Today&apos;s readiness: {latestReadiness}/100</p>
          )}
        </>
      )}

      {weeklyRows.length > 0 && (
        <div className="mt-5 border-t border-[#1B3A2D]/5 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
            Weekly Insights
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {weeklyRows.map(({ key, Icon, label, value }) => (
              <div key={key}>
                <div className="flex items-center gap-1.5 text-[#6B7A72]">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-[11px] font-medium uppercase tracking-wider">{label}</p>
                </div>
                <p className="mt-1 text-lg font-semibold text-[#1B3A2D]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
