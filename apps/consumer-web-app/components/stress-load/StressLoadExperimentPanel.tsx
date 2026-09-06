'use client';

/**
 * The dashboard card for the Stress & Load Deep-Dive's seven day
 * experiment.
 *
 * THE QUESTION IS THE ONE SHE AGREED TO, in the words of her own protocol.
 * Unlike its two Happiness siblings this experiment is different for every
 * member (five minutes of music, five minutes outside, five minutes of
 * nothing), so the question comes from the server, resolved from the
 * stored title in lib/stress-load/experiment.ts. A member on day 4 should
 * not have to remember what she signed up for.
 *
 * ONE ROW PER CALENDAR DAY, on cvs_experiment_daily_logs (migration 134),
 * the same table the Core Values Snapshot, the Life Signal Check, the
 * Readiness Pulse, Owning Your Value and Where Your Joy Lives experiments
 * all log into. No new table, no new column and no migration.
 *
 * NO DAY 3 OR DAY 7 FOLLOW-UP, deliberately, exactly as its siblings. This
 * experiment closes itself at seven days by the existing read-time expiry
 * rule, and inventing a reflection prompt nobody asked for would be a
 * second thing to answer. Once it is no longer active the server hands
 * back null and this card stops rendering rather than asking her about
 * something that is over.
 */

import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CVS_CARD, CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import {
  logStressLoadDayAction,
  type StressLoadExperimentStatus,
} from '@/app/actions/stressLoad';

export function StressLoadExperimentPanel({ status }: { status: StressLoadExperimentStatus }) {
  const [todayCompleted, setTodayCompleted] = useState<boolean | null>(status.todayCompleted);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const day = Math.min(status.daysSinceStart + 1, status.experiment.durationDays);

  function logDay(completed: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await logStressLoadDayAction(status.experiment.id, completed);
      if (!result.ok) {
        setError(result.error ?? 'Could not save that.');
        return;
      }
      setTodayCompleted(completed);
    });
  }

  return (
    <div className={`${CVS_CARD} mef-animate-in p-7`} data-experiment="stress-load-deep-dive">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {`Day ${day} of ${status.experiment.durationDays}`}
      </p>
      <p className={`${CVS_DISPLAY_FONT} mt-2 text-xl leading-snug text-[#1B3A2D]`}>
        {status.dailyQuestion}
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {todayCompleted !== null ? (
        <div className="mt-5 flex items-center gap-2 text-sm font-medium text-[#4F7A63]">
          <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          {todayCompleted ? 'Logged: today counted.' : 'Logged: not today, and that is fine.'}
        </div>
      ) : (
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => logDay(true)}
            className="mef-focus-ring mef-press flex-1 rounded-2xl bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
          >
            Yes
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => logDay(false)}
            className="mef-focus-ring mef-press flex-1 rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4] disabled:opacity-50"
          >
            Not today
          </button>
        </div>
      )}
    </div>
  );
}
