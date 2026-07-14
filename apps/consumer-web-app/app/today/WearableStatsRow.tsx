import { HeartPulse, Gauge, Moon } from 'lucide-react';
import type { WearableDailySnapshot } from '@/lib/wearables/snapshot';

const TILE = 'rounded-[24px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] p-5';

function scoreColor(score: number | null): string {
  if (score === null) return 'text-[#6B7A72]';
  if (score >= 85) return 'text-green-700';
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-amber-700';
  return 'text-red-700';
}

function formatSleepDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

/**
 * Part 7's "Today's Recovery / Today's Readiness / Latest Sleep" — three
 * distinct stat tiles showing the real numbers behind the Daily Coaching
 * Brief's recommendation sentences (see decision.wearableBrief), not a
 * restatement of them. Null fields render an honest "—", never a
 * fabricated number.
 */
export function WearableStatsRow({ snapshot }: { snapshot: WearableDailySnapshot | null }) {
  if (!snapshot) return null;

  return (
    <div className="mt-4 grid grid-cols-3 gap-3">
      <div className={TILE}>
        <div className="flex items-center gap-1.5 text-[#854D0E]">
          <Gauge className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-[11px] font-semibold uppercase tracking-wider">Readiness</p>
        </div>
        <p className={`mt-2 text-2xl font-semibold ${scoreColor(snapshot.readinessScore)}`}>
          {snapshot.readinessScore ?? '—'}
          {snapshot.readinessScore !== null && (
            <span className="text-sm font-normal text-[#6B7A72]">/100</span>
          )}
        </p>
      </div>

      <div className={TILE}>
        <div className="flex items-center gap-1.5 text-[#854D0E]">
          <HeartPulse className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-[11px] font-semibold uppercase tracking-wider">Recovery</p>
        </div>
        <p
          className={`mt-2 text-2xl font-semibold ${scoreColor(snapshot.recoveryScore ?? snapshot.readinessScore)}`}
        >
          {snapshot.recoveryScore ?? snapshot.readinessScore ?? '—'}
          {(snapshot.recoveryScore ?? snapshot.readinessScore) !== null && (
            <span className="text-sm font-normal text-[#6B7A72]">/100</span>
          )}
        </p>
        {snapshot.hrvMs !== null && (
          <p className="mt-1 text-xs text-[#6B7A72]">HRV {snapshot.hrvMs}ms</p>
        )}
      </div>

      <div className={TILE}>
        <div className="flex items-center gap-1.5 text-[#854D0E]">
          <Moon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-[11px] font-semibold uppercase tracking-wider">Latest Sleep</p>
        </div>
        <p className="mt-2 text-2xl font-semibold text-[#1B3A2D]">
          {formatSleepDuration(snapshot.sleepDurationMinutes)}
        </p>
        {snapshot.sleepScore !== null && (
          <p className="mt-1 text-xs text-[#6B7A72]">Sleep score {snapshot.sleepScore}</p>
        )}
      </div>
    </div>
  );
}
